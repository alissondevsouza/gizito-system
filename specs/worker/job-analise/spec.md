---
feature: job-analise
module: worker
size: L
status: done
branch: feat/worker/job-analise
updated: 2026-10-22
---

# job-analise (F2-02)

## Objetivo
O job `order.analyze` leva o pedido de `draft` a `analyzing` e, depois da extração da F1-06 (`analyzeMaterial`), a `preview_ready` ou de volta a `draft` com avisos por foto, de matéria de outra disciplina ou ano, ou de matéria ainda não atendida (PRD §5 etapa 3 e exceções; spec pedagógica §3.3; `jobs.md` §1 e §4; `state-machine.md`). O resultado fica no banco e o `GET /orders/:token` passa a mostrar a prévia (`api.md` §3, campos marcados F2-02). Cumpre também o que a F2-01 deixou no Status da sua spec:
- ler as fotos sob o lock do `start_analysis`;
- limpar a prévia na troca de fotos;
- fechar a corrida do singleton com a troca feita logo depois do fim da análise.

Roadmap F2-02. O tamanho subiu de M para L porque a entrega cruza core, db, integrations, worker e api e decide onde o cache e o resultado ficam no banco.

## Requisitos e critérios de aceite
- **RF-01 — leitura de objeto no storage.** `ObjectStorage.get(key)` devolve os bytes do objeto privado. Objeto ausente lança `ObjectStorageError("storage_not_found")` (código novo); 5xx, 429 e rede lançam `storage_unavailable`; outros 4xx lançam `storage_rejected`. Vale para o R2 (aws4fetch), para o fake e para a suíte de contrato. · Aceite: a suíte de contrato roda no fake e no MinIO com leitura, ausência e chave inválida; o unit do R2 cobre 404, 500 e 403 com `fetch` falso.
- **RF-02 — cache da extração no banco.** Tabela `extraction_cache` com estas colunas:
  - `extraction_cache_id` (PK);
  - `cache_key` único (a chave de `buildExtractionCacheKey`);
  - `extraction` e `issue_list` em jsonb;
  - `expire_datetime`, com índice para a purga;
  - `insert_datetime` e `update_datetime`, com o trigger.

  O worker implementa a porta `ExtractionCache` sobre ela:
  - `find` devolve a entrada validada por `photoExtractionSchema` e `validationIssueSchema`; entrada que não passa conta como ausente;
  - `save` faz upsert pela chave e sobrescreve extração, avisos e validade;
  - `purgeExpiredExtractionCache(executor, { now, batchSize })` apaga até `batchSize` linhas vencidas e devolve quantas apagou. Quem a agenda é a F2-06, no `retention.purge`.

  · Aceite: integração com acerto, ausência, entrada corrompida tratada como ausente, upsert sobre entrada vencida e purge que apaga só as vencidas, em lotes.
- **RF-03 — resultado da análise no pedido.** Coluna `order.analysis` (jsonb, nula) com `orderAnalysisSchema` do core, de um destes três tipos:
  - `{ outcome: "preview_ready", analyzedPhotoIdList, mergedExtraction }`;
  - `{ outcome: "analysis_failed", failCode, isMaterialMismatch, analyzedPhotoIdList, mergedExtraction }`;
  - `{ outcome: "analysis_unavailable" }`.

  `analyzedPhotoIdList[i]` é o `order_photo_id` da foto `i + 1` da junção, e o tamanho da lista é igual ao de `mergedExtraction.photoList`. A análise concluída também grava:
  - `order_photo.legibility_score` de cada foto analisada;
  - `order.material_profile` com o perfil juntado em `preview_ready`, ou nulo nos outros casos.

  `analysis` nula em `draft` ou `analyzing` quer dizer análise pendente: há um job enfileirado ou em curso. Um check no banco garante `analysis` nula em `analyzing` e `analysis.outcome = "preview_ready"` em `preview_ready`.

  Retenção (invariante 10): `analysis` guarda `terminologyList` e `contextThemeList`, texto tirado da foto. Ela é limpa junto com as fotos, em `PHOTO_RETENTION_DAYS`. `material_profile` segue a mesma regra nos pedidos que não chegaram a `awaiting_payment`; nos demais, sai junto com o `study_kit`, em 12 meses. A regra entra no `data-model.md`, e quem executa é a F2-06.

  · Aceite: unit do schema (tamanhos diferentes recusados, os três tipos aceitos); integração das gravações e do check.
