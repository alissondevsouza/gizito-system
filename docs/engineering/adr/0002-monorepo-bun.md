# ADR-0002: Monorepo Bun com Turborepo, Biome e packages sem build

**Data:** 2026-10-15
**Status:** aceito
**Decidido por:** Alisson

## Contexto

O PRD §9 define três aplicações (`web`, `api`, `worker`) e um domínio compartilhado (`core`) que precisa ser a única fonte de schemas, constantes e máquina de estados, para que "nenhuma regra de negócio viva só em uma app". O projeto é de uma pessoa com agentes: o custo de manter ferramentas e configurações duplicadas pesa mais que em um time. A F0-01 (`specs/infra/repo-e-monorepo/`) implementou a estrutura; este ADR registra as escolhas para não serem rediscutidas.

## Decisão

Um único repositório com Bun Workspaces (`apps/*`, `packages/*`), Turborepo para `typecheck`, `test`, `build` e `dev`, Biome como único formatter e linter rodando na raiz, TypeScript 7 com `tsconfig.base.json` estrito (`module: Preserve`, `moduleResolution: bundler`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`). Os packages (`core`, `db`, `integrations`) exportam fonte TypeScript (`exports["."] = ./src/index.ts`) sem etapa de build. Imports internos sempre por subpath `#src/...ts`; entre workspaces por `@gizito/*`; imports relativos e sem extensão são proibidos por lint. Runner de testes: `bun test` no backend e nos packages, Vitest só no web.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Repositórios separados por app | isolamento de deploy | `core` viraria pacote publicado com versionamento; a regra "uma fonte de verdade" exigiria release a cada mudança de schema |
| pnpm + Node + ESLint + Prettier | ecossistema mais comum | dois runtimes (Node para tooling, Bun para apps); três ferramentas de lint/format com configs sobrepostas; sem execução nativa de TS |
| Packages com `tsc -b` e `dist/` | compatível com consumidores externos | passo de build no caminho de cada teste e do dev; nenhum consumidor externo existe |
| Turborepo sem task `transit` | config mais curta | o cache de `typecheck`/`test` da api não invalidava ao mudar `packages/core/src` (verificado em F0-01) |

## Consequências

### Positivas
- Mudança em `core` é vista por api, worker e web no mesmo commit, sem publicar nada.
- Uma config de lint e uma de TypeScript; `bun run lint|typecheck|test|build` cobre tudo; CI de 15 minutos.
- Lint impõe mecanicamente a rule de imports (`imports.md`).

### Negativas
- `bun test` rodado na raiz (fora do Turborepo) descobre o teste Vitest do web e falha; o comando documentado é `bun run test`.
- TypeScript 7 e Bun 1.3 são versões recentes; uma incompatibilidade exige fallback (TS 6.0.3 registrado em F0-01).

### Riscos
- Turborepo falha quando nenhum workspace implementa uma task: scripts raiz (`db:*`, `test:pedagogy`) só entram junto com a primeira implementação.

## O que faria esta decisão mudar

- Um consumidor externo do `core` (app nativo, parceiro) exigindo pacote publicado.
- Bun deixar de executar TypeScript de forma confiável em produção.
- Mais de um time no repositório com cadências de deploy conflitantes.
