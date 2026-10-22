# Regressão pedagógica 2026-10-21 · extract-v1+plan-v1+generate-v2+review-v2

Rodada rodada-final (34 casos) + rodada-final-complemento (7 casos, código final), juntadas (completa, 35 casos). Modelos: extração claude-haiku-5-5 (esforço padrão do adaptador) e geração claude-sonnet-5-5 (esforço padrão do adaptador). Câmbio usado nos critérios de custo: 6 reais por dólar. Só ids, códigos e números: o material, o pedido e o kit ficam na saída da rodada, fora do git.

## Critérios do gate (spec pedagógica §13.2)

| # | Critério | Meta | Valor | Resultado |
|---|---|---|---|---|
| 1 | Bloqueador crítico inesperado (prévia ou kit diferente do esperado) | 0 | 2 | falhou |
| 2 | Extração sem falha (obrigatório, inesperado, não atendido) | ≥ 90% dos casos | 35 de 35 | ok |
| 3 | Foto ilegível recusada e dado pessoal sinalizado sem cópia | 100% dos casos com essas tags | 5 de 5 | ok |
| 4 | Auditoria do professor | zero defeito crítico na amostra | F1-11 | não avaliado |
| 5 | Custo médio por kit, com extração e regeneração | ≤ 10% de R$ 29,90 (US$ 0,4983) | US$ 0,407 (R$ 2,44) | ok |
| 6 | Custo médio por prévia | ≤ R$ 0,10 (US$ 0,0167) | US$ 0,0011 (R$ 0,01) | ok |
| 7 | Tempo de geração p95, do plano aos PDFs (não bloqueia) | ≤ 5 min 0 s | 5 min 34 s | falhou |

Bloqueadores críticos inesperados: 7-portuguese-carta-cortada, 7-portuguese-figuras-de-linguagem.

## Verificações

| Verificação | Casos com falha |
|---|---|
| preview_outcome_mismatch | 0 |
| required_topic_missing | 0 |
| unexpected_topic | 0 |
| unsupported_topic_missed | 0 |
| legibility_mismatch | 0 |
| source_warning_missed | 1 |
| personal_data_copied | 0 |
| material_copied | 0 |
| kit_outcome_mismatch | 2 |

## Casos

