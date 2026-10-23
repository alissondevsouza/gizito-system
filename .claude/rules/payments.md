---
paths:
  - "packages/integrations/src/mercadopago/**"
  - "apps/api/src/routes/webhooks/**"
  - "apps/api/src/services/charge*"
  - "apps/worker/src/jobs/charge*"
  - "apps/api/src/services/charge-webhooks.ts"
---

# Pagamentos — Mercado Pago, Orders API (PRD 9.1)

## Criar cobrança
- `POST https://api.mercadopago.com/v1/orders` com header `X-Idempotency-Key` = `charge_id` interno; `type: "online"`, `total_amount: "29.90"` (de `KIT_PRICE_CENTS`), `external_reference: order_id`, `processing_mode: "automatic"`, `transactions.payments[0]` com `amount`, `payment_method: { id: "pix", type: "bank_transfer" }` e `expiration_time: "PT30M"` (dentro do pagamento: o modo automático não aceita `expiration_time` na raiz); `payer.email` = e-mail do pedido. **Não enviar CPF do comprador.** Adaptador em `packages/integrations/src/mercadopago/` (F2-03).
- Guardar `gateway_order_id`, `gateway_payment_id`, `qr_code`, `qr_code_base64` (nulo se vier vazio), `ticket_url`, `expire_datetime`. O `expire_datetime` é o calculado antes da chamada, uma fração de segundo antes do `date_of_expiration` do pagamento no gateway.
- O gateway expira a order em lote, de 1 a 2 minutos depois do vencimento (`canceled`/`expired`, sandbox em 22/10/2026). Nesse intervalo, a consulta ainda dá `action_required`: a reconciliação não pode tratar isso como erro.
- Cobrança nova só com a anterior expirada ou falha; um pedido tem no máximo uma cobrança ativa (trava do pedido na inserção). A vencida fica `pending` até a reconciliação consultar o gateway.
- Erros viram `PaymentGatewayError` (`gateway_unavailable`, `gateway_rejected`, `gateway_response_invalid`); rede, timeout e 5xx têm uma retentativa com a mesma chave; 429 não é retentado.

## Cancelar cobrança
- `cancelCharge(reference)`: `POST /v1/orders/{id}/cancel` sem corpo, `X-Idempotency-Key` = `cancel-{charge_id}`. O gateway só cancela `created` e `action_required`; outro estado dá 4xx → `gateway_rejected`. Quem chama trata como melhor esforço: a order não cancelada expira sozinha em 30 min.
- Uso: depois do commit de um pagamento, o worker cancela os outros Pix pendentes do pedido (F2-04). Não é reembolso.

## Webhook (F2-04: `apps/api/src/routes/webhooks/mercadopago.ts` e `services/charge-webhooks.ts`)
- Validar `x-signature` (HMAC-SHA256 em hexa com a assinatura secreta sobre `id:{data.id da query, em minúsculas};request-id:{x-request-id};ts:{ts};`, omitindo o par que falta, comparação em tempo constante) pelo `parseWebhook` do gateway e registrar em `webhook_event` com unique (`source`, `external_id` = `{data.id}:{action}`, `action` até `MAX_WEBHOOK_ACTION_LENGTH`). Duplicado → `200 { outcome: "duplicate" }` sem efeito.
- Respostas: assinatura inválida `401 unauthorized` (o gateway reenvia e o segredo errado aparece), corpo fora do formato `400 validation_error`, `type` que não é `order` `200 ignored`, order desconhecida `200 unknown_charge` com o evento já processado (`charge_not_found`), corpo acima de `MAX_WEBHOOK_BODY_BYTES` `413`, acima de `WEBHOOK_RATE_LIMIT_PER_MINUTE` por IP `429 rate_limited`.
- Responder 200 em menos de 22 segundos; nunca processar inline além de registrar e enfileirar `charge.reconcile { orderId, chargeId, webhookEventId }` na mesma transação. Sem janela de tolerância no `ts`: o unique e a consulta ao gateway anulam o replay.
- **Nunca confiar no corpo.** O worker consulta `GET /v1/orders/{id}` e confere `external_reference`, valor e status (`decideChargeReconciliation` do core) antes de qualquer transição.
- Transição `awaiting_payment → paid` + enfileiramento de `order.generate` em **uma transação** (`markOrderPaidAndEnqueue`, que confere o `amountCents` de novo). Idempotente por `gateway_payment_id`.
- Pagamento confirmado para pedido já `paid` ou posterior → no-op com log `info`; se for **outra** cobrança do mesmo pedido, `duplicate_payment` com ticket e log `error`.
- Pagamento confirmado após expiração da cobrança → ainda é válido: marcar pago e seguir (o dinheiro entrou).

## Reconciliação (F2-04: `apps/worker/src/jobs/charge-reconcile.ts`)
- Job `charge.reconcile` a cada 2 minutos para cobranças `pending` com mais de 1 minuto de pedidos `awaiting_payment`, em lotes de `CHARGE_RECONCILE_BATCH_SIZE`; consulta o gateway; marca `paid` (mesmo caminho do webhook) ou `expired` quando o gateway dá a order como vencida ou cancelada, mesmo antes do `expire_datetime`. Vencida pelo relógio e ainda `action_required` no gateway fica `pending` até a varredura seguinte.
- Com `orderId` e `chargeId` (webhook ou conferência agendada), consulta só aquela cobrança, em qualquer status do banco: é assim que o Pix antigo pago em dobro vira `duplicate_payment`.
- Depois do commit de um `paid`, `cancelCharge` nos outros Pix pendentes do pedido (melhor esforço, `warn cancel_failed`); o `markOrderPaidAndEnqueue` já agendou um `charge.reconcile` de cada um para `expire_datetime + CHARGE_RECONCILE_AFTER_EXPIRY_MINUTES`.
- Referência ou valor divergente → `payment_mismatch`: nada muda, log `error`, job dirigido `failed`. Erro do gateway: `gateway_unavailable` volta à fila; os outros são falha definitiva com o código; na varredura, qualquer erro é `warn` e a varredura segue.
- Dev e E2E com dois processos: `FAKE_GATEWAY_UNKNOWN_CHARGE_STATUS=paid|pending|expired` no worker faz o fake responder por `fake-order-*` que a api criou em outro processo (só com `PAYMENT_GATEWAY=fake`). Com `paid`, a varredura paga toda cobrança pendente com mais de 1 minuto, com ou sem webhook; a order desconhecida que o worker cancelou passa a responder `expired`.

## Reembolso
- Só via painel admin, com motivo; chama a API de reembolso (`POST /v1/orders/{id}/refund` sem corpo, total, chave `refund-{charge_id}`), grava `refund_id`, transição para `refunded`. Nunca automático.

## Segurança e logs
- Access token e segredo do webhook só por env; nunca em fixtures.
- Logar `chargeId`, `gatewayPaymentId`, status e código de erro; nunca `qr_code`, e-mail ou corpo bruto do webhook em nível acima de `debug`.
- Ambiente de teste do Mercado Pago com usuários de teste; nunca apontar testes automatizados para produção. O `test:payment-live` lê só `MERCADOPAGO_TEST_ACCESS_TOKEN`, nunca a chave da api.

## Plano B
- `AsaasGateway` implementa a mesma interface; troca por configuração (`PAYMENT_GATEWAY=mercadopago|asaas`).
