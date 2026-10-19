---
feature: revisao-f0
module: cross
size: L
status: in_progress
branch: fix/cross/revisao-f0
updated: 2026-10-19
---

# revisao-f0

## Objetivo
Aplicar os achados da revisão da F0 de 19/10/2026 antes da F2, com foco na fila (F0-06). Hoje um `order.generate` que esgota as tentativas deixa um pedido pago parado para sempre. O lock fixo de 15 min, sem renovação nem cancelamento, faz jobs rodarem em dobro e deixa vagas presas. Um código de erro mal formatado trava o job. O `webhookEventId` não tem caminho até `markOrderPaidAndEnqueue`. Fora da fila, a revisão achou estes problemas:
- a proteção de produção fica aberta sem `NODE_ENV`;
- logs vazam parâmetros de query e campos pessoais;
- o pool não tem timeouts;
- faltam índices e transições previstas no design doc;
- a tabela `notification` não comporta a ajuda do WhatsApp.

Fontes: revisão em conversa de 19/10/2026; PRD §5, §7.1, §8; design doc §6.3 e §7.2; `jobs.md`, `data-model.md`, `state-machine.md`, `api.md`; ADR-0008; `known-issues.md`.

## Requisitos e critérios de aceite

### Core
- **RF-01** — Máquina de estados ganha `{ paid, generation_failed → failed }` e `{ preview_ready, photos_changed → draft }` (decisões do humano em 19/10/2026). · Aceite: teste exaustivo status × evento cobre as 15 transições e todas as demais combinações como inválidas; `postPaymentOrderStatusList` inalterada.
- **RF-02** — Constantes da fila no core:
  - `JOB_LOCK_TIMEOUT_SECONDS = 120`
  - `JOB_LEASE_RENEW_INTERVAL_SECONDS = 30`
  - `JOB_MAX_RUN_SECONDS = 900`
  - `jobErrorCodeMap` ganha `jobTimeout`, `invalidErrorCode` e `workerShutdown`

  · Aceite: teste de formato dos códigos (`outcomeCodeSchema`); renovação menor que o lock.
- **RF-03** — `chargeReconcileJobPayloadSchema` aceita `webhookEventId` opcional, só junto com `orderId`. · Aceite: payload com `webhookEventId` sem `orderId` é recusado; com os dois, aceito.
- **RF-04** — Regras de assuntos (PRD §7.1, "1–3 assuntos, chips ou outro"):
  - `topicIdListSchema` recusa ids repetidos;
  - `orderSchema` recusa mais de `MAX_TOPIC_COUNT` assuntos contando o "outro";
  - a partir de `awaiting_payment` (alcançáveis pela máquina), exige ao menos `MIN_TOPIC_COUNT`.

  · Aceite: testes com repetido, 3 + outro, 0 assuntos em `paid` e 0 assuntos em `draft` (aceito).
- **RF-05** — URLs e e-mail:
  - `ticketUrl` (cobrança e `createdChargeSchema`) aceita só `https`;
  - as URLs de notificação aceitam só `http`/`https`;
  - `emailSchema` apara espaços e normaliza para minúsculas.

  · Aceite: `javascript:` recusado nos três; `" Mae@Ex.com "` vira `mae@ex.com`.
- **RF-06** — Retenção de fotos: `isPhotoDueForPurge(insertDatetime, now)` vence a foto cujo prazo cai antes da próxima execução do purge (`now + RETENTION_PURGE_INTERVAL_HOURS`), para que ela nunca passe de 30 dias (PRD §8, "até 30 dias"). · Aceite: teste da borda (prazo exatamente em `now + intervalo`) e do pior caso.
- **RF-07** — `outboundNotificationSchema` discriminado por `kind`:
  - `whatsapp_help` só no canal `whatsapp`, para telefone, sem `orderId`, `shortCode` nem `orderUrl`;
  - os demais kinds exigem `orderId` e `shortCode`;
  - `recipientHashSchema` (64 hex).

  · Aceite: teste de contrato com os dois ramos e recusa de `whatsapp_help` com `orderId` ou por e-mail.

