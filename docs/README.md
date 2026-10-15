# Gizito — Documentação e Memória do Projeto

Este diretório é a **memória persistente do projeto**: produto, design, decisões arquiteturais, lições, dívidas e estado por módulo. Serve de contexto para agentes de IA e para quem desenvolve.

## Como usar

- **Antes de implementar:** leia o PRD (`product/`), o guia de design (`design/`), os ADRs relevantes (`engineering/adr/`), as lições (`lessons.md`) e o estado do módulo (`progress/`)
- **Depois de implementar:** atualize `progress/{modulo}.md`, a tabela de estado abaixo, e gradue decisões/lições (fluxo `gizito-spec-driven`, Phase 5)
- **Nova decisão arquitetural:** crie um ADR a partir de `engineering/adr/_template.md` e adicione a linha na tabela
- **Gotcha/aprendizado operacional:** append em `lessons.md`
- **Dívida deliberada:** registre em `engineering/known-issues.md`

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
| [`../specs/`](../specs/) | Artefatos por feature (spec/plan/tasks/progress/validate/review) |

---

## Architecture Decision Records (ADRs)

| # | Decisão | Status | Data |
|---|---------|--------|------|
| — | Nenhum ADR ainda. As decisões já tomadas estão no PRD, seções 9, 9.1, 9.2 e 12.1, e devem virar ADRs no design técnico | — | — |

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
