# Progresso: integrations

**Workspace:** `@gizito/integrations`
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-14

## Feature repo-e-monorepo (2026-10-14)

- Workspace criado com `package.json` (`imports` `#src/*`, `exports` apontando para `src/index.ts`, dep `@gizito/core`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)

## Pendências

- Adaptadores e fakes entram a partir de F1 (F1-04, F1-05) e F2
