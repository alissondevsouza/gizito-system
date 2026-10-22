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
| [`pedagogy/`](pedagogy/) | [`taxonomia.md`](pedagogy/taxonomia.md) (gerado do core por `bun run taxonomy:doc`, com os assuntos ainda não atendidos); [`spec-pedagogica.md`](pedagogy/spec-pedagogica.md) (schemas do kit, alocação das questões, validações com código e severidade, regeneração, casos de regressão, homologação); [`prompts-v1.md`](pedagogy/prompts-v1.md) e [`prompts-v2.md`](pedagogy/prompts-v2.md); [`regressao/`](pedagogy/regressao/) (relatórios da regressão); [`amostras/`](pedagogy/amostras/) (kits de amostra da landing); [`homologacao/`](pedagogy/homologacao/) (auditoria do professor) |
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
| [0008](engineering/adr/0008-fila-propria-skip-locked.md) | Fila própria com `FOR UPDATE SKIP LOCKED` em vez de pg-boss, decidida pelo spike de F0-06 | aceito (lock substituído pelo 0009) | 2026-10-15 |
| [0009](engineering/adr/0009-lease-renovado-e-compensacao.md) | Lease curto renovado, teto por execução e compensação atômica do job esgotado | aceito | 2026-10-19 |
| [0010](engineering/adr/0010-pipeline-pedagogico-deterministico.md) | Pipeline pedagógico com regras no core, fotos só na extração e regeneração por reparo | aceito | 2026-10-19 |
| [0011](engineering/adr/0011-anthropic-como-provedor-de-ia.md) | Anthropic como provedor de IA na F1, com adaptador por `Result`, saída estruturada e custo em centavos de dólar | aceito | 2026-10-20 |
| [0012](engineering/adr/0012-storage-r2-com-aws4fetch-e-minio-local.md) | Storage R2 com `aws4fetch`, MinIO local no dev e na CI, fotos no prefixo `photos/` | aceito | 2026-10-22 |

> Para criar um novo ADR: copie `engineering/adr/_template.md` → `engineering/adr/NNNN-titulo.md` e adicione a linha aqui.

---

## Estado por Módulo

> Atualizado em 2026-10-21 (F1 concluída; próxima fase F2). O pipeline vai do caderno aos dois PDFs por linha de comando (`bun run pipeline`), com a regressão de 35 casos (`bun run test:pedagogy`), a auditoria do professor e os kits de amostra. Ainda não há banco nem fila no pipeline: os handlers dos jobs, a web e o Pix entram na F2. Detalhes em `progress/{modulo}.md`.

| Módulo | Workspace | Status |
|--------|-----------|--------|
| Core | `@gizito/core` | constantes, enums, máquina de estados, schemas e interfaces (F0-04); taxonomia `tax-v2` com 180 assuntos e os não atendidos (F1-01, F1-02, F1-10); schemas, alocação, composição e validações do kit e interpretação da revisão (F1-03) |
| Database | `@gizito/db` | schema das 8 tabelas, conexão Bun.SQL e test-helpers (F0-05); tabela `job` e fila própria com `SKIP LOCKED`, `markOrderPaidAndEnqueue` e `publishKit` (F0-06) |
| Integrations | `@gizito/integrations` | logger Pino com redação e fake em memória (F0-07); avaliador mathjs e LaTeX (F1-04), conferência de KaTeX, adaptador Anthropic e `FakeAiProvider` (F1-05); Mercado Pago, Evolution, Resend e R2 na F2 |
| API | `@gizito/api` | Elysia com config fail-fast, `/health`, erros `{ error, code }`, CORS e log por rota (F0-07); rotas de pedido a partir de F2-01 |
| Worker | `@gizito/worker` | loop da fila por raias, agendador, manutenção de locks e `/health` com métricas (F0-07); pipeline de extração e geração, render dos dois PDFs com marca de amostra, `bun run pipeline` e `bun run test:pedagogy` (F1-06 a F1-11); handlers dos jobs na F2 |
| Web | `@gizito/web` | TanStack Start com Tailwind v4, tokens de cor e página vazia (F0-07); identidade em F2-08 |
| Infra | `docker-compose.yml`, `infra/`, `.github/` | monorepo, Biome, Turborepo e CI (F0-01); compose com Postgres, Redis e Evolution (F0-02); imagem do worker com Chromium e navegador do Playwright na CI (F1-08) |
