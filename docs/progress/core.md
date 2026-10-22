# Progresso: core

**Workspace:** `@gizito/core`
**Fase atual:** F2 — Fluxo comercial (F1 concluída em 2026-10-21)
**Última atualização:** 2026-10-21

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Workspace criado com `package.json` (`imports` `#src/*`, `exports` apontando para `src/index.ts`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test.

## Feature core-fundacao (2026-10-15, `74c3c61`)

- `constants.ts` (preço, limites de foto e assunto, contagens 2/10/10/20, distribuições 4/4/2 e 3/4/3, cobertura mínima por assunto, TTL do Pix, retenção, token e código curto), `enums.ts` (`z.enum` + `List` + tipo para ano, disciplina, status do pedido e da cobrança, gateway, tipo de questão, dificuldade, bloco, job, etapa de IA, canal, tipo e status de notificação, fonte de webhook, ticket, arquivo do kit; rótulos pt-BR de ano e disciplina).
- `order/state-machine.ts`: `orderEventList`, `orderTransitionList` (13 transições do PRD §5), `transitionOrder` devolvendo `Result<OrderStatus, InvalidTransitionError>`, `allowedEventList`, `isTerminalOrderStatus`, `isWhatsappLinkableOrderStatus`. `charge_expired` é derivado em `charge/rules.ts`, não é status.
- Schemas: `order/schemas.ts` (`publicToken`, `shortCode`, `email`, `phone`, `noteText`, `otherTopicText`, `topicId`, `orderSchema`, `orderPhotoSchema`), `charge/schemas.ts`, `jobs/schemas.ts` (união discriminada dos 6 jobs), `pedagogy/expected-answer.ts`, `storage/keys.ts`, `common.ts` (`guidSchema`, `outcomeCodeSchema`, timestamps).
- Interfaces em `interfaces/`: `PaymentGateway`, `NotificationChannel`, `AiProvider` (4 métodos genéricos no `outputSchema`), `ObjectStorage`, `MathEvaluator`; tipos de entrada e saída como schemas Zod.
- Ajuste pós-revisão da F0-03: `charge.reconcile { orderId? }` (o webhook do gateway enfileira a reconciliação direcionada) e `duplicate_payment` em `supportTicketKindList`.
- Testes: 184 em `src/__tests__/` (máquina de estados exaustiva, fixtures válidas e inválidas, regras com datas fixas, contratos das interfaces com fakes mínimos, `purity.test.ts`); `bunfig.toml` com `coverageThreshold` 0.7 (cobertura atual 100%). Dependência: `zod` 4.
- Ajuste em F0-05 (`66f1217`): `publicTokenSchema` aceita os 16 últimos caracteres canônicos de base64url de 32 bytes (`AEIMQUYcgkosw048`); a classe `[AQgw]` rejeitava 75% dos tokens reais. `chargeSchema` ganha `refundDatetime` (coluna já prevista no data-model).

## Ajustes em fila-postgres (2026-10-15, `db5e365`, `70d9d60`)

- `enums.ts`: `jobStatusList` (`pending`, `active`, `completed`, `failed`). `constants.ts`: `JOB_RETRY_DELAY_SECONDS_LIST` (30, 120, 480), `JOB_MAX_ATTEMPT_COUNT` (4), `JOB_LOCK_TIMEOUT_SECONDS` (900).
- `jobs/rules.ts`: `jobRetryDelaySeconds`, `nextJobRunAfterDatetime`, `jobLockExpireDatetime`, `jobErrorCodeMap` (`payload_invalid`, `lock_expired`, `unhandled_error`), `personalDataJobNameList`, `personalDataJobRetainedFieldMap` e `isPersonalDataJob`.
- `order/state-machine.ts`: `postPaymentOrderStatusList` derivada da máquina (alcançáveis a partir de `paid`) e `isPostPaymentOrderStatus`.
- `charge/schemas.ts`: `markOrderPaidInputSchema`. `charge/rules.ts`: `decidePaymentConfirmation` e `ChargePaymentMismatchError`. `kit/schemas.ts`: `publishKitInputSchema` (as duas keys iguais a `kitStorageKey` do próprio kit).
- Testes: 212, cobertura 100%.

## Ajustes em esqueleto-das-apps (2026-10-16, `c579f79`)

- `config/schemas.ts`: `nodeEnvList`, `logLevelList`, `portSchema`, `postgresUrlSchema`, `sharedEnvironmentSchema`, `paymentEnvironmentSchema` (`PAYMENT_GATEWAY` obrigatória), `isPaymentGatewayAllowed`, `isLogLevelAllowed` e `checkProductionEnvironment` (fake e `debug`/`trace` recusados em produção).
- `api/errors.ts`: `apiErrorCodeList` (com `not_found` e `internal_error`) e `apiErrorSchema`. `health/schemas.ts`: `healthStatusList`, `apiHealthSchema`, `queueMetricsSchema`, `workerHealthSchema`.
- `constants.ts`: `RETENTION_PURGE_INTERVAL_HOURS` (24) e `JOB_FAILED_METRIC_WINDOW_HOURS` (24). `jobErrorCodeMap.handlerNotFound`. `common.ts`: `errorNameOf`. `health/schemas.ts`: `DATABASE_UNAVAILABLE_ERROR_CODE`.
- Testes: 233.

## Ajustes em revisao-f0 (2026-10-19, `f81d88b`, `ecdd15e`)

- `order/state-machine.ts`: `preview_ready → draft` (`photos_changed`, "Trocar foto") e `paid → failed` (`generation_failed`, esgotamento antes de gerar); `confirmedOrderStatusList` (alcançáveis de `awaiting_payment`).
- `order/schemas.ts`: `topicIdListSchema` sem repetidos; `countOrderTopics`; `orderSchema` com até 3 assuntos contando o "outro" e ao menos 1 a partir de `awaiting_payment`; `emailSchema` apara e põe em minúsculas.
- `common.ts`: `httpsUrlSchema` (`ticketUrl`) e `webUrlSchema` (URLs de notificação). `interfaces/notification-channel.ts`: `outboundNotificationSchema` discriminado por `kind` (`whatsapp_help` sem pedido, só WhatsApp) e `recipientHashSchema`.
- `constants.ts`: `JOB_LOCK_TIMEOUT_SECONDS` 120, `JOB_LEASE_RENEW_INTERVAL_SECONDS` 30, `JOB_MAX_RUN_SECONDS` 900. `jobErrorCodeMap` ganha `job_timeout`, `invalid_error_code`, `worker_shutdown` e `job_compensation_failed`. `chargeReconcileJobPayloadSchema` com `webhookEventId` (só junto com `orderId`).
- `retention/rules.ts`: `isPhotoDueForPurge` (vence antes da próxima execução do purge). `config/schemas.ts`: `NODE_ENV` obrigatório.
- Testes: 254, cobertura 100%.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Constantes, enums, máquina de estados, schemas de entidade e de job, regras puras e interfaces (F0-04)
- [x] Taxonomia `tax-v1` (F1-01), assuntos ainda não atendidos (F1-02) e `tax-v2` com `lp5-word-classes` (F1-10)
- [x] Schemas, alocação, composição, validações e revisão do kit (F1-03)

## Pendências

- Payloads da API (`POST /orders`, `confirm`) em F2-01; mapeamento estado → rota no web em F2-09
- Contratos HTTP de cada rota nova entram em `api/` conforme F2 avança

## Feature taxonomia-v1 (2026-10-19, `0f4f4e5` e ajustes da revisão)

- `pedagogy/taxonomy/`: 8 arquivos `{4..7}-{math,portuguese}.ts` com 179 assuntos (`tax-v1`): id `{ma|lp}{ano}-{slug}`, nome de até 40 caracteres, descrição, habilidades BNCC da própria faixa, pré-requisitos (podem vir de anos anteriores) e regras aplicáveis.
- `schemas.ts`: `topicDefinitionSchema`, `topicSchema`, `topicValidationRuleList` (6 regras, 3 por disciplina) com descrição e disciplina. `bncc.ts`: faixas `EF04MA`…`EF07LP` com o último número de cada uma e `isBnccSkillOfGrade`. `integrity.ts`: `checkTaxonomyIntegrity` com 11 códigos. `lookup.ts`: `createTaxonomyLookup`. `index.ts`: `TAXONOMY_VERSION`, `taxonomyTopicList`, `listTopics`, `findTopic`, `isSelectableTopic`, `taxonomyExclusionList`. `markdown.ts`: `renderTaxonomyMarkdown`.
- `scripts/write-taxonomy-doc.ts` e `bun run taxonomy:doc` geram `docs/pedagogy/taxonomia.md`; teste de sincronia e input do turbo pegam edição à mão. Fingerprint por versão em `__fixtures__/taxonomy-history.ts`: mudar o conteúdo exige novo `TAXONOMY_VERSION`; ids publicados nunca somem.
- Testes: 331, cobertura 100%. Revisada e aprovada pelo professor em 19/10/2026, sem mudanças. Pendência: regressão pedagógica (`known-issues.md`).

## Ajustes em spec-pedagogica-executavel (2026-10-19, `f25169c`)

- `pedagogy/taxonomy/unsupported.ts`: `unsupportedTopicSchema`, `unsupportedTopicList` (7 áreas ainda não atendidas, ids `{ma|lp}-{slug}`, com o texto aprovado pelo professor, rótulo curto, motivo, como a extração reconhece e palavras do "outro"), `normalizeKeywordText` e `findUnsupportedTopicList(text, subject)`. Substitui `taxonomyExclusionList`.
- `schemas.ts` exporta `topicSubjectPrefixMap` e `uniqueListSchema`. `markdown.ts` publica a tabela de não atendidos em `taxonomia.md`. O histórico da `tax-v1` congela também a lista (`unsupportedFingerprint`).
- Testes: 346.

## Feature schemas-e-validacoes-do-kit (2026-10-20, `3641d79`)

- `pedagogy/extraction/`: `photoExtractionSchema`, `materialProfileSchema`, `sanitizePhotoExtraction`, `mergePhotoExtractionList` e `decidePreviewOutcome`.
- `pedagogy/slots.ts` (`planKitSlots`, as 20 vagas com assunto e dificuldade), `pedagogy/plan/` (`kitPlanSchema`) e `pedagogy/validation/plan.ts` (`validateKitPlan`).
- `pedagogy/kit/`: `kitContentSchema` e o de reparo, `studyKitSchema`, `composeStudyKit`, `applyKitRepair`, `listAnswerKey` e o formato das respostas.
- `pedagogy/validation/`: `validateStudyKit`, com o `MathEvaluator` injetado, e os códigos com severidade e reparo fixos (`decideRepair`).
- `pedagogy/review/`: `reviewResultSchema` e `interpretReview`.
- `labels.ts`: rótulos pt-BR.
- Testes: 689. Há uma fixture válida e uma inválida por código, e as tabelas da spec pedagógica viraram teste. Spec: `specs/core/schemas-e-validacoes-do-kit/`.

## Ajustes da F1-05 à F1-10 (2026-10-20 e 2026-10-21)

- `AiProvider` com `Result` (F1-05, ADR-0011).
- Correções da regressão (F1-10, spec pedagógica 1.5 §15.10): `tax-v2` com `lp5-word-classes` (180 assuntos) e parágrafo de texto-base de 1 a 800 caracteres.
- Testes: 730.
