---
feature: webhook-e-reconciliacao
module: api
size: L
status: in_progress
branch: feat/api/webhook-e-reconciliacao
updated: 2026-10-22
---

# webhook-e-reconciliacao (F2-04)

## Objetivo
Fechar o ciclo do pagamento: quando o Pix é pago, o pedido passa de `awaiting_payment` a `paid` e a geração entra na fila, **só depois de consultar o gateway**, numa transação idempotente pelo id do pagamento (invariante 2; PRD §5 etapa 6 e §9.1 itens 3 a 5; `state-machine.md` §2 e §4; `jobs.md` §1, §3 e §5; `api.md` §4). Entram:

- `POST /webhooks/mercadopago`: valida a assinatura, registra o `webhook_event` e enfileira `charge.reconcile` daquele pedido, na mesma transação. Responde 200 rápido e não faz mais nada inline.
- o job `charge.reconcile` no worker: disparado pelo webhook (um pedido e uma cobrança) ou pelo agendador a cada 2 minutos (varredura das cobranças pendentes com mais de 1 minuto). Consulta o gateway, marca pago pelo `markOrderPaidAndEnqueue`, marca `expired` a cobrança que o gateway deu como vencida, e, depois do commit de um pagamento, cancela no gateway os outros Pix ainda pendentes do pedido.
- as dívidas que a revisão da F0 deixou para esta spec (`known-issues.md`): checks por status na `charge` e a conferência do valor pago.

Roadmap F2-04 (tamanho revisto de M para L: toca core, db, integrations, api e worker). Pronto quando o webhook duplicado é no-op e o pagamento sem webhook é detectado pela reconciliação.

## Requisitos e critérios de aceite

- **RF-01 — payload do `charge.reconcile` com `chargeId`.** `chargeReconcileJobPayloadSchema` ganha `chargeId?` (guid), permitido só junto com `orderId`. O webhook enfileira `{ orderId, chargeId, webhookEventId }`; o agendador continua enfileirando `{}`. Com `chargeId`, o worker consulta exatamente aquela order no gateway, qualquer que seja o status dela no banco (inclusive `expired`): é assim que um Pix antigo pago depois de o pedido já estar pago vira `duplicate_payment`, em vez de passar despercebido. · Aceite: unit do schema (`chargeId` sem `orderId` recusado; `webhookEventId` sem `orderId` recusado; `{}` aceito).

- **RF-02 — `cancelCharge` na interface do gateway.** `PaymentGateway.cancelCharge(reference: ChargeReference): Promise<void>`. Cancela a order no gateway para o QR não poder mais ser pago. Erros viram `PaymentGatewayError`; uma order que já não pode ser cancelada (paga, já cancelada) dá `gateway_rejected`, e quem chama trata como melhor esforço. · Aceite: o teste de contrato do core compila; a suíte `describePaymentGatewayContract` ganha o caso "cancelar uma cobrança pendente deixa a consulta `expired`", que roda no fake e no sandbox.

- **RF-03 — decisão da reconciliação no core.** `decideChargeReconciliation({ charge, orderId }, statusResult)` em `charge/reconcile.ts`, pura:
  - `statusResult.externalReference` não nulo e diferente de `orderId` → `{ kind: "mismatch", reason: "external_reference" }`;
  - `statusResult.amountCents !== charge.amountCents` → `{ kind: "mismatch", reason: "amount" }`;
  - `paid` → `{ kind: "confirm_payment", gatewayPaymentId, paidDatetime }`, com `gatewayPaymentId` da consulta ou, se ela vier sem (`orderStatusResponseSchema` aceita `transactions` nulo), o `charge.gatewayPaymentId` gravado na criação; só com os dois nulos → `{ kind: "mismatch", reason: "payment_id_missing" }`. `paidDatetime` nulo vira o `now` recebido por parâmetro;
  - `expired` com a cobrança `pending` no banco → `{ kind: "expire" }`; com outro status → `{ kind: "no_change", outcome: "expired" }`. Vale também antes do `expire_datetime`: o gateway é quem sabe que a order morreu (`canceled`, `failed`), e o comprador precisa ver "gerar novo Pix";
  - `pending` → `{ kind: "no_change", outcome: "pending" }`;
  - `refunded` → `{ kind: "no_change", outcome: "refunded" }` (reembolso é operação do admin, F2-11; aqui só registra).

  `chargeReconcileOutcomeList` lista os códigos gravados em `webhook_event.outcome_code` e nos logs: `paid`, `already_paid`, `duplicate_payment`, `pending`, `expired`, `refunded`, `payment_mismatch`, `charge_not_found`, e os códigos de erro do `markOrderPaidAndEnqueue` e do gateway passam como vêm (todos cabem em `outcomeCodeSchema`). · Aceite: unit de cada linha, inclusive `expired` antes do vencimento e `paid` com `paidDatetime` nulo.

