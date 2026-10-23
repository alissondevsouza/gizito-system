---
feature: job-geracao-e-publicacao
module: worker
size: M
status: in_progress
branch: feat/worker/job-geracao-e-publicacao
updated: 2026-10-22
---

# job-geracao-e-publicacao (F2-05)

## Objetivo
O job `order.generate`, que a F2-04 já enfileira em `markOrderPaidAndEnqueue`, ganha o handler: leva o pedido de `paid` a `processing`, roda o `generateKit` da F1-07 e o `renderKit` da F1-08, sobe os dois PDFs no storage e publica pelo `publishKit` (`processing → ready`, com `order.notify` `kit_ready`). Falha definitiva leva a `failed` com `fail_reason_code` e `order.notify` `kit_failed`. O custo de IA do pedido respeita `MAX_AI_COST_CENTS_PER_ORDER`, contando a extração e as tentativas anteriores. PRD §5 etapa 6, §7.4 passos 3 a 7, §7.5; `jobs.md` §2 e §4; `state-machine.md` §2. Roadmap F2-05.

Tamanho M: toca worker, core e db, sem decisão arquitetural nova (o fluxo já está no `jobs.md` §2). Zona sensível (máquina de estados, pipeline de IA, render), então a revisão neutra do código entra.

## Requisitos e critérios de aceite
- **RF-01 — decisão de início no core.** `decideGenerationStart(status)` em `packages/core/src/order/generation.ts`: `paid → start`, `processing → resume` (worker caiu ou retentativa), qualquer outro → `skip`. · Aceite: unit com os 9 estados.
- **RF-02 — entrada da geração no core.** `buildGenerationInput({ grade, subject, topicIdList, otherTopicText, perceivedDifficulty, noteText, materialProfile, analysis })` devolve `Result` com `{ grade, subject, topicRefList, otherTopicText, perceivedDifficulty, noteText, materialProfile, sourceWarningCodeList }`:
  - `topicRefList` = `topicIdList` seguido de `other` quando há `otherTopicText`; vazio é erro;
  - `materialProfile` passa em `materialProfileSchema`; nulo ou inválido é erro;
  - `sourceWarningCodeList` vem de `analysis.mergedExtraction.sourceWarningList` quando a análise passa em `orderAnalysisSchema` e tem extração; senão, lista vazia.

  O erro é `GenerationInputError` com `code = "generation_input_invalid"`. · Aceite: unit com entrada válida (com e sem "outro"), perfil nulo, lista de assuntos vazia e análise ausente ou indisponível.
- **RF-03 — incidente do provedor no core.** `aiProviderIncidentCodeList = ["ai_auth_failed", "ai_request_invalid"]` e `isAiProviderIncidentCode(code)` em `interfaces/ai-provider.ts`. São falhas do operador (conta, saldo, limite de gasto), não do pedido. · Aceite: unit da lista e da função.
- **RF-04 — início sob trava no db.** `startOrderGeneration(tx, orderId)` trava o pedido (`FOR UPDATE`), aplica `decideGenerationStart` e:
  - `start`: `transitionOrder(status, "generation_started")`, grava o status e limpa `fail_reason_code` (um pedido reprocessado não carrega o motivo antigo);
  - `resume`: sem escrita;
  - `skip`: devolve `{ decision: "skip", status }` sem escrita.

  Em `start` e `resume` devolve os campos do RF-02 lidos na mesma transação. Pedido inexistente devolve `OrderNotFoundError`. · Aceite: integração com `start` (status, `fail_reason_code` limpo), `resume`, `skip` em `ready`, `failed` e `awaiting_payment`, e pedido inexistente.
