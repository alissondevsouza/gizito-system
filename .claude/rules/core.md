---
paths:
  - "packages/core/**/*.ts"
---

# Core — Domínio puro (`@gizito/core`)

## Papel
Única fonte de verdade de schemas, tipos, constantes, máquina de estados, taxonomia, regras pedagógicas e interfaces de integração. Consumido por `api`, `worker`, `web` e `integrations`.

## Regras
- **Sem IO.** Nada de banco, HTTP, filesystem, env, `Date.now()` solto ou cliente de IA. Funções puras recebem tudo por parâmetro (inclusive relógio e gerador de id quando precisarem).
- Todo schema Zod exporta o tipo: `export const orderSchema = z.object(...)` + `export type Order = z.infer<typeof orderSchema>`.
- Constantes de negócio vivem aqui e são importadas por quem precisa: `KIT_PRICE_CENTS = 2990`, `MAX_PHOTO_COUNT = 5`, `MAX_PHOTO_BYTES`, `MAX_TOPIC_COUNT = 3`, `PRACTICE_QUESTION_COUNT = 10`, `MOCK_QUESTION_COUNT = 10`, `WORKED_EXAMPLE_COUNT = 2`, `CHARGE_TTL_MINUTES = 30`, `PHOTO_RETENTION_DAYS = 30`, `KIT_RETENTION_MONTHS = 12`. Nenhum número desses aparece inline em apps.
- Enums como `z.enum` + array `List`: `gradeList`, `subjectList`, `orderStatusList`, `questionTypeList`, `difficultyList`, `jobNameList`.

## Máquina de estados do pedido
- Definida como dado: `orderTransitionList` com `{ from, event, to }`. Função `transitionOrder(status, event)` retorna o novo estado ou um erro tipado `InvalidTransitionError`; nunca lança string.
- Estados e eventos espelham o PRD seção 5 (`draft → analyzing → preview_ready → awaiting_payment → paid → processing → ready | failed → refunded`; `charge_expired` como sub-estado de `awaiting_payment`; `analyzing` com falha volta a `draft`).
- Quem persiste a transição (`db`/services) chama `transitionOrder` dentro da transação; o core não sabe que existe banco.

## Taxonomia de assuntos
- `pedagogy/taxonomy/{grade}-{subject}.ts` com `topic` = `{ topicId, label, description, bnccSkillList, prerequisiteList, validationRuleList }`. Ids estáveis, nunca renomeados; descontinuar com `deprecated: true`.
- `taxonomyVersion` exportado e gravado no kit.
- Assuntos ainda não atendidos em `pedagogy/taxonomy/unsupported.ts` (`unsupportedTopicList`, ids `{ma|lp}-{slug}`, `findUnsupportedTopicList` para o "outro"); congelados junto da versão da taxonomia.

## Pipeline pedagógico (contratos)
- Schemas (campo a campo em `docs/pedagogy/spec-pedagogica.md`): `photoExtractionSchema`, `materialProfileSchema`, `kitPlanSchema`, `kitContentSchema`, `studyKitSchema` (com `practiceQuestionList[10]` e `mockQuestionList[10]` com a resposta dentro de cada questão, `workedExampleList[2]`, `topicList`, `materialProfile`, `sourceWarningCodeList`, `qualityCheckList`, `formatVersion`, `generationVersion`, `taxonomyVersion`), `expectedAnswerSchema` (`number | fraction | expression | set | text`, com `unit` e `tolerance`), `reviewResultSchema`. O gabarito é derivado por `listAnswerKey`, nunca uma lista separada.
- Validações em `pedagogy/validation/`: cada regra é uma função `(kit) => ValidationIssue[]` com `severity: "blocker" | "warning"` e `code` estável. `validateStudyKit(kit)` agrega. Recálculo matemático recebe o avaliador por parâmetro (`MathEvaluator`), implementado em `integrations` com mathjs.
- Prompts **não** vivem no core; vivem em `apps/worker/src/pipeline/prompts/` versionados. O core só define o formato de saída.

## Interfaces de integração
- `PaymentGateway`: `createCharge`, `getChargeStatus`, `refund`, `parseWebhook`.
- `NotificationChannel`: `send(notification)`; implementações `email` e `whatsapp`.
- `AiProvider`: `extract`, `plan`, `generate`, `review`, cada uma devolvendo `{ output, usage: { inputTokens, outputTokens, costCents }, model, promptVersion }`.
- `ObjectStorage`: `putPrivate`, `get`, `getSignedUrl(ttlSeconds)`, `delete`.
- `MathEvaluator`: `evaluate(expression) → Result<ExpectedAnswer, MathEvaluationError>` e `equals(left, right)` (equivalência com unidade, fração e tolerância).
- Interfaces não carregam detalhes de fornecedor (nenhum campo chamado `mercadoPagoOrderId` aqui; isso é do adaptador e do `db`).