- **RF-04 — valor pago conferido também na transação.** `markOrderPaidInputSchema` ganha `amountCents` (inteiro positivo, obrigatório), e `decidePaymentConfirmation(orderStatus, charge, payment)` recebe `{ gatewayPaymentId, amountCents }`: depois da checagem do pagamento ligado a outra cobrança e antes do `already_paid`, `charge.amountCents !== payment.amountCents` → `ChargeAmountMismatchError` (`code: "charge_amount_mismatch"`). Resolve a parte "`decidePaymentConfirmation` não confere o valor pago" do `known-issues.md`. · Aceite: unit do core com valor diferente em cobrança `pending` e `paid`; o teste de integração do db passa `amountCents` e tem o caso do valor divergente sem escrita.

- **RF-05 — `markOrderPaidAndEnqueue` devolve as cobranças que expirou e agenda a conferência delas.** O desfecho `paid` passa a `{ outcome: "paid", generateJobId, expiredChargeList: { chargeId, gatewayOrderId, gatewayPaymentId }[] }`, com as cobranças `pending` do pedido que a transação marcou `expired`. O worker usa a lista para cancelar no gateway depois do commit (RF-10). Na mesma transação, para cada uma delas, enfileira `charge.reconcile { orderId, chargeId }` com `runAfterDatetime = expire_datetime + CHARGE_RECONCILE_AFTER_EXPIRY_MINUTES` (5, acima do atraso de 1 a 2 min com que o gateway expira em lote): se o cancelamento falhar, ou o worker cair entre o commit e o cancelamento, e o responsável pagar o QR antigo sem webhook, essa conferência consulta o gateway depois do vencimento e abre o `duplicate_payment`. Com o cancelamento feito, a conferência vê `expired` e não muda nada. `lockPaymentTarget` passa a ler também `amountCents` da cobrança travada. · Aceite: o teste de integração que já existe ("demais pendentes expiram") confere a lista e os jobs agendados (um por cobrança expirada, com `run_after_datetime` certo); o caso sem outras cobranças devolve lista vazia e não agenda nada.

- **RF-06 — banco: checks por status e leituras da reconciliação.**
  - Migration `0006_webhook_e_reconciliacao`, não destrutiva: `charge_paid_fields_check` (`status NOT IN ('paid', 'refunded') OR (paid_datetime IS NOT NULL AND gateway_payment_id IS NOT NULL)`), `charge_refunded_fields_check` (`status <> 'refunded' OR (refund_id IS NOT NULL AND refund_datetime IS NOT NULL)`) e o índice `charge_status_insert_datetime_idx (status, insert_datetime)`, que a varredura usa. Resolve a parte "checks por status" do `known-issues.md`.
  - `packages/db/src/charge/reconcile.ts`:
    - `findChargeByGatewayOrderId(executor, { gateway, gatewayOrderId })` e `findChargeForReconcile(executor, chargeId)`, os dois devolvendo `{ chargeId, orderId, gatewayOrderId, gatewayPaymentId, amountCents, status, expireDatetime }` ou nulo;
    - `listChargesToReconcile(executor, { now, minAgeMinutes, limit })`: cobranças `pending` com `insert_datetime <= now - minAgeMinutes`, do pedido em `awaiting_payment`, na ordem de `insert_datetime` e `charge_id`, até `limit`;
    - `expireCharge(executor, chargeId)`: `pending → expired`, devolve se mudou (idempotente).
  - `packages/db/src/webhook/events.ts`:
    - `recordWebhookEvent(executor, { source, externalId, processed? })`: insere com `onConflictDoNothing` no unique `(source, external_id)` e devolve `{ webhookEventId }` ou nulo (duplicado); `processed: { outcomeCode, now }` grava a linha já processada (o `charge_not_found` do RF-08);
    - `markWebhookEventProcessed(executor, webhookEventId, { outcomeCode, now })`, devolve se achou a linha.

  · Aceite (integração do db): a migration aplica do zero e o `core-alignment` continua verde; inserir `paid` sem `paid_datetime` ou `refunded` sem `refund_id` dá `23514`; os ajustes nas fixtures (`buildChargeInsert` com `status: "paid"` passa a levar `paidDatetime` e `gatewayPaymentId`); `listChargesToReconcile` ignora a cobrança com menos de 1 minuto, a `expired`, a de pedido `paid`, respeita o limite e a ordem; `expireCharge` duas vezes muda uma; `recordWebhookEvent` repetido devolve nulo.