- **RF-04 — início sob lock.** A decisão `decideAnalysisStart(status, hasAnalysis)` fica no core:
  - `draft` sem análise → `start` (`start_analysis`);
  - `analyzing` → `resume` (reexecução depois de queda ou retry);
  - `draft` com análise, `preview_ready` e os demais estados → `skip`.

  A função do db `startOrderAnalysis` trava o pedido (`FOR UPDATE`), aplica a decisão e, em `start` e `resume`, lê na mesma transação as fotos atuais (`replaced_datetime` e `delete_datetime` nulos, por `photo_index`). Devolve ano, disciplina e a lista `{ orderPhotoId, storageKey, insertDatetime }`. · Aceite: unit da decisão para os 9 estados com e sem análise; integração de `start`, `resume` e `skip` e de troca feita antes do início, que entra na leitura.
- **RF-05 — fim na mesma transação do job.** `finishOrderAnalysis(tx, input)` trava o pedido e exige `analyzing`, senão devolve `InvalidTransitionError` sem gravar. Também confere se as fotos atuais são as analisadas, na mesma ordem; se não forem, devolve `AnalysisPhotoSetChangedError` sem gravar. Passando nas duas, aplica `analysis_succeeded` ou `analysis_failed` por `transitionOrder` e grava o RF-03.

  A transação final do handler faz, nesta ordem:
  1. `context.completeWithin(tx)` (RF-06), que trava o job antes do pedido, na mesma ordem da compensação do esgotamento, para não haver deadlock;
  2. `finishOrderAnalysis`.

  Os desfechos:
  - `completeWithin` devolve `false`: o lease se perdeu, o handler desfaz a transação e devolve falha retryable `lease_lost`;
  - `AnalysisPhotoSetChangedError`: desfaz e devolve falha retryable com esse código, e a retentativa relê as fotos;
  - `InvalidTransitionError` (o pedido saiu de `analyzing` por outro caminho): desfaz e devolve `Ok` sem efeito, com log `warn`.

  · Aceite: integração com:
  - o fim, depois do qual o job já está `completed` e a troca de fotos enfileira um novo `order.analyze` (esse é o caso que hoje fica sem job);
  - foto trocada por fora durante a análise, que dá retentativa sem gravar;
  - pedido fora de `analyzing` no fim, que termina sem efeito.
- **RF-06 — `completeWithin` na fila.** `JobHandlerContext` ganha `completeWithin(tx): Promise<boolean>`. Ele completa o job dentro da transação do handler e devolve `false` se o lease não é mais dele. Quando o handler devolve `Ok`, `workJob` tenta completar o job como hoje. Se não conseguir e o handler chamou `completeWithin`, relê a linha por `(job_id, attempt_count)`: `completed` dá o desfecho `completed`, e qualquer outro status dá `lease_lost`. Assim, uma transação desfeita depois do `completeWithin` não vira `completed` por engano. · Aceite: integração da fila com:
  - conclusão dentro da transação;
  - transação desfeita depois do `completeWithin`, em que o job fica `completed` pelo `workJob`;
  - lease perdido, em que `completeWithin` devolve `false`;
  - o caminho antigo sem mudança.
- **RF-07 — handler `order.analyze`.** Os passos:
  - carrega pelo RF-04; `skip` vira `Ok` com log `info`;
  - lê as fotos com `storage.get`;
  - chama `analyzeMaterial` com o `signal` do job, o cache do RF-02 e `AI_MODEL_EXTRACT`;
  - grava uma linha de `ai_call` por chamada, com sucesso ou erro, antes de qualquer transição;
  - encerra pelo RF-05 com o `previewOutcome`.

  Todo fim que muda o pedido (prévia pronta, falha da prévia ou `analysis_unavailable`) passa pela transação final do RF-05, com `completeWithin`. O `skip` também chama `completeWithin` na transação do início. Assim, nenhum caminho deixa o job ativo depois do commit que libera a troca de fotos.

  O mapeamento de falhas:

  | Falha | Resultado |
  |---|---|
  | Falha retryable da etapa (`ai_*` transitório, `extraction_cache_failed`) ou `storage_unavailable` | `Err` retryable com o código; o pedido fica em `analyzing` e a retentativa retoma pelo RF-04 com o cache |
  | Falha não retryable (`ai_auth_failed`, `ai_request_invalid`), foto ausente ou recusada no storage, ou pedido sem foto atual | encerra com `analysis_unavailable` e log `error` com o código; o job fica `completed` |
  | Pedido inexistente | `Err` não retryable `order_not_found` |

  · Aceite: integração com Postgres, fake de IA e fake de storage para:
  - `preview_ready`, `photos_unreadable`, `only_unsupported_topics` e `no_topic_found` com e sem mismatch;
  - falha transitória seguida de retomada sem nova chamada para a foto já em cache;
  - falha não retryable;
  - storage indisponível;
  - reexecução em `preview_ready` e em `draft` já analisado sem chamar a IA;
  - linhas de `ai_call` com `order_id`;
  - troca de foto logo depois de um fim com `analysis_unavailable` e depois de um `skip`, que enfileira um `order.analyze` novo.
