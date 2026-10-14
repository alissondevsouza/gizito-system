---
name: gizito-spec-driven
description: >-
  Autonomous, closed-loop development of a Gizito feature or bug from a free-form
  description. The orchestrator analyzes the codebase, authors the full spec set
  (spec.md, plan.md, tasks.md, progress.md), then runs two adversarial neutral-review
  loops: a NEUTRAL gizito-spec-verifier validates the spec and loops corrections until
  approved; after implementation, a NEUTRAL gizito-implement-verifier (never the
  implementer) reviews, runs the test suite, build and architecture checks, and loops
  fixes until green. Neutrality is guaranteed by spawning reviewers as fresh, isolated
  subagents that see only the artifacts and diff. Every decision is persisted
  (per-feature Decisions Log, then graduated to docs/engineering/adr/, docs/lessons.md
  and docs/engineering/known-issues.md). Works on a dedicated feat/ branch with local
  checkpoint commits per milestone; push / PR / merge are LEFT TO THE HUMAN. This is
  the DEFAULT flow for implementing a non-trivial feature or fixing a non-trivial bug;
  the user does NOT need to type any command. Use when the user asks to implement /
  build / create a feature or fix a non-trivial bug, or says "gizito-spec-driven",
  "autônomo", "sozinho até os testes passarem", or invokes /gizito-spec-driven. Do NOT
  use for a trivial hotfix (use `gizito-fix`) or for questions / analysis (just answer).
  Routing table in `.claude/rules/dev-flow-routing.md`.
---

# Skill: gizito-spec-driven

Desenvolvimento **autônomo em malha fechada** de uma feature ou bug, a partir de uma descrição livre. O orquestrador analisa, especifica, implementa e submete o resultado a **loops de revisão neutra e adversarial**, parando sozinho apenas quando a suíte passa e a revisão aprova. `push`, `PR` e `merge` são **do humano**.

---

## REGRAS INVIOLÁVEIS

1. **Neutralidade obrigatória.** Quem **revisa/testa NUNCA é quem implementou.** Todo revisor (`gizito-spec-verifier`, `gizito-implement-verifier`) é um subagente **novo, de contexto isolado**, que recebe **apenas artefatos + diff + critérios de aceite**, nunca o raciocínio de quem produziu. Após uma rodada do `gizito-fixer`, spawnar um `gizito-implement-verifier` **novo**.
2. **Branch dedicada + checkpoints locais.** Todo trabalho acontece em `feat/{modulo}/{slug}` (ou `fix/{modulo}/{slug}`) criada a partir de `main`. O **orquestrador** faz `git commit` local ao fechar cada milestone. Subagentes **nunca** commitam. **NUNCA** trabalhar direto na `main`.
3. **Autônomo até a suíte verde, e para aí.** Não roda `git push`, não abre PR, não faz merge. Ao terminar, **handoff ao humano**.
4. **Loops têm teto.** `MAX_SPEC_ROUNDS` e `MAX_IMPL_ROUNDS` (default 3). Estourou → **parar e escalar ao humano**.
5. **Artefatos obrigatórios** em `specs/{modulo}/{slug}/`: `spec.md`, `plan.md`, `tasks.md`, `progress.md`, `validate.md`, `review.md` (`research.md` para size M/L).
6. **Registro persistente.** Toda decisão entra no `Decisions Log` do `progress.md`; ao fechar, o conhecimento durável **gradua** (Phase 5).
7. **Produto e pedagogia são restrições.** O plano não pode contrariar o PRD (`docs/product/product-doc-v1.md`) nem o design doc sem registrar a divergência e pedir decisão ao humano. Mudanças em prompt, modelo, taxonomia ou validador exigem task de regressão pedagógica.
8. **Nada de "zero bugs" prometido.** Reportar honestamente o que foi verificado e o que não foi.

**Violação de qualquer uma = execução inválida.**

---

## Papéis (subagentes)

| Papel (`subagent_type`) | Definição | Ferramentas | Pode editar código? |
|---|---|---|---|
| **orchestrator** (esta skill) | main loop | todas | coordena; edita artefatos `specs/`; commita checkpoints |
| **gizito-spec-verifier** | `.claude/agents/gizito-spec-verifier.md` | Read/Grep/Glob/Bash (leitura) | ❌ |
| **gizito-implementer** | `.claude/agents/gizito-implementer.md` | Read/Grep/Glob/Edit/Write/Bash | ✅ |
| **gizito-implement-verifier** | `.claude/agents/gizito-implement-verifier.md` | Read/Grep/Glob/Bash | ❌ (revisa + roda testes) |
| **gizito-fixer** | `.claude/agents/gizito-fixer.md` | Read/Grep/Glob/Edit/Write/Bash | ✅ |

