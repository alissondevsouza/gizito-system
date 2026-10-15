---
feature: F0-01 repo-e-monorepo
module: infra
size: M
status: in_progress
branch: feat/infra/repo-e-monorepo
updated: 2026-10-14
---

# F0-01 repo-e-monorepo

## Objetivo
Transformar o repositório (hoje só docs e harness) num monorepo Bun pronto para receber código: Bun Workspaces, Turborepo, Biome, tsconfig base, layout `apps/{web,api,worker}` e `packages/{core,db,integrations}`, `.env.example`, scripts raiz e CI de lint/typecheck/test. É a primeira feature da Fase 0 do roadmap (`docs/product/roadmap-v1.md` §3) e bloqueia F0-02, F0-04 e tudo o que vem depois. Fonte: PRD §9 (arquitetura decidida) e CLAUDE.md (stack, comandos, convenções).

## Requisitos e critérios de aceite
- **RF-01** — Workspaces Bun na raiz com os seis pacotes nomeados `@gizito/{web,api,worker,core,db,integrations}` e deps internas `workspace:*` seguindo o grafo do CLAUDE.md (api e worker → core, db, integrations; db e integrations → core; web sem dep interna até F0-07) · Aceite: `bun install` resolve sem rede para os internos e `bun pm ls` lista os seis workspaces.
- **RF-02** — Todo workspace tem `"imports": { "#src/*": "./src/*" }` e `allowImportingTsExtensions` e resolve `#src/arquivo.ts` em runtime (Bun e Vitest) e no `tsc` · Aceite: teste em cada workspace importa `#src/index.ts`; `bun run typecheck` verde.
- **RF-03** — Packages exportam fonte TypeScript direto (`exports["."] = ./src/index.ts`), sem etapa de build, e são consumidos pelas apps por `@gizito/core` · Aceite: teste da api importa `@gizito/core` e passa em `bun test` e `tsc`.
- **RF-04** — Biome é o único formatter/linter: `bun run lint` cobre todo o repo e falha diante de import relativo (`./`, `../`) ou de `#src/*` sem extensão; `bun run format` formata · Aceite: `bun run lint` verde no repo gerado; um arquivo temporário com `import "./x.ts"` faz o lint falhar (verificado durante a implementação, não commitado).
- **RF-05** — `bun run test` roda `bun test` em api, worker, core, db e integrations e Vitest em web, sem Docker; nenhum workspace fica sem arquivo de teste (Bun e Vitest falham com zero testes) · Aceite: `bun run test` verde com um arquivo de teste por workspace.
- **RF-06** — `bun run typecheck` roda `tsc --noEmit` por workspace a partir de `tsconfig.base.json` com `strict`, `module: Preserve`, `moduleResolution: bundler`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess` · Aceite: verde nos seis workspaces; mudança em `packages/core/src` invalida o cache do typecheck de `apps/api` (verificado com `--dry-run`/`--summarize` durante a implementação).
- **RF-07** — `bun run build` e `bun run dev` existem na raiz via Turborepo; `build` empacota api e worker com `bun build --target=bun`; `dev` é `persistent` e sem cache (o `dev` das três apps só é exigido em F0-07) · Aceite: `bun run build` verde e gera `apps/api/dist` e `apps/worker/dist` (ignorados pelo git).
- **RF-08** — `.env.example` documenta, agrupadas por serviço e com valores de exemplo não reais, as variáveis já nomeadas por CLAUDE.md e pelas rules (`DATABASE_URL`, `WHATSAPP_ENABLED`, `PAYMENT_GATEWAY`, `AI_MODEL_EXTRACT`, `AI_MODEL_GENERATE`, `MAX_AI_COST_CENTS_PER_ORDER`, `PREVIEW_RATE_LIMIT_PER_HOUR`, `PREVIEW_RATE_LIMIT_PER_DAY`, `GENERATE_CONCURRENCY`, Evolution, Mercado Pago, Resend, R2) · Aceite: arquivo presente, sem segredo real, `.env` continua ignorado pelo git.
- **RF-09** — CI em `.github/workflows/ci.yml` roda `bun install --frozen-lockfile`, lint, typecheck, test e build em push na `main` e em pull request, com a versão do Bun lida de `package.json` (`packageManager`) · Aceite: workflow válido (YAML parseável, ações com versão major fixada); passa no primeiro push, que é do humano.
- **RF-10** — Docs de estado atualizados: roadmap (F0-01 concluída, resumo por fase), `docs/README.md` (estado por módulo) e `docs/progress/{modulo}.md` para os sete módulos criados · Aceite: arquivos presentes com data e commit.

## Fora de escopo
- `docker-compose.yml`, Postgres, Redis, Evolution (F0-02).
- Qualquer conteúdo de domínio em `core` (F0-04), schema Drizzle e `test-helpers` (F0-05), fila (F0-06).
- Scaffold real das apps: Elysia com `/health`, loop do worker, TanStack Start com página (F0-07). Em F0-01 as apps têm só `package.json`, tsconfig, `src/index.ts` vazio e um teste de resolução de imports.
- Scripts `db:generate`, `db:migrate` (entram em F0-05 com os scripts do package) e `test:pedagogy` (F1-10): Turborepo falha quando nenhum workspace define a task, então os scripts raiz entram junto com os scripts dos workspaces.
- ADRs 0002 a 0007 (F0-03). As decisões de tooling desta feature ficam na tabela Decisões abaixo para o ADR 0002 (monorepo Bun) absorver.
- Thresholds de coverage (70% packages, 50% apps): não fazem sentido num repo vazio; entram com a primeira feature de domínio (F0-04).
- Dockerfiles e imagem do worker com Chromium (F1-08, F2-13).

## Plano
**Decisões técnicas**
- **Packages sem build.** `core`, `db` e `integrations` exportam `./src/index.ts`. Bun executa TS nativamente e o Vite do web (F0-07) também, então um passo de build só adicionaria `dist/` e `tsc -b`. Entrypoint `client` separado para o web entra quando houver o que separar (F0-04/F2-08).
- **TypeScript 7 (compilador nativo).** É a versão corrente do npm. Nenhuma opção removida em TS7 (`baseUrl`, `moduleResolution: node10`, `outFile`) está no plano; o `#src/*` resolve pelo campo `imports` do `package.json`, não por `paths`. Se o `tsc` 7 falhar com `@types/bun` ou Vitest, a alternativa é `typescript@6.0.3` com as mesmas opções.
- **`@types/bun` na linha 1.3.x** (`~1.3.11`), alinhada ao runtime instalado (Bun 1.3.11); a 1.4.x descreve APIs que o runtime local não tem.
- **Biome na raiz, fora do Turborepo.** Um `biome check .` na raiz cobre o monorepo em milissegundos; rodar por workspace só fragmentaria a config. `lint` e `format` são scripts raiz; `typecheck`, `test`, `build` e `dev` passam pelo Turborepo.
- **Imports relativos proibidos por lint.** `style/noRestrictedImports` com `patterns` para `./**` e `../**`, mais um grupo que proíbe `#src/**` sem extensão (`.ts`, `.tsx`, `.json`, `.css` liberados por negação). Formatter: espaços, 2, largura 100, aspas duplas, ponto e vírgula, vírgula final.
- **Turborepo com `dependsOn: ["^typecheck"]` em `typecheck` e `["^test"]` em `test`** se a verificação de RF-06 mostrar que o cache não invalida por mudança em dependência interna sem isso; caso invalide sozinho, deixar sem `dependsOn`. Decidido empiricamente na task 1.4 e registrado em Decisões.
- **Testes de fumaça são de resolução de imports.** O que F0-01 entrega é a fiação (`#src/*`, `@gizito/*`, runners); cada teste importa o entrypoint do próprio workspace (e `@gizito/core` nas apps) e afirma que o módulo resolveu. São substituídos por testes de domínio nas próximas features e ficam em `src/__tests__/` como manda a rule de testes.
- **Bun pinado em `packageManager: "bun@1.3.11"`**; CI lê de lá via `oven-sh/setup-bun@v2` (`bun-version-file: package.json`).

