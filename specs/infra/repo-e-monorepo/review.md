---
feature: F0-01 repo-e-monorepo
module: infra
round: 1
verdict: APROVADO
updated: 2026-10-14
---

# Review: F0-01 repo-e-monorepo

## Rodada 1

Verifier: `gizito-implement-verifier` (spawn novo, contexto isolado). Diff: `git diff main...HEAD` nos commits `8d2509c` e `d2d67a1`.

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun install --frozen-lockfile` | "Checked 58 installs across 108 packages (no changes)", exit 0 |
| `bun pm ls` | seis workspaces `@gizito/*` + biome 2.5.15, turbo 2.11.8, typescript 7.0.2 |
| `bun run lint` | "Checked 29 files, No fixes applied", exit 0 |
| `bun run typecheck --force` | 6 tasks successful, 0 cached |
| `bun run test --force` | core 1 pass; db, integrations, api, worker 2 pass cada; web 1 passed (Vitest); 6/6 |
| `bun run build --force` | api e worker 2/2; `dist/index.js` gerados; `git status --porcelain` vazio |
| probe de lint (arquivo temporário em `apps/api/src`, removido) | `../x.ts`, `#src/index.js`, `export * from "./x.ts"`, `import type` relativo e `import("./x.ts")`: 1 hit `noRestrictedImports` e exit 1 cada; `#src/index.ts`: exit 0 |
| `curl` em `oven-sh/setup-bun@v2` e `actions/checkout@v5` | `bun-version-file` aceita `package.json`; tag `v5` existe |
| `git show HEAD:.env.example` × CLAUDE.md e rules | todos os nomes do RF-08 presentes; nenhum valor real |
| `test:integration` | não aplicável em F0-01 |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `package.json` workspaces; grafo em `apps/*/package.json` e `packages/*/package.json`; `bun pm ls` |
| RF-02 | sim | `imports` `#src/*` nos seis `package.json`; `tsconfig.base.json` `allowImportingTsExtensions`; `src/__tests__/workspace.test.ts` em cada workspace; Vitest resolve em `apps/web` |
| RF-03 | sim | `packages/*/package.json` `exports["."]`; teste da api importa `@gizito/core` |
| RF-04 | sim | `biome.json` `noRestrictedImports.patterns`; probe reprova 5 variantes inválidas e aprova `#src/index.ts` |
| RF-05 | sim | `turbo.json` + scripts `test` por workspace; um teste por workspace; sem Docker |
| RF-06 | sim | `tsconfig.base.json`; invalidação cruzada verificada via `--dry-run=json` |
| RF-07 | sim | `turbo.json`; `bun build --target=bun` em api/worker; `dist` e `.output` ignorados |
| RF-08 | sim | `.env.example` por serviço, valores de exemplo; `.env` ignorado |
| RF-09 | sim, com ALERTA | YAML válido, `checkout@v5`, `setup-bun@v2`, `--frozen-lockfile`; gatilho divergia do texto do RF |
| RF-10 | sim, com ALERTA | roadmap `[x]` com data e spec; `docs/README.md`; sete `docs/progress/*.md`; faltava hash de commit |

### Achados
- [ALERTA] `.github/workflows/ci.yml:3-5` / `spec.md` RF-09 — gatilho é `push` (qualquer branch) + `workflow_dispatch`, sem `pull_request`, mas o RF-09 dizia "push na `main` e em pull request"; spec internamente inconsistente; PR de fork não rodaria CI — alinhar o texto ou trocar o gatilho.
- [ALERTA] `docs/progress/*.md` e `docs/product/roadmap-v1.md` — aceite do RF-10 pedia "data e commit"; só havia a data e o caminho da spec.
- [SUGESTÃO] `spec.md` — `status: in_progress` e task 3.4 em aberto embora os checkpoints existam.
- [SUGESTÃO] `turbo.json` — `test` com `dependsOn: ["^test"]` serializa a suíte e um teste quebrado em `core` suprime os de api/worker/db/integrations; usar o padrão "transit node" do Turborepo.
- [SUGESTÃO] `.env.example` — `RENDER_CONCURRENCY` (`pdf-render.md`) e `WHATSAPP_MAX_SENDS_PER_MINUTE` (`whatsapp.md`, default 10) não documentados.
- [SUGESTÃO] `apps/web/src/__tests__/workspace.test.ts` — `bun test` rodado na raiz (fora de `bun run test`) descobre este arquivo e falha ao importar `vitest`.

### Regressão pedagógica
não aplicável

### Resposta do orquestrador
- ALERTA do RF-09: mantido o gatilho `push` em qualquer branch + `workflow_dispatch` (o roadmap pede "CI passando no primeiro push", que será o da branch desta feature; repositório de uma pessoa, sem fork). Texto do RF-09 reescrito para bater com a decisão.
- ALERTA do RF-10: aceite reescrito ("data, caminho da spec e commit de criação do monorepo", como o roadmap permite em "Como marcar"); `8d2509c` citado no roadmap e nos sete `docs/progress/*.md`.
- SUGESTÃO spec: task 3.4 marcada e `status: done`.
- SUGESTÃO transit: aplicada. `turbo.json` agora tem `transit` (no-op, `dependsOn: ["^transit"]`) e `typecheck`/`test` dependem de `transit`; reverificado com `--dry-run=json` que o hash de `api#typecheck` muda ao tocar `packages/core/src/index.ts`.
- SUGESTÃO `.env.example`: aplicada (`RENDER_CONCURRENCY=1`, `WHATSAPP_MAX_SENDS_PER_MINUTE=10`).
- SUGESTÃO `bun test` na raiz: não aplicada. O `bunfig.toml` do Bun só restringe a uma raiz (`[test] root`), o que esconderia os testes das apps ou dos packages; o comando documentado é `bun run test` (Turborepo) ou `bun test` dentro do workspace. Reavaliar se alguém tropeçar nisso (vira entrada em `docs/lessons.md`).
