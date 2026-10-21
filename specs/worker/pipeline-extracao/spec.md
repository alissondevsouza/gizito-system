---
feature: pipeline-extracao
module: worker
size: M
status: done
branch: feat/worker/pipeline-extracao
updated: 2026-10-21
---

# pipeline-extracao (F1-06)

## Objetivo
A etapa `extract` do pipeline (spec pedagógica §1, §3; `prompts-v1.md` extract v1): cada foto vai sozinha ao `AI_MODEL_EXTRACT` com o prompt `extract` v1, a saída é validada por `photoExtractionSchema`, sanitizada e guardada em cache por `content_hash`; depois a junção (`mergePhotoExtractionList`) e a decisão da prévia (`decidePreviewOutcome`) da F1-03 dão os assuntos com confiança, o perfil do material, a legibilidade por foto, os avisos (dado pessoal) e os assuntos ainda não atendidos (PRD 7.7). É o que o job `order.analyze` (F2-02) e o CLI (F1-09) vão chamar. Roadmap F1-06.

## Requisitos e critérios de aceite
- **RF-01 — prompt `extract` v1.** `apps/worker/src/pipeline/prompts/extract/v1.ts` com o texto de `prompts-v1.md` sem mudança e `EXTRACT_PROMPT_VERSION = "extract-v1"`. O builder troca os placeholders por `gradeLabelMap`, `subjectLabelMap`, `TAXONOMY_VERSION`, `MAX_TOPIC_CANDIDATE_COUNT`, `MAX_EVIDENCE_LENGTH`, `MAX_TERMINOLOGY_COUNT`, `MAX_TERM_LENGTH`, `MAX_CONTEXT_THEME_COUNT`, uma linha por assunto de `listTopics(grade, subject)` (`- {topicId} | {label} | {description}`), uma linha por área não atendida da disciplina (`- {id} | {label} | como reconhecer: {recognitionCue}`) e `z.toJSONSchema(photoExtractionSchema)`. · Aceite: o template é igual, caractere a caractere, aos blocos `text` de "## extract v1" em `prompts-v1.md` (teste lê o doc); prompt montado sem `{{`; traz todos os assuntos do ano × disciplina e nenhum de outro ano ou disciplina; não atendidos só da disciplina; o JSON do schema é parseável; o system é igual entre chamadas do mesmo ano × disciplina (cache de prompt) e o texto do usuário não carrega dado do pedido além de ano e disciplina; placeholder sem valor é erro.
- **RF-02 — uma chamada por foto, com reparo de saída.** `analyzeMaterial(photoList, { grade, subject }, deps)` chama `aiProvider.extract` uma vez por foto, com a foto em `imageList`, o `outputSchema` `photoExtractionSchema` e o `signal` do job, todas as fotos em paralelo. Saída inválida (`ai_output_invalid`, `ai_output_truncated`, `ai_refused`) faz uma nova chamada para a mesma foto (`EXTRACT_OUTPUT_RETRY_COUNT = 1`, core); persistindo, a foto entra na junção como `null` (não utilizável, `extraction_output_invalid`). `ai_image_invalid` vai direto para `null`, sem nova chamada. · Aceite: testes com o fake: uma requisição por foto, com a imagem, todas em voo ao mesmo tempo; inválida → válida dá a foto válida com 2 chamadas; inválida duas vezes dá `null` e `photos_unreadable` quando é a única; imagem inválida dá 1 chamada e `null`.
- **RF-03 — falha da etapa.** Erro transitório (`isRetryableAiFailureCode`: timeout, limite de taxa, indisponível, cancelado) devolve `Err` com `isRetryable: true`, para o retry do job (`jobs.md` §1); `ai_auth_failed` e `ai_request_invalid` devolvem `Err` com `isRetryable: false`; falha da porta do cache (consulta ou gravação) devolve `Err` `extraction_cache_failed`, retryable, com a causa para o log de `debug` e as chamadas já feitas. As fotos que já deram certo ficam no cache. · Aceite: com uma foto ok e outra em `ai_rate_limited`, `Err` retryable, a primeira no cache, e a reexecução só chama a segunda; gravação que rejeita devolve o registro da chamada paga; consulta que rejeita não chama o modelo.
- **RF-04 — cache por hash com expiração.** Chave = `content_hash` (SHA-256 hex dos bytes da foto, calculado na etapa) + ano + disciplina + `TAXONOMY_VERSION` + versão do prompt + modelo de extração. A entrada guarda a extração **já sanitizada** (`sanitizePhotoExtraction`) e os avisos internos da sanitização, com validade `photoDeleteDeadline(insertDatetime da foto)`; acerto não estende a validade; entrada vencida é ignorada e sobrescrita; falha de saída nunca entra no cache. `ExtractionCache` (`find`, `save`, assíncronos) é a porta que a F2-02 implementa no banco; `createMemoryExtractionCache` serve ao CLI e aos testes. · Aceite: mesma foto de novo → zero chamadas e mesmo resultado (inclusive `issueList`); mudar ano, disciplina, modelo, versão do prompt ou bytes → nova chamada; entrada vencida → nova chamada; `evidence` com telefone e termo com e-mail não chegam ao cache (padrões do §8.4: telefone, e-mail, CPF); candidato de outro ano não chega ao cache. Nome de pessoa ou de escola não tem padrão: depende do prompt (RF-08 e known-issues).
- **RF-05 — resultado da análise.** `Ok` com `mergedExtraction` (`mergedExtractionSchema`: assuntos com confiança e fotos, não atendidos, avisos com fotos, perfil, `legibilityScore` por foto, `issueList` com os avisos da sanitização e da junção, sem duplicar), `previewOutcome` (`decidePreviewOutcome`), `photoStatusList` (`cached` \| `extracted` \| `failed`, na ordem das fotos) e `aiCallList`. · Aceite: testes para `preview_ready`, `photos_unreadable`, `only_unsupported_topics`, `no_topic_found` com e sem `isMaterialMismatch`, `personal_data_visible` na lista de avisos, `legibilityScore` 1 / 0,5 / 0 / `null`; o resultado passa em `mergedExtractionSchema`.
- **RF-06 — custo por chamada.** Cada chamada ao provedor, de sucesso ou falha, vira um `AiCallRecord` com os campos de `ai_call` sem `order_id` (`stage`, `model`, `promptVersion`, `inputTokenCount`, `outputTokenCount`, `costCents`, `durationMs`, `outcomeCode` = `ok` ou o código `ai_*`), no `Ok` e no `Err`; acerto de cache não gera registro. · Aceite: 3 fotos com uma reparada dão 4 registros; falha transitória devolve os registros das chamadas já feitas; falha sem `usage` registra zero tokens e custo.
- **RF-07 — fake determinístico em paralelo.** `createFakeAiProvider` ganha `respondWith(stage, responder)`, usado quando a fila da etapa está vazia, para responder pelo conteúdo da requisição (a imagem); a fila continua FIFO. · Aceite: teste do fake com duas chamadas simultâneas respondidas pelo responder; suíte de contrato do fake segue verde.
- **RF-08 — visto funcionando contra o modelo real.** `bun run --cwd apps/worker test:extract-live` (lê o `.env` da raiz, custa centavos, fora do CI) roda a etapa com o provedor real em fotos sintéticas (três páginas desenhadas em HTML, com a fonte em `__fixtures__/photos/source/`, e uma de ruído gerada no teste): página de frações equivalentes do 5º ano, página em branco com ruído, página de Português com nome e escola, página com instrução para a IA e página de Português num pedido de Matemática. · Aceite: `ma5-equivalent-fractions` entre os candidatos; ruído → `photos_unreadable`; nome e escola fora de todo campo e `personal_data_visible`; `instruction_in_material`; `no_topic_found` com `isMaterialMismatch`; nenhuma linha de exercício copiada na `evidence`; custo e tokens gravados em `aiCallList`.

