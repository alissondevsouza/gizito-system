---
feature: regressao-pedagogica
module: pedagogy
size: M
status: done
branch: feat/pedagogy/regressao-pedagogica
updated: 2026-10-21
---

# regressao-pedagogica

## Objetivo

Roadmap F1-10, spec pedagógica §12 e §13. `bun run test:pedagogy` roda os 35 casos da v1 com o pipeline de produção, pelo `runPipeline` da F1-09, sem banco nem fila. Os casos são as 30 imagens de caderno geradas por IA e 5 variações delas: 1 ilegível e 4 com dado pessoal inventado. Cada caso é conferido contra o que se espera dele, e a rodada gera um relatório por caso e um agregado, com os critérios do gate F1 → F2 que a máquina mede (§13.2: 1, 2, 3, 5, 6 e 7). O resumo da rodada fica em `docs/pedagogy/regressao/`. A regressão é a que todas as features de F1-01 a F1-07 deixaram pendente no `known-issues.md`, e ela mede as dívidas que pediram número da F1-10.

## Requisitos e critérios de aceite

- **RF-01 — Formato do caso (§12.2).** `tests/pedagogy/cases/{caseId}/case.json`, no git, validado por `regressionCaseSchema`, que recusa campo desconhecido. Regras além dos tipos:
  - `caseId` igual ao nome do diretório, no padrão `{grade}-{subject}-{slug}`, com o ano e a disciplina do próprio caso;
  - `failCode` nulo se e só se `outcome` for `preview_ready`;
  - `expectedKitOutcome` igual a `not_applicable` se e só se a prévia for `analysis_failed`;
  - assunto obrigatório, aceitável ou confirmado que não passa em `isSelectableTopic` é recusado, e o mesmo assunto não pode ser obrigatório e aceitável;
  - não atendido de outra disciplina é recusado;
  - prévia `preview_ready` sem confirmação pede ao menos um obrigatório;
  - `acceptableRefusalList` (opcional, vazia por padrão) só cabe com `preview_ready` e sem assunto obrigatório. Lista as recusas que também valem num caso de fronteira, cada uma com os avisos exigidos nela (spec pedagógica 1.5 §12.2). Não repete código, e `photos_unreadable` não combina com foto esperada `good`;
  - prévia recusada não tem confirmação;
  - a confirmação segue as regras do pedido: total com o "outro" em `MIN_TOPIC_COUNT`..`MAX_TOPIC_COUNT` e "outro" sem área não atendida.

  · Aceite: teste unit com um caso válido e um inválido por regra; teste unit que carrega os 35 casos do repositório e não acha problema.
- **RF-02 — Os 35 casos (§13.1).** Um caso por imagem de `docs/materiais-fotograficos/` e um por variação, com tags, prévia esperada, confirmação e resultado do kit da classificação da F1-10 (tabela em Decisões). Os 11 casos do `test:extract-cases-live` da F1-06 entram com as mesmas expectativas, e os 10 do `test:generate-live` da F1-07 com a mesma confirmação. · Aceite: teste unit com a contagem por tag do §13.1 e com cada imagem usada.
- **RF-03 — Fotos fora do git, com hash.** A preparação copia cada imagem para `tests/pedagogy/cases/{caseId}/photos/` e gera as 5 variações a partir de `tests/pedagogy/photo-variations.json`:
  - borrão do sharp com sigma fixo;
  - nome de aluno, nome de escola e telefone inventados, escritos sobre a página pelo Chromium, com a fonte do repositório, em posição fixa.

  É idempotente: foto presente e com o hash do `case.json` não é refeita. O runner confere o SHA-256 de todas as fotos antes da primeira chamada de IA. Foto ausente, foto diferente ou variação que não reproduz o hash abortam a rodada, com o caso e a foto na mensagem. · Aceite: testes unit da cópia, do borrão, da recusa por hash e da idempotência; teste de integração da sobreposição com o Chromium.
