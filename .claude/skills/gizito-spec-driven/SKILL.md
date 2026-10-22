---
name: gizito-spec-driven
description: Entrega autônoma de feature ou bug não trivial do Gizito, da spec ao handoff, com revisão neutra do diff por um agente que não implementou. Não usar para hotfix trivial (gizito-fix) nem para perguntas.
argument-hint: <descrição da feature ou do bug> [--size P|M|L] [--resume]
---

# gizito-spec-driven

Resultado esperado: feature implementada, testada e revisada por quem não a escreveu, numa branch pronta para o humano revisar e fazer push. Você (orquestrador) faz o trabalho. Subagentes entram só onde contexto isolado compra algo: a revisão neutra e, em features grandes, implementação paralela.

## O tamanho decide o caminho

| Size | Critério | Spec | Revisão da spec | Quem implementa | Revisão do código |
|---|---|---|---|---|---|
| P | até ~3 arquivos, sem decisão arquitetural | `spec.md` curto | não | você | verifier neutro só em zona sensível |
| M | até ~8 arquivos, pode cruzar packages | `spec.md` completo | não (humano lê no handoff) | você | 1 verifier neutro |
| L | vários módulos ou decisão arquitetural | `spec.md` completo com pesquisa | 1 rodada de `gizito-spec-verifier` | você, ou `gizito-implementer` em paralelo por milestone com arquivos disjuntos | 1 verifier neutro |

Zonas sensíveis, com verifier neutro em qualquer size: máquina de estados, pagamento e webhooks, pipeline de IA e pedagogia, render dos PDFs, WhatsApp, retenção e LGPD.

## Fluxo

1. **Intake.** Classifique size, módulo (`web`, `api`, `worker`, `core`, `db`, `integrations`, `infra`, `pedagogy`, `cross`) e slug kebab-case. `git checkout main && git checkout -b feat/{modulo}/{slug}` (ou `fix/`). Com `--resume`, leia `specs/{modulo}/{slug}/spec.md` e continue da seção Status.
2. **Spec.** Leia só o que a tarefa toca (tabela do CLAUDE.md; as rules do módulo carregam sozinhas; ADRs, `lessons.md` e `known-issues.md` por grep do tema). Escreva `specs/{modulo}/{slug}/spec.md` a partir de `specs/_templates/spec.template.md`. Divergência do PRD ou do design doc: registre em Decisões e pergunte ao humano antes de implementar aquele ponto.
3. **Revisão da spec (só L).** Spawn `gizito-spec-verifier` com o objetivo original e o caminho da spec. Corrija os CRÍTICOs; máximo 2 rodadas, depois escale.
4. **Implementação.** Por milestone: código e testes juntos, lint/typecheck/testes do módulo, tasks marcadas na spec, `git commit` de checkpoint. L com milestones disjuntos: commit antes e spawn `gizito-implementer` em paralelo, um por milestone. Milestone com UI: antes do checkpoint, você o exercita no Playwright MCP pelo roteiro de `.claude/rules/frontend.md` (os implementers não usam o browser). Mudou prompt, modelo, taxonomia ou validador: `bun run test:pedagogy` e resumo em `review.md`.
5. **Revisão neutra.** Spawn `gizito-implement-verifier` novo com: caminho da spec, a branch (o diff é `git diff main...HEAD`) e os comandos e verificações no navegador que você fez, com resultado. Grave o veredito em `specs/{modulo}/{slug}/review.md` (template em `specs/_templates/review.template.md`).
6. **Correção.** Corrija os CRÍTICOs e os ALERTAs com que concordar; registre em `review.md` os que contestar, com justificativa. Houve CRÍTICO: um verifier novo revalida só os pontos corrigidos (passe o `review.md` anterior e o diff da correção). Máximo 2 rodadas; depois escale ao humano com o `review.md`.
7. **Memória, só quando aconteceu.** Decisão arquitetural durável → ADR em `docs/engineering/adr/` + linha em `docs/README.md`. Gotcha que custou iteração → `docs/lessons.md`. Dívida deliberada → `docs/engineering/known-issues.md`. Comportamento visível mudou → PRD/design doc com entrada no histórico. Módulo mudou de estado → `docs/progress/{modulo}.md`.
8. **Handoff.** `git status` limpo e `git log main..HEAD` só com esta feature. Resumo para o humano: o que mudou, testes rodados com números, decisões, pendências. Push, PR e merge são dele.

## Invariantes do fluxo

- Quem revisa nunca é quem implementou. Verifier é spawn novo, com contexto isolado, que vê spec e diff, não o seu raciocínio.
- Branch dedicada, checkpoint por milestone, subagentes não commitam. Se o commit falhar por assinatura GPG, reporte e siga; não tente contornar.
- Loops têm teto de 2 rodadas. Aprovação não se força.
- Reporte o que foi verificado e o que não foi.

Formato dos artefatos e o que passar a cada subagente: `references/artifacts.md`.
