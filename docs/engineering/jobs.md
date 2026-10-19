# Jobs e fila (`apps/worker`)

**Versão:** 1.3 · **Data:** 2026-10-19 · **Fonte:** PRD §5, §7.4, §9.1, §9.2; `.claude/rules/worker.md` · **Código:** `jobNameList`, `jobPayloadSchema` e regras de retry em `packages/core/src/jobs/` (F0-04, F0-06); fila própria em `packages/db/src/queue/` (F0-06, ADR-0003 e ADR-0008); loop, agendador e health em `apps/worker/src/` (F0-07)

O worker é um processo Bun que consome a fila no Postgres. Cada job tem um handler em `src/jobs/{nome}.ts`, payload validado por `jobPayloadSchema` ao enfileirar e ao consumir, e é **idempotente**: checa o estado do pedido antes de agir e reexecução não duplica kit, cobrança, e-mail nem mensagem.

## 1. Catálogo

| Job | Payload | Quem enfileira | Transições | Concorrência |
|---|---|---|---|---|
| `order.analyze` | `{ orderId }` | api, `POST /orders` (mesma transação do `draft`) | `draft → analyzing → preview_ready` ou `→ draft` com avisos por foto | própria, 2 |
| `order.generate` | `{ orderId }` | `markOrderPaidAndEnqueue` (webhook ou reconciliação); admin `reprocess` | `paid → processing → ready` (via `publishKit`) ou `→ failed` | `GENERATE_CONCURRENCY` (default 2) |
| `order.notify` | `{ orderId, kind }` | `publishKit` (`kit_ready`), `order.generate` ao falhar (`kit_failed`), `confirm` (`order_link`), `whatsapp.inbound` | nenhuma | padrão |
| `charge.reconcile` | `{ orderId?, webhookEventId? }` (`webhookEventId` só junto com `orderId`) | webhook do Mercado Pago (com `orderId` e `webhookEventId`, na transação do `webhook_event`); agendador a cada 2 minutos (sem nenhum dos dois) | `awaiting_payment → paid` por `markOrderPaidAndEnqueue`, após consultar o gateway, repassando o `webhookEventId`; cobrança vencida → `expired` | 2 |
| `retention.purge` | `{}` | agendador, diário | nenhuma; grava `delete_datetime` | 1 |
| `whatsapp.inbound` | `{ webhookEventId, phone, text ≤ 1000 }` | api, `POST /webhooks/whatsapp` | nenhuma; grava ou remove vínculo | padrão |

O worker agrupa os jobs em raias pela coluna Concorrência (`buildJobLaneList`):
- `order.generate` com `GENERATE_CONCURRENCY` vagas (máximo 8);
- `charge.reconcile` com 2, para o webhook pago não esperar a varredura de 2 min (a varredura é singleton e o pedido é travado em `markOrderPaidAndEnqueue`);
- `retention.purge` com 1;
- `order.analyze` numa raia própria de 2, porque o responsável espera a prévia na tela;
- `order.notify` e `whatsapp.inbound` numa raia de 2.

O pool do worker tem duas conexões por vaga (handler e renovação do lease) mais 2. Cada vaga é um laço sobre `workJob` que dorme 1 s com a fila vazia e 5 s depois de erro de banco, sem morrer. Só sobem raias com handler registrado em `src/jobs/index.ts`; enquanto um job não tem handler, ninguém o reclama nem o agenda.

## 2. Fluxo de `order.generate` (PRD §7.4)

