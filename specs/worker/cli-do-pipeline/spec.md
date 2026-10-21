---
feature: cli-do-pipeline
module: worker
size: M
status: in_progress
branch: feat/worker/cli-do-pipeline
updated: 2026-10-21
---

# cli-do-pipeline

## Objetivo

Roadmap F1-09: um comando gera um kit a partir de fotos de caderno, sem web, banco nem fila. `bun run pipeline --photos ... --grade ... --subject ...` encadeia `analyzeMaterial` (F1-06) → decisão da prévia → confirmação → `generateKit` (F1-07) → `renderKit` (F1-08). Ele grava `study_kit.json`, os dois PDFs e um resumo de custo e tempo. A orquestração fica numa função do worker (`runPipeline`), que o runner da F1-10 reaproveita. Fecha também a parte da F1-09 da dívida do `known-issues.md` sobre o `signal`: toda chamada de IA do comando sai com `AbortSignal.timeout(JOB_MAX_RUN_SECONDS * 1000)`.

## Requisitos e critérios de aceite

- **RF-01 — Comando.** `bun run pipeline` na raiz aceita `--photos <arquivo>...` (repetível; caminhos soltos depois de `--photos` também contam como fotos, para o glob do shell funcionar), `--grade 4|5|6|7`, `--subject math|portuguese` e, opcionais, `--topics id,id`, `--other "texto"`, `--difficulty basic|intermediate|unknown`, `--note "texto"` e `--out <pasta>`. Os caminhos são relativos à raiz do repositório, onde o `bun run` executa. · Aceite: teste unit do parser com fotos repetidas e soltas, cada opcional e ausência de opcionais.
- **RF-02 — Entrada validada antes de qualquer chamada de IA.** O comando recusa, com mensagem pt-BR por campo e código de saída 2:
  - foto ausente, fora de 1..`MAX_PHOTO_COUNT`, extensão fora de `.jpg`, `.jpeg` e `.png`, ou acima de `MAX_PHOTO_BYTES`;
  - ano ou disciplina fora dos enums do core;
  - assunto que não passa em `isSelectableTopic` para o ano e a disciplina (`topic_not_selectable`) ou assunto repetido;
  - total de assuntos com o "outro" fora de `MIN_TOPIC_COUNT`..`MAX_TOPIC_COUNT` (`countOrderTopics`);
  - "outro" fora de `otherTopicTextSchema`, ou com área não atendida por `findUnsupportedTopicList` (`other_topic_unsupported`);
  - observação fora de `noteTextSchema`; dificuldade fora do enum; opção desconhecida;
  - chave de IA ausente no ambiente (`aiEnvironmentSchema`), informada só pelo nome da variável.

  · Aceite: um teste unit por recusa; nenhuma recusa chama o `AiProvider`.
- **RF-03 — Orquestração com o código de produção.** `runPipeline` roda extração por foto → `decidePreviewOutcome` → confirmação → `generateKit` → `renderKit`, com o `AiProvider`, o `MathEvaluator`, o KaTeX e o `PdfRenderer` injetados. Usa cache de extração em memória e nenhum banco nem fila. · Aceite: teste unit com `FakeAiProvider` e renderer roteirizado: o caminho feliz chama `extract` uma vez por foto, depois `plan`, `generate` e `review`, e renderiza os dois PDFs.
- **RF-04 — Pontos de parada.** O resultado diz em que etapa o pedido parou (`analyze`, `confirm`, `generate`, `render`) e com que código:
  - falha da extração (código da `ExtractionFailure`);
  - prévia `analysis_failed` (`photos_unreadable`, `only_unsupported_topics`, `no_topic_found`): sem geração, como a volta para `draft`;
  - confirmação sem assunto (`topic_confirmation_required`): sem geração;
  - falha da geração (código da `GenerationFailure`), com o último kit guardado quando houver;
  - falha do render (`render_failed`).

  · Aceite: teste unit por parada, conferindo que nenhuma etapa seguinte foi chamada.
