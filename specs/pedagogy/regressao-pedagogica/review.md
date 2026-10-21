---
feature: regressao-pedagogica
module: pedagogy
round: 1
verdict: REPROVADO
updated: 2026-10-21
---

# Review: regressao-pedagogica

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint` | 369 arquivos, sem achados |
| `bun run typecheck` | 6 de 6 tarefas verdes |
| `bun run test` | verde; worker 324, integrations 371, demais pacotes verdes |
| `bun run --cwd apps/worker test:integration` (pelo verifier) | 37 pass, 0 fail, incluindo `personal-data-painter.test.ts` |
| `bun run test:pedagogy --prepare-photos` | 35 fotos prontas, 0 refeitas; as 5 variações reproduzem o hash |
| `bun run test:pedagogy --case nao-existe` / `--concurrency 0` | recusa com mensagem, saída 2 |
| `bun run test:pedagogy --case 4-portuguese-pontuacao-desfocada --case 7-math-potenciacao-raiz` (API) | desfocada ok; potenciação com `preview_outcome_mismatch` (o modelo ofereceu um candidato `medium`); saída 1 |
| `bun run test:pedagogy --case 5-math-divisao-com-outro` (API) | kit pronto, US$ 0,39, 2 min 49 s; saída 0 |
| `bun run test:pedagogy` (API, rodada completa, `rodada-1`) | ver Regressão pedagógica; saída 1 |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `regression-case.test.ts`, `cases.test.ts` |
| RF-02 | sim, com ressalva corrigida (`material_copied`) | `cases.test.ts`; conferência à mão dos casos da F1-06 e da F1-07 pelo verifier |
| RF-03 | sim | `case-photo.test.ts`, `integration/personal-data-painter.test.ts` |
| RF-04 | sim | `regression-input.test.ts`, `run-case.test.ts` |
| RF-05 | sim | `case-check.test.ts` |
| RF-06 | em parte → corrigido | `regression-report.test.ts` (faltavam os critérios 3 e 6 e a tabela por etapa) |
| RF-07 | sim | `regression-report.test.ts`; script grava nos docs só na rodada completa |
| RF-08 | sim | `constants.test.ts` |
| RF-09 | não | rodada completa com 10 bloqueadores críticos inesperados |

### Achados
- [CRÍTICO] `specs/pedagogy/regressao-pedagogica/spec.md` — RF-09 não atendido: a rodada completa, o resumo nos docs e o relatório final faltavam, e o ensaio já tinha um bloqueador crítico.
- [ALERTA] `apps/worker/src/regression/regression-report.ts` — caso `crashed` contava como aprovado nos critérios 2 e 3.
- [ALERTA] `apps/worker/src/regression/case-check.ts` — a verificação `material_copied` da F1-06 se perdeu com a saída do `test:extract-cases-live`.
- [ALERTA] `apps/worker/src/regression/case-check.ts` — `personal_data_copied` só detectava o texto inteiro (nome sozinho e telefone sem DDD passavam).
- [ALERTA] `apps/worker/src/__tests__/regression/regression-report.test.ts` — sem teste do veredito dos critérios 3 e 6.
- [ALERTA] `apps/worker/src/regression/regression-report.ts` — o `report.md` não trazia custo e tempo por etapa nem os avisos da 1ª tentativa.
- [ALERTA] `docs/pedagogy/spec-pedagogica.md:435` — a spec pedagógica diz "7 estão cortadas ou com sombra"; a classificação da F1-10 contou 12.
- [SUGESTÃO] `case-check.ts` — `legibility_mismatch` com `!isUsable` é mais rígido que o §12.3.
- [SUGESTÃO] `regression-case.ts` — caso `analysis_failed` com confirmação não era recusado.
- [SUGESTÃO] `case-photo.ts` — regex do nome de arquivo duplicada.
- [SUGESTÃO] `scripts/pedagogy-regression.ts` — exceção fora do `runPipeline` derrubava a rodada inteira.
- [SUGESTÃO] `regression-report.ts` — colunas "Prévia" e "Kit" repetidas na tabela de casos.

### Regressão pedagógica

Rodada completa em 21/10/2026, `extract-v1+plan-v1+generate-v1+review-v1`, `tax-v1`, Haiku 5.5 na extração e Sonnet 5.5 na geração, 4 casos por vez. Resumo em `docs/pedagogy/regressao/2026-10-21-extract-v1+plan-v1+generate-v1+review-v1.md`; saída completa em `tests/pedagogy/output/regressao/rodada-1/` (fora do git). O resumo foi gravado pelo código de `403ea80`, antes das correções desta revisão: não tem a tabela por etapa nem a verificação `material_copied`.

| # | Critério | Meta | Valor | Resultado |
|---|---|---|---|---|
| 1 | Bloqueador crítico inesperado | 0 | 10 | falhou |
| 2 | Extração sem falha | ≥ 90% | 33 de 35 | ok |
| 3 | Foto ilegível recusada e dado pessoal sinalizado sem cópia | 100% | 5 de 5 | ok |
| 4 | Auditoria do professor | — | F1-11 | não avaliado |
| 5 | Custo médio por kit | ≤ R$ 2,99 | US$ 0,42 (R$ 2,50 a 6,00) | ok |
| 6 | Custo médio por prévia | ≤ R$ 0,10 | US$ 0,001 | ok |
| 7 | Geração p95 (não bloqueia) | ≤ 5 min | 7 min 2 s | falhou |

Os 10 críticos, por causa:

- **Lacuna da `tax-v1` no 5º ano de Português, com página legível** (`no_topic_found` sem aviso, que na tela vira o texto de foto ilegível): `5-portuguese-artigos`, `5-portuguese-classes-de-palavras` e `5-portuguese-singular-plural`. A variação `5-portuguese-singular-plural-dado-pessoal`, com a mesma página, recebeu `lp5-nominal-agreement` `medium`, e por isso a extração oscila nesse ponto.
- **Caso de fronteira que oscila:** `7-portuguese-carta-cortada` recebeu `lp7-linguistic-variety` `medium`, uma escolha pedagogicamente defensável (carta formal e informal), e a prévia passou. `7-math-potenciacao-raiz` deu a recusa esperada nesta rodada e um candidato `medium` no ensaio.
- **Kit que falha depois da única regeneração (6 de 28 kits, 21%; o PRD §3 pede sucesso de geração ≥ 95%):**
  - `review_answer_ambiguous`: outra resposta certa fora de `acceptedList` (`7-portuguese-figuras-de-linguagem`);
  - `review_explanation_inconsistent`: passo contraditório na subtração com troca em decimais (`5-math-sistema-monetario-troco`);
  - `review_answer_incorrect`: respostas aceitas erradas em período simples e composto (`6-portuguese-sujeito-predicado`);
  - `review_kit_personal_data` por nome inventado no texto-base, "Escola Municipal Rio Claro" e "Paula Dias" (`5-portuguese-singular-plural-dado-pessoal`, `6-portuguese-sujeito-predicado`);
  - `kit_output_invalid` (JSON em texto) e depois trecho corrompido no kit refeito (`5-math-fracoes-decimais-perimetro`);
  - `math_expression_invalid` por `min(...)` fora da lista, que gastou a regeneração, e depois erro numa conferência do exemplo (`7-math-equacoes-porcentagem`).

Números da geração:
- 28 kits gerados, 22 prontos e 6 falhos.
- 10 kits saíram limpos na 1ª tentativa; 13 foram para o reparo por item e 5 para o kit refeito, e 12 dos 18 reparos fecharam.
- Bloqueadores em todas as tentativas: `review_answer_ambiguous` × 8, `review_explanation_inconsistent` × 5, `kit_output_invalid` × 3, `review_answer_incorrect` × 3, `review_kit_personal_data` × 3, `review_kit_section_incorrect` × 3, `math_expression_invalid` × 1.
- `ai_output_invalid` em 3 das 46 chamadas de `generate`, contando as de reparo; foi a 1ª saída de 3 dos 28 kits.

Custo e tempo:
- 5 kits passaram sozinhos de 10% do preço; o p95 por kit foi US$ 0,73.
- A geração teve p50 de 3 min 9 s e p95 de 7 min 2 s, e 4 kits passaram de 5 min.
- Custo total da rodada: US$ 11,66, mais cerca de US$ 0,40 dos ensaios, para comparar com o painel da Anthropic.

O que passou:
- A extração passou em 33 de 35 casos.
- A foto ilegível foi recusada.
- Os 4 casos com dado pessoal sinalizaram `personal_data_visible` sem copiar o texto inteiro, e o "outro" passou nos dois casos.
- Nenhum `personal_data_pattern` falso apareceu.

### Resposta do orquestrador

Corrigidos em `f495acf`, com teste:
- os 5 ALERTAs de código;
- 4 das 5 SUGESTÕES: confirmação em prévia recusada, regex reaproveitada, erro por caso sem derrubar a rodada e colunas renomeadas.

A outra SUGESTÃO, a regra mais rígida do `legibility_mismatch`, fica de propósito e está registrada em Decisões. Para o responsável, foto ilegível, "não é material escolar" e saída inválida dão a mesma tela de trocar a foto.

O ALERTA da contagem de 7 para 12 na spec pedagógica e o CRÍTICO do RF-09 dependem do humano. Os 10 críticos pedem mudança de taxonomia, de prompt, de severidade da revisão, da contagem de regenerações (PRD §7.4) ou do formato do caso, e cada uma é decisão dele (Decisões da spec). Nenhum caso foi recalibrado.

## Correções da rodada 1 (decisões do humano de 21/10/2026)

As correções estão em `f501077`:
- `tax-v2` com `lp5-word-classes`;
- `generate` e `review` v2;
- `min` e `max` no avaliador;
- relatório com modelo e esforço;
- seis casos recalibrados;
- spec pedagógica 1.5.

Testes no fim: lint limpo; typecheck 6 de 6; core 729, integrations 375 e worker 335 pass.

### Rodada 2: casos afetados, com `AI_EFFORT_GENERATE=medium` (`rodada-2`, US$ 3,90)

Foram 13 casos: os 10 críticos da rodada 1, os outros 2 do 5º ano de Português e `7-math-potenciacao-raiz`.

- Prévia certa em 13 de 13. A `tax-v2` deu `lp5-word-classes` com confiança alta para artigos, classes de palavras e singular/plural.
- 8 de 13 kits prontos, entre eles 4 dos 6 que tinham falhado: `5-math-sistema-monetario-troco`, `5-math-fracoes-decimais-perimetro`, `7-math-equacoes-porcentagem` e `7-portuguese-figuras-de-linguagem`.
- 5 kits falharam:
  - 3 por JSON inválido no reparo por item: `5-portuguese-artigos`, `5-portuguese-singular-plural-dado-pessoal` e `6-portuguese-sujeito-predicado`;
  - 1 por saída inválida duas vezes: `7-portuguese-carta-cortada`;
  - 1 por plano sem questões contextualizadas, seguido de kit sem as vagas: `7-math-potenciacao-raiz`.
- Geração com p50 de 2 min 17 s e p95 de 4 min 54 s; kit a US$ 0,30 em média.

### Rodada 3: os 5 que falharam, com o esforço padrão (`rodada-3`, US$ 2,65)

- `5-portuguese-artigos`, `5-portuguese-singular-plural-dado-pessoal` e `6-portuguese-sujeito-predicado` saíram prontos na 1ª tentativa. O JSON inválido da rodada 2 vinha do esforço `medium`, que volta ao valor atual: o `.env` não muda (§15.10 da spec pedagógica).
- `7-portuguese-carta-cortada` falhou de novo com saída inválida. O diagnóstico, com um provedor que valida fora do adaptador e imprime só os caminhos do Zod, mostrou `baseTextList.N.paragraphList.9` abaixo de 10 caracteres. Os textos-base são cartas, e saudação e assinatura são parágrafos curtos que a spec pedagógica §7.1 não aceita (`kitText[1..10] (10..800)`). Decisão do humano.
- `7-math-potenciacao-raiz` desta vez deu `no_topic_found`; na rodada 2 tinha dado o assunto vizinho. O caso oscila entre as duas respostas, e a recalibração não resolve. Decisão do humano.

Situação, somando as três rodadas: dos 10 críticos da rodada 1, 8 fecharam, e os 2 que seguem abertos dependem das decisões acima.