- **RF-07 — Mercado Pago e fake.**
  - `MercadoPagoGateway.cancelCharge`: `POST /v1/orders/{gatewayOrderId}/cancel` sem corpo, `X-Idempotency-Key` = `cancel-{chargeId}`, resposta validada por `canceledOrderResponseSchema` (`id`, `status`). Mesma retentativa dos outros métodos (5xx e rede uma vez; 429 e 4xx não). A doc só aceita cancelar `created` e `action_required`; outro estado volta 4xx → `gateway_rejected`.
  - `FakePaymentGateway.cancelCharge`: `pending → expired`; `paid`, `refunded` ou já `expired` → `gateway_rejected`; `cancelReferenceList` guarda as chamadas; `failNextCancel(code)`.
  - `FakePaymentGateway.parseWebhook`: `queryMap.type` presente e diferente de `order` → `unsupported_event`, para a api provar o 200 "ignorado" com o fake.
  - `action` do corpo limitado a `MAX_WEBHOOK_ACTION_LENGTH` (64) no adaptador real e no fake; acima disso → `malformed`. Ele entra no `external_id`, que tem índice unique: sem teto, um corpo grande estouraria o índice com 500 (invariante 4).
  - `createFakePaymentGateway({ unknownChargeStatus })`: o fake guarda as cobranças na memória do processo, então a api e o worker, em processos separados, não veem as cobranças um do outro. Com `unknownChargeStatus` (`paid`, `pending` ou `expired`), `getChargeStatus` de uma `fake-order-{chargeId}` desconhecida responde com esse status, `gatewayPaymentId` = `fake-payment-{chargeId}`, `amountCents` = `KIT_PRICE_CENTS`, `externalReference` nulo e `paidDatetime` = agora quando `paid`; `cancelCharge` de desconhecida é no-op. Sem a opção, continua `gateway_rejected`. Só o worker usa, por `FAKE_GATEWAY_UNKNOWN_CHARGE_STATUS` (RF-09), e só com `PAYMENT_GATEWAY=fake`, que já é recusado em produção. É o que permite a verificação da task 5.3 e, na F2-09, o E2E com api e worker separados.
  - `test:payment-live`: a suíte de contrato já cobre o cancelamento real (cria e cancela uma order no sandbox).

  · Aceite: unit com `fetch` injetado e fixture `canceledOrderResponse` (caminho, método, chave, sem corpo; 200; 4xx → `gateway_rejected` sem retentativa; 500 depois 200 → sucesso com a mesma chave; resposta fora do schema → `gateway_response_invalid`); `action` com 65 caracteres → `malformed` no real e no fake; unit do fake (`cancelCharge`, `failNextCancel`, `type` na query, `unknownChargeStatus` em cada valor e sem a opção); contrato no fake.

- **RF-08 — `POST /webhooks/mercadopago`.** Rota em `routes/webhooks/mercadopago.ts` com `parse: "none"`: o handler lê o corpo bruto como texto, monta `WebhookRequest { headerMap, queryMap, rawBody }` (headers em minúsculas, query de `new URL(request.url).searchParams`, então `data.id` chega como veio) e chama `receiveMercadoPagoWebhook` de `services/charge-webhooks.ts` (os nomes casam com os globs de `.claude/rules/payments.md`). Passos, nesta ordem:
  1. rate limit por IP no processo (`createWebhookRateLimiter`, janela fixa de 1 minuto, `WEBHOOK_RATE_LIMIT_PER_MINUTE` do core, IP por `resolveClientIp` com `TRUSTED_PROXY_HOP_COUNT`) → `429 rate_limited`;
  2. `Content-Length` acima de `MAX_WEBHOOK_BODY_BYTES` (64 KB) ou corpo lido maior que isso → `413 payload_too_large`;
  3. `paymentGateway.parseWebhook`: `invalid_signature` → `401 unauthorized` (o gateway reenvia a cada 15 min, o que deixa visível um segredo errado); `malformed` → `400 validation_error`; `unsupported_event` → `200 { outcome: "ignored" }`;
  4. cobrança por `(gateway.name, gatewayOrderId)` (`findChargeByGatewayOrderId`): ausente → `recordWebhookEvent` com `processed: { outcomeCode: "charge_not_found" }` (orders órfãs da F2-03 e orders de outra aplicação existem) e responde `200 { outcome: "unknown_charge" }`; repetido, `duplicate`;
  5. numa transação: `recordWebhookEvent`; duplicado → `200 { outcome: "duplicate" }` sem job; senão `enqueueJob(tx, { name: "charge.reconcile", orderId, chargeId, webhookEventId })` e `200 { outcome: "queued" }`.

  Resposta `webhookAckSchema` do core (`{ outcome: "queued" | "duplicate" | "ignored" | "unknown_charge" }`), `Cache-Control: no-store`. O corpo do webhook serve só para o `action` do `externalId`; nada dele decide pagamento. Logs: `orderId`, `chargeId`, `webhookEventId`, `outcome`, `errorCode`, `durationMs`; nunca `rawBody`, headers, `data.id` bruto fora do `gatewayOrderId` já conhecido, e-mail ou `qr_code`. A rota não entra no CORS do web (o gateway não é navegador; o `cors` global não atrapalha porque não há preflight).

  · Aceite (integração, Postgres real, fake por padrão):
  - válido → `webhook_event` (`source: "mercadopago"`, `external_id = "{gatewayOrderId}:{action}"`, `processed_datetime` nulo) e um job `charge.reconcile` com `{ orderId, chargeId, webhookEventId }`, na mesma transação (trigger que derruba o insert do job → 500 e nenhum `webhook_event`);
  - o mesmo webhook de novo → `200 duplicate`, nenhum job novo, nenhuma linha nova;
  - assinatura inválida → 401, nada gravado; corpo que não é JSON → 400, nada gravado; `type=payment` → `200 ignored`, nada gravado;
  - `gatewayOrderId` desconhecido → `200 unknown_charge`, `webhook_event` processado com `charge_not_found`, nenhum job;
  - `Content-Length` acima do limite → 413 sem ler; corpo acima do limite sem `Content-Length` → 413;
  - rate limit: `WEBHOOK_RATE_LIMIT_PER_MINUTE + 1` chamadas do mesmo IP no mesmo minuto → a última dá 429; outro IP passa; o minuto seguinte zera (relógio injetado);
  - com o `MercadoPagoGateway` real (`fetch` que lança; segredo de teste): webhook assinado com HMAC calculado no teste sobre `data.id` da query em minúsculas, `x-request-id` e `ts` → `queued`; mesmo pedido com `v1` adulterado → 401. Prova que query e headers chegam ao adaptador como ele espera;
  - log sem `rawBody`, sem o `action` solto e sem e-mail.

