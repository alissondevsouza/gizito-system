---
name: gizito-fix
description: >-
  Fast, root-cause hotfix workflow for a TRIVIAL, localized Gizito bug (1-3 files, no
  architectural decision, no cross-module impact). Investigates with systematic
  debugging, writes a failing regression test first, applies the minimal root-cause
  fix, validates (lint + typecheck + tests) and commits on a fix/ branch; push / PR
  are LEFT TO THE HUMAN. Use when the user reports a small bug, a broken test, a
  typo-level defect, or says "gizito-fix" / invokes /gizito-fix. Do NOT use for
  non-trivial features or bugs that need spec/plan (use `gizito-spec-driven`).
  Routing table in `.claude/rules/dev-flow-routing.md`.
argument-hint: <descricao-do-bug> [--module <module>]
---

# Skill: gizito-fix

Workflow enxuto para correção de bug **trivial e localizado**. Sem spec, sem plan formal, sem loops de revisão, mas **com causa raiz, teste de regressão e validação real**. Se durante a investigação o escopo se revelar não trivial (decisão arquitetural, mudança cross-module, mais de 3 arquivos, qualquer mudança em prompt/modelo/taxonomia/validador pedagógico), **parar e redirecionar para `gizito-spec-driven`**.

## Processo

1. **Investigar (causa raiz, não sintoma).** Aplicar `systematic-debugging` ANTES de propor fix: reproduzir, ler o código real, formar hipótese, confirmar. Consultar `docs/lessons.md` e `docs/engineering/known-issues.md`. Apresentar o diagnóstico em 5–10 linhas.
2. **Branch.** `git checkout main && git checkout -b fix/{modulo}/{descricao-curta}`. Nunca corrigir na `main`.
3. **Teste primeiro.** Escrever o teste de regressão que reproduz o bug; ele deve **falhar** antes do fix.
4. **Corrigir.** Fix mínimo na causa raiz (`no-workarounds`: nada de silenciar erro, relaxar schema Zod ou teste). Seguir as rules do módulo.
5. **Validar de fato.** `bun run lint && bun run typecheck && bun run test` (e `test:integration` do módulo se o fix tocar fluxo coberto por integração). Máximo 2 tentativas; depois, reportar ao humano.
6. **Registrar.** Gotcha durável → `docs/lessons.md`. Dívida deliberada → `docs/engineering/known-issues.md`.
7. **Commit local.** `fix({modulo}): {descricao}`. **Sem push nem PR**: informar diagnóstico, diff resumido, resultado dos testes e a branch pronta.