| Caso | Prévia | Kit | Falhas | Avisos | Bloqueadores da 1ª tentativa | Tentativas | Custo da prévia | Custo do kit | Geração | Páginas |
|---|---|---|---|---|---|---|---|---|---|---|
| 4-math-adicao-subtracao-cortada | preview_ready | ready | — | — | review_explanation_inconsistent | initial, item | US$ 0,0012 | US$ 0,4626 | 3 min 28 s | 10 + 6 |
| 4-math-medidas-de-tempo | preview_ready | ready | — | — | — | initial | US$ 0,0017 | US$ 0,3302 | 3 min 12 s | 9 + 5 |
| 4-math-operacoes-valor-posicional | preview_ready | ready | — | — | — | initial | US$ 0,0019 | US$ 0,3161 | 2 min 58 s | 10 + 4 |
| 4-portuguese-pontuacao | preview_ready | ready | — | — | — | initial | US$ 0,0015 | US$ 0,5689 | 5 min 23 s | 11 + 4 |
| 4-portuguese-pontuacao-desfocada | analysis_failed (photos_unreadable) | not_applicable | — | — | — | — | US$ 0,0006 | — | — | — |
| 4-portuguese-producao-textual | analysis_failed (only_unsupported_topics) | not_applicable | — | — | — | — | US$ 0,0005 | — | — | — |
| 4-portuguese-substantivos-comuns-proprios | preview_ready | ready | — | — | review_answer_incorrect, review_explanation_inconsistent | initial, item | US$ 0,0008 | US$ 0,4525 | 4 min 17 s | 9 + 4 |
| 4-portuguese-substantivos-cortada | preview_ready | ready | — | — | review_evidence_unsupported, review_answer_ambiguous | initial, item | US$ 0,0005 | US$ 0,4251 | 3 min 50 s | 9 + 5 |
| 4-portuguese-substantivos-dado-pessoal | preview_ready | ready | — | — | review_answer_ambiguous, review_evidence_unsupported | initial, item | US$ 0,0008 | US$ 0,3997 | 3 min 21 s | 10 + 4 |
| 5-math-divisao-com-outro | preview_ready | ready | — | — | — | initial | US$ 0,0013 | US$ 0,3709 | 3 min 9 s | 9 + 5 |
| 5-math-fracoes-decimais-perimetro | preview_ready | ready | — | — | — | initial | US$ 0,002 | US$ 0,4117 | 3 min 29 s | 10 + 6 |
| 5-math-multiplicacao-cortada | preview_ready | ready | — | — | — | initial | US$ 0,0005 | US$ 0,3056 | 2 min 47 s | 9 + 5 |
| 5-math-sistema-monetario-troco | preview_ready | ready | — | — | — | initial | US$ 0,0007 | US$ 0,3463 | 3 min 14 s | 10 + 5 |
| 5-portuguese-artigos | preview_ready | ready | — | — | — | initial | US$ 0,0016 | US$ 0,4412 | 4 min 2 s | 10 + 4 |
| 5-portuguese-classes-de-palavras | preview_ready | ready | — | — | — | initial | US$ 0,0008 | US$ 0,378 | 3 min 34 s | 10 + 4 |
| 5-portuguese-interpretacao-de-texto-cortada | preview_ready | ready | — | — | kit_slot_mismatch | initial, kit | US$ 0,0006 | US$ 0,7254 | 6 min 50 s | 11 + 5 |
| 5-portuguese-interpretacao-e-redacao | preview_ready | ready | — | — | — | initial | US$ 0,0017 | US$ 0,411 | 3 min 36 s | 11 + 5 |
| 5-portuguese-singular-plural | preview_ready | ready | — | — | — | initial | US$ 0,0008 | US$ 0,3169 | 2 min 57 s | 8 + 4 |
| 5-portuguese-singular-plural-dado-pessoal | preview_ready | ready | — | — | — | initial | US$ 0,0007 | US$ 0,4362 | 4 min 1 s | 10 + 4 |
| 6-math-angulos | preview_ready | ready | — | — | — | initial | US$ 0,0016 | US$ 0,2981 | 2 min 18 s | 9 + 4 |
| 6-math-fracoes-cortada | preview_ready | ready | — | — | — | initial | US$ 0,0007 | US$ 0,3009 | 2 min 38 s | 10 + 7 |
| 6-math-poligonos-perimetro-area | preview_ready | ready | — | — | — | initial | US$ 0,0009 | US$ 0,2826 | 2 min 31 s | 9 + 5 |
| 6-math-razao-proporcao | preview_ready | ready | — | — | — | initial | US$ 0,001 | US$ 0,3115 | 2 min 49 s | 9 + 6 |
| 6-math-razao-proporcao-dado-pessoal | preview_ready | ready | — | — | — | initial | US$ 0,001 | US$ 0,3386 | 3 min 10 s | 11 + 5 |
| 6-portuguese-substantivos-formacao | preview_ready | ready | — | — | review_answer_ambiguous, review_answer_ambiguous | initial, item | US$ 0,0015 | US$ 0,6253 | 5 min 34 s | 11 + 5 |
| 6-portuguese-sujeito-predicado | preview_ready | ready | — | — | — | initial | US$ 0,0007 | US$ 0,4203 | 4 min 2 s | 9 + 5 |
| 6-portuguese-tempos-verbais | preview_ready | ready | — | — | — | initial | US$ 0,0014 | US$ 0,4294 | 3 min 47 s | 9 + 4 |
| 6-portuguese-verbos-com-outro | preview_ready | ready | — | — | — | initial | US$ 0,0007 | US$ 0,5451 | 5 min 26 s | 11 + 5 |
| 7-math-equacoes-porcentagem | preview_ready | ready | — | — | review_kit_section_incorrect | initial, item | US$ 0,0017 | US$ 0,4272 | 3 min 1 s | 10 + 5 |
| 7-math-equacoes-porcentagem-dado-pessoal | preview_ready | ready | — | — | — | initial | US$ 0,001 | US$ 0,3006 | 2 min 47 s | 10 + 5 |
| 7-math-inteiros-cortada | preview_ready | ready | — | — | — | initial | US$ 0,0006 | US$ 0,2469 | 2 min 12 s | 9 + 5 |
| 7-math-inteiros-e-fracoes | preview_ready | ready | — | — | — | initial | US$ 0,001 | US$ 0,3425 | 3 min 13 s | 10 + 5 |
| 7-math-potenciacao-raiz | analysis_failed (no_topic_found) | not_applicable | source_warning_missed | — | — | — | US$ 0,0014 | — | — | — |
| 7-portuguese-carta-cortada | preview_ready | failed (ai_output_invalid); esperado ready | kit_outcome_mismatch | — | plan_output_invalid | initial, plan | US$ 0,0015 | US$ 0,4777 | 4 min 54 s | — |
| 7-portuguese-figuras-de-linguagem | preview_ready | failed (generation_blocked); esperado ready | kit_outcome_mismatch | — | evidence_quote_not_found | initial, item | US$ 0,0007 | US$ 0,5773 | 5 min 13 s | — |