- **RF-09 — worker: configuração e montagem.** `workerConfigSchema` ganha `mercadoPagoEnvironmentSchema` e o `transform` com `resolvePaymentGatewaySetting`, igual à api (`mercadopago` exige `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`; `asaas` recusado; `fake` só fora de produção), mais `FAKE_GATEWAY_UNKNOWN_CHARGE_STATUS?` (`paid` | `pending` | `expired`), que só vale com `PAYMENT_GATEWAY=fake` e é recusada com outro gateway (nomeando o campo). O `index.ts` monta o gateway (a mesma fábrica de cinco linhas da api; os fakes ficam fora do entrypoint principal do `integrations`, então não há lugar comum sem misturar as entradas) e o passa a `buildJobHandlerMap`; `handledJobNameList` ganha `charge.reconcile`, então a raia `charge_reconcile` (2 vagas) sobe e o agendador passa a enfileirar o periódico a cada `CHARGE_RECONCILE_INTERVAL_MINUTES`. · Aceite: unit do config (cada chave faltando com `mercadopago`, nomeada; `asaas` recusado; `FAKE_GATEWAY_UNKNOWN_CHARGE_STATUS` com `mercadopago` recusada e com `fake` aceita); `buildJobLaneList(handledJobNameList)` traz a raia; o teste do agendador com `handledNameList` real enfileira `charge.reconcile`.

