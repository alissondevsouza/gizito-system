# Progresso: infra

**Workspace:** raiz do monorepo (`package.json`, `turbo.json`, `biome.json`, `tsconfig.base.json`, `docker-compose.yml`, `infra/`, `.github/`)
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-15

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Bun 1.3.11 (`packageManager`), Bun Workspaces `apps/*` e `packages/*`, Turborepo 2 (`build`, `typecheck`, `test`, `dev`; task `transit` no-op para o cache de `typecheck`/`test` invalidar por mudança em dependência interna sem serializar a suíte), Biome 2 como único formatter/linter rodando na raiz (fora do Turborepo), TypeScript 7 nativo com `tsconfig.base.json` estrito.
- Lint proíbe import relativo e `#src/*` sem extensão (`noRestrictedImports.patterns`). `.claude/**` fora do escopo do Biome.
- `.env.example` por serviço; CI (`.github/workflows/ci.yml`) com install frozen, lint, typecheck, test e build em todo push.

## Feature infra-local-compose (2026-10-15, `dcb3319`)

- `docker-compose.yml` (projeto `gizito`): `postgres:16-alpine` em `127.0.0.1:5433` com bancos `gizito` e `evolution` (script em `infra/postgres/initdb/`), `redis:7-alpine` em `127.0.0.1:6379` (só para a Evolution) e `evoapicloud/evolution-api:v2.3.7` em `127.0.0.1:8080`. Healthchecks 5s/5s/5 em todos; `start_period: 90s` na Evolution para as migrations do Prisma; volumes `postgres_data`, `redis_data`, `evolution_instances`.
- Evolution: `AUTHENTICATION_API_KEY` vem de `EVOLUTION_API_KEY` do `.env` (default só-local `gizito-local-dev-key`); `DATABASE_SAVE_DATA_*=false` para não guardar mensagens, contatos, chats, histórico nem labels; telemetria desligada; `DEL_INSTANCE=false`. Healthcheck via `node -e fetch(...)` porque a imagem final não tem curl/wget.
- Verificado: `docker compose up -d --wait` saudável (~41 s na primeira vez, ~11 s no reinício com volumes); `GET /instance/fetchInstances` 200 com `apikey` e 401 sem; Postgres acessível do host pelo `DATABASE_URL` do `.env.example`.
- CI ganhou o step `docker compose config --quiet`.

## Implementado

- [x] Monorepo, scripts raiz, CI (F0-01)
- [x] Infra local: Postgres, Redis e Evolution API no docker compose (F0-02)

## Pendências

- Compose de produção, proxy com TLS, backups e Dockerfiles em F2-13; imagem do worker com Chromium em F1-08
- Scripts `db:generate`/`db:migrate` em F0-05 e `test:pedagogy` em F1-10 (Turborepo falha em task sem implementação)
- Primeiro run do CI depende do primeiro push, que é do humano