- **RF-08 — esgotamento.** O `onExhausted` de `order.analyze` trava o pedido. Em `analyzing`, aplica `analysis_failed` e grava `{ outcome: "analysis_unavailable" }`; em qualquer outro estado, não faz nada (ADR-0009). · Aceite: integração com retentativas esgotadas e com `lock_expired` esgotado na varredura.
- **RF-09 — troca de fotos limpa a prévia.** `PUT /orders/:token/photos` grava `analysis = null` e `material_profile = null` em `draft` e em `preview_ready`, e limpa o `legibility_score` das fotos que ficam. Hoje só limpa o perfil, e só em `preview_ready`. · Aceite: integração da api com troca em `draft` depois de uma falha (análise e notas limpas e job novo) e em `preview_ready`.
- **RF-10 — prévia no `GET /orders/:token`.** A lista de fotos e os campos por estado:
  - `photoList`: cada foto ganha `isUsable` (`boolean`, ou `null` sem análise) e `photoIssueList`;
  - `draft`: `analysisFailure` com `{ failCode, isMaterialMismatch, unsupportedTopicList }`, ou `null` com a análise pendente. `failCode` é `photos_unreadable`, `only_unsupported_topics`, `no_topic_found` ou `analysis_unavailable`;
  - `preview_ready`: `topicCandidateList` (`topicId`, `label` da taxonomia, `confidence`), `unsupportedTopicList` (`unsupportedTopicId`, `label`, `reason`), `materialProfile` resumido (`exerciseFormatList`, `notationList`, `isHandwritten`) e `kitPreview` (`workedExampleCount`, `practiceQuestionCount`, `mockQuestionCount`, `answerKeyCount`, `priceCents`, das constantes do core).

  `terminologyList`, `contextThemeList`, evidências, `issueList` e `sourceWarningList` nunca saem na resposta. · Aceite: unit do schema da view; integração da api nos dois estados e com análise pendente; teste de que a resposta não traz `evidence`, `terminologyList`, `contextThemeList`, `issueList` nem `sourceWarningList`.
- **RF-11 — configuração do worker.** O `workerConfigSchema` passa a exigir `aiEnvironmentSchema` e `storageEnvironmentSchema` e ganha a guarda de produção do storage. O boot monta o `AiProvider` da Anthropic e o storage do R2. O mapa de handlers vira `buildJobHandlerMap(dependencies)`. · Aceite: testes de configuração com chave ausente e boot sem env (já existe); o worker sobe em dev com o `.env`.
- **RF-12 — visto funcionando.** A api, o worker, o Postgres e o MinIO no ar, com a IA real e as fotos sintéticas `ma5-fracoes-equivalentes.jpg` e `ma5-decimais-com-instrucao.jpg`:
  - `POST /orders` com as duas → `analyzing` → `preview_ready`, com `ma5-equivalent-fractions` entre os candidatos;
  - troca da segunda por uma variação dela → `draft` → nova análise com acerto de cache para a primeira, sem chamada nova para ela;
  - linhas de `ai_call` com custo.

  · Aceite: resultados no `review.md`, com custo em centavos.