### Custo e tempo por etapa

| Caso | Custo extração | Custo plano | Custo geração | Custo revisão | Tempo análise | Tempo geração | Tempo render | Avisos da 1ª tentativa |
|---|---|---|---|---|---|---|---|---|
| 4-math-adicao-subtracao-cortada | US$ 0,0012 | US$ 0,0455 | US$ 0,3482 | US$ 0,0677 | 4,4 s | 3 min 28 s | 0,3 s | non_computable_excess × 1 |
| 4-math-medidas-de-tempo | US$ 0,0017 | US$ 0,0344 | US$ 0,2458 | US$ 0,0483 | 10,3 s | 3 min 12 s | 0,2 s | non_computable_excess × 1 |
| 4-math-operacoes-valor-posicional | US$ 0,0019 | US$ 0,03 | US$ 0,235 | US$ 0,0492 | 8,6 s | 2 min 58 s | 0,3 s | expression_number_not_in_statement × 1, non_computable_excess × 1 |
| 4-portuguese-pontuacao | US$ 0,0015 | US$ 0,0483 | US$ 0,4591 | US$ 0,06 | 5,2 s | 5 min 23 s | 0,2 s | — |
| 4-portuguese-pontuacao-desfocada | US$ 0,0006 | — | — | — | 5,4 s | — | — | — |
| 4-portuguese-producao-textual | US$ 0,0005 | — | — | — | 5,3 s | — | — | — |
| 4-portuguese-substantivos-comuns-proprios | US$ 0,0008 | US$ 0,0371 | US$ 0,3322 | US$ 0,0823 | 6,8 s | 4 min 17 s | 0,2 s | — |
| 4-portuguese-substantivos-cortada | US$ 0,0005 | US$ 0,0335 | US$ 0,3214 | US$ 0,0698 | 5,6 s | 3 min 50 s | 0,2 s | review_unclear_wording × 1 |
| 4-portuguese-substantivos-dado-pessoal | US$ 0,0008 | US$ 0,037 | US$ 0,2857 | US$ 0,0761 | 6,3 s | 3 min 21 s | 0,2 s | — |
| 5-math-divisao-com-outro | US$ 0,0013 | US$ 0,0509 | US$ 0,2629 | US$ 0,0558 | 6,3 s | 3 min 9 s | 0,2 s | expression_number_not_in_statement × 1 |
| 5-math-fracoes-decimais-perimetro | US$ 0,002 | US$ 0,0466 | US$ 0,2954 | US$ 0,0677 | 9,5 s | 3 min 28 s | 0,4 s | expression_number_not_in_statement × 5, fraction_not_simplified × 3, non_computable_excess × 1, review_unclear_wording × 1 |
| 5-math-multiplicacao-cortada | US$ 0,0005 | US$ 0,0378 | US$ 0,2201 | US$ 0,0472 | 4,8 s | 2 min 46 s | 0,2 s | expression_number_not_in_statement × 4, review_difficulty_mismatch × 1 |
| 5-math-sistema-monetario-troco | US$ 0,0007 | US$ 0,0377 | US$ 0,2497 | US$ 0,0581 | 5,3 s | 3 min 14 s | 0,2 s | — |
| 5-portuguese-artigos | US$ 0,0016 | US$ 0,0487 | US$ 0,3338 | US$ 0,0571 | 6,3 s | 4 min 1 s | 0,2 s | — |
| 5-portuguese-classes-de-palavras | US$ 0,0008 | US$ 0,0405 | US$ 0,2743 | US$ 0,0625 | 6 s | 3 min 34 s | 0,2 s | — |
| 5-portuguese-interpretacao-de-texto-cortada | US$ 0,0006 | US$ 0,036 | US$ 0,6376 | US$ 0,0512 | 5 s | 6 min 49 s | 0,4 s | — |
| 5-portuguese-interpretacao-e-redacao | US$ 0,0017 | US$ 0,0474 | US$ 0,2979 | US$ 0,0641 | 9,3 s | 3 min 35 s | 0,2 s | — |
| 5-portuguese-singular-plural | US$ 0,0008 | US$ 0,0343 | US$ 0,2385 | US$ 0,0433 | 6 s | 2 min 57 s | 0,2 s | — |
| 5-portuguese-singular-plural-dado-pessoal | US$ 0,0007 | US$ 0,0406 | US$ 0,2857 | US$ 0,1092 | 4,6 s | 4 min 0 s | 0,2 s | review_difficulty_mismatch × 1, review_unclear_wording × 1 |
| 6-math-angulos | US$ 0,0016 | US$ 0,0444 | US$ 0,2019 | US$ 0,0503 | 6,6 s | 2 min 18 s | 0,2 s | non_computable_excess × 1, review_difficulty_mismatch × 1 |
| 6-math-fracoes-cortada | US$ 0,0007 | US$ 0,0298 | US$ 0,2146 | US$ 0,0559 | 6,1 s | 2 min 38 s | 0,3 s | fraction_not_simplified × 2, review_hint_in_mock × 2, non_computable_excess × 1 |
| 6-math-poligonos-perimetro-area | US$ 0,0009 | US$ 0,0344 | US$ 0,1999 | US$ 0,0473 | 6,6 s | 2 min 30 s | 0,2 s | expression_number_not_in_statement × 7, non_computable_excess × 1, similar_question × 1, unit_missing × 1 |
| 6-math-razao-proporcao | US$ 0,001 | US$ 0,0318 | US$ 0,2327 | US$ 0,046 | 7,7 s | 2 min 48 s | 0,3 s | expression_number_not_in_statement × 2, fraction_not_simplified × 1 |
| 6-math-razao-proporcao-dado-pessoal | US$ 0,001 | US$ 0,0389 | US$ 0,2509 | US$ 0,0478 | 7,1 s | 3 min 10 s | 0,2 s | expression_number_not_in_statement × 1, non_computable_excess × 1, similar_question × 1 |
| 6-portuguese-substantivos-formacao | US$ 0,0015 | US$ 0,0551 | US$ 0,4782 | US$ 0,0905 | 5,4 s | 5 min 33 s | 0,2 s | — |
| 6-portuguese-sujeito-predicado | US$ 0,0007 | US$ 0,0389 | US$ 0,3208 | US$ 0,0599 | 9,5 s | 4 min 2 s | 0,2 s | — |
| 6-portuguese-tempos-verbais | US$ 0,0014 | US$ 0,0545 | US$ 0,3144 | US$ 0,059 | 4,8 s | 3 min 47 s | 0,2 s | — |
| 6-portuguese-verbos-com-outro | US$ 0,0007 | US$ 0,0394 | US$ 0,4519 | US$ 0,0531 | 14,2 s | 5 min 26 s | 0,2 s | review_difficulty_mismatch × 1 |
| 7-math-equacoes-porcentagem | US$ 0,0017 | US$ 0,0476 | US$ 0,3112 | US$ 0,0667 | 7,9 s | 3 min 0 s | 0,3 s | expression_number_not_in_statement × 2, similar_question × 1 |
| 7-math-equacoes-porcentagem-dado-pessoal | US$ 0,001 | US$ 0,0378 | US$ 0,2213 | US$ 0,0406 | 8 s | 2 min 47 s | 0,2 s | — |
| 7-math-inteiros-cortada | US$ 0,0006 | US$ 0,0309 | US$ 0,1784 | US$ 0,0371 | 5,6 s | 2 min 12 s | 0,2 s | similar_question × 1 |
| 7-math-inteiros-e-fracoes | US$ 0,001 | US$ 0,0306 | US$ 0,2633 | US$ 0,0475 | 7,1 s | 3 min 13 s | 0,3 s | — |
| 7-math-potenciacao-raiz | US$ 0,0014 | — | — | — | 5 s | — | — | — |
| 7-portuguese-carta-cortada | US$ 0,0015 | US$ 0,1007 | US$ 0,3756 | — | 6,8 s | 4 min 54 s | — | — |
| 7-portuguese-figuras-de-linguagem | US$ 0,0007 | US$ 0,0489 | US$ 0,4571 | US$ 0,0706 | 4,8 s | 5 min 13 s | — | — |

