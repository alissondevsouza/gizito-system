---
paths:
  - "packages/integrations/src/mercadopago/**"
  - "apps/api/src/routes/webhooks/**"
  - "apps/api/src/services/charge*"
  - "apps/worker/src/jobs/charge*"
---

# Pagamentos — Mercado Pago, Orders API (PRD 9.1)

## Criar cobrança
- `POST https://api.mercadopago.com/v1/orders` com header `X-Idempotency-Key` = `charge_id` interno; `type: "online"`, `total_amount: "29.90"` (de `KIT_PRICE_CENTS`), `external_reference: order_id`, `processing_mode: "automatic"`, `transactions.payments[0]` com `amount`, `payment_method: { id: "pix", type: "bank_transfer" }` e `expiration_time: "PT30M"` (dentro do pagamento: o modo automático não aceita `expiration_time` na raiz); `payer.email` = e-mail do pedido. **Não enviar CPF do comprador.** Adaptador em `packages/integrations/src/mercadopago/` (F2-03).
- Guardar `gateway_order_id`, `gateway_payment_id`, `qr_code`, `qr_code_base64` (vazio no sandbox, gravado nulo), `ticket_url`, `expire_datetime`. A resposta não traz vencimento: vale o calculado antes da chamada.
- Cobrança nova só com a anterior expirada ou falha; um pedido tem no máximo uma cobrança ativa (trava do pedido na inserção). A vencida fica `pending` até a reconciliação consultar o gateway.
- Erros viram `PaymentGatewayError` (`gateway_unavailable`, `gateway_rejected`, `gateway_response_invalid`); rede, timeout e 5xx têm uma retentativa com a mesma chave; 429 não é retentado.

## Webhook
- Validar `x-signature` (HMAC-SHA256 em hexa com a assinatura secreta sobre `id:{data.id da query, em minúsculas};request-id:{x-request-id};ts:{ts};`, omitindo o par que falta, comparação em tempo constante) e registrar em `webhook_event` com unique (`source`, `external_id`). Duplicado → 200 sem efeito.
- Responder 200 em menos de 22 segundos; nunca processar inline além de registrar e enfileirar.
- **Nunca confiar no corpo.** Consultar `GET /v1/orders/{id}` (ou `/v1/payments/{id}`) e conferir `external_reference`, valor e status antes de qualquer transição.
- Transição `awaiting_payment → paid` + enfileiramento de `order.generate` em **uma transação** (`markOrderPaidAndEnqueue`). Idempotente por `gateway_payment_id`.
- Pagamento confirmado para pedido já `paid` ou posterior → no-op com log `info`.
- Pagamento confirmado após expiração da cobrança → ainda é válido: marcar pago e seguir (o dinheiro entrou).

## Reconciliação
- Job `charge.reconcile` a cada 2 minutos para cobranças `awaiting_payment` com mais de 1 minuto; consulta o gateway; marca `paid` (mesmo caminho do webhook) ou `charge_expired` após `expire_datetime`.

## Reembolso
- Só via painel admin, com motivo; chama a API de reembolso (`POST /v1/orders/{id}/refund` sem corpo, total, chave `refund-{charge_id}`), grava `refund_id`, transição para `refunded`. Nunca automático.

## Segurança e logs
- Access token e segredo do webhook só por env; nunca em fixtures.
- Logar `chargeId`, `gatewayPaymentId`, status e código de erro; nunca `qr_code`, e-mail ou corpo bruto do webhook em nível acima de `debug`.
- Ambiente de teste do Mercado Pago com usuários de teste; nunca apontar testes automatizados para produção. O `test:payment-live` lê só `MERCADOPAGO_TEST_ACCESS_TOKEN`, nunca a chave da api.

## Plano B
- `AsaasGateway` implementa a mesma interface; troca por configuração (`PAYMENT_GATEWAY=mercadopago|asaas`).
