# Regressão pedagógica 2026-10-21 · extract-v1+plan-v1+generate-v1+review-v1

Rodada 2026-10-21T18-58-10-200Z (completa, 35 casos). Câmbio usado nos critérios de custo: 6 reais por dólar. Só ids, códigos e números: o material, o pedido e o kit ficam na saída da rodada, fora do git.

## Critérios do gate (spec pedagógica §13.2)

| # | Critério | Meta | Valor | Resultado |
|---|---|---|---|---|
| 1 | Bloqueador crítico inesperado (prévia ou kit diferente do esperado) | 0 | 10 | falhou |
| 2 | Extração sem falha (obrigatório, inesperado, não atendido) | ≥ 90% dos casos | 33 de 35 | ok |
| 3 | Foto ilegível recusada e dado pessoal sinalizado sem cópia | 100% dos casos com essas tags | 5 de 5 | ok |
| 4 | Auditoria do professor | zero defeito crítico na amostra | F1-11 | não avaliado |
| 5 | Custo médio por kit, com extração e regeneração | ≤ 10% de R$ 29,90 (US$ 0,4983) | US$ 0,4163 (R$ 2,50) | ok |
| 6 | Custo médio por prévia | ≤ R$ 0,10 (US$ 0,0167) | US$ 0,001 (R$ 0,01) | ok |
| 7 | Tempo de geração p95, do plano aos PDFs (não bloqueia) | ≤ 5 min 0 s | 7 min 2 s | falhou |

Bloqueadores críticos inesperados: 5-math-fracoes-decimais-perimetro, 5-math-sistema-monetario-troco, 5-portuguese-artigos, 5-portuguese-classes-de-palavras, 5-portuguese-singular-plural, 5-portuguese-singular-plural-dado-pessoal, 6-portuguese-sujeito-predicado, 7-math-equacoes-porcentagem, 7-portuguese-carta-cortada, 7-portuguese-figuras-de-linguagem.

## Verificações

| Verificação | Casos com falha |
|---|---|
| preview_outcome_mismatch | 4 |
| required_topic_missing | 2 |
| unexpected_topic | 0 |
| unsupported_topic_missed | 0 |
| legibility_mismatch | 0 |
| source_warning_missed | 2 |
| personal_data_copied | 0 |
| kit_outcome_mismatch | 9 |

## Casos