**Arquivos**
- Raiz: `package.json`, `bun.lock`, `turbo.json`, `biome.json`, `tsconfig.base.json`, `.env.example`, `.github/workflows/ci.yml`, `.gitignore` (acrescentar `.output`, `apps/*/dist`).
- Cada workspace: `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/workspace.test.ts`; web ainda `vitest.config.ts`.
- Docs: `docs/product/roadmap-v1.md`, `docs/README.md`, `docs/progress/{core,db,integrations,api,worker,web,infra}.md`.

**Riscos**
- TS7 `tsc` ou Vitest 5 incompatíveis com algo do plano → fallback de versão registrado.
- Bin do `tsc` hoisted na raiz não visível de `bun run` dentro do workspace → verificar na task 2.1; se falhar, declarar `typescript` como devDependency em cada workspace.
- Turborepo com task sem nenhum workspace que a implemente falha; por isso `build` tem implementação em api e worker e `db:*` fica para F0-05.

## Tasks
### M1 — Raiz: workspaces, Turborepo, Biome, tsconfig
- [x] 1.1 `package.json` raiz (private, workspaces, packageManager, scripts dev/build/lint/typecheck/format/test, devDeps turbo/biome/typescript) e `bun install` · Arquivos: `package.json`, `bun.lock` · Verificação: `bun install` sem erro
- [x] 1.2 `tsconfig.base.json` e `biome.json` com as regras de import · Arquivos: `tsconfig.base.json`, `biome.json` · Verificação: `bunx biome check .` verde; arquivo temporário com import relativo e com `#src/x` sem extensão reprovado
- [x] 1.3 `turbo.json` com tasks build/dev/typecheck/test e `globalDependencies: ["tsconfig.base.json"]` · Arquivos: `turbo.json` · Verificação: `bunx turbo run typecheck --dry-run` lista os workspaces
- [x] 1.4 Verificar invalidação de cache cruzada (mudança em `packages/core/src` reexecuta `api#typecheck`) e fixar `dependsOn` · Arquivos: `turbo.json` · Verificação: `bunx turbo run typecheck --summarize` antes e depois de tocar `packages/core/src/index.ts`
- [x] 1.5 `.gitignore` com `apps/*/dist` e `.output` · Verificação: `git status` sem artefatos de build após `bun run build`

