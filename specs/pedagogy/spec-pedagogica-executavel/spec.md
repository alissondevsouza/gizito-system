---
feature: F1-02 spec-pedagogica-executavel
module: pedagogy
size: M
status: in_progress
branch: feat/pedagogy/spec-pedagogica-executavel
updated: 2026-10-19
---

# F1-02 spec-pedagogica-executavel

## Objetivo
Escrever em `docs/pedagogy/` a especificação pedagógica que as features F1-03 a F1-07 implementam sem precisar decidir mais nada: schemas campo a campo (extração, perfil do material, plano, kit, revisão), regras de validação com código e severidade, prompts v1 em texto, formato dos casos de regressão e critério de homologação. Dar id e regra de reconhecimento aos assuntos ainda não atendidos (PRD 1.3 §7.7), no core, para que `taxonomia.md` continue gerado do código. Fontes: roadmap §4 F1-02, PRD §6 e §7, design doc §5.2, §6.3 e §9, `jobs.md` §2, rules `ai-pipeline.md`, `core.md` e `pdf-render.md`.

## Requisitos e critérios de aceite
- **RF-01** — Assuntos ainda não atendidos com id em `packages/core/src/pedagogy/taxonomy/unsupported.ts`: `unsupportedTopicSchema` = `{ unsupportedTopicId, subject, label, description, reason, recognitionCue, keywordList }`; id `{ma|lp}-{slug}` (sem ano, nunca colide com `ma4-…`), prefixo igual à disciplina; `label` de 3 a 40 caracteres; `reason` em `unsupportedTopicReasonList` (`figure`, `orality`, `open_writing`); `keywordList` não vazia, já normalizada (minúsculas, sem acento, espaço simples) e sem repetição. `unsupportedTopicList` substitui `taxonomyExclusionList` com as 7 áreas aprovadas pelo professor, `description` com o texto aprovado sem mudança · Aceite: fixture válida passa; id com ano, prefixo de outra disciplina, rótulo de 41 caracteres, `keywordList` vazia, palavra com acento ou maiúscula e palavra repetida falham; a lista real passa no schema, tem ids únicos, nenhum id colide com `taxonomyTopicList` e nenhuma palavra se repete entre áreas da mesma disciplina.
- **RF-02** — Reconhecimento do "outro": `findUnsupportedTopicList(text, subject)` pura devolve as áreas da disciplina cuja palavra-chave aparece no texto como palavra ou expressão inteira, depois de normalizar o texto como as palavras · Aceite: "tirinhas da Mônica" em Português acha `lp-image-genres`; "Tirinha" maiúsculo e "HQ" acham; "tirinha" em Matemática não acha nada; "algoritmo da divisão" em Matemática não acha `ma-flowcharts`; "fração" não acha nada; "simetria" em Matemática acha a área de simetria em malha; "redação" e "produção de texto" acham `lp-essay-writing`; "malhação" não acha a área de malha.
- **RF-03** — Versão: o histórico da `tax-v1` passa a congelar também a lista de não atendidos (`unsupportedFingerprint` e `unsupportedTopicIdList`); mudar a lista exige novo `TAXONOMY_VERSION` · Aceite: teste de versão compara o fingerprint e os ids da lista; alterar uma palavra-chave localmente faz o teste falhar (verificado à mão e registrado na review).
- **RF-04** — `docs/pedagogy/taxonomia.md` gerado mostra os não atendidos numa tabela (id, nome, disciplina, motivo, como a extração reconhece, palavras que recusam o "outro"), no lugar da lista "Fora desta versão" · Aceite: teste de sincronia verde depois de `bun run taxonomy:doc`; teste do render com fixture confere a linha da tabela e o escape de `|`.
- **RF-05** — `docs/pedagogy/spec-pedagogica.md`: pipeline com entradas, saídas, modelo e quem implementa cada etapa; schemas campo a campo (`photoExtractionSchema`, `materialProfileSchema`, `kitPlanSchema`, `kitContentSchema`, `studyKitSchema`, `reviewResultSchema`) com tipo, limite e regra; alocação determinística das 20 questões e dos 2 exemplos; tabela única de códigos de validação com etapa, severidade, onde roda e origem no PRD; decisão da prévia a partir da extração; regeneração; constantes novas com valor · Aceite: todo bloqueador do PRD §7.5 e toda validação do PRD §7.4 passo 5 aparecem com código; todo número do PRD §7.2 e §7.3 aparece ligado a uma constante do core existente ou proposta; cada etapa nomeia a feature que a implementa (F1-03 a F1-08, F2-02, F2-03).
- **RF-06** — `docs/pedagogy/prompts-v1.md`: texto dos prompts `extract`, `plan`, `generate` (com modo de reparo) e `review` v1, separando system (regras fixas) e mensagem do usuário (contexto e dados delimitados), com placeholders `{{NOME}}` ligados a constantes do core ou ao contexto do pedido · Aceite: nenhum número de produto digitado no texto, só placeholders; todo dado não confiável (fotos, observação, "outro", perfil do material) em bloco delimitado com a instrução de não seguir ordens contidas nele; o formato de saída vem do JSON Schema gerado do Zod.
- **RF-07** — Formato dos casos de regressão e do relatório (para a F1-10) e critério de homologação (PRD §7.6) em `spec-pedagogica.md`: manifesto do caso, onde ficam as fotos (fora do git), o que o runner mede, quando um caso passa, rubrica de defeitos para o professor, tamanho da amostra e metas de custo e tempo · Aceite: o manifesto cobre resultado esperado da prévia, assuntos obrigatórios e aceitáveis, não atendidos, fotos ilegíveis, avisos e resultado do kit; o gate da F1 vira números verificáveis.
- **RF-08** — Docs e rules coerentes: `docs/README.md` e a tabela do `CLAUDE.md` apontam `docs/pedagogy/`; `.claude/rules/ai-pipeline.md` e `core.md` deixam de contradizer a spec (resposta junto da questão, marcação matemática, alocação determinística); roadmap F1-02 fica `[ ]` com "Feito até agora" (o pronto exige a aprovação do humano) · Aceite: `grep` não acha nos rules regra contrária à spec; `bun run lint`, `bun run typecheck` e `bun run test` verdes na raiz.

