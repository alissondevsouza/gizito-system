# Progresso: integrations

**Workspace:** `@gizito/integrations`
**Fase atual:** F2 — Fluxo comercial (F1 concluída em 2026-10-21)
**Última atualização:** 2026-10-21

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Workspace criado com `package.json` (`imports` `#src/*`, `exports` apontando para `src/index.ts`, dep `@gizito/core`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test.

## Feature esqueleto-das-apps (2026-10-16, `c579f79`)

- `src/logger.ts`: `createLogger({ service, level, destination? })` com Pino 10, JSON, horário ISO, campo `service` e redação de `email`, `phone`, `token`, `publicToken`, `payload` e `text` no topo e um nível abaixo.
- `src/log-error.ts`: `serializeLogError` (serializer de `err`: tipo, código, mensagem e stack, causa até 3 níveis; sem `detail`, `query` nem `params`) e `scrubLogText` (mascara e-mail, token e telefone).
- `src/fakes/memory-logger.ts`: `createMemoryLogger` com `waitForEntryList` para testes que esperam um log assíncrono; exposto só por `@gizito/integrations/fakes`, fora do entrypoint de produção.
- Testes: 12.

## Ajustes em revisao-f0 (2026-10-19, `ecdd15e`)

- `src/logger.ts`: a caminhada em `formatters.log` (profundidade 6, arrays incluídos) troca o `redact`: chaves sensíveis do domínio comparadas sem caixa, `_` nem `-`; `Error` em qualquer chave passa por `serializeLogError`; bindings de logger filho também mascaradas.
- `src/log-error.ts`: erro de query (`query` e `params`) sai como `Failed query`; regexes limitadas, telefone brasileiro e E.164, token que não pega UUID; texto truncado em 4.000 caracteres sem meia palavra.
- Testes: 25.

## Feature avaliador-matematico (2026-10-20, `21643c4`)

- `src/math/`: `createMathjsEvaluator`, com lista fechada de nós, funções e unidades, tabela de unidades pt-BR e equivalência por valor, unidade, tolerância, expressão, conjunto e texto. Também `mathExpressionToLatex`, em LaTeX pt-BR sem custo exponencial. `min` e `max` entraram na F1-10.
- `src/katex/markup.ts`: `isKatexParsable`, que o worker usa no `checkMathMarkup`.
- Spec: `specs/integrations/avaliador-matematico/`.

## Feature adaptador-de-ia (2026-10-20, `8c5acd5`)

- `src/ai/`: `createAnthropicProvider`, com streaming e cache do system. A foto vai reduzida e sem metadado. Os erros são tipados (`ai_output_invalid`, `ai_output_truncated`, `ai_refused` e os transitórios), e o custo sai em centavos de dólar. A saída é estruturada na extração, no plano e na revisão, e é JSON em texto na geração (ADR-0011).
- `src/fakes/fake-ai-provider.ts`: `createFakeAiProvider`.
- `test:ai-live` passou 16 de 16 contra a API real. Spec: `specs/integrations/adaptador-de-ia/`.
- Dívida: com `ai_output_invalid`, `parseOutput` descarta o motivo (`known-issues.md`, 7º ano de Português).
- Testes: 378.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Logger Pino com redação e fake em memória (F0-07)
- [x] Avaliador matemático e conferência de KaTeX (F1-04)
- [x] Adaptador Anthropic e `FakeAiProvider` (F1-05)

## Pendências

- Adaptadores e fakes de Mercado Pago, Evolution API, Resend e R2 na F2
