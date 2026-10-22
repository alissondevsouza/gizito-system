# Auditoria do professor · F1-11

**Estado:** concluída em 21/10/2026, com zero defeito crítico na amostra.

Este documento cumpre a spec pedagógica §13.3 e o critério de lançamento do PRD §7.6. Ele traz só ids, códigos e números. O material, os kits e a planilha preenchida ficam em `tests/pedagogy/output/homologacao/`, fora do git; os kits de amostra são a exceção e ficam em `docs/pedagogy/amostras/`.

## Amostra

São 10 kits, com 1 kit por ano × disciplina entre os `ready` da regressão e mais os 2 kits de amostra. Somam 200 questões, 20 exemplos e as seções de revisão e textos-base de cada kit.

O sorteio é determinístico e pode ser reproduzido:
- em cada célula, os casos `ready` vão em ordem alfabética do id;
- o sorteado é o de índice `uint32(sha256("f1-11|<ano>-<disciplina>")[0..4]) mod n`, contado a partir de 0.

Os casos `ready` vêm da rodada final juntada (`tests/pedagogy/output/regressao/rodada-final-composta/origin.json`), toda com `extract-v1+plan-v1+generate-v2+review-v2` e `tax-v2`. A célula do 7º ano de Português não tem kit `ready` nessa rodada, porque os seus 2 casos falharam (dívida HIGH em `docs/engineering/known-issues.md`). A rerodada dos 2 casos também falhou, e a célula vem do único kit `ready` dela em todas as rodadas (seção 7º ano de Português).

O professor vê só o rótulo, com o ano e a disciplina. O id do caso fica só aqui, porque revela a intenção do teste (por exemplo, `dado-pessoal`).

| Rótulo | Ano | Disciplina | Caso | Rodada | Candidatos | Índice | Assuntos | Linhas |
|---|---|---|---|---|---|---|---|---|
| Kit 01 | 4º | Matemática | 4-math-medidas-de-tempo | rodada-final | 3 | 1 | ma4-time | 24 |
| Kit 02 | 4º | Português | 4-portuguese-substantivos-dado-pessoal | rodada-final | 4 | 3 | lp4-nouns-adjectives | 26 |
| Kit 03 | 5º | Matemática | 5-math-sistema-monetario-troco | rodada-final | 4 | 3 | ma5-addition-subtraction | 24 |
| Kit 04 | 5º | Português | 5-portuguese-singular-plural | rodada-final | 6 | 4 | lp5-word-classes | 25 |
| Kit 05 | 6º | Matemática | 6-math-razao-proporcao-dado-pessoal | rodada-final | 5 | 4 | ma6-sharing-ratio | 24 |
| Kit 06 | 6º | Português | 6-portuguese-verbos-com-outro | rodada-final | 4 | 3 | lp6-verb-moods, other | 27 |
| Kit 07 | 7º | Matemática | 7-math-equacoes-porcentagem | rodada-final | 4 | 0 | ma7-linear-equations, ma7-percentage | 25 |
| Kit 08 | 7º | Português | 7-portuguese-figuras-de-linguagem | rodada-2 | 1 | 0 | lp7-figures-of-speech | 26 |
| Kit 09 | 5º | Matemática | amostra de Matemática | amostra | — | — | ma5-decimal-numbers, ma5-equivalent-fractions, ma5-perimeter-area | 26 |
| Kit 10 | 5º | Português | amostra de Português | amostra | — | — | lp5-word-classes | 25 |

Os kits de amostra se somam aos 8 sorteados. Os casos de regressão das mesmas imagens (`5-math-fracoes-decimais-perimetro` e `5-portuguese-classes-de-palavras`) continuam candidatos nas células do 5º ano, e o sorteio não caiu neles.

Os 10 kits têm `extract-v1+plan-v1+generate-v2+review-v2` e `tax-v2`. A planilha tem 252 linhas. O texto do `generate` v2 não é o mesmo em todos:
- os Kits 01 a 08 vêm de rodadas que começaram antes do `708b1b9` (21/10/2026, 17:37);
- os Kits 09 e 10 vêm de depois do `708b1b9`.

Esse commit mudou o pedido de formato da resposta (JSON sem bloco de código) sem subir a versão do prompt. Para analisar um crítico, é preciso considerar o texto exato. O Kit 08 saiu com `AI_EFFORT_GENERATE=medium`; zero crítico nele não valida a configuração de produção dessa célula.

## Kits de amostra

Os dois kits vêm de `bun run pipeline` com a confirmação padrão. Depois, `render:kit --sample` os renderizou de novo com a marca de amostra (design doc 1.8, §9).