- **RF-10 — job `charge.reconcile`.** `createChargeReconcileJob({ db, paymentGateway, logger, now })` em `apps/worker/src/jobs/charge-reconcile.ts`, com `handle` e `onExhausted`. Desfecho do job por caminho: no job dirigido (com `chargeId` ou `orderId`), todo caminho esperado termina em `Ok` (`completed`), e as anomalias que não voltam com retentativa (`Err` do `markOrderPaidAndEnqueue`, `mismatch`, `gateway_rejected`, `gateway_response_invalid`) terminam em `Err { retryable: false }` com o código, para o job ficar `failed` e contar no `failedCount` do `/health`; `gateway_unavailable` é `Err { retryable: true }`. Na varredura, qualquer problema de uma cobrança é log e a varredura segue, terminando em `Ok`.

  Alvos:
  - `chargeId` no payload → `findChargeForReconcile`; nulo → log `warn` `charge_not_found`, `webhook_event` processado com esse código, `Ok`;
  - só `orderId` → as cobranças `pending` daquele pedido;
  - nenhum dos dois (agendado) → `listChargesToReconcile` com `CHARGE_RECONCILE_MIN_AGE_MINUTES` e `CHARGE_RECONCILE_BATCH_SIZE` (100).

  Para cada alvo, `reconcileCharge`:
  1. `getChargeStatus({ chargeId, gatewayOrderId, gatewayPaymentId })`; cobrança sem `gatewayOrderId` é pulada com `warn`;
  2. `decideChargeReconciliation` (RF-03):
     - `confirm_payment` → `db.transaction(tx => markOrderPaidAndEnqueue(tx, { orderId, chargeId, gatewayPaymentId, amountCents: statusResult.amountCents, paidDatetime, webhookEventId }))`. `paid` → log `info` e, **depois do commit**, `cancelCharge` para cada item de `expiredChargeList` com `gatewayOrderId`; erro de cancelamento é `warn` `cancel_failed` e segue (a order expira sozinha em 30 min, e a conferência agendada pelo RF-05 pega um pagamento dela como `duplicate_payment`). `already_paid` → `info`. `duplicate_payment` → log `error` (é o alerta para reembolso manual, `state-machine.md` §4). `Err` (`OrderNotFoundError`, `ChargeNotFoundError`, `GatewayPaymentInUseError`, `WebhookEventNotFoundError`, `ChargePaymentMismatchError`, `ChargeAmountMismatchError`, `InvalidTransitionError`) → log `error` com o código, `webhook_event` processado com ele (quando existe) e `Err { retryable: false }`;
     - `expire` → numa transação, `expireCharge` e `markWebhookEventProcessed("expired")`; log `info`;
     - `no_change` → `markWebhookEventProcessed(outcome)` quando há `webhookEventId`; log `info` (`pending`) ou `warn` (`refunded`);
     - `mismatch` → log `error` `payment_mismatch` com `reason`, nenhuma escrita na cobrança, `webhook_event` processado com `payment_mismatch` e, no job dirigido, `Err { retryable: false }`. Não abre ticket: a varredura repete o `error` a cada 2 minutos enquanto a cobrança estiver pendente, e esse é o alerta. É caminho quase impossível (a api cria a order com o valor e a referência).
  3. `PaymentGatewayError` do `getChargeStatus`: no job dirigido (com `chargeId` ou `orderId`), `gateway_unavailable` é falha transitória (retry da fila; o `webhook_event` fica sem `processed_datetime`) e `gateway_rejected` ou `gateway_response_invalid` é falha definitiva com o próprio código, depois de marcar o `webhook_event` processado com ele; na varredura, qualquer erro é `warn` naquela cobrança e a varredura segue com as outras, terminando em `Ok`.

  A varredura loga um resumo (`scannedCount`, `paidCount`, `expiredCount`, `pendingCount`, `errorCount`, `durationMs`) e cada cobrança loga `orderId`, `chargeId`, `outcome`, `errorCode`. `onExhausted`: payload com `webhookEventId` → `markWebhookEventProcessed(exhaustedJob.errorCode)`; senão nada.

  Idempotência: reexecução com o mesmo payload dá `already_paid` sem segundo `order.generate`; varredura e job dirigido no mesmo pedido ao mesmo tempo terminam em um `paid` e um `already_paid` (trava do pedido no `markOrderPaidAndEnqueue`).

  · Aceite (integração do worker, fake, `workJob` real no caminho feliz e `handle` direto nos demais):
  - pago no gateway, job dirigido do webhook: pedido `paid` com `paid_datetime`, cobrança `paid` com `gateway_payment_id`, um `order.generate`, `webhook_event` com `processed_datetime` e `paid`, outra cobrança `pending` do pedido virou `expired` e o fake recebeu `cancelCharge` dela;
  - o mesmo job de novo: `already_paid`, um `order.generate` só, `cancelCharge` não chamado de novo;
  - pendente no gateway: nada muda, `webhook_event` processado `pending`;
  - expirado no gateway, antes e depois do `expire_datetime`: cobrança `expired`, pedido continua `awaiting_payment`, `webhook_event` `expired`;
  - pedido já `paid` e webhook da cobrança antiga paga em dobro (fake `markPaid` nela): `duplicate_payment`, `support_ticket`, log `error`, estado mantido, um `order.generate` só;
  - `amount_cents` da cobrança no banco diferente do fake → `payment_mismatch`, nenhuma escrita, log `error`; `orderId` diferente da referência → idem com `external_reference`;
  - `gateway_unavailable` no job dirigido → falha transitória (`retry_scheduled`), `webhook_event` sem `processed_datetime`; `onExhausted` depois de esgotar grava o código; `gateway_rejected` → job `failed` com esse código e `webhook_event` processado com ele;
  - `payment_mismatch` e `Err` do `markOrderPaidAndEnqueue` no job dirigido → job `failed` com o código;
  - a conferência agendada pelo RF-05 (`charge.reconcile { orderId, chargeId }` da cobrança antiga) com o fake dizendo `paid` → `duplicate_payment` com ticket; dizendo `expired` → `no_change`;
  - varredura: quatro cobranças (uma com menos de 1 minuto, uma paga, uma expirada, uma pendente, mais uma com `failNextStatus`): a nova fica fora, a paga vira `paid` com `order.generate`, a expirada vira `expired`, a pendente fica, a com erro loga `warn` e a varredura termina `completed`; segunda varredura não duplica nada;
  - `cancelCharge` falhando (`failNextCancel`) não desfaz o pagamento: pedido `paid`, log `warn` `cancel_failed`;
  - nenhum log leva `qrCode`, e-mail ou payload.