> Como spawnar: tool de subagente (Agent) com `subagent_type` **igual** ao `name:` do frontmatter. Se os agents custom não estiverem carregados, usar `general-purpose` **passando o corpo do arquivo do papel como prompt**; a separação de contexto é o que garante a neutralidade.
>
> **Paralelismo:** tasks paralelizáveis em `tasks.md` podem ir para implementers simultâneos **somente se** tocarem arquivos disjuntos. Preferir commitar o checkpoint antes (permite `isolation: worktree`).

---

## Parâmetros

- `MAX_SPEC_ROUNDS = 3`, `MAX_IMPL_ROUNDS = 3` (defaults em `.claude/rules/spec-format.md`; o usuário sobrescreve no input).
- `size` auto-detectado (P/M/L); M/L gera `research.md`.
- `--dry-run` para após a spec aprovada.

## Pré-requisitos

- Ler `.claude/rules/spec-format.md` e as rules dos módulos afetados (`.claude/rules/*`).
- Ler `docs/README.md`, os ADRs relevantes em `docs/engineering/adr/`, `docs/lessons.md`, `docs/engineering/known-issues.md` e `docs/progress/{modulo}.md`.
- Ler as seções do PRD e do design doc que a feature toca (jornada, estados, pedagogia, pagamentos, WhatsApp, telas).
- Confirmar que o repositório está em git com `main` existente; sem isso, parar e pedir ao humano.

---

## Pipeline

```
Phase 0  Intake & Triagem        → classifica feature/bug, size, modulo, slug; cria branch + dir
Phase 1  Análise & Spec          → spec.md, (research.md se M/L), plan.md, tasks.md, progress.md
Phase 2  LOOP Revisão de Spec    → gizito-spec-verifier (neutro) ↔ orchestrator corrige   [máx MAX_SPEC_ROUNDS]
Phase 3  Implementação           → gizito-implementer executa tasks; checkpoint commit por milestone
Phase 4  LOOP QA                 → gizito-implement-verifier (neutro) → gizito-fixer → verifier novo [máx MAX_IMPL_ROUNDS]
Phase 5  Graduação da Memória    → docs/engineering/adr/ + docs/lessons.md + known-issues + docs/progress/ + docs/README.md
Phase 6  Handoff ao Humano       → PARA. Resumo + testes. Humano revisa, faz push/PR/merge
```

### Phase 0 — Intake & Triagem
1. Receber a descrição livre (feature ou bug; texto, stack trace, ou link).
2. Classificar: **feature** vs **bug**. Definir `size` (P/M/L), `{modulo}` (valores em `spec-format.md`) e `{slug}` (kebab-case ≤ 50).
3. **Criar a branch**: `git checkout main && git checkout -b feat/{modulo}/{slug}` (ou `fix/...`). Se já existe, checkout e conferir a base: `git merge-base --is-ancestor main HEAD || <avisar o humano>`. NUNCA criar branch a partir de outra feature branch.
4. Criar `specs/{modulo}/{slug}/` e inicializar `progress.md` (status `in_progress`, `Current Phase: spec`).
5. Sem checkpoint humano aqui.

### Phase 1 — Análise & Autoria da Spec
1. **Analisar**: arquivos relevantes, padrões, interfaces e riscos no codebase (subagente Explore read-only para features L). Consultar `docs/*`, as rules e as seções do PRD/design doc tocadas.
2. Escrever, com os templates de `specs/_templates/`: `spec.md`, `research.md` (M/L), `plan.md`, `tasks.md`, `progress.md`.
3. Registrar cada decisão de design no **Decisions Log** do `progress.md`. Divergência do PRD/design doc → registrar e **perguntar ao humano** antes de seguir.

### Phase 2 — Loop de Revisão de Spec
Repetir até **APROVADO** ou `MAX_SPEC_ROUNDS`:
1. Spawnar **`gizito-spec-verifier`** (novo, isolado) com: objetivo original + paths de `spec.md`/`plan.md`/`tasks.md` + rules relevantes. **Não** entregar o raciocínio do autor.
2. Veredito `APROVADO` | `REPROVADO` + problemas (severidade, o quê, por quê, correção).
3. Se `REPROVADO`: o orquestrador corrige os artefatos, registra no Decisions Log, e volta ao passo 1 com um verifier **novo**.
4. Estourou o teto: parar, atualizar `progress.md`, **escalar ao humano**.
5. Spec aprovada → checkpoint: `git add specs/ && git commit -m "docs({modulo}): spec de {slug}"`.

