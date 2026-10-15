# ADR-0003: Fila de jobs no próprio PostgreSQL

**Data:** 2026-10-15
**Status:** aceito
**Decidido por:** Alisson

## Contexto

O PRD §5 exige que "confirmar Pix" e "enfileirar geração" aconteçam na mesma transação, e que a repetição de um webhook não gere kits duplicados (invariante 2 do CLAUDE.md). O PRD §9 decide que "a fila de jobs vive no próprio Postgres (pg-boss, verificando compatibilidade com Bun, ou fila própria com `FOR UPDATE SKIP LOCKED`)". O volume do piloto é de dezenas de pedidos por dia; a operação é um VPS só.

## Decisão

A fila vive no PostgreSQL da aplicação. Enfileirar um job é um `INSERT` na mesma transação que muda o estado do pedido; consumir é `SELECT ... FOR UPDATE SKIP LOCKED` (ou o equivalente do pg-boss). Não há Kafka, Redpanda, RabbitMQ nem Redis como broker; o Redis do compose serve só à Evolution API. Payloads são validados por `jobPayloadSchema` do core ao enfileirar e ao consumir. A escolha entre pg-boss e fila própria é feita pelo spike de F0-06 e registrada no ADR-0008.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Redis (BullMQ) | maduro, rápido | enfileirar fora da transação do banco: janela em que o pedido está `paid` sem job, ou job sem pedido pago; exige outbox para fechar |
| Kafka / Redpanda | escala, replay | infraestrutura desproporcional a dezenas de jobs por dia; mesma questão de atomicidade |
| Chamar o worker por HTTP após o webhook | simples | sem persistência: processo cai, geração some; retry e idempotência ficam por conta do chamador |

## Consequências

### Positivas
- `markOrderPaidAndEnqueue` e `publishKit` são transações comuns; idempotência decorre de unique em `webhook_event` e do estado do pedido.
- Um serviço a menos para operar, fazer backup e monitorar; o `pg_dump` diário leva a fila junto.
- Teste de integração com Postgres real cobre a fila sem container extra.

### Negativas
- Polling do worker (intervalo de segundos) em vez de push; latência de início de job de até alguns segundos, irrelevante para uma geração de minutos.
- Throughput limitado pelo banco; suficiente por ordens de grandeza para o piloto.

### Riscos
- pg-boss pode não rodar bem no Bun (roadmap §1.2); a alternativa própria com `SKIP LOCKED` tem poucas dezenas de linhas e está prevista.
- Jobs periódicos (`charge.reconcile`, `retention.purge`) precisam de agendamento sem duplicar execuções entre réplicas do worker: uma réplica no piloto; com mais, lock por nome do job.

## O que faria esta decisão mudar

- Volume que faça o polling ou o lock no Postgres aparecer em latência ou CPU (milhares de jobs por hora).
- Necessidade de consumidores fora do monorepo (outra linguagem, outro serviço).