- **RF-11 — logs sem dado pessoal e sem corpo.** A rota e o job logam só ids, códigos, desfechos e durações (`payments.md`). · Aceite: nos testes da api e do worker, varrer o `memoryLogger` por `rawBody`, pelo `action`, por e-mail e por `qrCode`.

- **RF-12 — prova real do webhook (pendente do humano).** A assinatura com uma notificação de verdade exige URL pública: subir a api com `PAYMENT_GATEWAY=mercadopago` e a credencial de teste, expor com um túnel, cadastrar a URL em "Webhooks > Configurar notificação" (modo teste, evento Order), pagar ou simular, e conferir no log `outcome: "queued"` e, no worker, `paid`. A spec deixa o roteiro no Status; a linha LOW do `known-issues.md` fica aberta até isso acontecer.

## Fora de escopo
- `order.generate` (F2-05): o job fica enfileirado; o worker só reclama nomes com handler.
- `POST /webhooks/whatsapp` e `whatsapp.inbound` (F2-10). O `recordWebhookEvent` já serve aos dois.
- Reembolso pelo admin e o `refund_id` (F2-11); `cancelCharge` não é reembolso.
- Telas de `paid`/`processing` e a visão do `GET` nesses estados além dos campos base (F2-05, F2-09, F2-10). O `GET /orders/:token` já responde a variante base para `paid`.
- Janela de tolerância no `ts` do `x-signature`: não entra. O replay de uma notificação válida só repete um `externalId` (barrado pelo unique) ou enfileira uma reconciliação a mais, que consulta o gateway. Uma janela traria recusa por relógio desalinhado sem ganho.
- Rate limit distribuído e trava por `pg_try_advisory_lock` (várias instâncias): continuam na linha LOW do `known-issues.md`.
- Ticket de suporte para divergência de valor ou referência (RF-10 explica por quê).

## Plano

### Pesquisa no código
- `markOrderPaidAndEnqueue`, `decidePaymentConfirmation`, `webhook_event`, `chargeReconcileJobPayloadSchema`, a raia `charge_reconcile`, o agendador com o singleton `charge.reconcile` e os índices `(gateway, gateway_order_id)` e `(status, expire_datetime)` já existem (F0). O worker só não tinha handler, então ninguém reclamava nem agendava o job.
- `MercadoPagoGateway.getChargeStatus` e `parseWebhook` (F2-03) devolvem o que o worker e a api precisam; o fake tem `markPaid`, `markExpired`, `failNextStatus` e `buildFakeWebhookRequest`. O `externalId` é `{data.id}:{action}`.
- A doc do Mercado Pago (22/10/2026): `POST /v1/orders/{order_id}/cancel` com `X-Idempotency-Key` obrigatória, só para `created` ou `action_required`, resposta com `status: "canceled"`; webhooks do tópico `order` com `data.id` e `type` na query, `x-signature` e `x-request-id` nos headers, resposta 200/201 em 22 s, reenvio a cada 15 min; depois da notificação, `GET /v1/orders/{id}`.
- Elysia 1.4: `parse: "none"` na rota deixa o corpo intocado para `request.text()`.
- O padrão de handler é o `order-analyze.ts` (`JobDefinition { handle, onExhausted }`, `Result<null, JobFailure>`, logs com `orderId` e `stage`); o de rota e service é `routes/orders.ts` e `services/charges.ts`.
- `GET /orders/:token` já devolve a variante base para `paid` e os seguintes (`postConfirmationViewOrderStatusList`).