## Fora de escopo
- Job `order.analyze`, transições `draft → analyzing → preview_ready | draft`, persistência de `legibility_score`, do resultado juntado, do cache e de `ai_call` no banco, e expurgo do cache vencido: F2-02 (spec §3, "onde o cache e o resultado ficam no banco é decisão da F2-02").
- Normalização da foto (EXIF, formato) e cálculo do `content_hash` no upload: F2-01. A etapa recebe os bytes normalizados e recalcula o hash.
- Teto de custo por pedido (`MAX_AI_COST_CENTS_PER_ORDER`) e tratamento de falha da conta do provedor como incidente: F1-07 (known-issues).
- Os 10 casos reais do "pronto quando": dependem das fotos que o humano está coletando; o formato de caso e o runner são da F1-10. Aqui a prova contra o modelo real é com fotos sintéticas (RF-08).
- `bun run test:pedagogy`: só existe na F1-10 (known-issues, entrada da regressão).

## Plano
- **Arquivos.** Core: `constants.ts` (`EXTRACT_OUTPUT_RETRY_COUNT`), `interfaces/ai-provider.ts` (`invalidOutputAiFailureCodeList`, da revisão). Integrations: `fakes/fake-ai-provider.ts` (`respondWith`). Worker: `pipeline/prompts/template.ts` (`fillPromptTemplate`, reutilizado pela F1-07), `pipeline/prompts/extract/v1.ts`, `pipeline/ai-call.ts` (`AiCallRecord`, `toAiCallRecord`), `pipeline/extraction-cache.ts` (porta, chave, memória), `pipeline/extract.ts` (`analyzeMaterial`), testes em `src/__tests__/pipeline/`, `package.json` (`test:extract-live`, `sharp` em dev para as fotos sintéticas).
- **Paralelo.** O responsável espera a prévia; até `MAX_PHOTO_COUNT` chamadas simultâneas por pedido cortam a espera para a de uma foto. O custo extra é a escrita do cache do system em cada chamada: com o Haiku 5.5 a US$ 0,10 por milhão, menos de US$ 0,003 por prévia de 5 fotos.
- **Sanitizar antes do cache.** A entrada guarda a extração sanitizada e a `issueList` da sanitização; a junção recebe a extração sanitizada (a sanitização dela é idempotente e não acha nada) e a etapa soma as duas listas. Assim o pedido vê os mesmos avisos com ou sem acerto de cache, e o dado pessoal nunca chega ao cache.
- **Hash na etapa.** A etapa calcula o SHA-256 dos bytes em vez de confiar num hash recebido: um hash errado entregaria a outro pedido o resultado de outra foto.
- **Validade na etapa.** A etapa descarta a entrada vencida, qualquer que seja a implementação da porta; a do banco (F2-02) pode também filtrar e apagar.
- **Testes.** Unit com `FakeAiProvider` (`respondWith` pela imagem) e fotos sintéticas do sharp; o teste do prompt compara com o doc; o live (RF-08) segue o padrão do `test:ai-live`.
- **Riscos.** Saída do Haiku fora do schema com frequência gasta a nova chamada e custa uma foto ilegível ao responsável: o live mede, e a F1-10 dá a taxa. Fontes do sistema mudam a foto sintética entre máquinas: as asserções do live são estruturais.