### Fila (db)
- **RF-08** — `renewJobLease(executor, lease, { now?, lockTimeoutSeconds? })` estende `lock_expire_datetime` só se o lease ainda for o ativo e devolve `boolean`. · Aceite: integração: renova o próprio lease; devolve `false` depois de recuperado e reclamado por outro.
- **RF-09** — `releaseJob(executor, lease, { now? })` devolve o job a `pending`, com `run_after = now`, `attempt_count - 1` e `last_error_code = worker_shutdown`, sem consumir tentativa; devolve `boolean`. · Aceite: integração: depois de liberado, o claim seguinte recebe o mesmo `attemptCount`.
- **RF-10** — `workJob` passa ao handler `{ signal }` e cuida do lease:
  - **Renovação:** a cada `leaseRenewIntervalMs`, até `maxRunMs`. Lease perdido aborta o handler com `lease_lost`; erro de banco na renovação não aborta e tenta de novo no próximo intervalo.
  - **Tempo máximo:** passado `maxRunMs`, aborta o handler e para de renovar. O resultado não-ok vira falha retryable `job_timeout`.
  - **Desligamento:** `signal` externo aborta o handler. Resultado não-ok com o desligamento já pedido vira `releaseJob` (outcome `released`); resultado ok conclui normalmente.
  - **Código de erro:** um `errorCode` que não passa em `outcomeCodeSchema` vira `invalid_error_code` retryable, sem lançar.

  · Aceite: integração cobre:
  - renovação mantendo o job fora do `recoverExpiredJobs`;
  - lease perdido abortando o handler;
  - `job_timeout`;
  - `released` com tentativa preservada;
  - código inválido sem deixar o job `active`.
- **RF-11** — Esgotamento com compensação atômica. `workJob` e `recoverExpiredJobs` aceitam `onExhausted(tx, exhaustedJob)`. Ele é chamado na **mesma transação** que grava o `failed` definitivo de uma falha transitória (retentativas esgotadas, `unhandled_error`, `job_timeout`, `invalid_error_code`, `lock_expired` esgotado). Não é chamado em falha não retryable (o handler já tratou), `payload_invalid` ou `lease_lost`. Se `onExhausted` lança, nada é gravado: o job continua `active` e o lock vencido o devolve à varredura.
  - `exhaustedJob = { jobId, name, payload, attemptCount, errorCode }` com o payload ainda completo.
  - `recoverExpiredJobs` trata um esgotado por vez com `FOR UPDATE SKIP LOCKED` e revalida o payload (inválido → `failed` `payload_invalid`, sem callback).

  · Aceite: integração cobre:
  - callback chamado uma vez na 4ª falha transitória e no lock esgotado;
  - não chamado em não retryable;
  - callback que lança deixa o job `active` sem `failed`;
  - escrita do callback (linha em `support_ticket` como sonda) some no rollback.
- **RF-12** — Migration `0002_revisao_f0`, índices da tabela `job` (o claim, a recuperação e as métricas do `/health` usam os parciais):

  | Antes | Depois |
  |---|---|
  | `job_status_name_run_after_datetime_idx` | `(name, run_after_datetime, insert_datetime) WHERE status = 'pending'` |
  | `job_status_lock_expire_datetime_idx` | `(lock_expire_datetime) WHERE status = 'active'` |
  | — | `(finish_datetime) WHERE status = 'failed'` (novo) |

  · Aceite: `migration.test.ts` encontra os índices novos e não os antigos; claim, recover e métricas verdes.

### Dados (db)
- **RF-13** — Mesma migration, índices e checks:
  - unique parcial `charge (gateway, gateway_order_id) WHERE gateway_order_id IS NOT NULL`;
  - índice parcial `order (whatsapp_phone) WHERE whatsapp_phone IS NOT NULL`;
  - índice `order_photo (content_hash)`;
  - check `order_topic_id_list_check`: `jsonb_typeof = 'array'` e comprimento ≤ `MAX_TOPIC_COUNT`.

  · Aceite: integração: duas cobranças com o mesmo `gateway_order_id` falham no unique; `topic_id_list` como string JSON ou com 4 itens é recusado.