### Decisões técnicas
- **O webhook nunca decide pagamento.** Registra, enfileira e responde. A consulta e a transição ficam no worker, pelo mesmo código da varredura (ADR-0004, `architecture.md` §2). Por isso o job do webhook e o periódico compartilham `reconcileCharge`.
- **`chargeId` no payload** em vez de "todas as pendentes do pedido": a notificação é de uma order; consultar só ela dá um `GET` por webhook e cobre a cobrança já `expired` no banco que foi paga mesmo assim.
- **Cancelar no gateway depois do commit, como melhor esforço**: a transação de pagamento não espera IO externo (seguraria o lock do pedido); se o cancelamento falhar, a order expira sozinha e um pagamento dela vira `duplicate_payment` com ticket.
- **`expired` só com o gateway confirmando** (continua da F2-03): a varredura vê `action_required` por 1 a 2 minutos depois do vencimento e só marca na seguinte (`payments.md`).
- **`amountCents` dentro do `markOrderPaidAndEnqueue`** além da decisão do core: a conferência fica na transação que escreve, não só no handler.
- **401 para assinatura inválida**: faz o gateway reenviar e deixa o problema visível; 200 esconderia um segredo errado.
- **Divergência sem ticket**: log `error` repetido pela varredura. Ver RF-10.
- **Rate limit por IP no processo** porque a regra de segurança manda; o teto é folgado (`WEBHOOK_RATE_LIMIT_PER_MINUTE = 120`) e um 429 é reenviado pelo gateway.

### Arquivos
- core: `jobs/schemas.ts`, `interfaces/payment-gateway.ts`, `charge/rules.ts` (`ChargeAmountMismatchError`, `decidePaymentConfirmation`), `charge/schemas.ts` (`markOrderPaidInputSchema`), `charge/reconcile.ts` (novo), `api/webhooks.ts` (novo: `webhookAckSchema`), `constants.ts` (`CHARGE_RECONCILE_BATCH_SIZE`, `CHARGE_RECONCILE_AFTER_EXPIRY_MINUTES`, `MAX_WEBHOOK_BODY_BYTES`, `MAX_WEBHOOK_ACTION_LENGTH`, `WEBHOOK_RATE_LIMIT_PER_MINUTE`), `index.ts` e os testes.
- db: `drizzle/0006_*.sql` e `meta`, `schema/charge.ts` (checks), `order/mark-order-paid-and-enqueue.ts`, `charge/reconcile.ts` (novo), `webhook/events.ts` (novo), `index.ts`, os testes de migration, alinhamento, `charge.test.ts`, `mark-order-paid-and-enqueue.test.ts` e os novos.
- integrations: `mercadopago/mercadopago-gateway.ts`, `mercadopago/schemas.ts`, `fakes/fake-payment-gateway.ts`, `__tests__/payment/` (contrato, fake, gateway e fixtures).
- api: `routes/webhooks/mercadopago.ts` (novo), `services/charge-webhooks.ts` (novo), `http/webhook-rate-limit.ts` (novo), `errors.ts`, `app.ts`, `__tests__/integration/webhooks.test.ts` (novo), `__tests__/http/webhook-rate-limit.test.ts` (novo).
- worker: `config.ts`, `index.ts`, `jobs/index.ts`, `jobs/charge-reconcile.ts` (novo), `__tests__/config.test.ts`, `__tests__/integration/charge-reconcile.test.ts` (novo), `__tests__/integration/scheduler.test.ts`.
- docs: `api.md` (§4, histórico), `jobs.md` (§1, §3, §5, fluxo do reconcile, histórico), `data-model.md` (§6, checks, histórico), `state-machine.md` (§4, histórico), `.claude/rules/payments.md` (cancelamento, respostas do webhook), `known-issues.md` (resolvidos e a linha do webhook real), roadmap (F2-03 `[x]`, F2-04).

### Testes
Unit no core (decisão, schema, erro), no integrations (adaptador com `fetch` injetado, fake, contrato) e na api (rate limit). Integração com Postgres real no db (migration, checks, leituras), na api (rota ponta a ponta com o fake e um caso com o adaptador real assinado) e no worker (job com `workJob` e `handle`). Sem IA.

### Riscos
- **Ações do tópico `order` fora da doc**: a doc lista só `order.processed` como exemplo e diz que order vencida chega com `action` `canceled` ou `failed`. O código não depende do `action`: toda notificação válida vira uma consulta ao gateway.
- **Cancelamento recusado** (order já paga ou já expirada no gateway): `gateway_rejected` tratado como `warn`; o fluxo não depende dele.
- **`parse: "none"` e o `onError` do app**: um corpo não lido não passa pelo parser do Elysia, então o 400 de "corpo malformado" vem do service (`malformed`), não do `PARSE`. O teste cobre.

## Tasks

### M1 — core
- [ ] 1.1 `chargeId` no payload do `charge.reconcile`; `cancelCharge` na interface; `webhookAckSchema`; constantes `MAX_WEBHOOK_BODY_BYTES`, `WEBHOOK_RATE_LIMIT_PER_MINUTE`, `CHARGE_RECONCILE_BATCH_SIZE` · Verificação: `bun test` no core, `bun run typecheck`
- [ ] 1.2 `ChargeAmountMismatchError`, `decidePaymentConfirmation` com `amountCents`, `markOrderPaidInputSchema.amountCents`; `decideChargeReconciliation` e `chargeReconcileOutcomeList` · Verificação: `bun test` no core