## Fora de escopo
- Agendar a purga do cache e limpar `analysis` e `material_profile` pela regra do RF-03: F2-06, no `retention.purge`. O roadmap da F2-06 passa a citar os dois.
- Texto da tela para `analysis_unavailable`: o design doc §5.2 e o §6.8 não têm linha para esse caso. A F2-09 define o texto com o humano, e a linha da F2-09 no roadmap passa a citar isso. Proposta: "Não consegui ler as fotos agora. Tenta de novo daqui a pouco." e um botão que leva a um pedido novo.
- Botão "tentar de novo" para reanalisar sem trocar fotos: hoje não existe rota para isso; quem tem `analysis_unavailable` troca a foto ou cria um pedido novo.
- Teto de custo por pedido na extração: no máximo 10 chamadas baratas por análise (5 fotos, com uma nova chamada para saída inválida), e o rate limit da prévia já limita o abuso.
- Tela da prévia (F2-09), confirmação (F2-03) e texto do e-mail.
- `bun run test:pedagogy`: prompt, modelo, taxonomia e validador não mudam (invariante 11 não se aplica).

## Plano
- **Arquivos.**
  - Core:
    - `interfaces/object-storage.ts`: `get` e `storage_not_found`;
    - `order/analysis.ts` (novo): `orderAnalysisSchema`, `analysisFailCodeList` e `decideAnalysisStart`;
    - `order/view.ts`: campos do RF-10;
    - `config`: uma guarda do worker, se precisar;
    - exports e testes.
  - Integrations:
    - `r2/r2-object-storage.ts` e `fakes/fake-object-storage.ts`: o `get`;
    - os testes de storage, contrato e MinIO.
  - Db:
    - `schema/extraction-cache.ts` (novo), `schema/order.ts` (`analysis`) e a migration `0004_job_analise`;
    - `order/analysis.ts` (novo): `startOrderAnalysis`, `finishOrderAnalysis` e `recordAiCallList`;
    - `extraction-cache.ts` (novo): `find`, `save` e `purge`;
    - `queue/work.ts`: o `completeWithin`;
    - testes de integração.
  - Worker:
    - `config.ts`, `index.ts` e `jobs/index.ts` (`buildJobHandlerMap`);
    - `jobs/order-analyze.ts` (novo) e o adaptador do cache;
    - testes.
  - Api: `services/orders.ts` (limpeza e view) e os testes de integração.
  - Docs:
    - `jobs.md`, `api.md`, `data-model.md` e `state-machine.md` (análise pendente e `analysis_unavailable`);
    - ADR-0013, sobre a conclusão do job dentro da transação do handler;
    - roadmap: F2-01 `[x]`, F2-02 em andamento, F2-06 com a purga do cache e a limpeza da análise, F2-09 com o texto de `analysis_unavailable`.
