---
feature: F0-03 design-tecnico-e-adrs
module: docs
size: M
status: in_progress
branch: feat/docs/design-tecnico-e-adrs
updated: 2026-10-15
---

# F0-03 design-tecnico-e-adrs

## Objetivo
Registrar o design técnico do Gizito em documentos que agentes e humanos leem por tema: arquitetura, modelo de dados, máquina de estados, API e jobs, mais os ADRs 0002 a 0007 com as decisões já tomadas no PRD §9 (monorepo Bun, fila no Postgres, Mercado Pago, Evolution API, TanStack Start + Elysia, dois PDFs). Roadmap §3 F0-03. O ADR-0001 (harness) já existe.

## Requisitos e critérios de aceite
- **RF-01** — ADRs `0002-monorepo-bun`, `0003-fila-no-postgres`, `0004-mercado-pago-pix`, `0005-evolution-api-whatsapp`, `0006-tanstack-start-e-elysia`, `0007-dois-pdfs-html-katex-playwright` a partir de `_template.md`, status `aceito`, contexto citando a seção do PRD/design doc e a spec de F0 que implementou, alternativas em tabela, gatilhos de revisão · Aceite: seis arquivos com as seis seções do template; nenhuma decisão contradiz PRD, design doc, rules ou código de F0-01/F0-02/F0-04.
- **RF-02** — `docs/engineering/architecture.md`: componentes (Mermaid), sequência do fluxo de compra (Mermaid), tabela de responsabilidades por app e package, camadas handler → service → Drizzle, dados e storage, ambientes, segurança e observabilidade em uma página · Aceite: cada invariante do CLAUDE.md que o fluxo toca aparece onde se aplica.
- **RF-03** — `docs/engineering/data-model.md`: convenções, ER (Mermaid) das oito tabelas do MVP com colunas das rules, índices obrigatórios, o que cada tabela não guarda, retenção, transações `markOrderPaidAndEnqueue` e `publishKit` · Aceite: nomes de tabela, PK, FK e timestamps seguem a rule `database.md`; enums apontam para os `*List` do core.
- **RF-04** — `docs/engineering/state-machine.md`: diagrama de estados (Mermaid), tabela das 13 transições com evento, quem dispara e quando, sub-estado `charge_expired`, casos obrigatórios do PRD §5, referência ao estado → rota · Aceite: transições idênticas a `orderTransitionList` de F0-04.
- **RF-05** — `docs/engineering/api.md`: convenções e códigos de erro, rotas públicas, resposta de `GET /orders/:token` por estado, webhooks, admin, configuração · Aceite: rotas iguais às da rule `api.md` e do design doc §6.8; nenhuma rota que exponha dado pessoal sem mascarar.
- **RF-06** — `docs/engineering/jobs.md`: catálogo dos seis jobs com payload, quem enfileira, transições e concorrência; fluxo de `order.generate` (Mermaid); idempotência e transações; retry e códigos de falha; agendamento; observabilidade · Aceite: nomes e payloads iguais a `jobNameList` e `jobPayloadSchema` de F0-04.
- **RF-07** — `docs/README.md` com os seis ADRs no índice e o mapa sem "(a criar)" em `engineering/`; roadmap com F0-03 em andamento ("Feito até agora") até a revisão do humano, que é o critério de pronto · Aceite: leitura.

## Fora de escopo
- ADR-0008 (pg-boss × fila própria): sai do spike de F0-06.
- `docs/ops/` (runbook, deploy) e `docs/legal/`: F2-13 e F2-12.
- `docs/pedagogy/`: F1-02.
- Alterar PRD ou design doc: nenhum comportamento visível muda aqui.

## Plano
- Os docs descrevem o design decidido, com os nomes do código já existente (F0-04) e os nomes canônicos das rules para o que ainda não existe (F0-05 em diante); onde a implementação futura pode escolher (fila, agendamento com mais de uma réplica), o doc diz quem decide.
- Diagramas só em Mermaid (rule `docs.md`), validados por leitura e pela revisão neutra.
- `data-model.md` acrescenta `kit.delete_datetime` e índices que as rules não listam explicitamente mas a retenção exige; a migration 0001 (F0-05) é a implementação e pode ajustar.
- Arquivos: `docs/engineering/{architecture,data-model,state-machine,api,jobs}.md`, `docs/engineering/adr/000{2..7}-*.md`, `docs/README.md`, `docs/product/roadmap-v1.md`, esta spec.

## Tasks
### M1 — ADRs
- [x] 1.1 ADRs 0002 a 0007 · Verificação: seis seções do template em cada um
### M2 — Docs de engenharia
- [x] 2.1 `architecture.md`, `state-machine.md` · Verificação: transições × `orderTransitionList`
- [x] 2.2 `data-model.md`, `api.md`, `jobs.md` · Verificação: nomes × rules e core
### M3 — Índice, roadmap, revisão
- [x] 3.1 `docs/README.md` (índice de ADRs, mapa) e roadmap (F0-03 em andamento, "Feito até agora")
- [ ] 3.2 Commit; revisão neutra (1 verifier, size M); `review.md`; handoff para revisão do humano

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-15 | ADRs datados de hoje e com status `aceito`, citando que a decisão de produto é do PRD de 14/10 | o ADR registra a decisão técnica e suas alternativas; o PRD já a tomou |
| 2026-10-15 | `api.md` sem prefixo de versão (`/orders`) | um consumidor só (o web); versionar quando houver outro |
| 2026-10-15 | `jobs.md` fixa `fail_reason_code` estáveis (`generation_blocked`, `ai_cost_exceeded`, `render_failed`, `ai_output_invalid`, `payload_invalid`) | o web mapeia código → mensagem do design doc 5.2; códigos precisam existir antes de F2 |
| 2026-10-15 | F0-03 fica "em andamento" no roadmap até o humano revisar | o critério de pronto do roadmap é "revisados por você" |

## Status
Fase: docs escritos; revisão neutra pendente (task 3.2); depois, revisão do humano.