| Kit | Imagem | Assuntos | Tentativas | Custo | Geração | Páginas |
|---|---|---|---|---|---|---|
| Matemática, 5º ano | `5-matematica-fracoes-decimais-e-perimetro.png` | ma5-decimal-numbers, ma5-equivalent-fractions, ma5-perimeter-area | initial | US$ 0,4017 | 3 min 14 s | 11 + 6 |
| Português, 5º ano | `5-portugues-classes-de-palavras.png` | lp5-word-classes | initial, item (`review_answer_ambiguous` em `p10`) | US$ 0,4711 | 3 min 50 s | 9 + 4 |

## 7º ano de Português

A rodada final juntada não tem kit `ready` nessa célula. Em 21/10/2026, os 2 casos foram rodados de novo com `bun run test:pedagogy --case`, na configuração atual (saída em `tests/pedagogy/output/regressao/homologacao-7-portugues/`):

| Caso | Resultado | Detalhe | Custo |
|---|---|---|---|
| 7-portuguese-carta-cortada | `analysis_failed` (`no_topic_found`) | O `case.json` só aceita essa recusa com `grade_mismatch`; veio com `personal_data_visible` e sem `grade_mismatch` (`source_warning_missed`) | US$ 0,0013 |
| 7-portuguese-figuras-de-linguagem | `failed` (`ai_output_invalid`) | `review_evidence_unsupported` em `m9` na 1ª tentativa; o reparo de item devolveu saída inválida (`kit_output_invalid`) | US$ 0,5871 |

Somando todas as rodadas da F1-10 e esta, o 7º ano de Português teve 7 tentativas de geração (as que passaram da prévia, 6 delas com os prompts v2), e só 1 deu `ready`: `7-portuguese-figuras-de-linguagem` na rodada 2, com os mesmos prompts e a mesma taxonomia, mas com `AI_EFFORT_GENERATE=medium`, esforço reprovado na F1-10. O humano decidiu, em 21/10/2026, auditar esse kit como o Kit 08 e tratar a taxa de falha do 7º ano de Português como dívida (`docs/engineering/known-issues.md`).

## Pacote do professor

Fica em `tests/pedagogy/output/homologacao/pacote-professor/` e foi montado por um script avulso, fora do repositório (spec da F1-11, Fora de escopo). Tem:
- uma pasta por kit (`Kit NN - Disciplina - Nº ano`), com `atividades.pdf` e `gabarito.pdf`;
- `auditoria-gizito.xlsx`, com quatro abas:
  - **Instruções**: como preencher, com um exemplo de linha;
  - **Rubrica**: os 14 códigos do §13.3, mais “sem defeito”, com classe e definição;
  - **Revisão**: uma linha por parte do kit, na ordem do PDF. As partes são o kit inteiro, cada seção de revisão, cada texto-base, `e1`–`e2`, `p1`–`p10` e `m1`–`m10`. O professor escolhe o defeito numa lista suspensa, e a classe e o código saem por fórmula;
  - **Resumo**: linhas em branco e contagem por classe em cada kit.

## Resultado

A revisão foi feita pelo professor, e o humano a transcreveu na planilha em 21/10/2026. A planilha devolvida está em `tests/pedagogy/output/homologacao/auditoria-gizito-revisado.xlsx`. Apesar da extensão, o arquivo é ODS, salvo pelo LibreOffice.

Conferência: a planilha tem as mesmas 252 linhas do pacote, na mesma ordem, com todos os `itemId` de cada `study_kit.json`. Nenhuma linha ficou em branco e nenhuma foi acrescentada.

| Kit | Linhas | Sem defeito | Crítico | Grave | Leve |
|---|---|---|---|---|---|
| Kit 01 | 24 | 24 | 0 | 0 | 0 |
| Kit 02 | 26 | 26 | 0 | 0 | 0 |
| Kit 03 | 24 | 24 | 0 | 0 | 0 |
| Kit 04 | 25 | 25 | 0 | 0 | 0 |
| Kit 05 | 24 | 24 | 0 | 0 | 0 |
| Kit 06 | 27 | 27 | 0 | 0 | 0 |
| Kit 07 | 25 | 25 | 0 | 0 | 0 |
| Kit 08 | 26 | 26 | 0 | 0 | 0 |
| Kit 09 | 26 | 26 | 0 | 0 | 0 |
| Kit 10 | 25 | 25 | 0 | 0 | 0 |
| **Total** | **252** | **252** | **0** | **0** | **0** |

O critério 4 do gate (§13.2) e o critério de lançamento do PRD §7.6 estão atendidos, e nenhum caso novo de regressão foi criado.

Ressalvas:
- A planilha não tem nenhum comentário. Como não houve defeito, nenhum era exigido, mas também não há registro do que o professor observou.
- O Kit 08 saiu com `AI_EFFORT_GENERATE=medium`. Zero crítico nele não valida a configuração de produção do 7º ano de Português, cuja taxa de falha está na dívida HIGH.