| Caso | Prévia | Kit | Falhas | Avisos | Bloqueadores da 1ª tentativa | Tentativas | Prévia | Kit | Geração | Páginas |
|---|---|---|---|---|---|---|---|---|---|---|
| 4-math-adicao-subtracao-cortada | preview_ready | ready | — | — | review_answer_ambiguous | initial, item | US$ 0,0012 | US$ 0,4104 | 3 min 36 s | 10 + 6 |
| 4-math-medidas-de-tempo | preview_ready | ready | — | — | review_answer_ambiguous | initial, item | US$ 0,0017 | US$ 0,336 | 2 min 57 s | 9 + 5 |
| 4-math-operacoes-valor-posicional | preview_ready | ready | — | — | review_kit_section_incorrect | initial, item | US$ 0,0017 | US$ 0,3756 | 2 min 51 s | 9 + 4 |
| 4-portuguese-pontuacao | preview_ready | ready | — | — | review_answer_ambiguous | initial, item | US$ 0,0007 | US$ 0,4846 | 3 min 55 s | 10 + 4 |
| 4-portuguese-pontuacao-desfocada | analysis_failed (photos_unreadable) | not_applicable | — | — | — | — | US$ 0,0006 | — | — | — |
| 4-portuguese-producao-textual | analysis_failed (only_unsupported_topics) | not_applicable | — | — | — | — | US$ 0,0005 | — | — | — |
| 4-portuguese-substantivos-comuns-proprios | preview_ready | ready | — | — | review_answer_ambiguous | initial, item | US$ 0,0009 | US$ 0,3357 | 2 min 59 s | 9 + 4 |
| 4-portuguese-substantivos-cortada | preview_ready | ready | — | — | — | initial | US$ 0,0005 | US$ 0,3673 | 3 min 33 s | 10 + 4 |
| 4-portuguese-substantivos-dado-pessoal | preview_ready | ready | — | — | review_answer_ambiguous | initial, item | US$ 0,0008 | US$ 0,3546 | 3 min 22 s | 8 + 4 |
| 5-math-divisao-com-outro | preview_ready | ready | — | — | — | initial | US$ 0,0013 | US$ 0,3416 | 2 min 46 s | 10 + 5 |
| 5-math-fracoes-decimais-perimetro | preview_ready | failed (generation_blocked); esperado ready | kit_outcome_mismatch | — | kit_output_invalid | initial, kit | US$ 0,0012 | US$ 0,5609 | 5 min 34 s | — |
| 5-math-multiplicacao-cortada | preview_ready | ready | — | — | review_explanation_inconsistent | initial, item | US$ 0,0005 | US$ 0,3461 | 2 min 59 s | 9 + 5 |
| 5-math-sistema-monetario-troco | preview_ready | failed (generation_blocked); esperado ready | kit_outcome_mismatch | — | review_explanation_inconsistent | initial, item | US$ 0,0008 | US$ 0,3499 | 3 min 9 s | — |
| 5-portuguese-artigos | analysis_failed (no_topic_found) | not_applicable; esperado ready | preview_outcome_mismatch, required_topic_missing, kit_outcome_mismatch | — | — | — | US$ 0,0015 | — | — | — |
| 5-portuguese-classes-de-palavras | analysis_failed (no_topic_found) | not_applicable; esperado ready | preview_outcome_mismatch, kit_outcome_mismatch | — | — | — | US$ 0,001 | — | — | — |
| 5-portuguese-interpretacao-de-texto-cortada | preview_ready | ready | — | — | review_answer_ambiguous | initial, item | US$ 0,0006 | US$ 0,4527 | 3 min 44 s | 10 + 5 |
| 5-portuguese-interpretacao-e-redacao | preview_ready | ready | — | — | — | initial | US$ 0,0009 | US$ 0,3396 | 3 min 1 s | 10 + 5 |
| 5-portuguese-singular-plural | analysis_failed (no_topic_found) | not_applicable; esperado ready | preview_outcome_mismatch, required_topic_missing, kit_outcome_mismatch | — | — | — | US$ 0,0008 | — | — | — |
| 5-portuguese-singular-plural-dado-pessoal | preview_ready | failed (generation_blocked); esperado ready | kit_outcome_mismatch | — | review_kit_personal_data | initial, kit | US$ 0,0008 | US$ 0,8293 | 8 min 5 s | — |
| 6-math-angulos | preview_ready | ready | — | — | kit_output_invalid | initial, kit | US$ 0,0014 | US$ 0,4179 | 3 min 46 s | 10 + 5 |
| 6-math-fracoes-cortada | preview_ready | ready | — | — | — | initial | US$ 0,0007 | US$ 0,302 | 2 min 42 s | 11 + 7 |
| 6-math-poligonos-perimetro-area | preview_ready | ready | — | — | — | initial | US$ 0,0009 | US$ 0,2946 | 2 min 29 s | 10 + 5 |
| 6-math-razao-proporcao | preview_ready | ready | — | — | review_explanation_inconsistent | initial, item | US$ 0,0011 | US$ 0,3718 | 2 min 52 s | 9 + 6 |
| 6-math-razao-proporcao-dado-pessoal | preview_ready | ready | — | — | — | initial | US$ 0,001 | US$ 0,2787 | 2 min 30 s | 9 + 5 |
| 6-portuguese-substantivos-formacao | preview_ready | ready | — | — | — | initial | US$ 0,0015 | US$ 0,4449 | 4 min 12 s | 11 + 4 |
| 6-portuguese-sujeito-predicado | preview_ready | failed (generation_blocked); esperado ready | kit_outcome_mismatch | — | review_answer_incorrect, review_answer_incorrect, review_kit_personal_data | initial, kit | US$ 0,0009 | US$ 0,729 | 7 min 2 s | — |
| 6-portuguese-tempos-verbais | preview_ready | ready | — | — | — | initial | US$ 0,0007 | US$ 0,5219 | 5 min 17 s | 9 + 4 |
| 6-portuguese-verbos-com-outro | preview_ready | ready | — | — | — | initial | US$ 0,0007 | US$ 0,4322 | 4 min 9 s | 10 + 5 |
| 7-math-equacoes-porcentagem | preview_ready | failed (generation_blocked); esperado ready | kit_outcome_mismatch | — | math_expression_invalid | initial, item | US$ 0,0019 | US$ 0,3653 | 2 min 27 s | — |
| 7-math-equacoes-porcentagem-dado-pessoal | preview_ready | ready | — | — | kit_output_invalid | initial, kit | US$ 0,0011 | US$ 0,459 | 4 min 13 s | 10 + 5 |
| 7-math-inteiros-cortada | preview_ready | ready | — | — | review_explanation_inconsistent | initial, item | US$ 0,0006 | US$ 0,3227 | 2 min 44 s | 10 + 5 |
| 7-math-inteiros-e-fracoes | preview_ready | ready | — | — | — | initial | US$ 0,001 | US$ 0,2988 | 2 min 35 s | 10 + 6 |
| 7-math-potenciacao-raiz | analysis_failed (no_topic_found) | not_applicable | source_warning_missed | — | — | — | US$ 0,0008 | — | — | — |
| 7-portuguese-carta-cortada | preview_ready | not_applicable | preview_outcome_mismatch, source_warning_missed | unexpected_topic_medium:lp7-linguistic-variety | — | — | US$ 0,0015 | — | — | — |
| 7-portuguese-figuras-de-linguagem | preview_ready | failed (generation_blocked); esperado ready | kit_outcome_mismatch | — | review_answer_ambiguous | initial, item | US$ 0,0007 | US$ 0,5331 | 4 min 39 s | — |