- **RF-05 — Confirmação.** Com `--topics`, os assuntos entram na ordem dada, que vale como ordem de relevância (spec pedagógica §4). Sem `--topics`, entram os candidatos `high` na ordem da prévia, até `MAX_TOPIC_COUNT`, ou até `MAX_TOPIC_COUNT − 1` com `--other` (sugestão da spec pedagógica §3.3 para os chips pré-marcados). O "outro" é sempre o último. Sem candidato `high` e sem `--other`, o pedido para com `topic_confirmation_required`. A saída lista os candidatos, com id e confiança, para a escolha com `--topics`. · Aceite: testes unit da confirmação padrão (corte em 3, corte em 2 com o outro, só `medium`) e da explícita.
- **RF-06 — Teto de tempo por etapa.** A análise e a geração recebem, cada uma, um `AbortSignal.timeout(JOB_MAX_RUN_SECONDS * 1000)` novo, como os jobs `order.analyze` e `order.generate`. Toda chamada de IA leva esse `signal`, e o sinal abortado vira `ai_aborted`. · Aceite: teste unit com fábrica de sinal injetada: todas as requisições levam o sinal; sinal já abortado para o pedido com `ai_aborted`.
- **RF-07 — Teto de custo com a extração.** A geração recebe em `spentCostCents` o custo da extração, como no `test:generate-live`, e respeita `MAX_AI_COST_CENTS_PER_ORDER`. · Aceite: teste unit com `maxCostCents` igual ao custo da extração: a geração para com `ai_cost_exceeded` sem chamar o `plan`.
- **RF-08 — Saída.** O comando grava, na pasta de `--out` ou em `tests/pedagogy/output/pipeline/{timestamp}/` (fora do git):
  - `study_kit.json`, `activities.pdf` e `answer-key.pdf` quando o kit sai;
  - `study_kit.failed.json` quando a geração falha com um último kit;
  - `summary.json` sempre.

  O resumo lista resultado, etapa e código da parada, fotos (estado, legibilidade, se é utilizável, problemas), candidatos (id, confiança, fotos), não atendidos e avisos por código, assuntos confirmados, tentativas com os códigos de bloqueador e aviso por item, páginas e avisos do render, e, por etapa, chamadas, tokens, custo e duração, com os totais. O terminal mostra o mesmo resumo em pt-BR, com custo em US$ (o `costCents` é em centavos de dólar, ADR-0011). O resumo e o terminal nunca trazem evidência, termos ou temas do perfil, texto do "outro", observação, trecho do kit ou `excerpt` de issue (invariante 9). Saída 0 com o kit pronto, 1 com o pedido parado. · Aceite: teste unit do resumo e do texto, com textos-sentinela no "outro", na observação e na evidência que não aparecem na saída.
- **RF-09 — Pronto quando (roadmap).** Um comando gera um kit a partir de uma imagem de caderno de teste. · Aceite: execução real com uma imagem de `docs/materiais-fotograficos/` de cada disciplina, com resultado no `review.md`; o humano abre os PDFs.

## Fora de escopo

- Banco, fila, `ai_call` persistido, `order`, máquina de estados e publicação. São da F2-02 e da F2-05.
- Upload, conversão de HEIC e outros formatos, limpeza de EXIF antes do armazenamento: F2-01. O adaptador já reduz a foto e tira o metadado antes de enviar ao modelo.
- Confirmação interativa e reordenação de `--topics` pela prévia. A ordem dada é a de relevância. A regra do §4 ("assunto marcado à mão vai depois dos detectados") é da F2-03.
- Cache de extração persistente entre execuções.
- Casos de regressão, `case.json` e relatório agregado: F1-10.
- Mudança em prompt, modelo, taxonomia ou validador. Por isso esta feature não roda `bun run test:pedagogy`, que ainda não existe.

## Plano

Arquivos:

| Arquivo | O quê |
|---|---|
| `apps/worker/src/pipeline/run-pipeline.ts` | `runPipeline(request, dependencies)`, `confirmTopicRefList`, tipos `PipelineRequest`, `PipelineDependencies`, `PipelineRun`, `pipelineStageList`, `TOPIC_CONFIRMATION_REQUIRED_CODE` |
| `apps/worker/src/cli/pipeline-input.ts` | `parsePipelineArgs(argv)` (puro, `node:util` `parseArgs` + schemas do core) e `loadPipelinePhotoList(pathList)` (leitura e checagem das fotos) |
| `apps/worker/src/cli/pipeline-report.ts` | `buildPipelineSummary(run, request)` (objeto do `summary.json`) e `formatPipelineSummary(summary, outputDirectory)` (linhas pt-BR) |
| `apps/worker/scripts/pipeline.ts` | entrada do comando: argumentos, ambiente, dependências reais, progresso por etapa, escrita dos arquivos, fechamento do renderer |
| `package.json` (raiz) | `"pipeline": "bun --env-file=.env apps/worker/scripts/pipeline.ts"` |
| testes em `apps/worker/src/__tests__/pipeline/run-pipeline.test.ts` e `apps/worker/src/__tests__/cli/` | RF-01 a RF-08 |

Decisões técnicas:

