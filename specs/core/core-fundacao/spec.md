---
feature: F0-04 core-fundacao
module: core
size: M
status: in_progress
branch: feat/core/core-fundacao
updated: 2026-10-15
---

# F0-04 core-fundacao

## Objetivo
Dar ao `@gizito/core` o domínio puro que api, worker, db e integrations vão consumir: constantes de negócio, enums com `List`, máquina de estados do pedido como dado, schemas Zod de pedido, foto, cobrança e payload de job, e as interfaces `PaymentGateway`, `NotificationChannel`, `AiProvider`, `ObjectStorage` e `MathEvaluator`. Sem IO. Fontes: roadmap §3 F0-04, PRD §5 (estados e exceções), §6 (entradas), §7.2–7.3 (contagens, dificuldade, `expected_answer`), §9 (interfaces), rule `core.md`.

## Requisitos e critérios de aceite
- **RF-01** — Constantes de negócio em `constants.ts`: `KIT_PRICE_CENTS = 2990`, `MIN_PHOTO_COUNT = 1`, `MAX_PHOTO_COUNT = 5`, `MAX_PHOTO_BYTES = 8 MiB`, `MIN_TOPIC_COUNT = 1`, `MAX_TOPIC_COUNT = 3`, `WORKED_EXAMPLE_COUNT = 2`, `PRACTICE_QUESTION_COUNT = 10`, `MOCK_QUESTION_COUNT = 10`, `ANSWER_KEY_COUNT = 20`, distribuições de dificuldade (fixação 4/4/2, simulado 3/4/3), cobertura mínima por assunto e bloco (3 assuntos → 3, 2 → 4), `MAX_PERCEIVED_DIFFICULTY_SHIFT = 1`, `MAX_REGENERATION_COUNT = 1`, `CHARGE_TTL_MINUTES = 30`, `PHOTO_RETENTION_DAYS = 30`, `KIT_RETENTION_MONTHS = 12`, `MAX_NOTE_LENGTH = 300`, `MAX_OTHER_TOPIC_LENGTH`, `PUBLIC_TOKEN_BYTES = 32`, `SHORT_CODE_PREFIX = "GZ-"`, `SHORT_CODE_LENGTH = 6`, `SHORT_CODE_ALPHABET` sem 0/O/1/I · Aceite: teste afirma os valores do PRD; `ANSWER_KEY_COUNT` = fixação + simulado; distribuições somam 10.
- **RF-02** — Enums como `z.enum` + array `List` em `enums.ts`: `gradeList`, `subjectList`, `orderStatusList`, `chargeStatusList`, `paymentGatewayList`, `questionTypeList`, `difficultyList`, `perceivedDifficultyList`, `questionBlockList`, `jobNameList`, `aiStageList`, `notificationChannelList`, `notificationKindList`, `notificationStatusList`, `webhookSourceList`, `supportTicketKindList`, `supportTicketStatusList`, `kitFileKindList`; rótulos pt-BR para ano e disciplina · Aceite: cada enum exporta schema, tipo e lista; `orderStatusList` tem exatamente os 9 estados do CLAUDE.md; `jobNameList` tem os 6 jobs da rule `worker.md`.
- **RF-03** — Máquina de estados como dado em `order/state-machine.ts`: `orderEventList`, `orderTransitionList` (`{ from, event, to }`), `transitionOrder(status, event)` devolvendo `Result<OrderStatus, InvalidTransitionError>` (nunca lança), `allowedEventList(status)`, `isTerminalStatus`. Transições do PRD §5: `draft →(start_analysis) analyzing →(analysis_succeeded) preview_ready →(confirm) awaiting_payment →(payment_confirmed) paid →(generation_started) processing →(kit_published) ready | →(generation_failed) failed`; `analyzing →(analysis_failed) draft`; `failed →(reprocess) paid`; `paid | processing | ready | failed →(refund) refunded`. Sub-estado `charge_expired` derivado da cobrança, não do status · Aceite: teste tabela com toda transição válida; teste exaustivo status × evento fora da tabela devolve `InvalidTransitionError` com `from` e `event`; `refunded` sem saída.
- **RF-04** — Schemas de entidade em `order/schemas.ts` e `charge/schemas.ts`: `publicTokenSchema` (base64url de 32 bytes), `shortCodeSchema` (`GZ-` + 6 do alfabeto), `emailSchema`, `noteTextSchema` (≤ 300), `otherTopicTextSchema`, `topicIdSchema`, `phoneSchema` (E.164), `orderSchema`, `orderPhotoSchema`, `chargeSchema`; ids com `z.guid()`; datas `z.date()` · Aceite: fixture válida e inválida por schema (token curto, código com `0`/`O`, 4 assuntos, observação de 301 chars, e-mail inválido, `amountCents` ≤ 0).
- **RF-05** — Payloads de job em `jobs/schemas.ts`: `jobPayloadSchema` como união discriminada por `name` sobre `jobNameList` (`order.analyze {orderId}`, `order.generate {orderId}`, `order.notify {orderId, kind}`, `charge.reconcile {}`, `retention.purge {}`, `whatsapp.inbound {webhookEventId, phone, text ≤ 1000}`), `jobPayloadSchemaByName` · Aceite: cada payload válido passa; nome desconhecido e campo obrigatório ausente falham; campo extra é descartado.
- **RF-06** — Regras puras com relógio por parâmetro: `charge/rules.ts` (`chargeExpireDatetime(now)`, `isChargeExpired(charge, now)`, `deriveAwaitingPaymentSubstate(charge, now)`), `retention/rules.ts` (`photoDeleteDeadline(insertDatetime)`, `kitDeleteDeadline(publishedDatetime)`, `isPhotoExpired`, `isKitExpired`) · Aceite: testes com datas fixas, inclusive borda exata e virada de mês.
- **RF-07** — Interfaces em `interfaces/`: `PaymentGateway` (`createCharge`, `getChargeStatus`, `refund`, `parseWebhook` com resultado discriminado válido/inválido), `NotificationChannel` (`channel`, `send`), `AiProvider` (`extract`, `plan`, `generate`, `review`, genéricas no schema de saída, devolvendo `{ output, usage { inputTokens, outputTokens, costCents }, model, promptVersion, durationMs }`), `ObjectStorage` (`putPrivate`, `getSignedUrl`, `delete`), `MathEvaluator` (`evaluate`, `equals`); tipos de entrada/saída como schemas Zod; nenhum campo de fornecedor · Aceite: `tsc` verde; um fake mínimo de cada interface compila num teste de tipo (sem virar fake oficial, que é de `integrations`).
- **RF-08** — `pedagogy/expected-answer.ts`: `expectedAnswerSchema` (`number | fraction | expression | set | text`, `unit`, `tolerance`) e `storage/keys.ts` com as keys `orders/{orderId}/photos/{photoId}.jpg` e `orders/{orderId}/kits/{kitId}/{activities,answer-key}.pdf` · Aceite: testes de parse e de formato das keys.
- **RF-09** — Pureza: nenhum arquivo de `src/` (fora de `__tests__`) importa algo além de `zod` e `#src/*`, nem usa `process.env`, `Date.now`, `new Date()` sem argumento, `Math.random`, `fetch`, `Bun.` · Aceite: teste `purity.test.ts` varre `src/**/*.ts` e falha ao encontrar; `zod` entra como dependência do core.
- **RF-10** — Cobertura mínima de 70% em `packages/core` via `bunfig.toml` (`coverageThreshold`), como adiado em F0-01 · Aceite: `bun test` no workspace falha abaixo do limiar; CI continua verde.
- **RF-11** — `index.ts` reexporta tudo; docs de estado: roadmap (F0-04 `[x]`), `docs/progress/core.md`, `docs/README.md` · Aceite: `apps/api` continua importando `@gizito/core` no teste existente; docs com data, commit e spec.