## Por assunto

| Assunto | Kits | Prontos | Regenerados | Bloqueadores da 1ª tentativa |
|---|---|---|---|---|
| lp4-nouns-adjectives | 3 | 3 | 3 | review_answer_ambiguous × 2, review_evidence_unsupported × 2, review_answer_incorrect × 1, review_explanation_inconsistent × 1 |
| lp4-punctuation | 1 | 1 | 0 | — |
| lp5-explicit-information | 2 | 2 | 1 | kit_slot_mismatch × 1 |
| lp5-word-classes | 4 | 4 | 0 | — |
| lp6-nouns | 1 | 1 | 1 | review_answer_ambiguous × 2 |
| lp6-sentence-clause | 1 | 1 | 0 | — |
| lp6-verb-moods | 2 | 2 | 0 | — |
| lp6-word-formation | 1 | 1 | 1 | review_answer_ambiguous × 2 |
| lp7-figures-of-speech | 1 | 0 | 1 | evidence_quote_not_found × 1 |
| lp7-linguistic-variety | 1 | 0 | 1 | plan_output_invalid × 1 |
| ma4-addition-subtraction | 1 | 1 | 1 | review_explanation_inconsistent × 1 |
| ma4-multiplication | 1 | 1 | 0 | — |
| ma4-place-value | 2 | 2 | 1 | review_explanation_inconsistent × 1 |
| ma4-time | 1 | 1 | 0 | — |
| ma5-addition-subtraction | 1 | 1 | 0 | — |
| ma5-decimal-numbers | 1 | 1 | 0 | — |
| ma5-equivalent-fractions | 1 | 1 | 0 | — |
| ma5-multiplication-division | 2 | 2 | 0 | — |
| ma5-perimeter-area | 1 | 1 | 0 | — |
| ma6-angles | 1 | 1 | 0 | — |
| ma6-fractions | 1 | 1 | 0 | — |
| ma6-perimeter-area | 1 | 1 | 0 | — |
| ma6-polygons | 1 | 1 | 0 | — |
| ma6-sharing-ratio | 2 | 2 | 0 | — |
| ma7-integer-addition-subtraction | 2 | 2 | 0 | — |
| ma7-linear-equations | 2 | 2 | 1 | review_kit_section_incorrect × 1 |
| ma7-percentage | 2 | 2 | 1 | review_kit_section_incorrect × 1 |
| ma7-rational-operations | 1 | 1 | 0 | — |