- **RF-14** — Tabela `notification`:
  - `order_id` nulo só com `kind = 'whatsapp_help'` (check);
  - `recipient_hash text NOT NULL` com check de 64 hex (HMAC do destinatário normalizado, nunca o valor);
  - unique troca para `(order_id, kind, channel, recipient_hash)`;
  - índice `(recipient_hash, kind, insert_datetime)` para o limite de uma ajuda por 24 h.

  · Aceite: integração cobre:
  - ajuda sem pedido aceita;
  - `order_link` sem pedido recusado;
  - reenvio para outro destinatário aceito;
  - repetido para o mesmo destinatário recusado.
- **RF-15** — Pool com timeouts: `createDatabase` passa a aceitar e aplicar estes valores:

  | Parâmetro | Default |
  |---|---|
  | `connectionTimeoutSeconds` | 5 |
  | `statement_timeout` | 30 s |
  | `lock_timeout` | 10 s |
  | `idle_in_transaction_session_timeout` | 60 s |

  O `migrate.ts` desliga o `statement_timeout`. `pingDatabase` e as métricas da fila têm teto de 2 s (`DatabaseTimeoutError`). `close` aceita `timeoutSeconds`.

  · Aceite: integração lê os parâmetros por `SHOW`; `pg_sleep` acima do teto falha; ping com banco travado falha em ~2 s.

### Worker
- **RF-16** — Raias de concorrência:

  | Raia | Jobs | Vagas |
  |---|---|---|
  | `generate` | `order.generate` | `GENERATE_CONCURRENCY` (máximo `MAX_GENERATE_CONCURRENCY = 8`) |
  | `charge_reconcile` | `charge.reconcile` | 2 |
  | `retention_purge` | `retention.purge` | 1 |
  | `analyze` | `order.analyze` | 2 |
  | `default` | `order.notify`, `whatsapp.inbound` | 2 |

  O pool do worker tem o tamanho da soma das vagas + 2. · Aceite: teste unit de `buildJobLaneList` e do tamanho do pool; config recusa `GENERATE_CONCURRENCY=9`.
- **RF-17** — O mapa de handlers vira `JobDefinition = { handle, onExhausted? }`. O runner passa o sinal de desligamento a `workJob` e loga `released` em `warn`. A manutenção roda a cada 30 s, com `onExhausted` do mapa. · Aceite: integração do runner: `SIGTERM` com handler em curso aborta o sinal e libera o job; a manutenção chama o `onExhausted` do nome certo.

### Config, logs, api, web
- **RF-18** — `NODE_ENV` obrigatório, sem default; os processos de teste passam `NODE_ENV=test`. · Aceite: config sem `NODE_ENV` falha nomeando o campo (core, api, worker); boot e integração verdes.
- **RF-19** — Logs (invariante 9, rule `privacy-security.md`):
  - `serializeLogError` troca a mensagem de erro com `query` e `params` (Drizzle) por `Failed query` e tira a linha da stack;
  - regexes limitadas (e-mail com partes de tamanho máximo e domínio só com letras, dígitos, ponto e hífen; telefone no formato brasileiro ou E.164; token que não casa UUID);
  - texto truncado em 4.000 caracteres antes de mascarar;
  - o logger mascara em qualquer profundidade, inclusive dentro de arrays, as chaves sensíveis do domínio. Lista: `email`, `phone`, `whatsappPhone`, `payerEmail`, `recipient`, `token`, `publicToken`, `payload`, `text`, `textBody`, `noteText`, `otherTopicText`, `userText`, `qrCode`, `qrCodeBase64`, `rawBody`, `authorization`, `cookie`, `secret`, `apiKey`, `accessToken`, `password`;
  - qualquer `Error` em qualquer chave passa por `serializeLogError`.

  · Aceite: unit:
  - `DrizzleQueryError` com `note_text` em params não aparece no log;
  - `orderId` UUID, timestamp ISO, `file.ts:12:34` e `pkg@1.2.3/x.js` saem intactos;
  - 40 KB sem `@` mascarado em menos de 50 ms;
  - `{ order: { whatsappPhone, noteText }, list: [{ email }] }` e `{ error: pgError }` saem mascarados.