- **RF-05 — falha definitiva no db.** `failOrderGeneration(tx, { orderId, failReasonCode })` trava o pedido, `transitionOrder(status, "generation_failed")` (vale de `paid` e de `processing`), grava `status` e `fail_reason_code` e enfileira `order.notify` `kit_failed` na mesma transação. Transição inválida (`ready`, `refunded`, etc.) volta como `Result` sem escrita. · Aceite: integração de `paid`, `processing`, `ready` (recusado, sem job) e inexistente.
- **RF-06 — custo já gasto no db.** `sumOrderAiCostCents(executor, orderId)` devolve a soma de `ai_call.cost_cents` do pedido (zero sem linhas). · Aceite: integração com zero, uma e várias linhas, inclusive de `extract`.
- **RF-07 — handler `order.generate`.** Os passos:
  1. começa pelo RF-04; `skip` vira `Ok` com log `info`;
  2. monta a entrada pelo RF-02; erro → falha definitiva `generation_input_invalid`;
  3. lê o custo já gasto pelo RF-06 e chama `generateKit` com `spentCostCents`, `signal` do job e `onAiCall` que grava cada chamada em `ai_call` na hora (`recordAiCallList`), antes de qualquer transição;
  4. `renderKit` com `generatedAt = now()`; falha → definitiva `render_failed`;
  5. gera `kitId`, sobe `activities.pdf` e `answer-key.pdf` em `kitStorageKey(orderId, kitId, kind)` com `putPrivate` (`application/pdf`);
  6. `publishKit` numa transação com `studyKit`, `generationVersion` e `taxonomyVersion` do próprio kit e as contagens de páginas.

  Mapeamento de falhas:

  | Falha | Resultado |
  |---|---|
  | `generateKit` retryable (`ai_timeout`, `ai_rate_limited`, `ai_unavailable`, `ai_aborted`) ou `storage_unavailable` no upload | `Err` retryable com o código; o pedido fica em `processing` e a retentativa retoma pelo RF-04 (`resume`), com o custo já gasto contando no teto |
  | Incidente do provedor (RF-03) ou `storage_rejected` no upload | `Err` retryable com o código e log `error` `incidente do provedor`; o pedido fica em `processing` e segue o retry da fila. Esgotado, o `onExhausted` (RF-08) leva a `failed` com esse código |
  | `generateKit` definitivo (`ai_output_invalid`, `generation_blocked`, `other_topic_unfeasible`, `ai_cost_exceeded`) ou qualquer outro código não retryable, `render_failed`, `generation_input_invalid` | `failOrderGeneration` numa transação e `Err` não retryable com o código; o job termina `failed` (conta no `failedCount` do `/health`), o pedido em `failed` com `fail_reason_code` e o `kit_failed` enfileirado |
  | `publishKit` com `InvalidTransitionError` (reembolso durante `processing`) | apaga do storage os dois objetos subidos (melhor esforço, `warn` se falhar), log `warn` `publicação sem efeito` e `Ok`; nada de kit |
  | Pedido inexistente | `Err` não retryable `order_not_found` |

  Log de cada fim: `orderId`, `stage: "generate"`, `durationMs`, `costCents` da execução, `aiCallCount`, `repairList` (reparos das tentativas), `outcome`, `errorCode`, `kitId` e as páginas dos dois PDFs quando publica, e `warningCodeList` do render (`page_count_out_of_range`). Nunca conteúdo do kit, prompt ou resposta.

  · Aceite: integração com Postgres, fake de IA com a fixture de Matemática, fake de storage e render falso, pelo `workJob`, para:
  - `paid → processing → ready`: kit com as duas keys, páginas, versões e `study_kit` válido; dois objetos no storage; `kit_ready` enfileirado; `ready_datetime`; linhas de `ai_call` com `order_id`; job `completed`;
  - reexecução em `ready`, `failed` e `awaiting_payment`: `skip`, sem chamada de IA nem kit novo;
  - retomada em `processing`: publica sem transição de início;
  - bloqueador da revisão nas duas tentativas: `generation_blocked`, `failed`, `fail_reason_code`, `kit_failed`, nenhum kit, nenhum objeto, job `failed`, uma regeneração registrada em `ai_call`;
  - custo já gasto no teto: `ai_cost_exceeded` sem nenhuma chamada;
  - falha transitória da IA: job volta a `pending`, pedido em `processing`, `ai_call` com o código; esgotamento pelo RF-08;
  - incidente `ai_auth_failed`: job volta a `pending`, log `error`, pedido em `processing`;
  - render falhando: `render_failed`, nada no storage;
  - reembolso durante o processamento: objetos apagados, sem kit, job `completed`, log `warn`;
  - storage indisponível no upload: retryable, pedido em `processing`;
  - teto de execução do job (`maxRunMs` curto): `job_timeout`, pedido em `processing`;
  - `material_profile` nulo: `generation_input_invalid` definitivo;
  - pedido inexistente.
