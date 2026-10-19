# Progresso: worker

**Workspace:** `@gizito/worker`
**Fase atual:** F1 — Prova técnica e pedagógica (F0 concluída em 2026-10-16)
**Última atualização:** 2026-10-19

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Workspace criado com `package.json` (`imports` `#src/*`, deps `@gizito/core`, `@gizito/db`, `@gizito/integrations`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test; scripts `dev` (`bun --watch`) e `build` (`bun build --target=bun`).

## Feature esqueleto-das-apps (2026-10-16, `c579f79`)

- `src/config.ts`: `workerConfigSchema` (`WORKER_HEALTH_PORT` 3002, `GENERATE_CONCURRENCY` ≥ 1 default 2, `PAYMENT_GATEWAY` obrigatória e as mesmas guardas de produção da api); fail-fast como a api. O `/health` sobe antes do runner, para porta ocupada derrubar o processo antes de qualquer claim.
- `src/runner/`: `buildJobLaneList` (raias `generate`, `charge_reconcile`, `retention_purge` e `default` com 2 vagas; só nomes com handler) e `startJobRunner` (vaga em laço sobre `workJob`, pausa de 1 s com fila vazia e 5 s após erro de banco, log por job sem payload, `cause` em `debug`, `payload_invalid` em `error`, `stop()` espera os jobs em curso).
- `src/scheduler.ts`: `startScheduler` com `enqueueSingletonJob` (chave `scheduled`) para `charge.reconcile` a cada 2 min e `retention.purge` a cada 24 h, só se houver handler, e manutenção a cada 60 s com `recoverExpiredJobs`.
- `src/health.ts` e `src/health-server.ts`: `GET /health` em `Bun.serve` com `getQueueMetrics`; `503` com o runner parando ou sem banco.
- `src/jobs/index.ts`: `jobHandlerMap` vazio; em dev o worker só faz manutenção e health.
- Testes: 18 unit (config, raias, laço sem banco, health, agendador, boot sem env) e 12 de integração (consumo e log, teto de `GENERATE_CONCURRENCY`, raia sem handler, `stop` com job em curso, retry e causa em `debug`, payload inválido, agendador singleton, recuperação de lock, health 200/503/404, processo com `SIGTERM`).

## Ajustes em revisao-f0 (2026-10-19, `37f121e`)

- `src/runner/lanes.ts`: `JobDefinition = { handle, onExhausted? }`; raias `generate` (até `MAX_GENERATE_CONCURRENCY` = 8), `charge_reconcile` (2), `retention_purge` (1), `analyze` (2) e `default` (2); `countWorkerConnections` dimensiona o pool em 2 × vagas + 2; `buildExhaustedJobDispatcher`.
- `src/runner/job-runner.ts`: passa o sinal de desligamento a `workJob`, loga `released` e `lease_renew_failed` em `warn` e `job_compensation_failed` em `error`.
- `src/scheduler.ts`: manutenção a cada 30 s com o `onExhausted` do mapa de handlers. `src/index.ts`: fecha o banco com teto de 5 s.
- Testes: 21 unit e 17 de integração.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Loop da fila por raias, agendador, manutenção de locks e `/health` com métricas (F0-07)

## Pendências

- Handlers: `order.analyze` (F1/F2-02), `order.generate` (F2-05), `order.notify` (F2-07), `charge.reconcile` (F2-04), `retention.purge` (F2-06), `whatsapp.inbound` (F2-10); cada um entra em `jobHandlerMap` como `{ handle, onExhausted? }` e passa a ser consumido e agendado sozinho; `onExhausted` de cada job conforme `jobs.md` §4
