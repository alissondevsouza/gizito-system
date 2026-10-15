# Progresso: core

**Workspace:** `@gizito/core`
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-15

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Workspace criado com `package.json` (`imports` `#src/*`, `exports` apontando para `src/index.ts`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test.

## Feature core-fundacao (2026-10-15, `74c3c61`)

- `constants.ts` (preço, limites de foto e assunto, contagens 2/10/10/20, distribuições 4/4/2 e 3/4/3, cobertura mínima por assunto, TTL do Pix, retenção, token e código curto), `enums.ts` (`z.enum` + `List` + tipo para ano, disciplina, status do pedido e da cobrança, gateway, tipo de questão, dificuldade, bloco, job, etapa de IA, canal, tipo e status de notificação, fonte de webhook, ticket, arquivo do kit; rótulos pt-BR de ano e disciplina).
- `order/state-machine.ts`: `orderEventList`, `orderTransitionList` (13 transições do PRD §5), `transitionOrder` devolvendo `Result<OrderStatus, InvalidTransitionError>`, `allowedEventList`, `isTerminalOrderStatus`, `isPaidOrderStatus`. `charge_expired` é derivado em `charge/rules.ts`, não é status.
- Schemas: `order/schemas.ts` (`publicToken`, `shortCode`, `email`, `phone`, `noteText`, `otherTopicText`, `topicId`, `orderSchema`, `orderPhotoSchema`), `charge/schemas.ts`, `jobs/schemas.ts` (união discriminada dos 6 jobs), `pedagogy/expected-answer.ts`, `storage/keys.ts`, `common.ts` (`guidSchema`, `outcomeCodeSchema`, timestamps).
- Interfaces em `interfaces/`: `PaymentGateway`, `NotificationChannel`, `AiProvider` (4 métodos genéricos no `outputSchema`), `ObjectStorage`, `MathEvaluator`; tipos de entrada e saída como schemas Zod.
- Testes: 182 em `src/__tests__/` (máquina de estados exaustiva, fixtures válidas e inválidas, regras com datas fixas, contratos das interfaces com fakes mínimos, `purity.test.ts`); `bunfig.toml` com `coverageThreshold` 0.7 (cobertura atual 100%). Dependência: `zod` 4.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Constantes, enums, máquina de estados, schemas de entidade e de job, regras puras e interfaces (F0-04)

## Pendências

- Taxonomia em F1-01; `studyKitSchema`, `extractionResultSchema`, `materialProfileSchema`, `kitPlanSchema`, `reviewResultSchema` e `validateStudyKit` em F1-03 (`order.materialProfile` fica `unknown` até lá)
- Payloads da API (`POST /orders`, `confirm`) em F2-01; mapeamento estado → rota no web em F2-09
- F0-06: payload de job nunca vai para log; linhas concluídas de `whatsapp.inbound` (telefone e texto) são expurgadas na conclusão
- F0-07: `config.ts` da api rejeita `PAYMENT_GATEWAY=fake` com `NODE_ENV=production`