- **RF-04 — Runner.** `bun run test:pedagogy` na raiz roda cada caso com `runPipeline` (`AiProvider`, `MathEvaluator`, KaTeX e render reais). A confirmação vem do caso; sem ela, entram os 3 primeiros obrigatórios, sem opcionais. Com `not_applicable`, a lista de assuntos vai vazia, e uma prévia que passar sem dever para na confirmação, sem gerar kit. Opções:
  - `--case <caseId>` (repetível), para rodar só alguns casos;
  - `--concurrency <n>`, de 1 a 8, com padrão 4;
  - `--usd-brl <taxa>`, com padrão 6,00 (Decisões);
  - `--prepare-photos`, que só prepara e confere as fotos;
  - `--out <pasta>`.

  Erro inesperado num caso vira `crashed` com a etapa e o nome do erro, e a rodada continua. Código de saída: 0 sem bloqueador crítico inesperado, 1 com algum, 2 para entrada inválida. · Aceite: testes unit do parser; teste unit do runner de casos com `FakeAiProvider` e renderer roteirizado: confirmação do caso, confirmação padrão, `not_applicable` parando na confirmação e caso que quebra.
- **RF-05 — Verificações do caso (§12.3).** Por caso:
  - `preview_outcome_mismatch`: falha de extração (erro de IA) também conta;
  - `required_topic_missing`;
  - `unexpected_topic`: candidato `high` fora de obrigatório ∪ aceitável; candidato `medium` fora deles é só aviso;
  - `unsupported_topic_missed`;
  - `legibility_mismatch`, por foto;
  - `source_warning_missed`;
  - `kit_outcome_mismatch`: o resultado real é `ready`, `failed` ou `not_applicable`, este último quando o pedido parou na análise ou na confirmação; `crashed` sempre falha.

  Há também duas verificações que não estão no §12.3 e não entram no gate:
  - `personal_data_copied`, para a dívida da F1-06: um texto inventado da variação aparece nas extrações por foto ou na juntada. Conta o nome inteiro, cada palavra do nome com 4 letras ou mais (palavra inteira, sem diferença de maiúsculas), a escola e os 8 últimos dígitos do telefone, com qualquer separador;
  - `material_copied`, que vem da F1-06 (transcrição): uma frase de `tests/pedagogy/material-phrases.json` aparece na extração.

  · Aceite: teste unit por código, com o caso que passa e o que falha.
- **RF-06 — Relatório.** Na saída da rodada (`tests/pedagogy/output/regressao/{runId}/`, fora do git), cada caso fica numa pasta com:
  - `study_kit.json` ou `study_kit.failed.json` e os dois PDFs, como no `bun run pipeline`;
  - `summary.json` (`buildPipelineSummary`);
  - `issues.json`, com as issues completas de cada tentativa;
  - `check.json`.

  A rodada tem `report.json` e `report.md` com:
  - por caso: verificações, bloqueadores e avisos da 1ª tentativa por código, reparos, custo da prévia e do kit por etapa, tempo por etapa e páginas;
  - por `topicRef`, com o "outro" à parte: casos, prontos, regenerações e códigos;
  - agregado: casos aprovados por verificação, bloqueadores críticos inesperados, taxa de regeneração, códigos mais frequentes (incluindo `ai_output_invalid` e `math_expression_invalid`), custo médio e p95 por prévia e por kit, e tempo p50 e p95 da geração;
  - os critérios 1, 2, 3, 5, 6 e 7 do §13.2, cada um com meta, valor e veredito. O 4 é da F1-11, e o 7 não bloqueia.

  · Aceite: teste unit do agregado (média, p50, p95, veredito de cada critério e "outro" à parte) e teste de que nenhum texto do material, do pedido ou do kit chega ao `report.md`.
- **RF-07 — Resumo nos docs (§12.1).** A rodada completa, sem `--case`, grava `docs/pedagogy/regressao/{AAAA-MM-DD}-{generationVersion}.md`, só com ids, códigos e números. A rodada parcial não grava nos docs. · Aceite: teste unit do nome do arquivo e do conteúdo sem texto do material.
- **RF-08 — Metas no core.** As metas do §13.2 que o relatório usa ficam em `packages/core/src/constants.ts`, e o relatório não repete número:
  - `REGRESSION_MIN_EXTRACTION_PASS_RATE` (0,9);
  - `MAX_KIT_AI_COST_PRICE_SHARE` (0,1 de `KIT_PRICE_CENTS`);
  - `MAX_PREVIEW_AI_COST_BRL_CENTS` (10);
  - `GENERATION_P95_TARGET_SECONDS` (300).

  · Aceite: typecheck e testes do relatório usando as constantes.
