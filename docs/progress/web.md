# Progresso: web

**Workspace:** `@gizito/web`
**Fase atual:** F1 — Prova técnica e pedagógica (F0 concluída em 2026-10-16)
**Última atualização:** 2026-10-19

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Workspace criado com `package.json` (`imports` `#src/*`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: Vitest 5 (`vitest.config.ts`); tsconfig com DOM e `jsx: react-jsx`.

## Feature esqueleto-das-apps (2026-10-16, `c579f79`)

- TanStack Start 1.169 (React 19.3, Vite 8, `bun --bun vite`), Tailwind 4.3 por `@tailwindcss/vite`. `src/styles/app.css` com `--color-*: initial` e os 12 tokens do design doc §4.1, mais `--container-content` (1120 px, §8); CSS por `?url` no `head` do `__root`.
- `src/routes/__root.tsx` (`lang="pt-BR"`, título, 404 neutra em pt-BR) e `src/routes/index.tsx` (faixa `bg-board` com a marca, `main` vazio). Textos em `src/copy/`.
- `routeTree.gen.ts` versionado (o typecheck da CI roda sem build); Biome com `tailwindDirectives` e import `#src/**/*.css?url` liberado.
- Testes Vitest + Testing Library em jsdom: 6 (rota `/`, 404, tokens contra a tabela do design doc, router).

## Ajustes em revisao-f0 (2026-10-19, `ecdd15e`)

- `src/routes/__root.tsx`: documento HTML em `shellComponent`; `errorComponent` e `defaultErrorComponent` do router com `RouteErrorPage` (`src/components/route-error-page.tsx`, copy em `src/copy/route-error.ts`, design doc 1.4 §7.2).
- Testes: 10.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] TanStack Start com Tailwind v4, tokens de cor e página vazia (F0-07)

## Pendências

- Tipografia, componentes P0, mascote e logo em F2-08; fluxo de compra e `order-route.ts` em F2-09
- Servidor de produção (`dist/server/server.js` sob Bun) e estáticos em F2-13
