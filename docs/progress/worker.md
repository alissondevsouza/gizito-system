# Progresso: worker

**Workspace:** `@gizito/worker`
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-16

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Workspace criado com `package.json` (`imports` `#src/*`, deps `@gizito/core`, `@gizito/db`, `@gizito/integrations`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test; scripts `dev` (`bun --watch`) e `build` (`bun build --target=bun`).

## Feature esqueleto-das-apps (2026-10-16, `c579f79`)

- `src/config.ts`: `workerConfigSchema` (`WORKER_HEALTH_PORT` 3002, `GENERATE_CONCURRENCY` ≥ 1 default 2, mesma recusa do gateway fake em produção); fail-fast como a api.
- `src/runner/`: `buildJobLaneList` (raias `generate`, `charge_reconcile`, `retention_purge` e `default` com 2 vagas; só nomes com handler) e `startJobRunner` (vaga em laço sobre `workJob`, pausa de 1 s com fila vazia e 5 s após erro de banco, log por job sem payload, `cause` em `debug`, `payload_invalid` em `error`, `stop()` espera os jobs em curso).
- `src/scheduler.ts`: `startScheduler` com `enqueueSingletonJob` (chave `scheduled`) para `charge.reconcile` a cada 2 min e `retention.purge` a cada 24 h, só se houver handler, e manutenção a cada 60 s com `recoverExpiredJobs`.
- `src/health.ts` e `src/health-server.ts`: `GET /health` em `Bun.serve` com `getQueueMetrics`; `503` com o runner parando ou sem banco.
- `src/jobs/index.ts`: `jobHandlerMap` vazio; em dev o worker só faz manutenção e health.
- Testes: 16 unit (config, raias, laço sem banco, health, agendador, boot sem env) e 12 de integração (consumo e log, teto de `GENERATE_CONCURRENCY`, raia sem handler, `stop` com job em curso, retry e causa em `debug`, payload inválido, agendador singleton, recuperação de lock, health 200/503/404, processo com `SIGTERM`).

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Loop da fila por raias, agendador, manutenção de locks e `/health` com métricas (F0-07)

## Pendências

- Handlers: `order.analyze` (F1/F2-02), `order.generate` (F2-05), `order.notify` (F2-07), `charge.reconcile` (F2-04), `retention.purge` (F2-06), `whatsapp.inbound` (F2-10); cada um entra em `jobHandlerMap` e passa a ser consumido e agendado sozinho
- Desligamento sem teto de tempo e lock sem renovação (known-issues)