```mermaid
flowchart TD
  A[pega job] --> S{status do pedido}
  S -->|outro| Z[no-op, log info]
  S -->|paid| B[generation_started → processing]
  S -->|processing: worker caiu antes| C
  B --> C[plan: objetivos, mapa assunto→questões, dificuldade]
  C --> D[generate: JSON do kit, modelo forte]
  D --> E{studyKitSchema.parse}
  E -->|inválido| R{já regenerou uma vez?}
  E -->|ok| F{validateStudyKit + recálculo mathjs}
  F -->|bloqueador| R
  F -->|ok| G{review por modelo}
  G -->|inconsistência| R
  R -->|não| D
  R -->|sim| X[generation_failed → failed; order.notify kit_failed]
  G -->|ok| H{render dos dois PDFs}
  H -->|falha| H2{já tentou render de novo?}
  H2 -->|não| H
  H2 -->|sim| X
  H -->|ok| I[conferir 20 questões, 2 exemplos e 20 respostas no DOM; contar páginas]
  I --> J[upload dos dois PDFs no R2]
  J --> K[publishKit: kit + kit_published → ready + order.notify kit_ready]
```

- Cada chamada de IA grava uma linha em `ai_call`; o custo acumulado do pedido é comparado a `MAX_AI_COST_CENTS_PER_ORDER` antes de cada chamada; exceder é falha segura.
- Uma regeneração automática no total (`MAX_REGENERATION_COUNT = 1`), seja por saída inválida no `parse`, por bloqueador na validação ou por inconsistência na revisão; nenhuma delas é transitória nem entra no retry da fila. O render tem uma segunda tentativa própria (timeout do Playwright é comum e barato de repetir).
- O handler tem três ramos pelo status: `paid` → `generation_started` e segue; `processing` (worker caiu no meio) → segue do `plan` sem transição, com o custo já gasto contando no teto; qualquer outro → no-op com log `info`.
- O handler respeita `signal` (desligamento, teto de execução ou lease perdido): interrompe a etapa em curso e devolve falha transitória, sem publicar nada parcial.
- `onExhausted` de `order.generate`: com o pedido em `paid` ou `processing`, `generation_failed` com o código do job em `fail_reason_code` e `order.notify` `kit_failed`, na transação do `failed`; qualquer outro estado é no-op.

## 3. Idempotência e transações

| Operação | Garantia |
|---|---|
| Enfileirar `order.analyze` | mesma transação do `INSERT` em `order` |
| `markOrderPaidAndEnqueue` | `payment_confirmed` + `charge.paid` + `order.generate` + `webhook_event.processed_datetime` (com o `webhookEventId` do payload de `charge.reconcile`) em uma transação, com pedido e cobrança travados; cobrança já paga com o mesmo pagamento é no-op e unique em `webhook_event (source, external_id)` barra o webhook repetido; detalhes em `data-model.md` §6 |
| `publishKit` | `kit` com as duas keys + `kit_published` + `order.notify` em uma transação; sem as duas keys não roda |
| `charge.reconcile { orderId }` | consulta o gateway e chama `markOrderPaidAndEnqueue`; pedido já `paid` ou posterior é no-op, salvo se for **outra** cobrança paga do mesmo pedido: abre `support_ticket` `duplicate_payment` e alerta (reembolso manual) |
| `order.notify` | unique `(order_id, kind, channel)` em `notification`: retry de envio atualiza a linha; segundo envio do mesmo evento é `skipped` |
| `whatsapp.inbound` | mensagem é identificada pelo `webhookEventId`; vínculo repetido não muda nada; resposta de ajuda limitada a uma por 24 h por número |
| Payload de job | nunca entra em log, em nível nenhum (o de `whatsapp.inbound` carrega telefone e texto); ao terminar (concluído ou falha definitiva), o payload de `whatsapp.inbound` é reduzido a `name` e `webhookEventId` (`personalDataJobRetainedFieldMap` do core) e a linha fica como registro |

## 4. Retry, falhas e códigos