## Fora de escopo
- Implementar schemas, validações, alocação de questões e decisão da prévia (F1-03), avaliador (F1-04), adaptador (F1-05), extração (F1-06), geração e revisão (F1-07), render (F1-08), runner da regressão (F1-10). A spec diz o quê; essas features fazem.
- Recusar o "outro" na API (F2-03) e voltar a `draft` sem assunto atendido (F2-02): só a função pura do RF-02 entra agora.
- Persistir candidatos de assunto e avisos da extração no banco (F2-02 decide a coluna).
- Coletar os 40 casos e combinar a auditoria com o professor (humano).
- Teto de custo por pedido (`MAX_AI_COST_CENTS_PER_ORDER`): valor sai da medição da F1-07.

## Plano
- **Por que mexer no core.** O PRD §7.7 manda publicar a lista em `taxonomia.md`, que é gerado e tem teste de sincronia. Pôr os ids só no documento criaria uma segunda fonte. A função de reconhecimento entra junto porque as palavras-chave não têm sentido sem a regra de normalização e casamento, e os testes dela são o que prova a lista (falso positivo em "algoritmo da divisão", por exemplo).
- **Palavras por disciplina.** Casar só na disciplina do pedido evita recusar "reflexão" num "outro" de Português por causa da simetria de Matemática. Palavra única que também nomeia assunto atendido fica fora ("algoritmo", "ampliação" sozinha); "simetria" entra mesmo com `ma7-cartesian-symmetry` atendido, porque recusar a mais antes do Pix custa menos que falhar depois (o chip continua disponível).
- **Versão sem `tax-v2`.** Nenhuma extração rodou com a `tax-v1` e as 7 áreas aprovadas não mudam de texto: os ids, rótulos curtos e palavras são metadados novos. Estender o congelamento da `tax-v1` para a lista é mais honesto que publicar uma `tax-v2` idêntica nos assuntos; daqui para frente, mudar a lista exige versão nova.
- **Documento em dois arquivos.** `spec-pedagogica.md` (contratos, validações, casos, homologação) e `prompts-v1.md` (texto longo, lido pela F1-06 e F1-07). Cada feature lê a seção dela.
- **Decisões de desenho da spec (registradas em Decisões):** fotos só na extração; alocação das 20 questões e dos 2 exemplos calculada no core, não pelo modelo; resposta dentro da questão (o gabarito separado sai no render); marcação matemática `\( … \)` porque `$` colide com "R$"; reparo só dos itens com bloqueador na regeneração; revisão resolve antes de comparar; severidade decidida pelo código, não pelo modelo.
- **Arquivos.** Criar: `packages/core/src/pedagogy/taxonomy/unsupported.ts`, `src/__tests__/pedagogy/taxonomy/unsupported.test.ts`, `docs/pedagogy/spec-pedagogica.md`, `docs/pedagogy/prompts-v1.md`. Modificar: `src/pedagogy/taxonomy/{index,markdown}.ts`, `src/index.ts`, `scripts/write-taxonomy-doc.ts`, testes `{content,markdown,version}.test.ts`, `__fixtures__/taxonomy-history.ts`, `docs/pedagogy/taxonomia.md`, `docs/README.md`, `CLAUDE.md`, `.claude/rules/{ai-pipeline,core}.md`, `docs/product/roadmap-v1.md`, `docs/engineering/known-issues.md`.
- **Riscos.** Números propostos (limites de palavras, faixas de múltipla escolha, metas de custo) sem medição: a regressão da F1-10 calibra e muda as constantes. Palavra-chave com falso positivo recusa um "outro" legítimo antes do Pix: testes com termos vizinhos de assuntos atendidos.

