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

## Pipeline pedagógico (contratos)
- Schemas: `topicCandidateSchema`, `materialProfileSchema`, `extractionResultSchema`, `kitPlanSchema`, `studyKitSchema` (com `practiceQuestionList[10]`, `mockQuestionList[10]`, `answerKeyList[20]`, `workedExampleList[2]`, `materialProfile`, `topicIdList`, `sourceWarningList`, `qualityCheckList`, `generationVersion`, `taxonomyVersion`), `expectedAnswerSchema` (`number | fraction | expression | set | text`, com `unit` e `tolerance`), `reviewResultSchema`.
- Validações em `pedagogy/validation/`: cada regra é uma função `(kit) => ValidationIssue[]` com `severity: "blocker" | "warning"` e `code` estável. `validateStudyKit(kit)` agrega. Recálculo matemático recebe o avaliador por parâmetro (`MathEvaluator`), implementado em `integrations` com mathjs.
- Prompts **não** vivem no core; vivem em `apps/worker/src/pipeline/prompts/` versionados. O core só define o formato de saída.

## Interfaces de integração
- `PaymentGateway`: `createCharge`, `getChargeStatus`, `refund`, `parseWebhook`.
- `NotificationChannel`: `send(notification)`; implementações `email` e `whatsapp`.
- `AiProvider`: `extract`, `generate`, `review`, cada uma devolvendo `{ output, usage: { inputTokens, outputTokens, costCents }, model, promptVersion }`.
- `ObjectStorage`: `putPrivate`, `getSignedUrl(ttlSeconds)`, `delete`.
- `MathEvaluator`: `evaluate(expression) → ExpectedAnswer`.
- Interfaces não carregam detalhes de fornecedor (nenhum campo chamado `mercadoPagoOrderId` aqui; isso é do adaptador e do `db`).

## Skills Relacionadas
- `zod`, `typescript-advanced`