## Fora de escopo
- Taxonomia (F1-01), `studyKitSchema`, `extractionResultSchema`, `materialProfileSchema`, `kitPlanSchema`, `reviewResultSchema` e `validateStudyKit` (F1-03). `order.materialProfile` fica `z.unknown()` até F1-03.
- Payloads da API (`POST /orders`, `confirm`) e `order-route` do web (F2-01, F2-09).
- Fakes oficiais (`FakePaymentGateway` etc.) em `integrations` (F1-05, F2-01, F2-03).
- Schema da tabela de jobs e `enqueue`/`work` (F0-06).
- Entrypoint `@gizito/core/client`: nada no core é só-servidor.

## Plano
- `grade` como `"4" | "5" | "6" | "7"` (string, vira `pgEnum`), `subject` como `"math" | "portuguese"`; rótulos pt-BR (`4º ano`, `Matemática`, `Língua Portuguesa`) em `gradeLabelMap`/`subjectLabelMap` porque web e PDF precisam do mesmo texto.
- `questionTypeList = ["multiple_choice", "open_answer"]`: PRD §7.2 fala em "múltipla escolha" e "resposta curta/aberta"; a forma da resposta curta já é capturada por `expectedAnswer.kind`.
- `Result<T, E>` mínimo em `result.ts` (`ok`/`err`), usado por `transitionOrder` e `MathEvaluator.evaluate`.
- `AiProvider` com quatro métodos (a rule lista três, mas o pipeline do PRD §7.4 tem a etapa `plan` com prompt próprio e modelo forte); genéricos no `outputSchema` porque os schemas de saída chegam em F1-03.
- `reprocess` só de `failed` → `paid` (admin "reprocessar"); republicação de pedido `ready` não muda status (kit novo supersede o anterior, F2-11).
- `whatsapp.inbound` carrega `phone` e `text` limitados no payload porque o handler precisa do texto para achar o código; o payload nunca é logado (invariante 9).
- `bunfig.toml` só no core; `coverageSkipTestFiles = true`.
- Arquivos: `packages/core/{package.json,bunfig.toml}`, `src/{index,constants,enums,common,result}.ts`, `src/order/{state-machine,schemas}.ts`, `src/charge/{schemas,rules}.ts`, `src/retention/rules.ts`, `src/jobs/schemas.ts`, `src/pedagogy/expected-answer.ts`, `src/storage/keys.ts`, `src/interfaces/{payment-gateway,notification-channel,ai-provider,object-storage,math-evaluator}.ts`, testes em `src/__tests__/`.
- Riscos: `bun test --coverage` com threshold no Bun 1.3 (sintaxe do `bunfig.toml`) → verificar na task 3.1; Zod 4 `z.guid()`/`z.email()` top-level → verificar na 1.1.

