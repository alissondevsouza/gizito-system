---
feature: F0-07 esqueleto-das-apps
module: cross
size: M
status: in_progress
branch: feat/cross/esqueleto-das-apps
updated: 2026-10-16
---

# F0-07 esqueleto-das-apps

## Objetivo
Levar as três apps de "workspace vazio" a processos que sobem com `bun run dev`: a api Elysia com config Zod fail-fast, `/health` que checa o banco, erros no formato `{ error, code }`, CORS restrito ao web e log estruturado; o worker com o loop da fila sobre `workJob`, recuperação de locks vencidos, agendador dos jobs periódicos e `/health` com métricas da fila; o web TanStack Start com uma página vazia nos tokens de cor do design doc §4.1. Fecha a última feature da F0. Fontes: roadmap §3 F0-07, `docs/engineering/api.md` §1, §2 e §6, `jobs.md` §1, §4, §5 e §6, `architecture.md` §3 e §7, pendências de `docs/progress/db.md`, rules `api.md`, `worker.md`, `frontend.md`, `testing.md`.

## Requisitos e critérios de aceite
- **RF-01** — Core: `sharedEnvironmentSchema` (`NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`, `HOST` com default `127.0.0.1`) para as apps estenderem; `apiErrorCodeList` (os códigos de `api.md` §1 mais `not_found` e `internal_error`) e `apiErrorSchema`; `healthStatusList` (`ok`, `unavailable`), `apiHealthSchema`, `queueMetricsSchema` e `workerHealthSchema`; `RETENTION_PURGE_INTERVAL_HOURS = 24`; `jobErrorCodeMap.handlerNotFound` · Aceite: testes unit dos schemas; teste de pureza verde.
- **RF-02** — Db: `pingDatabase(executor)`; `getQueueMetrics(executor, { now, failedSinceDatetime })` devolve `readyCount`, `oldestReadyAgeSeconds` (null sem job pronto), `activeCount`, `failedCount` e `payloadInvalidCount` na janela, numa consulta; `claimJob`/`workJob` aceitam `onPayloadInvalid({ jobId, name })`, chamado para cada job que o claim leva a `failed` por `payload_invalid` · Aceite: integração cobre as cinco métricas (job futuro não conta como pronto, falha fora da janela não conta) e o callback.
- **RF-03** — Integrations: `createLogger({ service, level, destination? })` com Pino em JSON, campo `service` e redação (`[redacted]`) de `email`, `phone`, `token`, `publicToken`, `payload`, `text` no topo e um nível abaixo · Aceite: teste unit grava num destino em memória e confirma JSON, `service` e redação.
- **RF-04** — Api: `src/config.ts` com `parseApiConfig(env)` → `Result` (`API_PORT` default 3001, `WEB_PUBLIC_URL` obrigatória); `src/index.ts` sem config válida escreve no stderr a lista de campos com `z.prettifyError` e sai com código 1, antes de abrir porta ou banco · Aceite: unit sem `DATABASE_URL` devolve erro que nomeia o campo; processo filho sem `DATABASE_URL` sai com 1 e stderr contém `DATABASE_URL`.
- **RF-05** — Api: `createApp({ db, logger, config })` com `GET /health` (handler → `checkApiHealth` → `pingDatabase`; banco travado fica limitado pelo timeout de conexão do Bun.SQL e pelo timeout do monitor): `200 { status: "ok" }` com banco, `503 { status: "unavailable" }` sem banco, ambos validados por `apiHealthSchema` como response da rota; rota desconhecida → `404 { error, code: "not_found" }`; erro de validação ou corpo malformado → `400 { error, code: "validation_error" }`; erro inesperado → `500 { error, code: "internal_error" }` com log `error` só do nome do erro; CORS só para a origem de `WEB_PUBLIC_URL`; um log `info` por resposta com `method`, `route` (o padrão da rota, nunca a URL, que carrega token), `status` e `durationMs` · Aceite: unit com banco inalcançável (503), 404, CORS permitido e negado, log sem a URL; integração com banco de teste devolve 200.
- **RF-06** — Worker: `src/config.ts` com `parseWorkerConfig(env)` (`WORKER_HEALTH_PORT` default 3002, `GENERATE_CONCURRENCY` inteiro ≥ 1 default 2) e o mesmo fail-fast da api · Aceite: unit; processo filho sem `DATABASE_URL` sai com 1 nomeando o campo.
- **RF-07** — Worker: `startJobRunner({ db, handlerMap, workerId, logger, generateConcurrency, pollIntervalMs })` com raias `order.generate` (`GENERATE_CONCURRENCY`), `charge.reconcile` (1), `retention.purge` (1) e padrão (`order.analyze`, `order.notify`, `whatsapp.inbound`; 2), cada vaga em laço sobre `workJob` com a lista de nomes da raia que têm handler; raia sem handler não sobe; fila vazia dorme `pollIntervalMs`; erro do laço (banco fora) é logado e a vaga tenta de novo depois de um intervalo, sem morrer; um log por job com `jobId`, `jobName`, `orderId` quando o payload tem, `attemptCount`, `outcome`, `errorCode` e `durationMs`, sem payload; `cause` só em `debug`; `payload_invalid` gera log `error`; `stop()` para de reclamar e espera os jobs em curso · Aceite: integração: job consumido e concluído; nunca mais de `GENERATE_CONCURRENCY` handlers de `order.generate` ao mesmo tempo; raia sem handler não consome; `stop()` resolve só depois do job em curso terminar; payload inválido loga `error`.
- **RF-08** — Worker: `startScheduler({ db, handledNameList, logger })` enfileira com `enqueueSingletonJob` e chave fixa, na partida e a cada intervalo, `charge.reconcile` (a cada `CHARGE_RECONCILE_INTERVAL_MINUTES`) e `retention.purge` (a cada `RETENTION_PURGE_INTERVAL_HOURS`), só os que o worker consome; e uma manutenção a cada 60 s que chama `recoverExpiredJobs` e loga `warn` quando devolve algo · Aceite: integração: duas partidas seguidas deixam um só job pendente por nome; nome sem handler não é agendado; job `active` com lock vencido volta a `pending` na manutenção.
- **RF-09** — Worker: `GET /health` em `Bun.serve` (`HOST`, `WORKER_HEALTH_PORT`): `200 { status: "ok", queue }` com o runner rodando e o banco respondendo; `503 { status: "unavailable", queue: null }` com o runner parando ou parado ou sem banco; outras rotas 404 · Aceite: integração com 200 e métricas, e 503 depois de `stop()`.
- **RF-10** — Worker e api: `SIGTERM`/`SIGINT` param o que está aberto (servidor HTTP, agendador, runner) e fecham o banco antes de sair com 0; segundo sinal sai com 1 · Aceite: integração sobe cada processo com banco de teste, recebe 200 no `/health` e sai com 0 depois do `SIGTERM`.
- **RF-11** — Web: TanStack Start (React 19, Vite 8) com Tailwind v4; `@theme` com os 12 tokens de cor do design doc §4.1 e a paleta padrão do Tailwind desligada; `/` com `lang="pt-BR"`, título "Gizito" e página vazia em `bg-paper`/`text-ink` com faixa `bg-board`/`text-chalk`; `dev` na porta 3000 em `127.0.0.1`; `routeTree.gen.ts` versionado para o typecheck da CI · Aceite: Vitest + Testing Library renderiza o componente da rota `/` e acha o título; `bun run build` gera o bundle; página responde 200 em `bun run dev`.
- **RF-12** — Raiz: `bun run dev` sobe as três apps lendo o `.env` da raiz (`bun --env-file=../../.env`); `.env.example` documenta `HOST` e perde `CORS_ORIGIN` (o CORS usa `WEB_PUBLIC_URL`, como diz `api.md` §1) · Aceite: com as variáveis do `.env.example` no ambiente, `curl` em `:3001/health`, `:3002/health` e `:3000/` devolve 200.
- **RF-13** — Docs: `api.md` 1.1 (503 do health, `not_found`, `internal_error`, log por rota), `jobs.md` 1.2 (raias, agendador só do que consome, manutenção, métricas do health, `payload_invalid` em log), roadmap (F0-07 `[x]`, contadores), progress de api, worker, web, db, core e integrations, tabela de estado do README · Aceite: arquivos atualizados com data.