- **Resultado no pedido, não numa tabela.** A prévia é uma por pedido e é trocada inteira a cada análise. Um jsonb validado pelo `orderAnalysisSchema` relê o `mergedExtractionSchema` sem schema próprio, como pede a spec pedagógica §3.3. `legibility_score` continua na foto, para métrica e admin. `material_profile` continua no pedido, para o `plan` da F2-05.
- **Cache numa tabela própria.** A chave já carrega o hash, o ano, a disciplina, a taxonomia, o prompt e o modelo. Cada entrada tem a validade da foto que a criou (`photoDeleteDeadline`). Um acerto em outro pedido não estende essa validade, porque a etapa da F1-06 não regrava em acerto. A gravação depois de uma entrada vencida usa a validade da foto nova, que tem os mesmos bytes. A purga é por `expire_datetime`, com índice.
- **Corrida do singleton.** A troca de fotos é recusada em `analyzing`. Hoje existe uma janela: a transição final já fez commit, mas o `completeJob` ainda não rodou. Uma troca nessa janela vê o singleton `active` e não enfileira nada. Com o `completeWithin` na mesma transação da transição final, quem trava o pedido depois dessa transação já vê o job `completed`. Na janela do início, o job está `active`, mas o pedido ainda está em `draft`. Uma troca ali não enfileira, e o job lê as fotos novas sob o lock (RF-04).
- **Ordem das travas.** A compensação do esgotamento trava o job (`failJob`) e depois o pedido (`onExhausted`). A transação final do handler segue a mesma ordem: `completeWithin` antes de `finishOrderAnalysis`. No `skip`, a ordem é a inversa (pedido e depois job), porque a decisão só sai depois de travar o pedido. Ali, o deadlock com a varredura só acontece com o lease vencido. O Postgres desfaz uma das duas, e o resultado continua seguro, como registra o ADR-0013.
- **`analysis_unavailable` completa o job.** Para o pedido, a falha não retryable é o fim da análise: ele volta a `draft` com aviso na mesma transação. O código vai para o log `error` e para `ai_call.outcome_code`, onde o alerta da F2-13 o encontra. Marcar o job como `failed` exigiria um `failWithin` para fechar a mesma janela, e este é o único job que precisa disso hoje.
- **`ai_call` gravado ao fim da etapa.** `analyzeMaterial` devolve a lista no `Ok` e no `Err`. O handler grava as linhas antes de qualquer transição, num comando próprio, e elas ficam mesmo se a transição falhar. A perda fica restrita a uma queda do processo durante as chamadas, que levam poucos segundos. O `generateKit` grava por chamada porque roda por minutos.
- **db sem lógica de domínio.** Começar, retomar ou pular é decisão do core (`decideAnalysisStart`), e a transição é `transitionOrder`. O db só trava, lê e grava. O worker não importa `drizzle-orm` (dependência de dev): o acesso ao banco fica em `@gizito/db`, como `publishKit`.
- **Testes.** Unit no core (schemas e decisão) e no R2 (`fetch` falso). Integração no db (cache, início e fim, `completeWithin`), no worker (handler com Postgres, fake de IA e fake de storage, pelo `workJob`, para cobrir `completeWithin` e `onExhausted` de verdade), no integrations (MinIO) e na api (view e limpeza). Por fim o RF-12 com tudo no ar.
- **Riscos.**
  - Mudar `JobHandlerContext` mexe na fila de todos os jobs. O campo é opcional de usar, e o caminho antigo tem teste próprio.
  - O worker passa a exigir as chaves de IA e do R2. O teste de boot, a integração do `/health` e o CI precisam de valores falsos.

## Tasks
### M1 — core e storage
- [x] 1.1 Roadmap: F2-01 `[x]`, F2-02 em andamento, F2-06 com a purga do cache e a limpeza da análise, F2-09 com o texto de `analysis_unavailable` · Arquivos: `docs/product/roadmap-v1.md`
- [x] 1.2 `ObjectStorage.get` e `storage_not_found` no core; R2 e fake; contrato, unit do R2 e MinIO · Arquivos: `packages/core/src/interfaces/object-storage.ts`, `packages/integrations/src/{r2,fakes}/…`, testes · Verificação: `bun run --cwd packages/integrations test`, `bun run --cwd packages/integrations test:integration`
- [x] 1.3 `orderAnalysisSchema`, `analysisFailCodeList`, `decideAnalysisStart` e campos da view · Arquivos: `packages/core/src/order/{analysis.ts,view.ts}`, `index.ts`, testes · Verificação: `bun run --cwd packages/core test`

### M2 — banco e fila
- [x] 2.1 Migration `0004_job_analise`: `order.analysis` e `extraction_cache` · Arquivos: `packages/db/src/schema/…`, `packages/db/drizzle/…` · Verificação: `bun run db:generate --filter=@gizito/db`, testes de convenção
- [x] 2.2 Cache (`find`, `save`, `purge`) com integração · Arquivos: `packages/db/src/extraction-cache.ts`, testes · Verificação: `bun run --cwd packages/db test:integration`
- [x] 2.3 `startOrderAnalysis`, `finishOrderAnalysis`, `recordAiCallList` com integração · Arquivos: `packages/db/src/order/analysis.ts`, testes · Verificação: `bun run --cwd packages/db test:integration`
- [x] 2.4 `completeWithin` no `workJob` com integração · Arquivos: `packages/db/src/queue/work.ts`, testes · Verificação: `bun run --cwd packages/db test:integration`

### M3 — worker
- [x] 3.1 Config com IA e storage, boot e `buildJobHandlerMap` · Arquivos: `apps/worker/src/{config.ts,index.ts,jobs/index.ts}`, testes · Verificação: `bun run --cwd apps/worker test`
- [x] 3.2 Handler `order.analyze`, adaptador do cache e `onExhausted`, com integração · Arquivos: `apps/worker/src/jobs/order-analyze.ts`, testes · Verificação: `bun run --cwd apps/worker test`, `bun run --cwd apps/worker test:integration`

