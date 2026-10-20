---
feature: F1-03 schemas-e-validacoes-do-kit
module: core
round: 1
verdict: REPROVADO
updated: 2026-10-20
---

# Review: F1-03 schemas-e-validacoes-do-kit

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun test` em `packages/core` | 654 pass, 0 fail |
| `bun run lint` (raiz) | verde, 229 arquivos |
| `bun run typecheck` (raiz) | verde, 6/6 |
| `bun run test` (raiz) | verde, 6/6 (core 654, db 98, api 25, integrations 25, worker 21, web) |
| testes de sondagem do verifier (apagados) | reproduziram os três CRÍTICOs e os ALERTAs |
| `bun run test:pedagogy` | não existe até a F1-10 |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01, RF-02, RF-03, RF-05 a RF-09, RF-11, RF-12, RF-15, RF-16 | sim | testes de cada arquivo em `src/__tests__/pedagogy/` |
| RF-04 | não | `sapatão`, `crioula`, `retardado` na lista; "figura de linguagem" e "imagem poética" casando depois de verbo |
| RF-10 | em parte | `unfeasible` sem "outro" disparava também `other_topic_unfeasible` |
| RF-13 | em parte | `R$` não arredondava para duas casas |
| RF-14 | sim | faltava teste de `figure_reference` fora do enunciado (sugestão) |
| RF-17 | em parte | duas mudanças de texto aprovado sem marca de pendente |

### Achados
- [CRÍTICO] `packages/core/src/pedagogy/validation/plan.ts:109` — `other_topic_unfeasible` disparava em pedido sem "outro"; `decideRepair` devolvia `none` e o pedido falharia sem regenerar depois do Pix.
- [CRÍTICO] `packages/core/src/pedagogy/validation/patterns.ts:112` — verbo + objeto visual casava "Observe a figura de linguagem", "Observe a imagem poética" e "Veja a imagem que o poeta cria".
- [CRÍTICO] `packages/core/src/pedagogy/validation/patterns.ts:185, :228` — `sapatao`, `crioula(s)`, `crioulo(s)` e `retardado(s)` em `blockedTermList` bloqueiam frases comuns.
- [ALERTA] `patterns.ts:86` — tag casava "Se x<y então y>x" e "Compare a<b e b>c".
- [ALERTA] `kit/answer-key.ts:61` — `R$` sem arredondar ("R$ 3,3333333333333335").
- [ALERTA] `patterns.ts:141` — complemento narrativo sem "dele", "dela" etc.
- [ALERTA] `patterns.ts:59, :62` — número de 10 ou 11 dígitos sem separador virava telefone ou CPF.
- [ALERTA] `kit/compose.ts:97` — erro de quem chama virava `kit_slot_mismatch` e gastaria a regeneração.
- [ALERTA] `docs/pedagogy/spec-pedagogica.md:84, :273` — `evidence` trocada e regex de tag sem marca de pendente.
- [SUGESTÃO] `validation/issue.ts:358` — corte do `excerpt` podia partir um emoji.
- [SUGESTÃO] `patterns.ts:72` — flag `i` fazia "saiu.Com" casar como domínio.
- [SUGESTÃO] `patterns.ts:87` — `\p{Extended_Pictographic}` pega `↔`, `©`, `™`.
- [SUGESTÃO] `kit-validation.test.ts:313` — `figure_reference` só testado no enunciado.

### Regressão pedagógica
Pendente: o runner só existe na F1-10; a dívida está em `docs/engineering/known-issues.md`, estendida aos validadores da F1-03.

### Resposta do orquestrador
Todos os achados aceitos e corrigidos, com teste que falhava antes:
- CRÍTICO 1: `other_topic_unfeasible` só com "outro" no pedido; teste de plano sem "outro" com `unfeasible` dando só `plan_output_invalid` e `decideRepair` → `plan`.
- CRÍTICO 2: "a figura de linguagem" fora do padrão de verbo; "a imagem" só casa pela posição; as frases do achado entraram nos falsos positivos.
- CRÍTICO 3: termos de sentido comum fora da lista; frases do achado nos testes de "não casa"; critério escrito na SP §8.4.
- ALERTAs: tag exige atributo `nome=valor`; `R$` com exatamente duas casas (arredondamento do ICU, 12,555 → 12,56); contrações com pronome no complemento narrativo; telefone fixo exige separador, celular sem separador exige o 9, CPF de 11 dígitos exige dígito verificador, nada procurado dentro de `\( \)`; `composeStudyKit` lança `InvalidComposeInputError` para dado do pedido inválido antes de olhar a saída do modelo; SP §15.6 lista todas as mudanças de texto aprovado como pendentes do aval do humano.
- SUGESTÕES: corte do trecho sem partir par substituto; domínio só com sufixo minúsculo; `©`, `®`, `™` e setas fora do padrão de emoji; teste de `figure_reference` em tabela, alternativa e exemplo.