- **RF-20** — API:
  - o log `request` usa o status real quando o handler devolve um `Response`;
  - inclui `code` nas respostas de erro;
  - `listen` com `reusePort: false`;
  - o desligamento fecha o banco com teto de 5 s.

  · Aceite: unit do app com rota de teste que devolve `Response` 418 e erro 404; integração sobe e responde `/health`.
- **RF-21** — Web: o documento HTML vai para `shellComponent` e a raiz ganha `errorComponent` em pt-BR com texto objetivo e saída (design doc §7.2), sem detalhe do erro. · Aceite: teste da rota com componente que lança: a resposta mantém `<html lang="pt-BR">`, mostra o texto pt-BR e não mostra a mensagem do erro.

### Docs
- **RF-22** — Documentação:

  | Arquivo | O que muda |
  |---|---|
  | ADR-0009 (lease curto renovado e esgotamento com compensação) | substitui a parte de lock do ADR-0008 |
  | `jobs.md` 1.3 | lease, renovação, tempo máximo, desligamento, esgotamento, raias, `webhookEventId` |
  | `data-model.md` 1.3 | índices, `notification`, timeouts do pool |
  | `state-machine.md` | duas transições |
  | `api.md` | webhook com `webhookEventId`, log `request` |
  | design doc §7.2 | erro genérico, com histórico |
  | `known-issues.md` | resolve lock sem renovação e desligamento sem teto; abre retenção de dados de contato (decisão do humano) |
  | roadmap | F2-04 (cancelar Pix antigos no gateway, `webhookEventId`) e F2-06 (expurgo de jobs e lote até esvaziar) |

  · Aceite: arquivos atualizados com data.

## Fora de escopo
- Retenção ou anonimização de e-mail, telefone, observação e assunto "outro": o humano decidiu registrar como dívida (`known-issues.md`).
- Handlers dos jobs e o `onExhausted` concreto de cada um (F2-02, F2-04, F2-05, F2-07, F2-10). `jobs.md` descreve o que cada um deve fazer.
- Cálculo do HMAC do destinatário e o segredo por env (F2-07, F2-10); aqui só a coluna e o formato.
- Ajustes BAIXOS que a revisão não listou para correção: config frouxa (`HOST`, porta hex, `http` em produção), pin de imagens do compose, `@types/bun`, CI (permissões, SHA das actions), regra do Biome para `.`/`..`, `storageKeySchema` em maiúsculas e `ObjectStorage` com `StorageKey`.
- Checks por status (cobrança `paid` com `paid_datetime`, etc.), unique de cobrança `pending` por pedido, kit vigente único, conferência do valor pago e `text` + `CHECK` no lugar de `pgEnum`: sugestões não incluídas na revisão.
- Limpar `last_error_code` ao concluir: mantido, porque registra que o job passou por retentativa.