### M4 — api
- [x] 4.1 Troca limpa a análise e as notas em `draft` e `preview_ready` · Arquivos: `apps/api/src/services/orders.ts`, testes · Verificação: `bun run --cwd apps/api test:integration`
- [x] 4.2 View com `isUsable`, `photoIssueList`, `analysisFailure` e campos da prévia · Arquivos: `apps/api/src/services/orders.ts`, testes · Verificação: `bun run --cwd apps/api test:integration`

### M5 — visto funcionando e fechamento
- [x] 5.1 Suíte: `bun run lint`, `bun run typecheck`, `bun run test`, integração dos workspaces tocados, `bun run build`
- [x] 5.2 RF-12 com api, worker, Postgres, MinIO e IA real
- [x] 5.3 Docs: `jobs.md`, `api.md`, `data-model.md`, `state-machine.md`, ADR-0013 e linha no `docs/README.md`
- [x] 5.4 Revisão neutra e `review.md`

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-22 | Tamanho L em vez de M | Cruza cinco workspaces e decide o banco do cache e do resultado (Objetivo) |
| 2026-10-22 | Resultado em `order.analysis` (jsonb) e cache em `extraction_cache` | Plano |
| 2026-10-22 | `completeWithin` na fila, em vez de reenfileirar na api | Fecha a janela da corrida sem mexer no unique do singleton, que os periódicos também usam (Plano) |
| 2026-10-22 | Falha não retryable da análise completa o job e deixa `analysis_unavailable` | Plano |
| 2026-10-22 | Purga do cache entregue como função; quem agenda é a F2-06 | O `retention.purge` é da F2-06 e ainda não tem handler |
| 2026-10-22 | Revisão da spec aprovada na rodada 1, sem CRÍTICO; os 4 ALERTAs e as sugestões foram incorporados | `analysis_unavailable` e `skip` com `completeWithin`; RF-12 com duas fotos; retenção da análise; desfechos do fim definidos; releitura do job no `workJob`; ordem das travas; notas limpas na troca |

## Status
- **Fase:** concluída na branch. A revisão neutra reprovou a rodada 1 com 1 CRÍTICO: os testes da corrida passavam sem o `completeWithin`. Ele foi corrigido em `efbdea5`, e a correção foi provada por mutação. A rodada 2 aprovou. Falta o merge do humano.
- **Suíte:** lint, typecheck, unit dos 6 workspaces, integração (db 161, worker 54, api 38, integrations 6) e build verdes.
- **RF-12 (visto funcionando, 22/10/2026):** api, worker, Postgres e MinIO no ar, com a IA real (`claude-haiku-5-5`, prompt `extract-v1`):
  - `POST /orders` com as duas fotos sintéticas levou a `preview_ready` em cerca de 6 s, com `ma5-equivalent-fractions`, `ma5-decimal-numbers`, `ma5-comparing-rationals` (`high`) e `ma5-addition-subtraction` (`medium`);
  - a troca da segunda foto por uma variação voltou a `draft` com a análise limpa e chegou a `preview_ready` em 7,6 s, com uma chamada nova só para a foto trocada (acerto de cache na primeira);
  - foram 3 linhas de `ai_call` com o `order_id`, US$ 0,0026 na primeira análise e US$ 0,0008 na segunda;
  - os dois jobs terminaram `completed` na 1ª tentativa, e os logs não trouxeram texto do material;
  - os dados do teste foram apagados do banco de dev e do MinIO depois.
- **Para a F2-06:**
  - agendar `purgeExpiredExtractionCache`;
  - limpar `order.analysis` junto com as fotos, e `material_profile` nos pedidos que não chegaram a `awaiting_payment` (`data-model.md` §5).
- **Para a F2-09:**
  - definir com o humano o texto de `analysis_unavailable`, que falta no design doc §5.2 e §6.8;
  - em `draft`, `analysisFailure: null` quer dizer "carregando".
- **Para a F2-13:** o alerta de falha do provedor de IA precisa ler `ai_call.outcome_code` e o log `error` "análise indisponível", porque esse job termina `completed` (ADR-0013).
- **Pendências do humano:** nenhuma para o merge. O `.env.example` não ganhou chave nova: o worker passa a exigir `AI_*` e `R2_*`, que já existem para o CLI e para a api.
