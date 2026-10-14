---
description: Formato canônico dos artefatos de feature no diretório specs/
---

# Specs — Formato Canônico

## Estrutura de Diretório

Cada feature produz artefatos em `specs/{modulo}/{slug}/`, **na raiz do monorepo**:

```
specs/{modulo}/{slug}/
├── spec.md          # Requisitos e contexto (Phase 1)
├── research.md      # Contexto coletado do codebase (Phase 1; obrigatório para size M/L)
├── plan.md          # Decisões técnicas (Phase 1)
├── tasks.md         # Milestones + tasks atômicas ordenadas (Phase 1)
├── progress.md      # Tracking entre sessões (Phase 0+)
├── validate.md      # Resultado de build/lint/typecheck/test (Phase 4)
└── review.md        # Saída do gizito-implement-verifier (Phase 4)
```

## Regras

- **Diretório raiz:** sempre `specs/` na raiz do monorepo.
- **`{modulo}`:** nome completo do workspace. Valores válidos: `web`, `api`, `worker`, `core`, `db`, `integrations`, `infra`, `docs`, `pedagogy` (prompts, taxonomia, casos de teste), `cross` (atravessa módulos).
- **Slug:** kebab-case, máximo 50 caracteres (ex: `cobranca-pix-mercado-pago`, `vinculo-whatsapp`).
- **Templates:** `specs/_templates/`.
- **Sizing:** `P` (1-2 arquivos, sem decisão arquitetural) · `M` (3-5 arquivos, pode cruzar packages) · `L` (múltiplos módulos, decisões arquiteturais). M/L exige `research.md`.

## Formato dos Artefatos

Frontmatter YAML em todos: `feature`, `module`, `phase`, `status`, `created`, `updated` (+ campos do template).

### spec.md
- Seções: O Que, Por Que (objetivo e seção do PRD/design doc), Requisitos (RF-01…), Critérios de Aceite (testáveis, 1+ por RF), Fora de Escopo, Restrições Conhecidas.

### research.md
- Seções: Código Existente Relevante, Padrões do Codebase, Schemas e Tipos Relevantes, Dependências Entre Packages, Gaps, Referências Externas.

### plan.md
- Frontmatter extra: `depends_on: [spec.md, research.md]`
- Seções: Decisões Arquiteturais (com justificativa), Arquivos a Criar/Modificar, Estratégia de Testes, Riscos, Definition of Done, Conformidade com Rules e com o PRD.

### tasks.md
- Frontmatter extra: `depends_on: [plan.md]`
- Milestones (M1, M2…) com tasks **atômicas e ordenadas por dependência**; cada task com Descrição, Arquivos, Dependências, Paralelizável, **Verificação** (comando/critério objetivo) e **Implementado por** (preenchido em runtime).
- Toda feature que toca prompt, modelo, taxonomia ou validador tem uma task explícita "rodar `bun run test:pedagogy` e anexar relatório".
- O checkbox de cada task é a fonte de verdade do progresso (espelhado em `progress.md`).
- Cada milestone fechado gera um **checkpoint commit** do orquestrador.

### progress.md
- Status: `not_started` | `in_progress` | `completed`
- Current Phase: `intake` | `spec` | `implement` | `qa` | `graduate` | `handoff` | `close`
- Seções: Decisions Log (tabela), Milestones (espelho), Session Log (1 linha por sessão).

### validate.md
- Gravado pelo **orquestrador** a partir do veredito do verifier: Comandos Executados, Saída, Status por Ferramenta, Regressão Pedagógica (quando aplicável), Pendências.

### review.md
- Gravado pelo **orquestrador**: Resumo, Arquivos Revisados, Problemas (CRÍTICO / ALERTA / SUGESTÃO), Testes, Conformidade Arquitetural. Resolvido antes do handoff.

## Tetos de Iteração

| Teto | Default | Aplica-se a |
|------|---------|-------------|
| `MAX_SPEC_ROUNDS` | `3` | loop `gizito-spec-verifier` ↔ correção |
| `MAX_IMPL_ROUNDS` | `3` | loop `gizito-implement-verifier` ↔ `gizito-fixer` |

Ao atingir o teto sem sucesso, o fluxo **PARA** e o humano decide. Nunca forçar aprovação.

## Modo Autônomo (`gizito-spec-driven`)

1. **Loop de spec**: `gizito-spec-verifier` neutro valida `spec.md`/`plan.md`/`tasks.md`; orquestrador corrige e repete.
2. **Loop de QA**: após `gizito-implementer`, um `gizito-implement-verifier` neutro (**nunca** quem implementou) revisa, **roda build + testes + lint/typecheck**, devolve `validate.md`/`review.md`; se reprovar, `gizito-fixer` corrige e um verifier **novo** revalida.

Regras: neutralidade (spawns novos, só artefatos + diff); branch + checkpoints (`feat/{modulo}/{slug}`); memória persistente (Decisions Log → `docs/engineering/adr/`, `docs/lessons.md`, `docs/engineering/known-issues.md`, `docs/progress/{modulo}.md`, `docs/README.md`).

Definições dos papéis em `.claude/agents/*`. Roteamento em `.claude/rules/dev-flow-routing.md`.