### Outro

| Assunto | Kits | Prontos | Regenerados | Bloqueadores da 1ª tentativa |
|---|---|---|---|---|
| other | 2 | 2 | 0 | — |

## Geração

- Kits gerados: 32; com regeneração: 9 (28,1%).
- Bloqueadores, em todas as tentativas: review_answer_ambiguous × 4, review_evidence_unsupported × 3, review_explanation_inconsistent × 2, evidence_quote_not_found × 1, kit_output_invalid × 1, kit_slot_mismatch × 1, plan_output_invalid × 1, review_answer_incorrect × 1, review_kit_section_incorrect × 1.
- Avisos, em todas as tentativas: expression_number_not_in_statement × 25, non_computable_excess × 9, fraction_not_simplified × 6, similar_question × 5, review_difficulty_mismatch × 4, review_unclear_wording × 4, review_hint_in_mock × 2, review_weak_distractor × 1, unit_missing × 1.
- Falhas da geração ou do render: ai_output_invalid × 1, generation_blocked × 1.
- Chamadas de IA sem sucesso, por etapa: plan ai_output_invalid × 1, generate ai_output_invalid × 1.

## Custo e tempo

- Prévia (extração): média US$ 0,0011 · p50 US$ 0,001 · p95 US$ 0,0019.
- Kit (todas as chamadas do pedido): média US$ 0,407 · p50 US$ 0,3997 · p95 US$ 0,6253.
- Geração, do plano aos PDFs: média 3 min 41 s · p50 3 min 21 s · p95 5 min 34 s.
