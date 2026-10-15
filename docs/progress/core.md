# Progresso: core

**Workspace:** `@gizito/core`
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-14

## Feature repo-e-monorepo (2026-10-14)

- Workspace criado com `package.json` (`imports` `#src/*`, `exports` apontando para `src/index.ts`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)

## Pendências

- Constantes, enums, máquina de estados, schemas e interfaces entram em F0-04