## Fora de escopo
- Handlers dos jobs (F1-F2): o `handlerMap` de produção começa vazio, então em dev o worker só faz manutenção e health.
- Rotas de negócio da api, rate limit, admin (F2).
- Tipografia, fontes, componentes P0, mascote e conteúdo da landing (F2-08, F2-09): aqui só os tokens de cor e uma página vazia.
- Servidor de produção do web, Dockerfiles, proxy e alertas externos (F2-13). O alerta de F0-07 é o log `error` e as métricas do `/health`.
- Teto de tempo no desligamento: job longo segura o `SIGTERM` até terminar; se o processo for morto antes, o lock vence em 15 min e `recoverExpiredJobs` devolve o job.
- Renovação de lock de job longo (dívida de F0-06 em `known-issues.md`).

## Plano
- **Config compartilhada no core** (`src/config/schemas.ts`): as duas apps leem `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL` e `HOST`; um schema base evita repetir e cada app estende com o seu. `parse*Config(env)` devolve `Result` com o `ZodError`; o `index.ts` formata com `z.prettifyError` e sai antes de qualquer IO.
- **`HOST` default `127.0.0.1`**: mesma postura de F0-02 (portas só locais); em container o deploy põe `0.0.0.0`.
- **Logger em `integrations`**: Pino é dependência de terceiro usada por api e worker; uma fábrica com a lista de redação num lugar só, como defesa extra da invariante 9 (o código já não loga conteúdo).
- **Contratos HTTP no core** (`src/api/errors.ts`, `src/health/schemas.ts`): o web vai validar erros da api com schemas do core (rule `frontend.md`); o health do worker fica junto para a CI e o monitor terem um contrato.
- **Elysia com Zod 4 via Standard Schema** no `response` da rota (Elysia 1.4 aceita); `createApp` recebe dependências para os testes usarem `app.handle(new Request(...))` sem porta.
- **Log de request com `route`** (padrão `/orders/:token`), nunca `request.url`: a URL leva o token do pedido (invariante 9).
- **Raias no worker**: uma por grupo de concorrência do catálogo de `jobs.md` §1; cada vaga é um laço independente com `AbortSignal` para o `stop()`. Raias só com nomes que têm handler: sem handler não há claim nem agendamento, e a fila não acumula job que ninguém consome (o que dispararia o alerta de fila parada nas fases em que os handlers ainda não existem). Erro do laço não derruba a vaga.
- **Health do worker**: vivo = runner `running` + consulta de métricas respondendo. As vagas não morrem por erro (laço com captura), então não há heartbeat separado; event loop travado não responde o HTTP e o monitor vê timeout.
- **`onPayloadInvalid`** no claim: o claim já leva o job a `failed`; o callback só avisa o worker para o log `error` (alerta de F0-07, pendência de `progress/db.md`).
- **Web**: TanStack Start com `tanstackStart()` antes de `viteReact()`, `@tailwindcss/vite`, CSS por `?url` no `head` do `__root` (SSR sem flash); `#src/*` resolvido pelo `imports` do `package.json`, que o Vite segue. A regra de import do Biome passa a aceitar `#src/**/*.css?url`. `dev` roda com `bun --bun vite dev`.
- **Testes**: unit sem Docker (config, schemas, logger, app com banco inalcançável em `127.0.0.1:1`, raias); integração com `createTestDatabase` (health, runner, agendador, health do worker, processos filhos com `SIGTERM`). `test:integration` novo em api e worker; a CI já roda `bun run test:integration` com o Postgres do compose.
- Arquivos: core `src/config/schemas.ts`, `src/api/errors.ts`, `src/health/schemas.ts`, `src/constants.ts`, `src/jobs/rules.ts`, `src/index.ts`, testes; db `src/health.ts`, `src/queue/metrics.ts`, `src/queue/claim.ts`, `src/queue/work.ts`, `src/index.ts`, integração; integrations `src/logger.ts`, teste; api `src/config.ts`, `src/app.ts`, `src/errors.ts`, `src/routes/health.ts`, `src/services/health.ts`, `src/index.ts`, testes; worker `src/config.ts`, `src/runner/lanes.ts`, `src/runner/job-runner.ts`, `src/scheduler.ts`, `src/health-server.ts`, `src/jobs/index.ts`, `src/index.ts`, testes; web `vite.config.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routeTree.gen.ts`, `src/styles/app.css`, teste; raiz `.env.example`, `biome.json`; docs de RF-13.
- Riscos: Zod 4 como response no Elysia 1.4.30 (verificar no teste; alternativa validar no handler); hooks do app principal valendo para rotas de plugin (verificar no teste do 404/log); `vite` sob `bun --bun` (alternativa `vite dev` no Node 24 instalado); `pino` no `bun build` (verificar no `bun run build`).

