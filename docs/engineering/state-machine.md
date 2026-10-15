# Máquina de estados do pedido

**Versão:** 1.0 · **Data:** 2026-10-15 · **Fonte:** PRD §5; design doc §6.8 · **Código:** `packages/core/src/order/state-machine.ts` (F0-04) · **Regras:** `.claude/rules/core.md`

O estado do pedido só muda pela função `transitionOrder(status, event)` do core, chamada por um service **dentro de uma transação** (invariante 1). A máquina é dado (`orderTransitionList`), não código: toda transição válida está na tabela abaixo e toda combinação fora dela devolve `InvalidTransitionError` sem lançar.

## 1. Diagrama

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> analyzing: start_analysis
  analyzing --> preview_ready: analysis_succeeded
  analyzing --> draft: analysis_failed
  preview_ready --> awaiting_payment: confirm
  awaiting_payment --> paid: payment_confirmed
  paid --> processing: generation_started
  processing --> ready: kit_published
  processing --> failed: generation_failed
  failed --> paid: reprocess
  paid --> refunded: refund
  processing --> refunded: refund
  ready --> refunded: refund
  failed --> refunded: refund
  refunded --> [*]
```

## 2. Transições

| De | Evento | Para | Quem dispara | Quando |
|---|---|---|---|---|
| `draft` | `start_analysis` | `analyzing` | worker, `order.analyze` | ao pegar o job |
| `analyzing` | `analysis_succeeded` | `preview_ready` | worker, `order.analyze` | extração devolveu ao menos um candidato e material suficiente; o teto de 3 assuntos é da confirmação |
| `analyzing` | `analysis_failed` | `draft` | worker, `order.analyze` | fotos insuficientes ou ilegíveis; avisos por foto gravados |
| `preview_ready` | `confirm` | `awaiting_payment` | api, `POST /orders/:token/confirm` | assuntos, e-mail e aceite válidos; a cobrança é criada no gateway antes (idempotente por `chargeId`) e gravada na mesma transação da transição |
| `awaiting_payment` | `payment_confirmed` | `paid` | worker, `charge.reconcile` (disparado pelo webhook com `orderId` ou pelo agendador) | **após consultar o gateway**; `markOrderPaidAndEnqueue` enfileira `order.generate` e expira as demais cobranças `pending` do pedido na mesma transação |
| `paid` | `generation_started` | `processing` | worker, `order.generate` | ao pegar o job |
| `processing` | `kit_published` | `ready` | worker, `publishKit` | os dois PDFs no storage e validações críticas verdes |
| `processing` | `generation_failed` | `failed` | worker, `order.generate` | bloqueador persistente após uma regeneração, custo excedido ou erro não transitório; `fail_reason_code` gravado |
| `failed` | `reprocess` | `paid` | admin | reenfileira `order.generate`; o job sempre parte de `paid` |
| `paid`, `processing`, `ready`, `failed` | `refund` | `refunded` | admin, com motivo | após reembolso no gateway; `refund_id` gravado na cobrança |

Estados terminais: só `refunded`. Estados em que o WhatsApp pode ser vinculado (`isWhatsappLinkableOrderStatus`, PRD §9.2): `paid`, `processing`, `ready`.

## 3. Sub-estado `charge_expired`

Não é um status do pedido. Com o pedido em `awaiting_payment`, o sub-estado deriva da cobrança ativa: `deriveAwaitingPaymentSubstate(charge, now)` devolve `charge_expired` quando a cobrança está `expired` ou é `pending` com `expire_datetime <= now`. "Gerar novo Pix" (`POST /orders/:token/charges`) cria outra cobrança no mesmo pedido; o status continua `awaiting_payment`. Um pedido tem no máximo uma cobrança ativa.

## 4. Casos obrigatórios (PRD §5)

| Situação | Comportamento |
|---|---|
| Webhook repetido | `webhook_event` é unique por (`source`, `external_id`): segundo recebimento responde 200 sem efeito |
| Pagamento confirmado para pedido já `paid` ou posterior | no-op na máquina (`transitionOrder` recusaria de qualquer forma); se for **outra cobrança** do mesmo pedido, o responsável pagou duas vezes: `markOrderPaidAndEnqueue` abre `support_ticket` `duplicate_payment` e dispara alerta para reembolso manual pelo admin |
| Pix pago depois da cobrança expirar | ainda vale: `payment_confirmed` segue e as demais cobranças `pending` do pedido viram `expired` (canceladas no gateway quando a API permitir), para um segundo Pix já gerado não ser pago também |
| Webhook atrasado ou perdido | `charge.reconcile` consulta o gateway a cada 2 minutos para cobranças `awaiting_payment` com mais de 1 minuto |
| Falha de geração | uma regeneração automática dentro do mesmo job; persistindo, `generation_failed` e aviso ao responsável (`kit_failed`) |
| Reembolso durante `processing` | `refund` leva a `refunded`; quando o job tentar `kit_published`, a máquina recusa e o kit não é publicado |
| Arquivo final indisponível | `publishKit` só roda com as duas keys; sem elas o pedido não chega a `ready` |

## 5. Estado → rota (design doc §6.8)

O web decide a rota canônica a partir do status devolvido por `GET /orders/:token` e redireciona ao abrir rota incompatível. A tabela completa está no design doc §6.8; `failed` e `refunded` vão para `/pedido/:token/erro`. Token inexistente devolve 404 neutro e a página "Pedido não encontrado".

## 6. Testes

`packages/core/src/__tests__/order/state-machine.test.ts`: a tabela é comparada com a lista literal da jornada do PRD; cada transição válida é testada; todas as 77 combinações status × evento fora da tabela devolvem `InvalidTransitionError` com `from` e `event`; `payment_confirmed` só é aceito de `awaiting_payment`. Services que persistem transições têm teste de integração com Postgres real (F0-05 em diante).

## Histórico

- **1.0 (2026-10-15):** versão inicial (F0-03), espelhando o código de F0-04.
