# Progresso: integrations

**Workspace:** `@gizito/integrations`
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-16

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Workspace criado com `package.json` (`imports` `#src/*`, `exports` apontando para `src/index.ts`, dep `@gizito/core`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test.

## Feature esqueleto-das-apps (2026-10-16, `c579f79`)

- `src/logger.ts`: `createLogger({ service, level, destination? })` com Pino 10, JSON, horário ISO, campo `service` e redação de `email`, `phone`, `token`, `publicToken`, `payload` e `text` no topo e um nível abaixo.
- `src/log-error.ts`: `serializeLogError` (serializer de `err`: tipo, código, mensagem e stack, causa até 3 níveis; sem `detail`, `query` nem `params`) e `scrubLogText` (mascara e-mail, token e telefone).
- `src/fakes/memory-logger.ts`: `createMemoryLogger` com `waitForEntryList` para testes que esperam um log assíncrono; exposto só por `@gizito/integrations/fakes`, fora do entrypoint de produção.
- Testes: 12.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Logger Pino com redação e fake em memória (F0-07)

## Pendências

- Adaptadores e fakes entram a partir de F1 (F1-04, F1-05) e F2
