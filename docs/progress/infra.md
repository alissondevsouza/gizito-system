# Progresso: infra

**Workspace:** raiz do monorepo (`package.json`, `turbo.json`, `biome.json`, `tsconfig.base.json`, `.github/`)
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-14

## Feature repo-e-monorepo (2026-10-14)

- Bun 1.3.11 (`packageManager`), Bun Workspaces `apps/*` e `packages/*`, Turborepo 2 (`build`, `typecheck`, `test`, `dev`; `^typecheck`/`^test` para o cache invalidar por mudança em dependência interna), Biome 2 como único formatter/linter rodando na raiz (fora do Turborepo), TypeScript 7 nativo com `tsconfig.base.json` estrito.
- Lint proíbe import relativo e `#src/*` sem extensão (`noRestrictedImports.patterns`). `.claude/**` fora do escopo do Biome.
- `.env.example` por serviço; CI (`.github/workflows/ci.yml`) com install frozen, lint, typecheck, test e build em todo push.

## Implementado

- [x] Monorepo, scripts raiz, CI (F0-01)

## Pendências

- `docker-compose.yml` com Postgres, Redis e Evolution API em F0-02
- Scripts `db:generate`/`db:migrate` em F0-05 e `test:pedagogy` em F1-10 (Turborepo falha em task sem implementação)
- Primeiro run do CI depende do primeiro push, que é do humano