## Tasks
### M1 — prompt e peças
- [x] 1.1 Roadmap: F1-05 `[x]` e F1-06 em andamento · Arquivos: `docs/product/roadmap-v1.md`
- [x] 1.2 `EXTRACT_OUTPUT_RETRY_COUNT` no core · Arquivos: `packages/core/src/constants.ts`, teste de constantes · Verificação: `bun test` no core
- [x] 1.3 `fillPromptTemplate` e prompt `extract` v1 com teste contra o doc · Arquivos: `apps/worker/src/pipeline/prompts/{template.ts,extract/v1.ts}`, testes · Verificação: `bun test` no worker
- [x] 1.4 `respondWith` no fake · Arquivos: `packages/integrations/src/fakes/fake-ai-provider.ts`, teste · Verificação: `bun test` em integrations

### M2 — etapa
- [x] 2.1 `AiCallRecord`, `ExtractionCache` com chave e memória · Arquivos: `apps/worker/src/pipeline/{ai-call.ts,extraction-cache.ts}`, testes
- [x] 2.2 `analyzeMaterial` (RF-02 a RF-06) · Arquivos: `apps/worker/src/pipeline/extract.ts`, testes · Verificação: `bun run lint`, `bun run typecheck`, `bun run test`

### M3 — visto funcionando e fechamento
- [x] 3.1 `test:extract-live` com fotos sintéticas, rodado contra a API · Arquivos: `apps/worker/src/__tests__/pipeline/extract-live.test.ts`, `apps/worker/package.json` · Verificação: `bun run --cwd apps/worker test:extract-live`
- [x] 3.2 `bun run test:pedagogy`: não existe até a F1-10; registrar no known-issues (entrada da regressão) que o `extract` v1 entrou sem ela
- [x] 3.3 Revisão neutra, `review.md`, roadmap "feito até agora"
- [x] 3.4 Pronto quando: 10 casos das imagens da regressão e 1 variação desfocada contra a API · Arquivos: `apps/worker/src/__tests__/pipeline/{extract-cases-live.test.ts,__fixtures__/extraction-cases.ts}`, `apps/worker/package.json` · Verificação: `bun run --cwd apps/worker test:extract-cases-live`

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-20 | `ai_output_truncated` e `ai_refused` contam como saída inválida (uma nova chamada, depois `null`); `ai_image_invalid` vai a `null` sem nova chamada | A spec §3.3 só fala de "saída inválida"; as três são saída que não serve, e a imagem que não abre não melhora com outra chamada. Para o responsável, as três dão o texto de foto ilegível |
| 2026-10-20 | `ai_auth_failed` e `ai_request_invalid` falham a etapa sem retry, em vez de marcar a foto | São problema da conta ou do código, não da foto; marcar a foto diria ao responsável para trocar uma foto boa |
| 2026-10-20 | Falha de saída não entra no cache | Uma nova tentativa com a mesma foto (outro pedido, reexecução) merece outra chamada; a spec só pede cache do resultado |
| 2026-10-20 | Chamadas em paralelo, uma por foto | Espera da prévia; custo extra desprezível com o Haiku 5.5 (Plano) |
| 2026-10-20 | Cache guarda a `issueList` da sanitização | Mesmos avisos internos com ou sem acerto (Plano) |
| 2026-10-20 | Falha da porta do cache vira `Err` `extraction_cache_failed`, retryable, com as chamadas já feitas (revisão, rodada 1) | Uma exceção perdia o custo das chamadas pagas (invariante 3); com o cache no banco, a queda que derruba a gravação derruba também a transição do job, então o retry é o caminho |
| 2026-10-20 | Fotos do live desenhadas em HTML e renderizadas uma vez pelo Chrome headless (`google-chrome --headless=new --screenshot --window-size=1000,1400`), guardadas em JPEG com a fonte HTML ao lado | O libvips do sharp não tem fontes nem a operação de texto; gerar no teste exigiria Chrome na máquina de quem roda |
| 2026-10-20 | Foto repetida no mesmo pedido não é deduplicada na etapa | O lugar é o upload (F2-01), que já tem o `content_hash`; na etapa, ela só custa uma chamada a mais e conta duas vezes na junção (known-issues) |
| 2026-10-20 | `AI_EFFORT_EXTRACT` fora da chave do cache na v1, decisão do humano | A chave do §3 não o inclui; trocar o esforço reaproveita saídas por até 30 dias (known-issues) |
| 2026-10-21 | Os casos do "pronto quando" ficam numa tabela do teste, com o SHA-256 de cada imagem e a leitura em `docs/materiais-fotograficos/` (fora do git). A foto ilegível é a página de pontuação desfocada com sigma 14 em memória | As imagens geradas por IA substituem as fotos reais (decisão do humano, PRD 1.5 §7.6). O formato `case.json` e o lugar dos casos são da F1-10, que leva estes 11 para `tests/pedagogy/cases/` e substitui o teste pelo runner. As verificações seguem os códigos do §12.3 da spec pedagógica, mais `material_copied` para a transcrição |

## Status
Pronta para o humano em 20/10/2026: M1 a M3 feitos, revisão neutra APROVADA na rodada 1 com os ALERTAs corrigidos (`review.md`), `test:extract-live` 5 de 5 na versão final. Em 21/10/2026, o "pronto quando" foi cumprido: `test:extract-cases-live` passou 11 de 11 contra a API, com 10 imagens da regressão e 1 variação desfocada (`review.md`). `AI_EFFORT_EXTRACT` fica fora da chave do cache na v1 (decisão do humano, 20/10/2026).