## Tasks
### M1 — Constantes, enums, resultado, erros
- [x] 1.1 `zod` no core; `constants.ts`, `enums.ts`, `common.ts`, `result.ts` · Verificação: `bun test` + `tsc`
### M2 — Máquina de estados e schemas
- [x] 2.1 `order/state-machine.ts` + teste exaustivo
- [x] 2.2 `order/schemas.ts`, `charge/schemas.ts`, `charge/rules.ts`, `retention/rules.ts` + testes
- [x] 2.3 `jobs/schemas.ts`, `pedagogy/expected-answer.ts`, `storage/keys.ts` + testes
### M3 — Interfaces, pureza, cobertura, docs
- [x] 3.1 `interfaces/*.ts` + teste de tipo com fakes mínimos; `purity.test.ts`; `bunfig.toml` com threshold
- [ ] 3.2 `index.ts`; `bun run lint/typecheck/test` na raiz; docs de estado; commits; revisão neutra (zona sensível: máquina de estados)

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-15 | `grade` como string `"4".."7"` e `subject` como `"math" \| "portuguese"`, com `gradeLabelMap`/`subjectLabelMap` em pt-BR | viram `pgEnum` em F0-05 sem conversão; web e PDF precisam do mesmo rótulo |
| 2026-10-15 | `questionTypeList = ["multiple_choice", "open_answer"]` | PRD §7.2 só distingue múltipla escolha de resposta curta/aberta; a forma da resposta vem de `expectedAnswer.kind` |
| 2026-10-15 | `refund` permitido de `paid`, `processing`, `ready` e `failed` | PRD §5: "nenhum pagamento deve ficar sem solução operacional"; reembolso durante `processing` é barrado na publicação pela própria máquina (`processing → ready` deixa de valer) |
| 2026-10-15 | `reprocess` só de `failed` → `paid` | o job `order.generate` sempre parte de `paid`; republicar pedido `ready` não muda status (kit novo supersede, F2-11) |
| 2026-10-15 | `AiProvider` com `extract`, `plan`, `generate`, `review`, genéricos no `outputSchema` | a rule lista três métodos, mas o pipeline do PRD §7.4 tem a etapa `plan` com prompt próprio; os schemas de saída chegam em F1-03 |
| 2026-10-15 | `MathEvaluator` com `evaluate` e `equals`; `expectedAnswerSchema` já definido no core | a interface precisa do tipo de retorno; a equivalência entre alternativas (F1-04) é do mesmo avaliador; F1-02/F1-03 podem estender o schema |
| 2026-10-15 | `whatsapp.inbound` carrega `webhookEventId`, `phone` e `text` (≤ 1000) | o handler precisa do texto para achar o código; payload nunca vai para log (invariante 9) |
| 2026-10-15 | `Result<T, E>` mínimo em `result.ts` | `transitionOrder` e `MathEvaluator.evaluate` devolvem erro tipado em vez de lançar |
| 2026-10-15 | Pureza garantida por teste (`purity.test.ts`) e cobertura ≥ 70% por `bunfig.toml` do core | regra mecânica em vez de revisão manual; threshold adiado em F0-01 entra com o primeiro domínio |

## Status
Fase: implementação concluída (commit `74c3c61`) e docs de estado atualizados; revisão neutra pendente (task 3.2).