### M2 — db
- [ ] 2.1 checks por status, migration 0006, `markOrderPaidAndEnqueue` com `amountCents` e `expiredChargeList`, fixtures ajustadas · Verificação: `bun run test:integration` no db
- [ ] 2.2 `charge/reconcile.ts` e `webhook/events.ts` com testes · Verificação: `bun run test:integration` no db

### M3 — integrations
- [ ] 3.1 `cancelCharge` no Mercado Pago (schema, fixture, testes) e no fake (`failNextCancel`, `cancelReferenceList`), `type` no `parseWebhook` do fake, caso de cancelamento no contrato · Verificação: `bun test` no integrations

### M4 — api
- [ ] 4.1 `webhook-rate-limit.ts` com unit · Verificação: `bun test` na api
- [ ] 4.2 `services/webhooks.ts`, `routes/webhooks.ts`, `errors.ts`, `app.ts` · Verificação: `bun run test:integration` na api (`webhooks.test.ts`)

### M5 — worker
- [ ] 5.1 config e montagem do gateway, `charge.reconcile` em `handledJobNameList` · Verificação: `bun test` no worker
- [ ] 5.2 `jobs/charge-reconcile.ts` com o teste de integração · Verificação: `bun run test:integration` no worker
- [ ] 5.3 api e worker no ar com `PAYMENT_GATEWAY=fake` contra o banco de dev, o worker com `FAKE_GATEWAY_UNKNOWN_CHARGE_STATUS=paid`: pedido levado a `awaiting_payment` pelo `confirm`, webhook do fake por `curl` (`x-fake-signature`, corpo `{ gatewayOrderId, action }`), worker reconcilia pelo job dirigido e o `GET` mostra `paid`; webhook repetido dá `duplicate`; `type=payment` dá `ignored`; dados apagados depois · Verificação: respostas, linhas em `webhook_event`, `charge`, `order` e `job`, e logs sem corpo nem e-mail

### M6 — docs e fechamento
- [ ] 6.1 `api.md`, `jobs.md`, `data-model.md`, `state-machine.md`, `payments.md`, `known-issues.md`, roadmap
- [ ] 6.2 `bun run lint`, `bun run typecheck`, `bun run test` e `test:integration` em db, integrations, api e worker

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-22 | Size revisto de M para L | toca core, db, integrations, api e worker e muda a interface do gateway; zona sensível (pagamento) |
| 2026-10-22 | `chargeId` no payload do `charge.reconcile` | um `GET` por webhook e cobre a cobrança já `expired` paga em dobro (RF-01); `jobs.md` e `api.md` são docs técnicos |
| 2026-10-22 | `cancelCharge` na interface, chamado depois do commit como melhor esforço | roadmap F2-04 e `state-machine.md` §4; IO fora da transação |
| 2026-10-22 | Sem janela de tolerância no `ts` | dedup por `webhook_event` e consulta ao gateway anulam o replay; janela recusaria por relógio |
| 2026-10-22 | 401 para assinatura inválida | o gateway reenvia e o segredo errado fica visível |
| 2026-10-22 | Divergência de valor ou referência: log `error`, sem ticket e sem escrita | caminho quase impossível; a varredura repete o alerta a cada 2 min |
| 2026-10-22 | `expired` também antes do `expire_datetime` quando o gateway já deu a order como `canceled`/`failed` | o gateway é a fonte; o comprador precisa de "gerar novo Pix" |
| 2026-10-22 | Revisão da spec (rodada 1, reprovada por 1 CRÍTICO): fake com `unknownChargeStatus` por env só no worker, para api e worker em processos separados; conferência agendada das cobranças expiradas pelo `markOrderPaidAndEnqueue` (`expire_datetime` + 5 min); desfecho do job declarado por caminho (`Err` não retryable nas anomalias); `gatewayPaymentId` da cobrança como fallback; `recordWebhookEvent` com `processed`; teto no `action`; índice `(status, insert_datetime)`; nomes de arquivo nos globs da regra de pagamentos | CRÍTICO e alertas aceitos; a sugestão de mover a fábrica do gateway para o `integrations` ficou de fora, porque os fakes vivem num entrypoint separado e a fábrica precisaria dos dois |

## Status
Spec escrita em 22/10/2026. A revisão da spec (rodada 1) reprovou por um CRÍTICO, a task 5.3 com o fake em memória em dois processos; a correção e os alertas estão na tabela de Decisões, e a rodada 2 revalida só esses pontos. M1 (core), M2 (db) e M3 (integrations) implementados antes da rodada 2 e ajustados conforme ela. Próximo passo: M4 (api) e M5 (worker).
