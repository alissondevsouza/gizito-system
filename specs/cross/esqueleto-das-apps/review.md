---
feature: F0-07 esqueleto-das-apps
module: cross
round: 1
verdict: APROVADO
updated: 2026-10-16
---

# Review: F0-07 esqueleto-das-apps

## Rodada 1

Verifier: `gizito-implement-verifier` (spawn novo, contexto isolado). Diff: `git diff main...HEAD` nos commits `c579f79` a `bd20b84`.

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint`, `typecheck`, `test`, `test:integration`, `build` (orquestrador) | verdes; o verifier conferiu as contagens contra os arquivos do diff sem rodar de novo |
| probe da api real com rotas extras (scratchpad) | corpo malformado e Zod inválido → 400 `validation_error`; exceção → 500 `internal_error` com log só de `errorName`; `throw status(404, …)` → 500 (achado); log de request com `route` `/orders/:token`, sem a URL; `debug` com `err.message` completo (achado) |
| probe de plugin | `onError`, `onAfterResponse` e CORS valem para rotas de plugin |
| `bun --bun vite dev` + `curl` | `/` 200 com `lang="pt-BR"`, título, `bg-paper text-ink`, h1 Gizito; `/nao-existe` 404 com h1 e link para `/` |
| `DATABASE_URL=… WEB_PUBLIC_URL=… bun run dev --filter=@gizito/api` | sai com 1: o Turbo em strict mode descarta as variáveis do shell (achado) |
| `bun apps/api/dist/index.js` e `bun apps/worker/dist/index.js` com `NODE_ENV=production`, `PAYMENT_GATEWAY=mercadopago` | `/health` 200 nos dois; `SIGTERM` sai com 0; Pino funciona no bundle |
| `git diff -- .env.example` | permissão negada ao verifier; não inspecionado |
| regressão pedagógica | não aplicável |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `packages/core/src/__tests__/config/schemas.test.ts`, `api/errors.test.ts`, `health/schemas.test.ts`, `jobs/rules.test.ts`, `index.test.ts`; faltava asserção de `JOB_FAILED_METRIC_WINDOW_HOURS` |
| RF-02 | sim | `packages/db/src/__tests__/integration/queue-metrics.test.ts`, `queue.test.ts` (callback em claim e work), `health.test.ts` |
| RF-03 | sim | `packages/integrations/src/__tests__/logger.test.ts` |
| RF-04 | sim no aceite | `apps/api/src/__tests__/config.test.ts`, `boot.test.ts`; nomes divergiam da spec |
| RF-05 | sim | `apps/api/src/__tests__/app.test.ts`, `integration/health.test.ts`; 400 e 500 conferidos por probe |
| RF-06 | sim | `apps/worker/src/__tests__/config.test.ts`, `boot.test.ts` |
| RF-07 | sim | `apps/worker/src/__tests__/integration/runner.test.ts`, `runner/job-runner.test.ts` |
| RF-08 | sim | `apps/worker/src/__tests__/integration/scheduler.test.ts` |
| RF-09 | sim | `apps/worker/src/__tests__/integration/health.test.ts`, `health.test.ts` |
| RF-10 | sim | testes de processo com `SIGTERM` em api e worker, reproduzidos com o `dist`; segundo sinal sem teste (fora do aceite) |
| RF-11 | sim | testes Vitest de rota, 404 e tokens; SSR conferido no `vite dev` |
| RF-12 | parcial | `--env-file` correto; variáveis do shell não chegavam às apps em `bun run dev` |
| RF-13 | sim | `api.md` 1.1, `jobs.md` 1.2, roadmap, progress de 6 módulos, README, lessons, known-issues |

### Achados
- [ALERTA] `apps/api/src/errors.ts:23-29` — `throw status(404, { code: "order_not_found" })` chegava ao `onError` com código numérico e virava 500 com log `error` — em F2-01 um token inválido daria 500 ao comprador e alerta falso — devolver o status e o corpo lançados; mapear `INVALID_FILE_TYPE` para 400.
- [ALERTA] `apps/api/src/app.ts:31`, `apps/worker/src/runner/job-runner.ts:83,110`, `apps/worker/src/scheduler.ts:110` — `{ err }` em `debug` serializa mensagem, stack e propriedades enumeráveis; a redação do Pino não alcança `err.message` — violação de unique traria `Key (email)=(fulano@x.com)` no log — serializer de `err` sem mensagem crua, ou recusar `debug` em produção.
- [ALERTA] `packages/core/src/config/schemas.ts:17,25` — `NODE_ENV` default `development` e `PAYMENT_GATEWAY` default `fake` abrem a guarda — deploy sem as duas variáveis sobe com gateway fake sem recusa — tornar uma delas obrigatória.
- [ALERTA] `turbo.json:12` — task `dev` em strict env mode descarta as variáveis do shell — a evidência de RF-12 veio de `--env-mode=loose` — `passThroughEnv` na task ou reescrever o aceite.
- [ALERTA] `apps/api/src/config.ts:12`, `apps/worker/src/config.ts:13` — spec pede `parseApiConfig`/`parseWorkerConfig` com `Result`, `createApp({ config })` e `generateConcurrency` no runner; o código usa os schemas, `webPublicUrl` e `laneList` — spec desatualizada — atualizar RF-04 a RF-07.
- [SUGESTÃO] `apps/worker/src/index.ts:29-37` — health sobe depois do runner; com porta ocupada o processo cai depois de reclamar job, que fica preso 15 min — subir o servidor antes.
- [SUGESTÃO] `packages/db/src/queue/metrics.ts:26-39` — `count(*) FILTER` sem `WHERE` varre a tabela inteira a cada `/health`, e `completed` nunca é apagado — restringir a `pending`, `active` e falhas da janela.
- [SUGESTÃO] `apps/worker/src/health-server.ts:25`, `apps/api/src/routes/health.ts:13`, `apps/worker/src/health.ts:36` — mensagem do 404 e `database_unavailable` repetidos — centralizar no core.
- [SUGESTÃO] `packages/integrations/src/index.ts:1` — fake `createMemoryLogger` no entrypoint de produção — subpath `@gizito/integrations/fakes`.
- [SUGESTÃO] `apps/api/src/__tests__/integration/helpers.ts`, `apps/worker/src/__tests__/integration/helpers.ts` — `findFreePort` e `waitForHttpStatus` duplicados.

### Regressão pedagógica
Não aplicável: a feature não toca prompt, modelo, taxonomia nem validador.

### Resposta do orquestrador
Corrigidos no commit de fechamento:
- **Status lançado:** `toApiErrorResponse` reconhece `ElysiaCustomStatusResponse`; com corpo do contrato e status ≥ 400 devolve o mesmo status e corpo, senão 500. `INVALID_FILE_TYPE` → 400. Testes no mapper e no app real com rotas encadeadas (`/lancado` 404 sem log de erro, `/excecao` 500 com log só do nome, corpo malformado e fora do schema → 400).
- **`err` em debug:** as duas saídas. `serializeLogError` (integrations) é o serializer de `err` do logger: tipo, código, mensagem e stack com e-mail, token e telefone mascarados (`scrubLogText`), causa até 3 níveis, sem `detail`, `query` nem `params`. E `checkProductionEnvironment` recusa `LOG_LEVEL` `debug`/`trace` com `NODE_ENV=production`, como pede a rule de privacidade.
- **Defaults abrindo a guarda:** `PAYMENT_GATEWAY` ficou obrigatória (sem default) nas duas apps; o `.env.example` já trazia `PAYMENT_GATEWAY=fake` para dev.
- **Strict env do Turbo:** `passThroughEnv: ["*"]` na task `dev` (sem cache, não afeta hash); conferido com `DATABASE_URL=… WEB_PUBLIC_URL=… PAYMENT_GATEWAY=fake bun run dev`: api e worker 200. Lição em `docs/lessons.md`.
- **Spec desatualizada:** RF-01, RF-03 a RF-07 e RF-12 reescritos com os nomes e o comportamento reais.
- Sugestões aplicadas: health do worker antes do runner; métricas com `WHERE status IN ('pending','active') OR (failed na janela)`; `DATABASE_UNAVAILABLE_ERROR_CODE` no core e 404 do health do worker sem corpo (porta interna, sem texto para usuário); fakes só por `@gizito/integrations/fakes`. Asserção de `JOB_FAILED_METRIC_WINDOW_HOURS` adicionada.

Contestado:
- **Helpers de teste duplicados:** são ~25 linhas de código de teste em dois workspaces; um pacote compartilhado de utilitários de teste custaria mais (workspace, exports, deps) do que a duplicação. Reavaliar se um terceiro workspace precisar deles.

Verificação depois das correções: `bun run lint` verde; `typecheck` 6/6; `test` core 233, db 98, api 23, worker 18, integrations 12, web 6; `test:integration` db 101, worker 12, api 2; `build` 3/3. Sem CRÍTICO, então sem rodada 2.
