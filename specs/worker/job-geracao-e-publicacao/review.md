---
feature: job-geracao-e-publicacao
module: worker
round: 2
verdict: APROVADO
updated: 2026-10-22
---

# Review: job-geracao-e-publicacao

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run --cwd packages/db test:integration` | 184 pass, 0 fail (17 arquivos); os 15 de `order-generation.test.ts` verdes |
| `bun run --cwd apps/worker test:integration` | 92 pass, 1 fail: "teto de execução do job vira job_timeout" com `stageListOf()` igual a `["plan"]` em vez de `[]` |
| `bun test src/__tests__/integration/order-generate.test.ts -t "teto de execução"` × 5 (isolado) | 5 pass |
| `bun test src/__tests__/integration/order-generate.test.ts` × 6 (arquivo inteiro) | 4 verdes, 2 com a mesma falha (3 falhas em 8 execuções no total) |
| `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` | não repetidos pelo verifier; saída do orquestrador do mesmo dia (lint 452 arquivos; typecheck 6 de 6; unit core 861, db 112, integrations 481 e 21 pulados, api 45, worker 346 e 15 pulados; build verde com `playwright` externo) |
| RF-10 com a IA real | não reproduzido pelo verifier (custa dinheiro); aceito pela evidência do orquestrador (Status da spec) |

### Navegador
não aplicável

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `packages/core/src/__tests__/order/generation.test.ts` percorre os 9 estados |
| RF-02 | sim | mesmo arquivo: válida com e sem "outro", só "outro", perfil nulo, inválido e string, lista vazia, análise nula, indisponível e inválida; a implementação acrescenta `topic_not_selectable`, que a spec não listava (SUGESTÃO) |
| RF-03 | sim | mesmo arquivo: lista, `isAiProviderIncidentCode`, não retryable, contido em `aiFailureCodeList` |
| RF-04 | sim | `packages/db/src/__tests__/integration/order-generation.test.ts`: `start` grava `processing` e limpa `fail_reason_code`, `resume` sem escrita, `skip` em 4 estados, inexistente; `FOR UPDATE` em `packages/db/src/order/generation.ts` |
| RF-05 | sim | mesmo arquivo: `paid` e `processing` → `failed` com `kit_failed`; `ready`, `refunded` e `awaiting_payment` recusados sem escrita nem job; inexistente |
| RF-06 | sim | mesmo arquivo: zero, três linhas (inclusive `extract` e falha) e linha de outro pedido ignorada |
| RF-07 | sim, com um teste não determinístico (CRÍTICO) | `apps/worker/src/__tests__/integration/order-generate.test.ts` cobre os 13 cenários pelo `workJob`; handler conferido contra a tabela de falhas; `onAiCall` grava antes de qualquer transição; `publishKit` só depois dos dois `putPrivate` (invariante 6); logs só com códigos, contagens, duração e custo (invariante 9) |
| RF-08 | sim | mesmo arquivo: 4 tentativas esgotadas → `failed` com `ai_unavailable` e `kit_failed`; `lock_expired` pela `recoverExpiredJobs`; `ready` no-op |
| RF-09 | sim, sem o unit do mapa (ALERTA) | `apps/worker/src/__tests__/runner/lanes.test.ts` prova as três raias; o mapa só pelo typecheck e pelo RF-10; boot cria avaliador, KaTeX e renderizador e o fecha depois do runner |
| RF-10 | sim, pela evidência do orquestrador | `ready` em 3 min 15 s, US$ 0,388 em 3 `ai_call`, dois PDFs no MinIO, `kit_ready` pendente, logs limpos |

### Achados
- [CRÍTICO] `apps/worker/src/__tests__/integration/order-generate.test.ts:510-520` — o teste "teto de execução do job vira job_timeout" é não determinístico (3 falhas em 8 execuções): `maxRunMs: 1` corre contra os roundtrips do Postgres de `startOrderGeneration` e `sumOrderAiCostCents`; quando o banco responde antes do abort, o `callAi` do `plan` passa pela checagem do `signal` e as asserções `stageListOf()` e `loadAiCallList()` iguais a `[]` falham — suíte vermelha intermitente; o código de produto está certo — tornar o abort determinístico com um fake que espera o `signal` e asserir `ai_call` `[["plan", "ai_aborted"]]`.
- [ALERTA] `apps/worker/src/jobs/index.ts:24-33` — RF-09 pede unit do mapa e não há teste de `buildJobHandlerMap`; o aceite fica provado só pelo typecheck — montar o mapa com fakes e conferir as chaves e o `onExhausted`.
- [SUGESTÃO] `apps/worker/src/jobs/order-generate.ts:241-243` — `OrderNotFoundError` em `publishKit` devolve `Err` sem apagar os dois objetos recém-subidos (órfãos fora da purga da F2-06) — chamar `deleteKitObjects` também nesse ramo.
- [SUGESTÃO] `apps/worker/src/jobs/order-generate.ts:198-233` — render, upload e `publishKit` não olham `context.signal`; depois do `abort("timeout")` o lease não é mais renovado, e publicar ali pode dar `lease_lost` → requeue → `resume` regenera — checar `signal.aborted` antes do `renderKit` ou ajustar o `jobs.md` §2.
- [SUGESTÃO] `apps/worker/src/jobs/order-generate.ts:81` e `:139` — `isIncident` é função de módulo e também o nome do parâmetro de `retryLater`, que a sombreia — renomear o parâmetro.
- [SUGESTÃO] `specs/worker/job-geracao-e-publicacao/spec.md:19-24` — RF-02 não lista `topic_not_selectable`, que a implementação devolve e testa; defesa útil (sem ela `assertGenerationRequest` lançaria `RangeError` → `unhandled_error` até esgotar) — registrar na spec.
- [SUGESTÃO] `docs/engineering/jobs.md:198-199` e `docs/engineering/data-model.md:258-259` — entrada 1.9 do histórico inserida antes da 1.8 — mover para o fim.

### Regressão pedagógica
não aplicável: o diff não toca prompt, modelo, taxonomia, validador nem schema do kit.

### Resposta do orquestrador
Todos os achados foram aceitos e corrigidos:
- **CRÍTICO:** o teste de timeout passou a usar um fake de `plan` que espera o `signal` abortar antes de responder, com `maxRunMs: 1000`; assere `job_timeout`, `processing`, `ai_call` `[["plan", "ai_aborted"]]`, nada publicado e nenhum `order.notify`. Rodado 6 vezes seguidas no arquivo inteiro: 22 de 22 em todas.
- **ALERTA:** `apps/worker/src/__tests__/jobs/index.test.ts` monta `buildJobHandlerMap` com fakes e confere que as chaves são `handledJobNameList` e que cada definição tem `handle` e `onExhausted`.
- **SUGESTÃO 1:** `deleteKitObjects` roda antes de qualquer ramo de erro do `publishKit`, inclusive `OrderNotFoundError`.
- **SUGESTÃO 2:** o handler confere `signal.aborted` ao fim da geração e, abortado, volta à fila com `generation_aborted` sem renderizar nem publicar; teste novo "teto de execução depois da revisão não renderiza nem publica" (fake de `review` que responde e depois espera o abort); `jobs.md` §2 e a spec (RF-07 passo 4) descrevem o comportamento.
- **SUGESTÃO 3:** parâmetro renomeado para `isProviderIncident`.
- **SUGESTÃO 4:** RF-02 da spec passou a listar `topic_not_selectable` com o motivo.
- **SUGESTÃO 5:** entradas 1.9 movidas para o fim dos históricos de `jobs.md` e `data-model.md`.

## Rodada 2

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun test src/__tests__/integration/order-generate.test.ts` × 10 seguidas (worker) | 22 pass em todas; arquivo em ~4,4 s (os dois testes de timeout levam ~1 s cada, e o pipeline chega ao `review` com folga de 5 a 10 vezes dentro do `maxRunMs: 1000`) |
| `bun run --cwd apps/worker test:integration` | 94 pass, 8 arquivos |
| `bun test src/__tests__/jobs/index.test.ts` (worker) | 1 pass, 8 expects |
| `bun run format`, `bun run lint`, typecheck e unit do worker | não repetidos pelo verifier; saída do orquestrador do mesmo dia (453 arquivos limpos; typecheck limpo; 347 pass e 15 pulados) |

