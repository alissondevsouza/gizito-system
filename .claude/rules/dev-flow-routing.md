# Dev Flow — Roteamento

Como decidir qual fluxo usar quando o usuário pede algo. O usuário NÃO precisa digitar comando; classifique o pedido e roteie.

| Pedido do usuário | Fluxo | Skill |
|---|---|---|
| Feature nova (qualquer tamanho) | Autônomo spec-driven | `gizito-spec-driven` |
| Bug não trivial (causa incerta, cross-module, precisa de plano) | Autônomo spec-driven | `gizito-spec-driven` |
| Qualquer mudança em prompt, modelo de IA, taxonomia ou validador pedagógico | Autônomo spec-driven (com regressão) | `gizito-spec-driven` |
| Bug trivial/localizado (1-3 arquivos, sem decisão arquitetural) | Hotfix rápido | `gizito-fix` |
| Pergunta, análise, discussão, "como funciona X?" | Responder direto | nenhuma |
| Mudança de docs/config trivial | Editar direto | nenhuma |
| Mudança no PRD ou design doc que altera comportamento | Editar o doc + entrada no histórico de revisões; se houver código afetado, abrir feature | nenhuma / `gizito-spec-driven` |

## Critérios de triagem

- **Trivial** = escopo claro, ≤ ~3 arquivos, sem decisão arquitetural, sem impacto cross-module, sem tocar pipeline pedagógico. Na dúvida, NÃO é trivial → `gizito-spec-driven`.
- Se um `gizito-fix` revelar escopo maior → parar e migrar para `gizito-spec-driven`.
- Pedido explícito do usuário sempre vence a triagem.

## Invariantes de qualquer fluxo

- Branch dedicada (`feat/...` ou `fix/...`) a partir de `main`; nunca trabalhar direto na `main`.
- `git push` / PR / merge são **sempre do humano**.
- Conhecimento durável gradua para `docs/` (ADR, lessons, known-issues, progress); ver `.claude/rules/spec-format.md`.
- O PRD e o design doc são restrições; divergência exige decisão do humano e atualização do doc.