## Tasks
### M1 — Não atendidos no core
- [x] 1.1 `unsupported.ts` com schema, lista, normalização e `findUnsupportedTopicList`; testes (RF-01, RF-02) · Verificação: `bun test` no core
- [x] 1.2 Trocar `taxonomyExclusionList` por `unsupportedTopicList` no index, render, script e testes; histórico e teste de versão (RF-03, RF-04); `bun run taxonomy:doc`; provar a falha do fingerprint alterando uma palavra · Verificação: `bun test` + `bun run typecheck`

### M2 — Spec pedagógica
- [x] 2.1 `docs/pedagogy/spec-pedagogica.md` (RF-05, RF-07)
- [x] 2.2 `docs/pedagogy/prompts-v1.md` (RF-06)

### M3 — Fechamento
- [x] 3.1 Docs e rules (RF-08)
- [x] 3.2 `bun run lint`, `bun run typecheck`, `bun run test` na raiz
- [x] 3.3 `bun run test:pedagogy`: não existe até a F1-10; pendência já em `known-issues.md` (linha da `tax-v1`), estendida à lista de não atendidos
- [x] 3.4 Revisão neutra (zona sensível: pedagogia): 3 rodadas (a 3ª pedida pelo humano), todas REPROVADO, achados corrigidos; correções da 3ª sem verifier

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-19 | Lista de não atendidos com id no core, `taxonomia.md` gerado | uma fonte só; PRD §7.7 publica a lista em `taxonomia.md` |
| 2026-10-19 | Estender o congelamento da `tax-v1` à lista, sem `tax-v2` | nenhuma extração usou a `tax-v1`; as 7 áreas aprovadas não mudam de texto |
| 2026-10-19 | "Outro" reconhecido por palavra-chave normalizada, na disciplina do pedido | a recusa é na API (F2-03), sem IA (invariante 3); casar entre disciplinas recusaria termos legítimos |
| 2026-10-19 | Assunto, dificuldade e ordem das questões calculados no core (`planKitSlots`); o modelo não escolhe | contagem e cobertura certas por construção; erro do modelo não gasta a regeneração (ADR-0010) |
| 2026-10-19 | Fotos só na extração, uma chamada por foto, cache por foto que expira com ela | originalidade e dado pessoal (PRD §7.1.5, invariante 4); "Trocar foto" só paga a foto nova (ADR-0010) |
| 2026-10-19 | Resposta dentro da questão; gabarito derivado por `listAnswerKey` | lista de gabarito separada poderia divergir das questões (ADR-0010) |
| 2026-10-19 | Marcação matemática `\( … \)`, `$` literal | "R$" colidiria com `$` como delimitador |
| 2026-10-19 | Regeneração por reparo (plano, kit ou itens) conforme o código mais forte; `não` para "outro" inviável e códigos de defesa | refazer o kit inteiro pode estragar itens certos sem segunda chance; refazer não corrige bug da alocação (ADR-0010) |
| 2026-10-19 | Severidade fixa por código no core, inclusive para a revisão por modelo | o modelo não decide o que bloqueia; código → reparo é função |
| 2026-10-19 | `expression_number_not_in_statement` e `non_computable_excess` como avisos | número por extenso e geometria conceitual dariam falso bloqueador; a revisão bloqueia a interpretação errada. Ponto para o humano (spec pedagógica §15) |
| 2026-10-19 | Limites de tamanho fora do texto dos prompts, carregados pelo JSON Schema | número digitado no prompt divergiria do schema na recalibração (revisão neutra, rodada 1) |
| 2026-10-20 | "produção de textos" recusa o "outro", aceitando a colisão com a descrição de `lp7-verb-moods` | é o nome BNCC da prática e o que o responsável digita; o PRD §7.7 proíbe pedir redação como "outro"; quem quer modos verbais tem o chip (revisão neutra, rodada 2) |
| 2026-10-20 | `figure_reference` só com o objeto ausente explícito, com exceções testadas; `markup_forbidden` bloqueador; render escapa todo texto | "observe" sozinho bloquearia "observe a tabela"; Markdown e HTML não podem chegar à criança (revisão neutra, rodada 2) |
| 2026-10-20 | Validadores de texto que bloqueiam usam lista fechada, com precisão antes de cobertura e testes de falso positivo; o resto fica com a revisão por modelo | bloqueador falso gasta a única regeneração e derruba pedido pago; foi o defeito das três rodadas (revisão neutra, rodada 3) |

## Status
M1 a M3 implementados. Revisão neutra: rodadas 1 e 2 REPROVADO, teto atingido e escalado; o humano pediu a rodada 3, também REPROVADO (bloqueador falso de `figure_reference` e padrão de marcação indefinido), corrigida em seguida. As correções da rodada 3 não passaram por verifier. Pendências para o humano: decidir se quer a rodada 4; aprovar a spec (pronto da F1-02), o ADR-0010 e os pontos do §15 da spec pedagógica.