### Navegador
não aplicável

### Pontos revalidados
| Ponto | Atendido | Evidência |
|---|---|---|
| 1. CRÍTICO: teste de timeout determinístico | sim | `order-generate.test.ts`: `untilAborted` e o fake de `plan` que espera o `signal`; o fixture devolve `ai_aborted` ao ver o sinal abortado e `resolveFailure` converte em `job_timeout`; 10 de 10 verdes no arquivo, 94 na suíte |
| 2. ALERTA: unit do mapa de handlers | sim | `apps/worker/src/__tests__/jobs/index.test.ts`: chaves iguais a `handledJobNameList`, `order.generate` presente, `handle` e `onExhausted` em cada definição, sem tocar o banco |
| 3. SUGESTÃO: `deleteKitObjects` em todo erro do `publishKit` | sim | `order-generate.ts`: a remoção precede o ramo `OrderNotFoundError`; o ramo de reembolso segue coberto |
| 4. SUGESTÃO: `signal.aborted` antes do render | sim | `publish` recebe `context.signal` e, abortado, volta à fila sem `renderKit`; teste "teto de execução depois da revisão não renderiza nem publica"; `jobs.md` §2 e spec RF-07 passo 4; `generation_aborted` passa em `outcomeCodeSchema` e nunca chega a `fail_reason_code` |
| 5. SUGESTÃO: `isProviderIncident` | sim | `order-generate.ts`; `isIncident` deixa de ser sombreada |
| 6. SUGESTÃO: `topic_not_selectable` no RF-02 | sim | spec RF-02 com as três razões, iguais às do core; o handler leva a razão só ao log |
| 7. SUGESTÃO: históricos em ordem | sim | 1.9 depois da 1.8 em `jobs.md` e `data-model.md` |

### Achados
- [SUGESTÃO] `docs/engineering/jobs.md` e `spec.md` (RF-07 passo 4) — diziam que o handler "volta à fila com `generation_aborted`", mas a fila grava `job_timeout` (o runner sobrepõe o código em `resolveFailure`) e, com lease perdido, nada; `generation_aborted` só existe no log `warn` — reescrever.
- [SUGESTÃO] `spec.md`, Status — números da rodada 1 (lint 452; worker unit 346; integração 93 com 21 novos) — atualizar para 453, 347, 94 e 22 ao fechar.

### Regressão pedagógica
não aplicável: a correção toca só handler, testes, spec e docs.

### Resposta do orquestrador
As duas sugestões foram aplicadas: `jobs.md` §2 e o RF-07 da spec dizem que o handler volta à fila (o runner grava `job_timeout` ou libera o job; o log leva `generation_aborted`), e o Status da spec traz os números depois da correção.