- **Orquestração em `src/pipeline/`, não no script.** O script fica fino (argumentos, IO, dependências reais), e `runPipeline` é testável com fakes e reaproveitável pelo runner da F1-10, que roda a mesma cadeia (spec pedagógica §12.3).
- **Um sinal por etapa-job, não um para o comando inteiro.** Em produção, `order.analyze` e `order.generate` são jobs separados, cada um com `JOB_MAX_RUN_SECONDS`. A fábrica de sinal é injetável para o teste, e o padrão é `AbortSignal.timeout(JOB_MAX_RUN_SECONDS * 1000)`. O render não recebe `signal`, pois tem timeout próprio por documento (F1-08).
- **Validação antes do custo.** Tudo que não depende da extração (fotos, ano, disciplina, assuntos explícitos, "outro", observação) é checado em `parsePipelineArgs` e `loadPipelinePhotoList`, antes de criar o provedor. `runPipeline` também recebe dados já válidos, e `generateKit` continua com seu `assertGenerationRequest` como defesa.
- **Tipo da foto pela extensão.** `.png` → `image/png`, `.jpg` e `.jpeg` → `image/jpeg`. O adaptador decodifica pelo conteúdo com o `sharp`, e arquivo inválido vira `ai_image_invalid` naquela foto, como na F1-06.
- **Resumo sem conteúdo.** Só ids da taxonomia, enums, códigos e números. O nome do assunto vem de `findTopic` (taxonomia, não usuário). `otherTopicText` e `noteText` viram `hasOtherTopicText` e `hasNoteText`.
- **Custo em US$.** O `costCents` do `AiCallRecord` é em centavos de dólar (ADR-0011). O terminal formata em `US$` com `Intl.NumberFormat("pt-BR")`. A conversão para real e a comparação com o preço são da F1-11.

Testes: unit com `createFakeAiProvider` (extração enfileirada, geração pelo `createFixtureAiProvider` da F1-07) e renderer roteirizado como em `render-kit.test.ts`. A execução real (RF-09) usa a chave do `.env` pelo `--env-file`, sem o agente ler o arquivo, e custa cerca de US$ 0,41 por kit (média da F1-07).

Riscos: Chromium ausente na máquina vira `render_failed` com `errorName`. O uso do comando aponta `bun run --cwd apps/worker browser:install`.

## Tasks

### M1 — Orquestração
- [x] 1.1 `runPipeline` e `confirmTopicRefList` · Arquivos: `apps/worker/src/pipeline/run-pipeline.ts` · Verificação: `bun test src/__tests__/pipeline/run-pipeline.test.ts` (em `apps/worker`)
- [x] 1.2 Testes RF-03 a RF-07 · Arquivos: `apps/worker/src/__tests__/pipeline/run-pipeline.test.ts`

### M2 — Comando
- [ ] 2.1 `parsePipelineArgs` e `loadPipelinePhotoList` com testes RF-01 e RF-02 · Arquivos: `apps/worker/src/cli/pipeline-input.ts`, `apps/worker/src/__tests__/cli/pipeline-input.test.ts`
- [ ] 2.2 `buildPipelineSummary` e `formatPipelineSummary` com testes RF-08 · Arquivos: `apps/worker/src/cli/pipeline-report.ts`, `apps/worker/src/__tests__/cli/pipeline-report.test.ts`
- [ ] 2.3 Script e `package.json` da raiz · Arquivos: `apps/worker/scripts/pipeline.ts`, `package.json` · Verificação: `bun run pipeline` sem argumentos mostra o uso; com argumento inválido, a mensagem e saída 2
- [ ] 2.4 `bun run lint`, `bun run typecheck`, `bun run test`

### M3 — Execução real e docs
- [ ] 3.1 Execução real com uma imagem de Matemática e uma de Português (RF-09)
- [ ] 3.2 `CLAUDE.md` (comando), `known-issues.md` (parte da F1-09 da dívida do `signal`), roadmap (F1-09 `[x]` e contagem da §4)

## Decisões

| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-21 | Size M, não P como no roadmap | São 4 arquivos de código, 3 de teste e o `package.json`. O pipeline de IA é zona sensível, com verifier neutro de qualquer forma |
| 2026-10-21 | Confirmação padrão = candidatos `high` na ordem da prévia | É a sugestão da spec pedagógica §3.3 para os chips pré-marcados da F2-09; mantém o "um comando" sem inventar regra |
| 2026-10-21 | `--topics` na ordem dada, sem reordenar pela prévia | A ordem de relevância é entrada de quem roda o comando; a regra do §4 fica para a F2-03, no core |
| 2026-10-21 | O custo da extração entra no teto da geração | Mesmo critério do `test:generate-live` da F1-07; o teto é por pedido |

## Status

M1 concluído. M2 em andamento: parser, resumo e script.