### M2 — Workspaces
- [x] 2.1 `packages/core`: package.json (`exports`, `imports`, scripts test/typecheck), tsconfig, `src/index.ts`, teste de resolução · Verificação: `bun test` e `tsc --noEmit` no workspace
- [x] 2.2 `packages/db` e `packages/integrations`: idem, com dep `@gizito/core` e teste importando-a · Verificação: idem
- [x] 2.3 `apps/api` e `apps/worker`: idem, com deps core/db/integrations, scripts dev (`bun --watch`) e build (`bun build --target=bun --outdir dist`) · Verificação: `bun run build` gera `dist/index.js` nos dois
- [x] 2.4 `apps/web`: package.json (Vitest 5, scripts test/typecheck), tsconfig com DOM e `jsx: react-jsx`, `vitest.config.ts`, teste de resolução `#src` no Vitest · Verificação: `bunx vitest run` no workspace
- [x] 2.5 Raiz: `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` verdes · Verificação: os quatro comandos

### M3 — CI, env e docs
- [x] 3.1 `.github/workflows/ci.yml` (checkout, setup-bun lendo `package.json`, install frozen, lint, typecheck, test, build) · Verificação: `bun -e` com parser YAML ou `bunx yaml` valida; revisão manual das versões das actions
- [x] 3.2 `.env.example` por serviço, sem valores reais · Verificação: `git check-ignore .env` ignora; `.env.example` rastreado
- [x] 3.3 Roadmap (F0-01 `[x]`, resumo por fase), `docs/README.md` (estado por módulo) e `docs/progress/*.md` dos sete módulos · Verificação: leitura
- [ ] 3.4 Commits de checkpoint por milestone; `git log main..HEAD` só com esta feature · Verificação: `git status` limpo

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-14 | Packages exportam fonte TS (`./src/index.ts`), sem build | Bun e Vite executam TS; build só adicionaria `dist` e um passo de `tsc -b` no caminho de cada teste |
| 2026-10-14 | TypeScript 7 (nativo) com `module: Preserve` + `moduleResolution: bundler` | Versão corrente; nenhuma opção removida em TS7 é usada; fallback `6.0.3` se o `tsc` falhar com `@types/bun` ou Vitest |
| 2026-10-14 | Biome como script raiz, não como task do Turborepo | Uma execução cobre o monorepo; config única; sem cache a invalidar |
| 2026-10-14 | Lint proíbe `./`, `../` e `#src/*` sem extensão via `noRestrictedImports.patterns` | É a única forma mecânica de garantir a rule `imports.md`; o hook PostToolUse já roda `biome check --write` |
| 2026-10-14 | Testes de F0-01 são de resolução de imports (`#src`, `@gizito/core`) | Única entrega testável de um esqueleto; evitam o `exit 1` de runner sem testes sem recorrer a `--passWithNoTests` |
| 2026-10-14 | Turborepo `typecheck` e `test` com `dependsOn: ["^typecheck"]` / `["^test"]` | Verificado na task 1.4: sem isso o hash de `api#typecheck` não muda quando `packages/core/src` muda |
| 2026-10-14 | `.claude/**` fora do escopo do Biome | O harness não é código do produto; o formatter reescrevia um exemplo de skill |
| 2026-10-14 | CI dispara em todo push e por `workflow_dispatch`, sem `pull_request` | Repositório de uma pessoa: evita run duplicado no PR; o check do commit aparece no PR |
| 2026-10-14 | `db:generate`, `db:migrate` e `test:pedagogy` ficam para F0-05 e F1-10 | Turborepo falha em task sem implementação em nenhum workspace |

## Status
Fase: M1, M2 e M3 implementados e verificados localmente (lint, typecheck, test e build verdes; cache cruzado do Turborepo e lint de imports provados). Próximo passo: revisão neutra por `gizito-implement-verifier` e `review.md`. Pendências para o humano: push (primeiro run do CI), PR e merge.