- **RF-09 — Rodada real.** Rodar os 35 casos contra a API. Pronto: zero bloqueador crítico inesperado (critério 1) e resumo gravado em `docs/pedagogy/regressao/`. Quando um defeito for corrigido, o caso que o pegou recebe a tag `regression`, ou um caso novo com essa tag é criado. Mudança de prompt, modelo, taxonomia ou validador que a correção pedir passa pelo humano antes (Decisões). · Aceite: relatório da rodada final no `review.md`.

## Fora de escopo

- A auditoria do professor e os kits de amostra (critério 4, F1-11), e o registro das metas no PRD §3, que também é da F1-11.
- Foto real de caderno: entra como caso novo quando existir (§13.1, §15.8).
- Comparar o custo gravado com o painel da Anthropic, que só o humano vê: o relatório dá o total em dólar para a comparação (known-issues).
- O `test:generate-live` da F1-07 fica como está. O `test:extract-cases-live` da F1-06 sai, porque a própria F1-06 deixou registrado que o runner o substitui.
- CI: a regressão roda fora dela, por custo (`testing.md`).

## Plano

- **Código em `apps/worker/src/regression/`**, que usa o `runPipeline`, o `buildPipelineSummary` e o render do worker:
  - `regression-case.ts`: schema, carga dos casos e problemas semânticos;
  - `case-photo.ts`: preparação e conferência das fotos, com variações;
  - `case-check.ts`: as verificações do RF-05;
  - `run-case.ts`: monta o `PipelineRequest` do caso, chama o `runPipeline` e captura o erro inesperado;
  - `regression-report.ts`: agregado, critérios, `report.md` e o resumo dos docs;
  - `regression-input.ts`: opções da linha de comando.

  - `personal-data-painter.ts`: a escrita do dado pessoal pelo Chromium.

  O script fica em `apps/worker/scripts/pedagogy-regression.ts`, e na raiz entra `"test:pedagogy": "bun --env-file=.env apps/worker/scripts/pedagogy-regression.ts"`, como o `pipeline`.
- **Saída reaproveitada.** A gravação de `study_kit.json`, dos PDFs e do `summary.json` sai do `scripts/pipeline.ts` para `src/cli/pipeline-output.ts`. O `bun run pipeline` e o runner usam a mesma função.
- **Cache de extração injetável.** O `runPipeline` ganha a dependência opcional `extractionCache`, com o cache em memória novo como padrão, como era antes. O runner passa um cache por caso e lê dele as extrações por foto, porque a extração juntada não guarda a `evidence` e a verificação `personal_data_copied` precisa dela.
- **Concorrência.** Os casos rodam com o `createSemaphore` do render, e um só `PdfRenderer` (`DEFAULT_RENDER_CONCURRENCY`) é compartilhado. Cada caso tem a sua instância de `runPipeline`, com cache de extração em memória próprio. O timeout por etapa (`JOB_MAX_RUN_SECONDS`) vem do `runPipeline`, e isso fecha a dívida LOW do `signal`.
- **Variação com dado pessoal.** O Chromium do Playwright abre uma página com a imagem de fundo e o texto em Nunito Sans (`@fontsource`, a mesma do render), na cor de caneta azul, e tira um screenshot do tamanho da imagem. O hash só é estável na mesma máquina e na mesma versão do Chromium. Se a variação não reproduzir o hash, a rodada aborta com a instrução de conferir a imagem e atualizar o `case.json` (lessons, se acontecer).
- **Custo em reais.** O `ai_call` grava centavos de dólar (ADR-0011). O relatório converte pelo câmbio de `--usd-brl` só para os critérios 5 e 6 e mostra o câmbio usado.
- **Testes.** Unit em `apps/worker/src/__tests__/regression/` com `FakeAiProvider`, renderer roteirizado e fixtures de `case.json`, mais o teste que carrega os 35 casos reais (sem fotos). Integração em `__tests__/integration/personal-data-painter.test.ts` para a sobreposição com o Chromium.
- **Riscos.**
  - Expectativa ambígua: em 5 imagens o assunto do material não tem id no ano do pedido (taxonomia `tax-v1`). A expectativa segue o que a spec manda fazer, mas o modelo pode escolher outro caminho defensável. Recalibrar o caso depois da rodada é permitido só com o motivo pedagógico no `note` e no `review.md`. Comportamento errado do modelo é defeito.
  - Custo: cerca de US$ 0,40 por kit e 31 kits por rodada, perto de US$ 13. A rodada inteira só se repete depois de mudança que peça regressão; as correções pontuais se conferem com `--case`.