## Plano
- **Lease curto renovado (ADR-0009).** Lock de 2 min renovado a cada 30 s por `UPDATE ... WHERE (job_id, attempt_count, status='active')`. Worker morto volta à fila em ≤ 2,5 min (lock + manutenção de 30 s), não em ~16 min. Teto de 15 min por execução (`JOB_MAX_RUN_SECONDS`): depois dele a renovação para e o handler é abortado. Assim um handler que ignora o sinal ainda perde o lease e o job é recuperado, sem renovar para sempre. Renovação, tempo máximo e desligamento vivem em `workJob` (db), que já compõe claim → handler → fim. Os intervalos são injetáveis para teste (`leaseRenewIntervalMs`, `maxRunMs`).
- **Esgotamento.** Compensação na mesma transação do `failed`, sem tabela nem job novos: atomicidade sem estado extra. Se a compensação falha, o job fica `active` e o lock vence. Por isso o caminho de esgotamento de `workJob` não fecha o job fora da transação. A falha só é aceita se o callback commitar junto; em caso de exceção, `workJob` relança e o loop faz backoff. A varredura repete a cada 30 s, o que é aceitável: o callback é uma transação curta e uma falha dele indica banco fora. `order.generate` usará `generation_failed` (de `paid` ou `processing`) + `order.notify kit_failed` com `fail_reason_code` do job. `order.analyze` usará `analysis_failed`. Os demais, só log.
- **`releaseJob` no desligamento.** Decrementar `attempt_count` é seguro porque a liberação exige o lease ativo. Um deploy não queima tentativa.
- **Código de erro inválido.** Trocado em `workJob` antes de `failJob`; `failJob` mantém o `parse` como guarda para chamadores diretos.
- **Migration única `0002_revisao_f0`.** Gerada pelo drizzle-kit (`--name revisao_f0`). Só índices, checks e colunas novas: não é destrutiva. A coluna `notification.recipient_hash NOT NULL` entra sem default porque a tabela está vazia em todo banco (nenhum handler grava `notification` ainda; produção não existe).
- **Logger.** `formatters.log` com caminhada recursiva (profundidade 6) substitui o `redact` do Pino, que só cobre caminhos fixos. `serializers.err` continua, porque o Pino aplica o próprio serializer em `err` antes do formatter.
- **Timeouts.** `connection` do Bun.SQL aceita parâmetros de runtime. Conferido em 19/10/2026: `SHOW` devolve os valores e `pg_sleep(3)` com `statement_timeout=1500` falha com 57014. O teto do ping é `Promise.race` porque a espera por conexão livre no pool não tem limite no Bun.SQL.
- **Testes.** Unit no core (máquina, schemas, regras), integrations (log) e worker (raias, pool). Integração no db (fila, migration, dados) e no worker (runner, scheduler, health). A web roda Vitest no teste da raiz.
- **Paralelismo.** M5 (config, logs, api, web) não compartilha arquivos com M1–M4 e vai para um `gizito-implementer` em paralelo, depois do commit de M1. M1 a M4 ficam com o orquestrador, porque a fila é a zona sensível.
- **Riscos:**
  - o check de `topic_id_list` precisa do número no DDL: `sql.raw(String(MAX_TOPIC_COUNT))` no schema, para não repetir o número à mão;
  - discriminar `outboundNotificationSchema` por `z.enum` em `discriminatedUnion` (Zod 4 aceita);
  - `onConflictDoNothing` do singleton não muda.

