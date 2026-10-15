---
feature: F0-03 design-tecnico-e-adrs
module: docs
round: 1
verdict: APROVADO
updated: 2026-10-15
---

# Review: F0-03 design-tecnico-e-adrs

## Rodada 1

Verifier: `gizito-implement-verifier` (spawn novo, contexto isolado). Diff: `git diff main...HEAD` no commit `d4626a7`. Código de referência lido por `git show feat/core/core-fundacao:...` e `git show feat/infra/infra-local-compose:docker-compose.yml`, sem checkout.

### Comandos executados
| Comando | Resultado |
|---|---|
| `mermaid.parse` (scratchpad, `mermaid@12.2.0` + happy-dom) em todo bloco ```mermaid dos cinco docs | 5/5 OK: flowchart (architecture, jobs), sequence (architecture), er (data-model), stateDiagram (state-machine) |
| `git diff main...HEAD --check` | só o trailing whitespace pré-existente do cabeçalho do roadmap (hard break Markdown) |
| `git show feat/core/core-fundacao:packages/core/src/{order/state-machine,jobs/schemas,enums,constants,charge/rules,retention/rules,storage/keys,common,interfaces/*}.ts` | transições, eventos, jobs, payloads, enums, constantes, funções e keys comparados nome a nome com os docs |
| `git show feat/core/core-fundacao:...state-machine.test.ts` | 9 × 10 − 13 = 77 inválidas, igual ao doc |
| `git show feat/infra/infra-local-compose:docker-compose.yml` | portas, `DATABASE_PROVIDER`, `CACHE_REDIS_ENABLED` batem com `architecture.md`; `DATABASE_SAVE_DATA_INSTANCE: "true"` (sugestão no ADR-0005) |
| grep de cabeçalho e seções nos seis ADRs | 6/6 com as seções do template |
| `tsconfig.base.json`, `turbo.json`, `package.json`, `ci.yml`, `biome.json`, `packages/core/package.json` | afirmações do ADR-0002 confirmadas |
| `bun run lint` | não repetido; só Markdown no diff |
| typecheck / test / integração / regressão pedagógica | não aplicáveis |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | seis ADRs com as seis seções e status `aceito`; contexto cita PRD/design doc e specs de F0; fatos conferidos contra F0-01/F0-02, `known-issues.md` e `lessons.md`; duas imprecisões menores (sugestões) |
| RF-02 | sim | `architecture.md`: dois Mermaid válidos; tabela de responsabilidades; camadas; keys iguais a `storage/keys.ts`; ambientes iguais ao compose e ao `.env.example`; invariantes 1–6 e 8–10 explícitas, a 7 só implícita (sugestão) |
| RF-03 | sim | ER das oito tabelas com colunas da rule mais `kit.delete_datetime`; PK/FK/timestamps conforme `database.md`; `*List` existem em `enums.ts`; índices da rule; transações descritas |
| RF-04 | sim | 13 transições idênticas a `orderTransitionList`; terminal só `refunded`; `deriveAwaitingPaymentSubstate` igual a `charge/rules.ts`; casos do PRD §5; estado → rota do design doc §6.8; um nome de função inexistente (ALERTA 1) |
| RF-05 | sim | rotas iguais à rule `api.md`; `kind` = `kitFileKindList`; 404 neutro; `failed`/`refunded` → `/erro`; dados mascarados; envs existem no `.env.example`; inline × assíncrono ambíguo (ALERTA 2) |
| RF-06 | sim | seis jobs = `jobNameList`; payloads = `jobPayloadSchema`; constantes batem; os cinco `fail_reason_code` passam em `outcomeCodeSchema`; fluxograma válido mas divergente do texto (ALERTA 3) |
| RF-07 | sim | índice 0002–0007 no README; mapa sem "(a criar)" e links existentes; roadmap com "(em andamento)", "Feito até agora" e contadores |

### Achados
- [ALERTA] `state-machine.md:43` — cita `isPaidOrderStatus`, que não existe no core de F0-04; o nome real para `paid, processing, ready` é `isWhatsappLinkableOrderStatus`.
- [ALERTA] `architecture.md:86` — "webhook_event + job charge.reconcile ou consulta": `charge.reconcile` é periódico com payload `{}` e o webhook não o enfileira; os docs deixam aberto se a consulta ao gateway é inline (`api.md`) ou diferida (rule `payments.md` e PRD §9.1 dizem assíncrono) e `jobNameList` não tem job de confirmação — decidir uma coisa só.
- [ALERTA] `jobs.md:22` — fluxograma "pedido em paid? não → no-op" contradiz o texto que continua de `processing`; `H -->|falha| X` contradiz "render falhou duas vezes"; `studyKitSchema.parse` sem aresta de falha.
- [ALERTA] `state-machine.md:55` e `data-model.md:176` — Pix antigo pago depois de "Gerar novo Pix": pedido vira `paid`, a cobrança nova fica `pending` para sempre e, se também for paga, cai em "no-op com log info": cobrado duas vezes sem caminho operacional.
- [SUGESTÃO] `api.md:44` — `refundedDatetime` sem coluna de origem.
- [SUGESTÃO] `api.md:22` e `state-machine.md:35` — criar cobrança no gateway dentro da transação segura o Postgres durante um HTTP; chamar o gateway antes (idempotente por `chargeId`).
- [SUGESTÃO] `api.md:67` — `republish` "supersede" mas `publishKit` faz `kit_published`, inválido de `ready`.
- [SUGESTÃO] `data-model.md:12` — lista de `*List` omite `perceivedDifficultyList`.
- [SUGESTÃO] `data-model.md:156` × `jobs.md:50` — índice comum num doc, "unique lógico" no outro.
- [SUGESTÃO] `adr/0005:13` — "`DATABASE_SAVE_DATA_*=false`" mas `DATABASE_SAVE_DATA_INSTANCE=true` no compose.
- [SUGESTÃO] `adr/0006:37` — "antes da 1.x estável" sem versão no repositório.
- [SUGESTÃO] `state-machine.md:33` — "1–3 assuntos" na extração; o teto de 3 é da confirmação (PRD §5 prevê mais candidatos).
- [SUGESTÃO] `architecture.md:99` — invariante 7 não enunciada.

### Regressão pedagógica
não aplicável

### Resposta do orquestrador
- ALERTA 1: aplicado (`isWhatsappLinkableOrderStatus`, com a semântica certa).
- ALERTA 2: decidido e aplicado em `architecture.md`, `api.md`, `jobs.md` e `state-machine.md`: o webhook valida a assinatura, registra `webhook_event` e enfileira `charge.reconcile { orderId }` na mesma transação; a consulta ao gateway e `markOrderPaidAndEnqueue` acontecem só no worker, pelo mesmo código da reconciliação periódica. Isso segue a rule `payments.md` ("registrar e enfileirar") e o PRD §9.1 ("assíncrono") sem job novo. Exige `orderId` opcional em `chargeReconcileJobPayloadSchema`, que entra em commit complementar na branch `feat/core/core-fundacao`.
- ALERTA 3: aplicado. Fluxograma refeito com os três ramos por status, aresta de falha do `parse`, contador único de regeneração e segunda tentativa de render; texto e códigos de falha alinhados.
- ALERTA 4: aplicado. `markOrderPaidAndEnqueue` expira as demais cobranças `pending` do pedido (cancelando no gateway quando a API permitir); pagamento confirmado de outra cobrança de pedido já pago abre `support_ticket` `duplicate_payment` e alerta para reembolso manual. `duplicate_payment` entra em `supportTicketKindList` no mesmo commit complementar do core.
- SUGESTÕES: todas aplicadas (`charge.refund_datetime`; gateway antes da transação; `republishKit` sem transição; `perceivedDifficultyList`; unique em `notification` com retry atualizando a linha; redação do ADR-0005 e do ADR-0006; condição de `analysis_succeeded`; invariante 7 em `architecture.md`).
- Pendência que continua: revisão do humano, que é o critério de pronto do roadmap para F0-03.
