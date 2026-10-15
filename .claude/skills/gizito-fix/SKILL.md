---
name: gizito-fix
description: Hotfix de bug trivial e localizado do Gizito (até ~3 arquivos, sem decisão arquitetural): causa raiz confirmada, teste de regressão, branch fix/ e commit local.
argument-hint: <descrição do bug>
---

# gizito-fix

Bug pequeno, correção pequena, com prova. Se a investigação revelar escopo maior (decisão arquitetural, impacto cross-module, prompt/modelo/taxonomia/validador), pare e migre para `gizito-spec-driven`.

1. Reproduza e confirme a causa raiz antes de mexer. `docs/lessons.md` e `docs/engineering/known-issues.md` costumam ter a pista.
2. `git checkout main && git checkout -b fix/{modulo}/{slug}`.
3. Escreva o teste de regressão que falha por causa do bug.
4. Corrija a causa, não o sintoma: nada de relaxar schema Zod, silenciar erro ou afrouxar teste.
5. `bun run lint && bun run typecheck && bun run test`, mais `test:integration` do módulo quando o fluxo é coberto por integração.
6. Gotcha durável → `docs/lessons.md`. Commit `fix({modulo}): ...`. Push e PR são do humano: entregue diagnóstico em poucas linhas, diff resumido e resultado dos testes.