## Tasks

### M1 — Formato do caso, metas e os 35 casos
- [x] 1.1 Metas do §13.2 no core · Arquivos: `packages/core/src/constants.ts` · Verificação: `bun run --cwd packages/core typecheck`
- [x] 1.2 `regressionCaseSchema`, carga e problemas semânticos · Arquivos: `apps/worker/src/regression/regression-case.ts`, `apps/worker/src/__tests__/regression/regression-case.test.ts` · Verificação: `bun test src/__tests__/regression` no worker
- [x] 1.3 Os 35 `case.json` e `photo-variations.json`, com o teste dos casos reais e da contagem por tag · Arquivos: `tests/pedagogy/cases/*/case.json`, `tests/pedagogy/photo-variations.json`, `apps/worker/src/__tests__/regression/cases.test.ts` · Verificação: idem

### M2 — Fotos e verificações
- [x] 2.1 Preparação e conferência das fotos (cópia, borrão, dado pessoal pelo Chromium, hash) · Arquivos: `apps/worker/src/regression/case-photo.ts`, testes unit e de integração · Verificação: `bun test` e `bun run test:integration` no worker
- [x] 2.2 Verificações do caso · Arquivos: `apps/worker/src/regression/case-check.ts`, teste · Verificação: `bun test src/__tests__/regression`

### M3 — Runner e relatório
- [x] 3.1 `pipeline-output.ts` extraído do script do pipeline · Arquivos: `apps/worker/src/cli/pipeline-output.ts`, `apps/worker/scripts/pipeline.ts` · Verificação: testes do CLI
- [x] 3.2 `run-case.ts` e `regression-input.ts` · Arquivos: os dois módulos e os testes · Verificação: `bun test src/__tests__/regression`
- [x] 3.3 Relatório, critérios, `report.md` e resumo nos docs · Arquivos: `apps/worker/src/regression/regression-report.ts`, teste · Verificação: idem
- [x] 3.4 Script e comando na raiz; sair o `test:extract-cases-live` · Arquivos: `apps/worker/scripts/pedagogy-regression.ts`, `package.json`, `apps/worker/package.json` · Verificação: `bun run test:pedagogy --prepare-photos`; `bun run lint`, `bun run typecheck` e `bun run test`

### M4 — Rodada real
- [x] 4.1 Preparar as fotos, conferir as 5 variações a olho e gravar os hashes · Verificação: `bun run test:pedagogy --prepare-photos`
- [x] 4.2 Rodada completa dos 35 casos · Verificação: `bun run test:pedagogy`
- [ ] 4.3 Corrigir defeitos e recalibrar casos ambíguos, com motivo; rodar de novo os casos afetados · Verificação: `bun run test:pedagogy --case ...`
- [ ] 4.4 Docs: dívidas medidas no `known-issues.md`, `testing.md` e `CLAUDE.md` se mudarem, roadmap

### M5 — Revisão neutra
- [x] 5.1 `gizito-implement-verifier` e `review.md`

### M6 — Correções da rodada 1 (decisões do humano de 21/10/2026)
- [x] 6.1 `tax-v2` com `lp5-word-classes`, histórico da versão e `taxonomia.md` · Arquivos: `packages/core/src/pedagogy/taxonomy/{5-portuguese,index}.ts`, `packages/core/src/__tests__/__fixtures__/taxonomy-history.ts`, `docs/pedagogy/taxonomia.md` · Verificação: `bun run --cwd packages/core test`
- [x] 6.2 `min` e `max` no avaliador e no LaTeX, com a lista de funções exportada · Arquivos: `packages/integrations/src/math/{expression,latex}.ts`, `packages/integrations/src/index.ts` · Verificação: `bun run --cwd packages/integrations test`
- [x] 6.3 `generate` v2 e `review` v2, `prompts-v2.md` e teste contra o doc · Arquivos: `apps/worker/src/pipeline/prompts/{generate,review}/v2.ts`, `apps/worker/src/pipeline/generate.ts`, `docs/pedagogy/prompts-v2.md` · Verificação: `bun run --cwd apps/worker test`
- [x] 6.4 Relatório com modelos e esforço da rodada · Arquivos: `apps/worker/src/regression/regression-report.ts`, script · Verificação: idem
- [x] 6.5 Seis casos recalibrados: quatro de gramática do 5º ano e dois de fronteira · Arquivos: `tests/pedagogy/cases/*/case.json`
- [x] 6.6 Spec pedagógica 1.5 e `known-issues.md`
- [x] 6.7 Rodada dos casos afetados com `AI_EFFORT_GENERATE=medium` (rodada 2) e dos que falharam com o esforço padrão (rodada 3) · Verificação: `bun run test:pedagogy --case ...`
- [x] 6.8 Parágrafo de texto-base de 1 a 800 caracteres e `acceptableRefusalList` nos dois casos de fronteira (decisões do humano de 21/10/2026, depois da rodada 3) · Arquivos: `packages/core/src/pedagogy/kit/schemas.ts`, `apps/worker/src/regression/{regression-case,case-check,regression-report}.ts`, os dois `case.json` · Verificação: `bun run test`
- [x] 6.9 Rodada completa dos 35 casos com o esforço padrão, juntada ao complemento depois da queda da sessão (decisão do humano) · Verificação: `bun run test:pedagogy`
- [x] 6.10 Revisão neutra, rodada 2, das correções (reprovada; CRÍTICO e ALERTA corrigidos em `6e2402d`, teto de 2 rodadas atingido)

