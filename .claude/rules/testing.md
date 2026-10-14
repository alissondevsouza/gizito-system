---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/*.test.tsx"
  - "**/*.spec.tsx"
  - "tests/**"
---

# Testing

## Runner por camada (fonte de verdade)
- **Backend (`apps/api`, `apps/worker`, `packages/*`):** `bun test` (runner nativo do Bun). NÃO usar Vitest aqui.
- **Frontend (`apps/web`):** Vitest + Testing Library; Playwright para E2E dos fluxos críticos (upload → prévia → Pix → entrega) com gateway e IA falsos.
- **Regressão pedagógica (`tests/pedagogy/`):** script próprio `bun run test:pedagogy`, roda o pipeline real com chave de IA; fora do CI padrão por custo.

## Estratégia
- Unit (~40%): domínio puro do `core` (máquina de estados, validações pedagógicas, taxonomia, parsers), services com dependências injetadas.
- Integração (~50%): Postgres REAL via container docker (`@gizito/db/test-helpers`); fila, transações de pagamento, idempotência de webhook, retenção.
- E2E (~10%): Playwright no web com API real e adaptadores falsos (`FakePaymentGateway`, `FakeAiProvider`, `FakeNotificationChannel`, storage em disco).

## Scripts separados (obrigatório)
- `test`: apenas unit, rápido, sem Docker.
- `test:integration`: sobe containers; timeout maior.
- `test:pedagogy`: raiz do monorepo; exige `AI_API_KEY`; grava relatório em `tests/pedagogy/output/` (ignorado pelo git).
- Razão: `mock.module` do Bun é process-wide; misturar unit e integração contamina imports (ver `docs/lessons.md`).

## Padrões
- NUNCA mockar banco em teste de integração.
- Adaptadores externos (Mercado Pago, Evolution, Resend, R2, IA) são substituídos por **fakes que implementam a interface do core**, não por mocks de módulo. Os fakes vivem em `packages/integrations/src/fakes/` e são usados por api, worker e E2E.
- Cada teste é independente (setup/teardown próprio).
- Nomes descritivos: `it("rejeita webhook sem assinatura válida")`.
- Testar casos de erro e bordas obrigatórias: webhook duplicado, cobrança expirada, falha de geração com uma regeneração, foto ilegível, `WHATSAPP_ENABLED=false`, job reexecutado.
- Toda transição de estado tem teste de transição inválida.
- Fixtures de imagem são **sintéticas** (geradas ou desenhadas), nunca fotos reais de caderno de criança. Fotos reais ficam só em `tests/pedagogy/cases/**/photos/`, fora do git.
- Saída de IA em testes unit/integration vem de fixtures JSON válidas pelo schema; testar também fixture inválida (deve falhar seguro).
- Coverage mínimo: 70% em `packages/`, 50% em `apps/`.

## Organização
- Testes em `src/__tests__/` espelhando a estrutura (`__tests__/services/`, `__tests__/routes/`, `__tests__/integration/`).
- Helpers de integração em `src/__tests__/integration/helpers.ts`.
- Fixtures em `__fixtures__/` ao lado do teste.

## Regressão pedagógica
- Casos em `tests/pedagogy/cases/{grade}-{subject}-{slug}/` com `case.json` (ano, disciplina, assuntos esperados por id, perfil esperado, bloqueadores esperados, se deve ser recusado por legibilidade) e `photos/`.
- O runner executa extração → geração → validação para cada caso e produz um relatório com: assuntos acertados, bloqueadores disparados, custo e tempo por caso.
- Critério: zero bloqueador crítico não esperado. Asserções são **estruturais** (contagens, cobertura, recálculo, schema), nunca igualdade textual com saída anterior.

## Comandos
- `bun run test`: unit do monorepo (via turbo)
- `bunx turbo run test --filter=@gizito/core`: unit de um workspace
- `bun run test:integration`: dentro do workspace (requer Docker)
- `bun run test:pedagogy`: raiz (requer chave de IA)

## Skills Relacionadas
- `test-antipatterns`: CONSULTAR ao adicionar mocks ou métodos test-only
- `vitest`: apenas `apps/web`