## Tasks
### M1 — Core
- [ ] 1.1 Máquina de estados (`paid → failed`, `preview_ready → draft`), testes exaustivos · Arquivos: `core/src/order/state-machine.ts`, teste · Verificação: `cd packages/core && bun test`
- [ ] 1.2 Constantes e códigos da fila, `chargeReconcileJobPayloadSchema` com `webhookEventId` · Arquivos: `core/src/constants.ts`, `core/src/jobs/{rules,schemas}.ts`, testes
- [ ] 1.3 Assuntos, URLs, e-mail, `isPhotoDueForPurge`, notificação discriminada, `recipientHashSchema` · Arquivos: `core/src/order/schemas.ts`, `charge/schemas.ts`, `interfaces/{payment-gateway,notification-channel}.ts`, `retention/rules.ts`, testes
### M2 — Fila
- [ ] 2.1 `renewJobLease`, `releaseJob`, `workJob` com sinal, renovação, teto, desligamento, código inválido e `onExhausted`; `recoverExpiredJobs` com `onExhausted` · Arquivos: `db/src/queue/{lease,finish,work,recover,index}.ts` · Verificação: `tsc`
- [ ] 2.2 Integração da fila (RF-08 a RF-11) · Arquivos: `db/src/__tests__/integration/queue.test.ts` (e arquivo novo se crescer) · Verificação: `bun run test:integration`
### M3 — Schema e migration
- [ ] 3.1 Índices parciais da `job`, índices e checks de `charge`, `order`, `order_photo`, `notification`; `0002_revisao_f0` · Arquivos: `db/src/schema/*.ts`, `db/drizzle/0002_*`, testes unit de convenções e integração de migration e dados
- [ ] 3.2 `createDatabase` com timeouts, `pingDatabase` e métricas com teto, `close` com teto, `migrate.ts` · Arquivos: `db/src/{client,health,migrate}.ts`, `db/src/queue/metrics.ts`, testes
### M4 — Worker
- [ ] 4.1 Raias, `MAX_GENERATE_CONCURRENCY`, pool pelo total de vagas, `JobDefinition`, sinal de desligamento, manutenção de 30 s com `onExhausted` · Arquivos: `apps/worker/src/{config,index,scheduler}.ts`, `runner/*`, `jobs/index.ts`, testes
### M5 — Config, logs, api, web (implementer em paralelo)
- [ ] 5.1 `NODE_ENV` obrigatório; processos de teste com `NODE_ENV=test` · Arquivos: `core/src/config/schemas.ts`, testes de config em core/api/worker, testes que fazem spawn
- [ ] 5.2 `log-error.ts` e `logger.ts` (RF-19), testes · Arquivos: `packages/integrations/src/*`
- [ ] 5.3 API: status real e `code` no log, `reusePort: false`, `close` com teto · Arquivos: `apps/api/src/{app,index}.ts`, testes
- [ ] 5.4 Web: `shellComponent`, `errorComponent` pt-BR, copy · Arquivos: `apps/web/src/routes/__root.tsx`, `src/copy/`, teste
### M6 — Docs e revisão
- [ ] 6.1 ADR-0009, `jobs.md`, `data-model.md`, `state-machine.md`, `api.md`, design doc §7.2, known-issues, roadmap, README (índice de ADR) · Verificação: leitura
- [ ] 6.2 `bun run lint && bun run typecheck && bun run test && bun run test:integration` na raiz; revisão neutra; `review.md`; correções

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-19 | Size L, uma branch para todos os achados | cruza seis workspaces e muda a semântica do lock da fila (ADR novo); separar em várias branches conflitaria nos mesmos docs e no snapshot do drizzle-kit |
| 2026-10-19 | Nova transição `paid → failed` por `generation_failed` | decisão do humano: um pedido pago cujo `order.generate` esgota antes de começar vai para `failed`, de onde `reprocess` e `refund` já saem |
| 2026-10-19 | "Trocar foto" volta `preview_ready → draft` por `photos_changed` | decisão do humano; reaproveita `start_analysis`; os assuntos confirmados são descartados pelo fluxo de upload (F2-01) |
| 2026-10-19 | Retenção de dados de contato só como dívida | decisão do humano, junto com a política de privacidade |
| 2026-10-19 | "Outro" conta no teto de 3 assuntos | PRD §5 e §7.1 dizem "1–3 assuntos (chips da taxonomia ou outro)"; a tabela de cobertura só tem 1 a 3 |
| 2026-10-19 | Lease de 2 min renovado a cada 30 s, teto de 15 min por execução | recuperação em minutos depois de queda ou deploy; um job longo não roda em dobro; handler travado não segura o lease para sempre |
| 2026-10-19 | Compensação de esgotamento na transação do `failed`, por callback | atômica e sem estado novo; a alternativa (varredura de pedidos parados ou job de compensação) exigiria consulta por payload ou enum novo |
| 2026-10-19 | `releaseJob` não consome tentativa no desligamento | interrupção é nossa; quatro deploys durante uma geração não podem esgotar o pedido |
| 2026-10-19 | `charge.reconcile` com 2 vagas; `order.analyze` em raia própria | o webhook pago não espera a varredura de 2 min; a prévia não espera rajada de WhatsApp; a varredura é singleton e o pedido é travado em `markOrderPaidAndEnqueue` |
| 2026-10-19 | Lista de chaves sensíveis no `logger.ts` de integrations, não no core | é política de log do adaptador; o teste confere os nomes reais dos campos do core |

## Status
Fase: spec escrita; próxima etapa é a revisão da spec (`gizito-spec-verifier`, rodada 1). Pendências para o humano: nenhuma até o handoff.