## Tasks
### M1 — Core, db e logger
- [x] 1.1 Core: config, erros da api, schemas de health, constante, código `handler_not_found`, testes · Verificação: `cd packages/core && bun test`
- [x] 1.2 Db: `pingDatabase`, `getQueueMetrics`, `onPayloadInvalid`, integração · Verificação: `cd packages/db && bun run test:integration`
- [x] 1.3 Integrations: `createLogger` e teste · Verificação: `cd packages/integrations && bun test`
### M2 — Api
- [x] 2.1 Config, app, health, erros, index, testes unit e integração · Verificação: `cd apps/api && bun test && bun run test:integration && bunx tsc --noEmit`
### M3 — Worker
- [ ] 3.1 Config, raias, runner, agendador, health, index, testes unit e integração · Verificação: `cd apps/worker && bun test && bun run test:integration && bunx tsc --noEmit`
### M4 — Web
- [ ] 4.1 TanStack Start, Tailwind com tokens, página `/`, teste, build · Verificação: `cd apps/web && bun run test && bun run typecheck && bun run build`
### M5 — Integração, docs, revisão
- [ ] 5.1 `.env.example`, `bun run dev` com os três health/página em 200 · Verificação: `curl`
- [ ] 5.2 Docs de RF-13 · Verificação: leitura
- [ ] 5.3 `bun run lint && typecheck && test && test:integration && build` na raiz; revisão neutra; `review.md`; correções

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-16 | Size M, não P como no roadmap | toca as três apps e core, db e integrations (~30 arquivos); sem decisão arquitetural nova, então não L; um verifier neutro no fim |
| 2026-10-16 | Módulo `cross` | a feature atravessa api, worker e web por igual |
| 2026-10-16 | Agendador e raias só para nomes com handler | job sem consumidor ficaria pendente e dispararia o alerta de fila parada nas fases sem handler; com vários tipos de worker, cada um agenda o que consome |
| 2026-10-16 | `CORS_ORIGIN` sai do `.env.example` | `api.md` §1 restringe o CORS a `WEB_PUBLIC_URL`; duas variáveis para a mesma origem podem divergir |
| 2026-10-16 | Raia padrão com 2 vagas como constante do worker, não env | `jobs.md` diz "padrão" sem número; vira env quando houver medida que peça ajuste |

## Status
Fase: implementação (M1). Próximo passo: core.
