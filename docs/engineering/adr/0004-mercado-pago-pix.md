# ADR-0004: Mercado Pago (Orders API) como gateway Pix, atrás de `PaymentGateway`

**Data:** 2026-10-15
**Status:** aceito
**Decidido por:** Alisson

## Contexto

O produto cobra R$ 29,90 por Pix, de pessoa física para pessoa física, sem cadastro do comprador e sem CPF (PRD §6, §9.1). A conta do vendedor é pessoa física. O gateway precisa de: aceitar PF, taxa baixa em ticket pequeno, sandbox, webhook assinado, consulta de status e reembolso por API. A comparação de candidatos está no PRD §9.1.

## Decisão

Mercado Pago pela Orders API (`POST /v1/orders` com `payment_method: pix`, `expiration_time: PT30M`, `X-Idempotency-Key` = id interno da cobrança). O domínio só conhece a interface `PaymentGateway` do core (`createCharge`, `getChargeStatus`, `refund`, `parseWebhook`); o adaptador vive em `packages/integrations/src/mercadopago/`. A transição `awaiting_payment → paid` só acontece após consultar o recurso no gateway, nunca pelo corpo do webhook, e junto com o enfileiramento de `order.generate` na mesma transação (ADR-0003). Reconciliação periódica (`charge.reconcile`) cobre webhook perdido. Asaas é o plano B atrás da mesma interface, trocado por `PAYMENT_GATEWAY`.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Efí (API Pix do BCB) | taxa competitiva | certificado mTLS e setup mais complexo; PF a confirmar |
| Asaas | REST simples, aceita PF | R$ 1,99 fixo por Pix (≈ 6,7% do ticket) após 3 meses; fica como plano B |
| Stripe, Pagar.me, Woovi | maduros | exigem CNPJ |
| Integrar direto com o banco (API Pix) | sem intermediário | exige conta PJ e homologação; fora do alcance do piloto |

## Consequências

### Positivas
- Custo por venda em torno de R$ 0,30; dinheiro disponível na hora.
- Webhook assinado + consulta ativa + idempotência por `gateway_payment_id` fecham os casos do PRD §5 (webhook duplicado, atrasado, pagamento após expiração).
- Troca de gateway é um adaptador novo e uma variável de ambiente.

### Negativas
- Conta nova pode passar por análise de risco e retenção; mitigação: abrir a conta em F0 para envelhecer.
- A taxa citada vem de terceiros; confirmar na conta (known issue LOW).

### Riscos
- Mudanças na Orders API (ainda recente) quebrarem o adaptador: fixtures gravadas e teste de contrato no sandbox antes de cada deploy que toque pagamentos.

## O que faria esta decisão mudar

- Retenção de saldo ou bloqueio da conta durante o piloto → ativar Asaas.
- Mudança de taxa que torne outro gateway claramente mais barato em R$ 29,90.
- Abertura de CNPJ, que reabre os candidatos descartados.