- Falhas **transitórias** (rede, 5xx, rate limit do provedor): 4 tentativas no total, a primeira e 3 retentativas após 30 s, 2 min e 8 min (`JOB_RETRY_DELAY_SECONDS_LIST` do core), mantendo o estado do pedido. Exceção não tratada no handler conta como transitória (`unhandled_error`).
- **Lease (ADR-0009):**
  - O claim grava `lock_expire_datetime` com 2 min (`JOB_LOCK_TIMEOUT_SECONDS`), e `workJob` renova a cada 30 s (`JOB_LEASE_RENEW_INTERVAL_SECONDS`). Erro de banco na renovação vira log `warn` `lease_renew_failed` (o callback `onLeaseRenewError` só loga e não pode lançar) e tenta de novo no intervalo seguinte.
  - Concluir, falhar, renovar ou liberar exige o par `(job_id, attempt_count)` do claim: worker atrasado recebe `lease_lost` e não fecha a tentativa de outro.
  - `recoverExpiredJobs`, chamado pela manutenção a cada 30 s, devolve a `pending` o job de worker morto, com `last_error_code = lock_expired`. Se o job estiver esgotado, vai para `failed` com compensação (abaixo).
- **Sinal e teto:**
  - O handler recebe `{ signal }`, abortado com `lease_lost` (renovação não achou o lease), `timeout` (passou de `JOB_MAX_RUN_SECONDS`, 15 min; a renovação para) ou `shutdown` (desligamento do worker).
  - Falha transitória depois do teto vira `job_timeout`. Falha transitória no desligamento vira `releaseJob`: volta a `pending` com `worker_shutdown`, sem gastar tentativa; a renovação para antes da liberação.
  - Falha não retryable do handler vence desligamento e teto e vira `failed`.
  - Código de erro que não passa em `outcomeCodeSchema` vira `invalid_error_code`, mantendo o `retryable` do handler.
- Falhas **definitivas**: `generation_failed` com `fail_reason_code` estável e `order.notify` `kit_failed`: `ai_output_invalid` (saída não passou em `studyKitSchema` também na regeneração), `generation_blocked` (bloqueador na validação ou inconsistência na revisão também na regeneração), `ai_cost_exceeded` (teto por pedido), `render_failed` (as duas tentativas de render falharam).
- Job com payload que não passa em `jobPayloadSchema` vai direto para `failed` com `last_error_code = payload_invalid` no claim, sem chamar handler, e o próximo job é entregue; nunca é "corrigido" em runtime. O pedido não muda de estado nem é notificado: é falha da fila, não da geração. O claim avisa o worker (`onPayloadInvalid`), que loga `error` com `payload_invalid`, e o `/health` conta os da janela (`payloadInvalidCount`) para o alerta. Código de erro passa em `outcomeCodeSchema` (minúsculas e `_`, até 64), então não carrega conteúdo.
- **Esgotamento (ADR-0009):**
  - Cada job pode declarar `onExhausted(tx, exhaustedJob)` no mapa de handlers (`JobDefinition = { handle, onExhausted? }`).
  - Ele é chamado na mesma transação do `failed` definitivo de uma falha transitória: retentativas esgotadas, `unhandled_error`, `job_timeout`, `invalid_error_code` ou `lock_expired` esgotado na varredura. Não é chamado em falha não retryable, `payload_invalid` ou `lease_lost`.
  - Contrato: estado de pedido inesperado é no-op; ele só lança em erro de infraestrutura. Se lança, nada é gravado e o job fica `active` até a varredura seguinte, que pula esse job, segue com os outros e loga `error` `job_compensation_failed`.
  - Refeita pela varredura, a compensação recebe `lock_expired` como código.
  - Por job: `order.generate` → `generation_failed` + `kit_failed`; `order.analyze` → `analysis_failed` (volta a `draft` com aviso); `order.notify` → notificação `failed`; os demais, só o log.
- Dead letter: job esgotado fica na tabela `job` como `failed`, com `last_error_code` e `finish_datetime`, para o admin ver; alerta por taxa de `failed` e por qualquer `payload_invalid`.
- `workJob` devolve a exceção do handler em `cause` para diagnóstico; ela pode carregar mensagem de provedor ou dado de entrada, então só vai para log em `debug` (invariante 9).

## 5. Agendamento

