# Progresso: worker

**Workspace:** `@gizito/worker`
**Fase atual:** F2 — Fluxo comercial (F1 concluída em 2026-10-21)
**Última atualização:** 2026-10-21

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

## Fase F1: pipeline, render, CLI e regressão (2026-10-20 e 2026-10-21)

- **pipeline-extracao** (F1-06, `31b3a8b`): prompt `extract` v1 e `analyzeMaterial` em `src/pipeline/extract.ts`. Faz uma chamada por foto, em paralelo, com uma nova chamada para saída inválida, e guarda cache por hash (`extraction-cache.ts`).
- **pipeline-geracao** (F1-07, `690a62b`): prompts `plan`, `generate` e `review` e o `generateKit` em `src/pipeline/generate.ts`. Cobre alocação, plano, geração, composição, validação com mathjs e KaTeX (`math-markup.ts`), revisão, uma regeneração pelo código mais forte e o teto de custo. Cada chamada é registrada em `ai-call.ts`.
- **render-pdf** (F1-08, `986ea36`): `renderKit` e `createPdfRenderer` em `src/render/`, com templates `kit-v1`, KaTeX no servidor, conferência no DOM e segunda tentativa. Também o script `render:kit` e o `Dockerfile` com Chromium.
- **cli-do-pipeline** (F1-09, `a4a247c`): `runPipeline` em `src/pipeline/run-pipeline.ts`, sem banco nem fila, e o `bun run pipeline` na raiz (`scripts/pipeline.ts`, `src/cli/`).
- **regressao-pedagogica** (F1-10, `708b1b9`): `bun run test:pedagogy` (`scripts/pedagogy-regression.ts`, `src/regression/`), com relatório pelos critérios do gate. Também os prompts `generate` e `review` v2.
- **homologacao-e-amostras** (F1-11): `isSample` no `renderKit` e `render:kit --sample` (selo “Kit de amostra” na capa e no rodapé).
- Testes: 343 unit. A integração do render tem 19 testes.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Loop da fila por raias, agendador, manutenção de locks e `/health` com métricas (F0-07)
- [x] Pipeline de extração e geração, sem banco nem fila (F1-06, F1-07, F1-09)
- [x] Render dos dois PDFs, imagem com Chromium e marca de amostra (F1-08, F1-11)
- [x] Regressão pedagógica `bun run test:pedagogy` (F1-10)

## Pendências

- Handlers: `order.analyze` (F2-02), `order.generate` (F2-05), `order.notify` (F2-07), `charge.reconcile` (F2-04), `retention.purge` (F2-06), `whatsapp.inbound` (F2-10); cada um entra em `jobHandlerMap` como `{ handle, onExhausted? }` e passa a ser consumido e agendado sozinho; `onExhausted` de cada job conforme `jobs.md` §4
- Dívidas da geração em `known-issues.md`: tempo p95 acima de 5 min (MEDIUM) e 7º ano de Português com 1 kit pronto em 7 gerações (HIGH)
