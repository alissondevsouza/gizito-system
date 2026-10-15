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
| [`engineering/`](engineering/) | Arquitetura, modelo de dados, máquina de estados, API, [`adr/`](engineering/adr/), [`known-issues.md`](engineering/known-issues.md) (a criar) |
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
| — | As decisões de produto já tomadas estão no PRD, seções 9, 9.1, 9.2 e 12.1, e viram ADRs no design técnico | — | — |

> Para criar um novo ADR: copie `engineering/adr/_template.md` → `engineering/adr/NNNN-titulo.md` e adicione a linha aqui.

---

## Estado por Módulo

> Atualizado em 2026-10-14. Nenhum código ainda. Detalhes em `progress/{modulo}.md` quando o módulo for criado.

| Módulo | Workspace | Status |
|--------|-----------|--------|
| Core | `@gizito/core` | não iniciado |
| Database | `@gizito/db` | não iniciado |
| Integrations | `@gizito/integrations` | não iniciado |
| API | `@gizito/api` | não iniciado |
| Worker | `@gizito/worker` | não iniciado |
| Web | `@gizito/web` | não iniciado |
| Infra | `docker-compose.yml`, `infra/` | não iniciado |