- **RF-08 — esgotamento.** O `onExhausted` de `order.generate` chama `failOrderGeneration` com o código do job (`ai_unavailable`, `ai_auth_failed`, `job_timeout`, `lock_expired`, `unhandled_error`, …). Em `paid` ou `processing`, aplica `generation_failed` e enfileira `kit_failed`; em qualquer outro estado, no-op (ADR-0009). · Aceite: integração com retentativas esgotadas e com `lock_expired` esgotado na varredura.
- **RF-09 — boot do worker.** `buildJobHandlerMap` ganha `order.generate`; o boot cria `createMathjsEvaluator()`, `isKatexParsable` e `createPdfRenderer({ concurrency: RENDER_CONCURRENCY })` e fecha o renderizador no desligamento, depois do runner. `handledJobNameList` passa a listar `order.generate`, então a raia `generate` sobe com `GENERATE_CONCURRENCY` vagas. · Aceite: unit das raias e do mapa; o teste de boot e a integração do `/health` continuam verdes (o Chromium só sobe na primeira renderização).
- **RF-10 — visto funcionando.** Api, worker, Postgres e MinIO no ar com `PAYMENT_GATEWAY=fake`, `FAKE_GATEWAY_UNKNOWN_CHARGE_STATUS=paid` e a IA real: um pedido em `preview_ready`, `confirm`, webhook do fake, `charge.reconcile` → `paid` → `order.generate` → `ready`, com os dois PDFs no MinIO, o kit no banco, as linhas de `ai_call` com custo e `kit_ready` pendente. Logs sem conteúdo do kit. · Aceite: resultado no `review.md`, com custo e tempo.

## Fora de escopo
- `order.notify` (F2-07): o `kit_ready` e o `kit_failed` ficam `pending` na fila até a F2-07 ter o handler; a raia `default` não sobe sem handler.
- Download dos PDFs e retenção (F2-06).
- Admin `reprocess` e `republishKit` (F2-11): o handler já parte de `paid` e limpa `fail_reason_code`, então o reprocesso só precisa da transição e do enfileiramento.
- Distinguir o 429 de teto de gasto (`enforced_spend_limit_reached`) no adaptador: continua `ai_rate_limited`, que já é retryable e cai no mesmo caminho de esgotamento. Fica como linha LOW no `known-issues.md`.
- Retentativa própria do upload no storage: uma falha depois de uma geração paga refaz a geração na retentativa da fila; o teto de custo limita o total. Registrado como risco.
- `completeWithin` (ADR-0013) na publicação: não há corrida equivalente à da troca de fotos (`order.generate` é enfileirado sem singleton, e o reprocesso é do admin); a reexecução em `ready` pula.
- `bun run test:pedagogy`: prompt, modelo, taxonomia, validador e schema do kit não mudam (invariante 11 não se aplica).

## Plano
- **Arquivos.**
  - Core: `order/generation.ts` (novo: `decideGenerationStart`, `buildGenerationInput`, `GenerationInputError`), `interfaces/ai-provider.ts` (incidente), `index.ts`, testes.
  - Db: `order/generation.ts` (novo: `startOrderGeneration`, `failOrderGeneration`, `sumOrderAiCostCents`), `order/index.ts`, testes de integração.
  - Worker: `jobs/order-generate.ts` (novo), `jobs/index.ts`, `index.ts`, `__tests__/integration/order-generate.test.ts` (novo), ajuste nos testes de raias e do mapa.
  - Docs: `jobs.md` (§1 dependências, §2 fluxo real, §4 códigos e incidente, histórico 1.9), `state-machine.md` (1.5: `generation_started` limpa `fail_reason_code`, incidente do provedor), `data-model.md` §6 (as três funções, histórico 1.9), `known-issues.md` (incidente do provedor resolvido com o que ficou; 429 de teto como LOW novo), roadmap (F2-05 `[x]`).