## Decisões

| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-21 | Classificação das 30 imagens feita pela F1-10, olhando cada uma. Contagem: 30 manuscritas; 5 de Matemática com frações; 2 com enunciado ambíguo (`4-math-adicao-subtracao-cortada`, com o exercício 4 cortado, e `6-math-razao-proporcao`); 1 só com não atendido; 1 com não atendido junto de atendidos; 12 cortadas ou com sombra (as 10 imagens de 301 × 506 e 2 com sombra forte); 3 de outro ano | A classificação de 21/10/2026 só registrou as contagens, sem a lista por imagem. A contagem de foto ruim passou de 7 para 12 nesta conferência: 10 imagens são recortes de 301 × 506 pixels com a página vizinha aparecendo |
| 2026-10-21 | Os 3 de outro ano (`grade_mismatch`): `6-portuguese-sujeito-predicado` (assunto do 7º ano, `lp7-subject-predicate`; o caso espera `lp6-sentence-clause`, oração), `7-math-potenciacao-raiz` (potenciação do 6º e raiz do 8º; espera `no_topic_found`) e `7-portuguese-carta-cortada` (partes da carta, `lp4-letters`; espera `no_topic_found`). Os dois `no_topic_found` exigem o aviso `grade_mismatch` | O §3.3 manda `no_topic_found` quando não há assunto do ano e, com o aviso, a tela usa o texto de matéria de outro ano. O sujeito e predicado tem assunto vizinho no 6º ano |
| 2026-10-21 | Imagens cujo assunto não tem id no ano do pedido e que ficam com o assunto mais próximo: artigos e singular/plural do 5º ano → `lp5-nominal-agreement`; classes de palavras do 5º ano → aceitáveis `lp5-pronouns`, `lp5-verb-tenses`, `lp5-word-formation` e `lp5-nominal-agreement`, sem obrigatório, com confirmação `lp5-pronouns` | Recusar uma página legível do próprio ano seria pior que oferecer o assunto mais próximo. Se o modelo recusar, o caso mostra uma lacuna da `tax-v1`, e a decisão é do humano (`tax-v2`) |
| 2026-10-21 | Casos com "outro": `5-math-divisao-com-outro` ("problemas com dinheiro e troco", da F1-07) e `6-portuguese-verbos-com-outro` ("uso dos porquês") | §13.1 pede 2 casos com "outro" entre os existentes |
| 2026-10-21 | Variações: `4-portuguese-pontuacao-desfocada` (sigma 14, a da F1-06) e dado pessoal sobre `4-portuguese-substantivos-comuns-proprios`, `5-portuguese-singular-plural`, `6-math-razao-proporcao` e `7-math-equacoes-porcentagem` | Uma variação de dado pessoal por ano, duas de cada disciplina, em páginas com espaço em branco para as três linhas de texto. As cinco foram conferidas a olho, e a geração repete o mesmo hash na mesma máquina |
| 2026-10-21 | Câmbio padrão de 6,00 reais por dólar no relatório, com `--usd-brl` para trocar | O custo é gravado em dólar (ADR-0011), e as metas 5 e 6 estão em reais. Um câmbio acima do de mercado deixa a conferência conservadora. O câmbio é parâmetro do relatório, não regra do produto, e não entra no core |
| 2026-10-21 | As receitas das variações e os textos inventados ficam em `tests/pedagogy/photo-variations.json`, fora do `case.json` | O `case.json` segue o §12.2 sem campo novo. A receita da variação é dado de preparação, e a verificação `personal_data_copied` lê os textos dela |
| 2026-10-21 | Revisão neutra, rodada 1: caso quebrado reprova nos critérios 2 e 3; `material_copied` volta, com as frases dos 10 casos da F1-06 em `tests/pedagogy/material-phrases.json`; a busca de dado pessoal casa cada palavra do nome e os 8 últimos dígitos do telefone; erro fora do `runPipeline` vira `crashed` sem derrubar a rodada; o `report.md` ganha custo e tempo por etapa e os avisos da 1ª tentativa | Achados da revisão (`review.md`) |
| 2026-10-21 | `legibility_mismatch` reprova a foto esperada `good` que não ficou utilizável por qualquer motivo (ilegível, "não é material escolar" ou saída inválida), e não só a marcada `unreadable` | Para o responsável, as três dão a mesma tela de trocar a foto. A regra mais rígida é de propósito |
| 2026-10-21 | O humano aprovou as cinco recomendações da rodada 1 (spec pedagógica 1.5 §15.10): `tax-v2` com `lp5-word-classes`, com a revisão do professor pendente; `generate` e `review` v2, com `min` e `max` no avaliador; os casos de fronteira recalibrados; o teste do esforço `medium`; e a contagem de 12 imagens no §13.1. Pediu para rodar de novo só o necessário | Decisões que o orquestrador não podia tomar: taxonomia, prompts, validador e texto da spec pedagógica |
| 2026-10-21 | A rodada das correções cobre só os casos afetados: os 10 críticos, os outros 2 do 5º ano de Português (a lista de assuntos do ano mudou) e `7-math-potenciacao-raiz` (recalibrado). O esforço vem de `AI_EFFORT_GENERATE=medium` na linha de comando, que vence o `.env`; o `.env` não muda | Pedido do humano. A invariante 11 pede a rodada completa antes da `main`, e isso fica dito no handoff |
| 2026-10-21 | Depois da rodada 3, o humano decidiu: parágrafo de texto-base de 1 a 800 caracteres, porque a carta tem saudação e assinatura curtas; casos de fronteira que aceitam as duas respostas (`acceptableRefusalList`, com os avisos da recusa); e rodada completa antes da `main`. O esforço `medium` volta ao valor atual pelo JSON inválido nos reparos | O diagnóstico, que valida fora do adaptador e imprime só os caminhos do Zod, achou o parágrafo curto. A oscilação se repetiu nas rodadas 2 e 3 |
| 2026-10-21 | Revisão neutra, rodada 2: a recusa aceita volta a exigir `grade_mismatch` (CRÍTICO); `min` com minutos passa no avaliador, com o símbolo de unidade renomeado no AST para não colidir com a função `min` (ALERTA); `acceptableRefusalList` sem obrigatório, sem repetir e sem `photos_unreadable` com foto `good`; frases do material só de caso existente; a sobreposição de `lp5-word-classes` com `lp5-nominal-agreement` (`EF05LP26`, gênero e número) vai para a revisão do professor | Achados da revisão (`review.md`) |
| 2026-10-21 | O humano fechou a F1-10 com os 2 críticos residuais registrados como dívida HIGH, para medir a taxa real no piloto | Sem defeito fixo: os dois kits falharam depois da única regeneração, e o diagnóstico repetido gerou o kit da carta |
| 2026-10-21 | Correções que mudem prompt, modelo, taxonomia, validador ou o texto da spec pedagógica param para o humano antes de entrar | `prompts-v1.md`, `tax-v1` e a spec pedagógica foram aprovados por ele. As dívidas do `known-issues.md` já dizem "decisão do humano" nesses pontos |

## Status

Concluída em 21/10/2026, com M1 a M6 feitos. A rodada final juntada teve 2 bloqueadores críticos inesperados (`review.md`). O humano decidiu fechar a F1-10 com eles registrados como dívida HIGH (`known-issues.md`).

O humano aprovou as correções da revisão neutra rodada 2 em 21/10/2026.

Pendências do humano:
- parecer do professor sobre `lp5-word-classes`, enviado em 21/10/2026;
- push e merge.