### Phase 3 — Implementação
1. Para cada task (em ordem de dependência): spawnar **`gizito-implementer`** com a task, o `plan.md`, as rules do módulo e o critério de verificação.
2. O implementer aplica a mudança, roda a verificação local da task, e **não commita**.
3. Após cada task: marcar o checkbox em `tasks.md`, atualizar `progress.md` (Session Log + Current Task), registrar decisões e **quem implementou o quê**.
4. Ao fechar cada **milestone**: rodar lint/typecheck/testes do módulo e fazer **checkpoint commit**: `git commit -m "feat({modulo}): {slug} — {milestone}"`.

### Phase 4 — Loop de QA
Repetir até **verde** ou `MAX_IMPL_ROUNDS`:
1. Spawnar **`gizito-implement-verifier`** (novo, isolado, **≠ implementer**) com `spec.md` + **diff** (`git diff main...HEAD`) + `tasks.md`.
2. O verifier revisa, **roda de fato** build/lint/typecheck/testes (e `test:pedagogy` quando aplicável e houver chave), exercita o runtime com a skill `run` quando houver superfície, e devolve `validate.md`/`review.md` no veredito. O orquestrador grava os dois arquivos.
3. Se `REPROVADO`: spawnar **`gizito-fixer`** (novo) com os achados; corrige **apenas** o escopo apontado; depois volta ao passo 1 com um verifier **novo**.
4. Estourou o teto: parar, atualizar `progress.md`, **escalar ao humano** com `review.md`/`validate.md`.
5. QA aprovado → checkpoint commit final.

**Definition of Done:** critérios de aceite atendidos · build ok · suíte passando · lint/typecheck limpos · conformidade arquitetural aprovada · `review.md` sem CRÍTICO em aberto · regressão pedagógica verde ou registrada como pendência explícita.

### Phase 5 — Graduação da Memória

| O que | Destino |
|---|---|
| Decisão arquitetural durável | novo ADR `docs/engineering/adr/NNNN-*.md` + linha em `docs/README.md` |
| Lição operacional / gotcha | `docs/lessons.md` (append no topo, com data e feature de origem) |
| Dívida técnica / issue deferido | `docs/engineering/known-issues.md` |
| Estado do módulo | `docs/progress/{modulo}.md` **e** linha em `docs/README.md` |
| Mudança de comportamento visível ao usuário | atualizar PRD e/ou design doc, com entrada no histórico de revisões |
| Preferência de trabalho cross-projeto e não óbvia | memória persistente do Claude |

Fechar `progress.md`: `status: completed`, `Current Phase: close`. Checkpoint commit dos docs.

### Phase 6 — Handoff ao Humano
1. **Gate de branch**: `git status` limpo, `git log main..HEAD --oneline` só com commits desta feature, `git merge-base --is-ancestor main HEAD` ok.
2. **PARAR.** Resumo: o que foi feito, arquivos alterados, resultado dos testes (com números), decisões graduadas, pendências.
3. Instruir o humano: revisar o diff e, se aprovar, `git push` / PR / merge. **A skill não faz nenhuma dessas operações.**

---

## Como a neutralidade é garantida
- Cada revisor é um **spawn novo**, sem acesso ao histórico de quem implementou.
- O prompt do revisor contém **só**: objetivo + artefatos + diff + critérios de aceite + rules.
- Após correção pelo `gizito-fixer`, o próximo verifier é **outro spawn**.
- Revisores **não têm Edit/Write**; os relatórios são gravados pelo orquestrador.

## Anti-padrões
- ❌ Revisor que também implementou.
- ❌ Reaproveitar o mesmo verifier após um fix.
- ❌ Aprovar sem **rodar** os testes.
- ❌ Trabalhar na `main` ou acumular uma feature sem checkpoint.
- ❌ `git push` / PR / merge.
- ❌ Loop infinito.
- ❌ Pular a graduação da memória.
- ❌ Alterar prompt/modelo/taxonomia/validador sem regressão pedagógica.
- ❌ Contrariar o PRD em silêncio.
