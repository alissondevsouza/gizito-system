# Gizito — Documentação e Memória do Projeto

Este diretório é a **memória persistente do projeto**: produto, design, decisões arquiteturais, lições, dívidas e estado por módulo. Serve de contexto para agentes de IA e para quem desenvolve.

## Como usar

- **Antes de implementar:** leia a seção do PRD ou do design doc que a tarefa toca (tabela no `CLAUDE.md`) e procure o tema por grep em `engineering/adr/`, `lessons.md` e `engineering/known-issues.md`. Não leia tudo antes de cada mudança
- **Depois de implementar, só quando aconteceu:** decisão arquitetural durável vira ADR; gotcha que custou iteração vira entrada em `lessons.md`; dívida deliberada vai para `engineering/known-issues.md`; comportamento visível muda PRD/design doc com entrada no histórico; módulo que mudou de estado atualiza `progress/{modulo}.md` e a tabela abaixo
- **Nova decisão arquitetural:** crie um ADR a partir de `engineering/adr/_template.md` e adicione a linha na tabela

## Mapa

| Diretório/Arquivo | Conteúdo |
|---|---|
| [`product/`](product/) | PRD (`product-doc-v1.md`): escopo, jornada, pedagogia, arquitetura decidida, decisões em aberto; roadmap por fases (`roadmap-v1.md`) |
| [`design/`](design/) | Guia de design, identidade, mascote, telas, PDFs (`design-doc-v1.md`) |
| [`gizito-image/`](gizito-image/) | Referências visuais do mascote |
| [`pedagogy/`](pedagogy/) | Taxonomia, schema do kit, prompts, regras de validação, casos de teste (a criar) |
| [`engineering/`](engineering/) | [`architecture.md`](engineering/architecture.md), [`data-model.md`](engineering/data-model.md), [`state-machine.md`](engineering/state-machine.md), [`api.md`](engineering/api.md), [`jobs.md`](engineering/jobs.md), [`adr/`](engineering/adr/), [`known-issues.md`](engineering/known-issues.md) |
| [`ops/`](ops/) | Runbook e deploy (a criar) |
| [`legal/`](legal/) | Termos, privacidade, ajuda (a criar) |
| [`lessons.md`](lessons.md) | Lições operacionais graduadas das features |
| [`progress/`](progress/) | Estado por módulo (1 arquivo por workspace) |
| [`../specs/`](../specs/) | Artefatos por feature: `spec.md` e `review.md` (templates em `specs/_templates/`) |

---

## Architecture Decision Records (ADRs)

| # | Decisão | Status | Data |
|---|---------|--------|------|
| [0001](engineering/adr/0001-harness-enxuto.md) | Harness enxuto para modelos de fronteira: contexto contextual, uma revisão neutra por feature, dois artefatos | aceito | 2026-10-14 |
| [0002](engineering/adr/0002-monorepo-bun.md) | Monorepo Bun com Turborepo, Biome e packages exportando fonte sem build | aceito | 2026-10-15 |
| [0003](engineering/adr/0003-fila-no-postgres.md) | Fila de jobs no próprio PostgreSQL, enfileirada na transação do estado | aceito | 2026-10-15 |
| [0004](engineering/adr/0004-mercado-pago-pix.md) | Mercado Pago (Orders API) como gateway Pix, Asaas como plano B, atrás de `PaymentGateway` | aceito | 2026-10-15 |
| [0005](engineering/adr/0005-evolution-api-whatsapp.md) | WhatsApp por Evolution API (Baileys), somente resposta, desligável por flag | aceito | 2026-10-15 |
| [0006](engineering/adr/0006-tanstack-start-e-elysia.md) | TanStack Start no web, Elysia na API, worker Bun puro; HTTP como única fronteira | aceito | 2026-10-15 |
| [0007](engineering/adr/0007-dois-pdfs-html-katex-playwright.md) | Dois PDFs gerados de HTML/CSS com KaTeX no servidor e Playwright | aceito | 2026-10-15 |
| [0008](engineering/adr/0008-fila-propria-skip-locked.md) | Fila própria com `FOR UPDATE SKIP LOCKED` em vez de pg-boss, decidida pelo spike de F0-06 | aceito | 2026-10-15 |

> Para criar um novo ADR: copie `engineering/adr/_template.md` → `engineering/adr/NNNN-titulo.md` e adicione a linha aqui.

---

## Estado por Módulo

> Atualizado em 2026-10-15 (F0-05). Monorepo e infra local criados; core com domínio puro; db com schema, migration e test-helpers; os demais workspaces são só esqueleto. Detalhes em `progress/{modulo}.md`.

| Módulo | Workspace | Status |
|--------|-----------|--------|
| Core | `@gizito/core` | constantes, enums, máquina de estados, schemas e interfaces (F0-04); taxonomia em F1-01, schemas do kit em F1-03 |
| Database | `@gizito/db` | schema das 8 tabelas, migration `0000_fundacao`, conexão Bun.SQL e test-helpers (F0-05); fila e transações em F0-06 |
| Integrations | `@gizito/integrations` | esqueleto (F0-01); adaptadores a partir de F1 |
| API | `@gizito/api` | esqueleto (F0-01); `/health` e config em F0-07 |
| Worker | `@gizito/worker` | esqueleto (F0-01); loop da fila em F0-07 |
| Web | `@gizito/web` | esqueleto com Vitest (F0-01); TanStack Start em F0-07 |
| Infra | `docker-compose.yml`, `infra/`, `.github/` | monorepo, Biome, Turborepo e CI (F0-01); compose com Postgres, Redis e Evolution (F0-02) |