- **Decisão pelo core, escrita pelo db.** Como no `order.analyze`: `decideGenerationStart` e `buildGenerationInput` são puros; o db trava, lê e grava; o handler orquestra. O worker não importa `drizzle-orm`.
- **Incidente do provedor vira retry, não `failed` na hora.** O `known-issues.md` pedia tratar `ai_auth_failed` e o limite de gasto como incidente, mantendo o pedido pago na fila. O handler devolve falha retryable com log `error`; a fila dá 3 retentativas em ~10 min e, esgotada, o `onExhausted` leva a `failed` com o código e avisa o responsável (`kit_failed`), como o PRD §5 pede ("depois atendimento/reembolso"). O operador vê o `error` e o `failedCount` e reprocessa pelo admin depois de corrigir a conta. `storage_rejected` no upload (credencial do R2) segue a mesma lógica.
- **Falha definitiva termina o job como `failed`.** Diferente do `analysis_unavailable` (que completa o job), a falha da geração é um evento que o operador precisa ver: o handler grava `generation_failed` numa transação própria e devolve `Err` não retryable, que não chama `onExhausted` (ADR-0009), então não há transição dupla. Se o processo cair entre a transação e o `failJob`, a recuperação reexecuta e o pedido em `failed` dá `skip`.
- **Reembolso durante `processing`.** `publishKit` recusa (`InvalidTransitionError`); o handler apaga os dois objetos que acabou de subir e termina `Ok` com `warn`. Os objetos não têm linha em `kit`, então a purga da F2-06 não os veria; a remoção imediata evita o órfão.
- **Custo.** `spentCostCents` soma todas as linhas de `ai_call` do pedido (extração, análises anteriores, tentativas anteriores da geração). `generateKit` confere o teto antes de cada chamada. Cada chamada vai para o banco pelo `onAiCall` antes da próxima, então uma queda do processo não perde o registro de chamada paga.
- **Testes.** Unit no core. Integração no db (as três funções). Integração no worker pelo `workJob` com Postgres real, fake de IA respondendo pela fixture (`createFixtureAiProvider`), fake de storage e o render falso dos testes do pipeline (`createCountingRenderer`); o Chromium real já é coberto pela integração do render e pelo RF-10.
- **Riscos.**
  - Falha de upload depois de uma geração paga refaz a geração na retentativa; o teto de custo (US$ 2 por pedido) limita a ~5 gerações.
  - O `index.ts` do worker passa a abrir o Chromium na primeira renderização; a imagem do worker já o tem (F1-08).
  - A raia `generate` passa a reclamar jobs reais em dev: o `GENERATE_CONCURRENCY` do `.env` vale.

## Tasks
### M1 — core e db
- [x] 1.1 `decideGenerationStart`, `buildGenerationInput`, `GenerationInputError`, `aiProviderIncidentCodeList` · Arquivos: `packages/core/src/order/generation.ts`, `packages/core/src/interfaces/ai-provider.ts`, `packages/core/src/index.ts`, testes · Verificação: `bun run --cwd packages/core test`
- [x] 1.2 `startOrderGeneration`, `failOrderGeneration`, `sumOrderAiCostCents` com integração · Arquivos: `packages/db/src/order/generation.ts`, `packages/db/src/order/index.ts`, testes · Verificação: `bun run --cwd packages/db test:integration`

### M2 — worker
- [ ] 2.1 Handler `order.generate` com `onExhausted`, mapa, raias e boot · Arquivos: `apps/worker/src/jobs/order-generate.ts`, `apps/worker/src/jobs/index.ts`, `apps/worker/src/index.ts`, testes unit · Verificação: `bun run --cwd apps/worker test`
- [ ] 2.2 Integração do handler pelo `workJob` · Arquivos: `apps/worker/src/__tests__/integration/order-generate.test.ts` · Verificação: `bun run --cwd apps/worker test:integration`

### M3 — fechamento
- [ ] 3.1 Suíte: `bun run lint`, `bun run typecheck`, `bun run test`, integração dos workspaces tocados, `bun run build`
- [ ] 3.2 RF-10 com api, worker, Postgres, MinIO e IA real
- [ ] 3.3 Docs: `jobs.md`, `state-machine.md`, `data-model.md`, `known-issues.md`, roadmap
- [ ] 3.4 Revisão neutra e `review.md`

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-22 | Incidente do provedor (`ai_auth_failed`, `ai_request_invalid`) e `storage_rejected` seguem o retry da fila com log `error`; esgotado, `failed` com o código | Resolve a linha MEDIUM do `known-issues.md` sem deixar o pedido parado sem aviso: o responsável é avisado em ~10 min e o admin reprocessa (Plano) |
| 2026-10-22 | Falha definitiva da geração deixa o job `failed` (não `completed`) | Entra no `failedCount` do `/health`; sem `onExhausted` em falha não retryable não há transição dupla (Plano) |
| 2026-10-22 | `generation_started` limpa `fail_reason_code` | Reprocesso não carrega o motivo antigo até `ready` |
| 2026-10-22 | Sem `completeWithin` na publicação | Não há corrida equivalente à da troca de fotos (Fora de escopo) |
| 2026-10-22 | Sem retentativa própria do upload | Simplicidade; o teto de custo limita o total (Riscos) |

## Status
- **Fase:** spec escrita; implementação não começou.
- **Próximo passo:** M1.