## Por assunto

| Assunto | Kits | Prontos | Regenerados | Bloqueadores da 1ª tentativa |
|---|---|---|---|---|
| lp4-nouns-adjectives | 3 | 3 | 2 | review_answer_ambiguous × 2 |
| lp4-punctuation | 1 | 1 | 1 | review_answer_ambiguous × 1 |
| lp5-explicit-information | 2 | 2 | 1 | review_answer_ambiguous × 1 |
| lp5-nominal-agreement | 1 | 0 | 1 | review_kit_personal_data × 1 |
| lp6-nouns | 1 | 1 | 0 | — |
| lp6-sentence-clause | 1 | 0 | 1 | review_answer_incorrect × 2, review_kit_personal_data × 1 |
| lp6-verb-moods | 2 | 2 | 0 | — |
| lp6-word-formation | 1 | 1 | 0 | — |
| lp7-figures-of-speech | 1 | 0 | 1 | review_answer_ambiguous × 1 |
| ma4-addition-subtraction | 1 | 1 | 1 | review_answer_ambiguous × 1 |
| ma4-multiplication | 1 | 1 | 1 | review_kit_section_incorrect × 1 |
| ma4-place-value | 2 | 2 | 2 | review_answer_ambiguous × 1, review_kit_section_incorrect × 1 |
| ma4-time | 1 | 1 | 1 | review_answer_ambiguous × 1 |
| ma5-addition-subtraction | 1 | 0 | 1 | review_explanation_inconsistent × 1 |
| ma5-decimal-numbers | 1 | 0 | 1 | kit_output_invalid × 1 |
| ma5-equivalent-fractions | 1 | 0 | 1 | kit_output_invalid × 1 |
| ma5-multiplication-division | 2 | 2 | 1 | review_explanation_inconsistent × 1 |
| ma5-perimeter-area | 1 | 0 | 1 | kit_output_invalid × 1 |
| ma6-angles | 1 | 1 | 1 | kit_output_invalid × 1 |
| ma6-fractions | 1 | 1 | 0 | — |
| ma6-perimeter-area | 1 | 1 | 0 | — |
| ma6-polygons | 1 | 1 | 0 | — |
| ma6-sharing-ratio | 2 | 2 | 1 | review_explanation_inconsistent × 1 |
| ma7-integer-addition-subtraction | 2 | 2 | 1 | review_explanation_inconsistent × 1 |
| ma7-linear-equations | 2 | 1 | 2 | kit_output_invalid × 1, math_expression_invalid × 1 |
| ma7-percentage | 2 | 1 | 2 | kit_output_invalid × 1, math_expression_invalid × 1 |
| ma7-rational-operations | 1 | 1 | 0 | — |

### Outro

| Assunto | Kits | Prontos | Regenerados | Bloqueadores da 1ª tentativa |
|---|---|---|---|---|
| other | 2 | 2 | 0 | — |

## Geração

- Kits gerados: 28; com regeneração: 18 (64,3%).
- Bloqueadores, em todas as tentativas: review_answer_ambiguous × 8, review_explanation_inconsistent × 5, kit_output_invalid × 3, review_answer_incorrect × 3, review_kit_personal_data × 3, review_kit_section_incorrect × 3, math_expression_invalid × 1.
- Avisos, em todas as tentativas: expression_number_not_in_statement × 24, non_computable_excess × 8, review_difficulty_mismatch × 7, fraction_not_simplified × 4, review_unclear_wording × 4, review_weak_distractor × 1, similar_question × 1, unit_missing × 1.
- Falhas da geração ou do render: generation_blocked × 6.
- Chamadas de IA sem sucesso, por etapa: generate ai_output_invalid × 3.

## Custo e tempo

- Prévia (extração): média US$ 0,001 · p50 US$ 0,0009 · p95 US$ 0,0017.
- Kit (todas as chamadas do pedido): média US$ 0,4163 · p50 US$ 0,3673 · p95 US$ 0,729.
- Geração, do plano aos PDFs: média 3 min 43 s · p50 3 min 9 s · p95 7 min 2 s.
