# Progresso: api

**Workspace:** `@gizito/api`
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-16

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Workspace criado com `package.json` (`imports` `#src/*`, deps `@gizito/core`, `@gizito/db`, `@gizito/integrations`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test; scripts `dev` (`bun --watch`) e `build` (`bun build --target=bun`).

## Feature esqueleto-das-apps (2026-10-16, `c579f79`)

- Elysia 1.4 com Zod 4 como schema de resposta. `src/config.ts`: `apiConfigSchema` estende `sharedEnvironmentSchema` e `paymentEnvironmentSchema` do core (`DATABASE_URL` e `WEB_PUBLIC_URL` obrigatórias; `API_PORT` 3001, `HOST` 127.0.0.1; `PAYMENT_GATEWAY=fake` recusado em produção). `src/index.ts` sai com 1 e lista os campos antes de abrir porta ou banco; `SIGTERM`/`SIGINT` param o servidor e fecham o banco.
- `src/app.ts`: `createApp({ db, logger, webPublicUrl })` com CORS só para a origem do web, `onError` → `toApiErrorResponse` (`404 not_found`, `400 validation_error`, `500 internal_error`, resposta fora do schema conta como 500), log `request` por resposta com `method`, `route` (padrão, nunca a URL), `status` e `durationMs`.
- `GET /health`: `routes/health.ts` → `services/health.ts` → `pingDatabase`; `200 ok` ou `503 unavailable` com `warn` só do nome do erro.
- `dev` lê o `.env` da raiz (`bun --env-file=../../.env`); `exports` aponta para `src/app.ts` para importar a api não subir o servidor.
- Testes: 16 unit (config, erros, app com banco inalcançável, CORS, log sem token, boot sem env) e 2 de integração (health com banco, processo com `SIGTERM`).

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Config fail-fast, `/health`, erros `{ error, code }`, CORS e log por rota (F0-07)

## Pendências

- Rotas de pedido, upload e rate limit da prévia em F2-01; cobrança em F2-03; webhooks em F2-04 e F2-10; admin em F2-11
- Toda rota nova declara `response` com schema do core e usa os códigos de `apiErrorCodeList`; log nunca leva a URL