- `charge.reconcile` sem `orderId`, a cada 2 minutos: cobranças `pending` com mais de 1 minuto são consultadas no gateway; pagas passam por `markOrderPaidAndEnqueue`; vencidas (`expire_datetime` passado e gateway confirma) viram `expired`. Com `orderId` (enfileirado pelo webhook), só aquele pedido, imediatamente, pelo mesmo código.
- `retention.purge` uma vez por dia: fotos com `insert_datetime` anterior a 30 dias e kits com `published_datetime` anterior a 12 meses; apaga do storage, grava `delete_datetime`; lote limitado por execução.
- O agendador (`startScheduler`) enfileira na partida e a cada intervalo, com `enqueueSingletonJob` e a chave `scheduled`, só os periódicos que aquele worker consome: o unique parcial em `(name, singleton_key)` mantém um só job pendente ou ativo por nome, com uma réplica ou várias; periódico sem consumidor ficaria pendente e dispararia o alerta de fila parada.
- Manutenção a cada 30 s, no mesmo agendador: `recoverExpiredJobs` com o `onExhausted` do mapa de handlers. Log `warn` quando recupera algo e `error` `job_compensation_failed` por compensação que falhou. Tarefa que falha vira log `error` (`scheduler_task_failed`) e roda de novo no próximo intervalo.

## 6. Observabilidade

- Log por job e por etapa: `orderId`, `jobName`, `stage`, duração, tokens, custo, `outcomeCode`. Nunca imagem, texto extraído, prompt, resposta, observação ou mensagem de WhatsApp. Desde F0-07 o loop loga cada job (`jobId`, `jobName`, `orderId` quando o payload tem, `attemptCount`, `outcome`, `errorCode`, `durationMs`) em `info` (concluído), `warn` (retry, liberado no desligamento ou lease perdido) ou `error` (falha definitiva), nunca o payload.
- `GET /health` do worker (`WORKER_HEALTH_PORT`, 3002): `200 { status: "ok", queue }` com o loop rodando e o banco respondendo, em que `queue` traz `readyCount`, `oldestReadyAgeSeconds` (idade do job pronto mais antigo, para o alerta de fila parada), `activeCount`, `failedCount` e `payloadInvalidCount` das últimas `JOB_FAILED_METRIC_WINDOW_HOURS` (24 h); `503 { status: "unavailable", queue: null }` com o loop parando ou sem banco. Contrato `workerHealthSchema` no core.
- `SIGTERM`/`SIGINT`: para o agendador, aborta o sinal dos handlers e para de reclamar, espera os jobs em curso (o que falhar por causa do sinal volta à fila sem gastar tentativa), fecha o health e o banco e sai com 0; segundo sinal sai com 1. Job morto no meio volta pela recuperação de lock em até ~2,5 min.
- `WHATSAPP_ENABLED=false` ou instância desconectada: `order.notify` pula o canal com `skipped`, e-mail segue.

## Histórico

- **1.0 (2026-10-15):** versão inicial (F0-03). Nomes de jobs e payloads espelham o core de F0-04; detalhes da fila (pg-boss ou própria) ficam para o ADR-0008.
- **1.1 (2026-10-15):** F0-06 e ADR-0008: fila própria; 4 tentativas com os atrasos do core; lock de 15 min com recuperação e lease por `(job_id, attempt_count)`; payload de `whatsapp.inbound` reduzido (não expurgado) ao terminar; agendador por `enqueueSingletonJob`.
- **1.2 (2026-10-16):** F0-07: raias de concorrência, agendador só do que o worker consome, manutenção de locks a cada 60 s, log por job, `payload_invalid` em log `error`, `/health` com métricas da fila e desligamento por sinal.
- **1.3 (2026-10-19):** revisão da F0 e ADR-0009: lease de 2 min renovado a cada 30 s, teto de 15 min por execução, sinal para o handler, liberação sem gastar tentativa no desligamento, código de erro inválido sem travar o job, compensação atômica por `onExhausted`, manutenção a cada 30 s; `charge.reconcile` com `webhookEventId` e 2 vagas; `order.analyze` em raia própria.
