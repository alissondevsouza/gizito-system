---
feature: cli-do-pipeline
module: worker
round: 1
verdict: APROVADO
updated: 2026-10-21
---

# Review: cli-do-pipeline

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint` | 317 arquivos, sem achados |
| `bun run typecheck` | 6 de 6 tarefas verdes |
| `bun run test` | verde; worker 270, core 729, integrations 371, db 98, api 25 |
| `bun run test:integration` (apps/worker, pelo verifier) | 36 pass, 0 fail |
| `bun run pipeline` sem argumentos | erros + uso, saída 2 |
| `bun run pipeline ... --topics ma7-integers --other "fluxogramas"` | `other_topic_unsupported` e `topic_not_selectable`, saída 2 |
| `bun run pipeline --photos nao-existe.png --grade 5 --subject math` | "foto não encontrada", saída 2 |
| CLI sem variáveis de IA (pelo verifier, `env -i`) | só os nomes das variáveis, saída 2 |
| `bun run pipeline --photos docs/materiais-fotograficos/5-matematica-fracoes-decimais-e-perimetro.png --grade 5 --subject math` | kit pronto, saída 0, US$ 0,37, 3 min 19 s, 11 + 5 páginas, primeira tentativa |
| `bun run pipeline --photos docs/materiais-fotograficos/6-portugues-sujeito-e-predicado.png --grade 6 --subject portuguese --difficulty basic` | kit pronto, saída 0, US$ 0,41, 3 min 42 s, 10 + 4 páginas, primeira tentativa |
| `summary.json` das duas execuções (pelo verifier, `jq`) | só ids, enums, códigos, modelos e versões |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `apps/worker/src/__tests__/cli/pipeline-input.test.ts` (aceita o comando) |
| RF-02 | sim | `pipeline-input.test.ts` (uma recusa por caso); a chave de IA ganhou teste unit na correção |
| RF-03 | sim | `apps/worker/src/__tests__/pipeline/run-pipeline.test.ts` (caminho feliz) |
| RF-04 | sim | `run-pipeline.test.ts` (análise, prévia, confirmação, render); a parada na geração com último kit ganhou teste na correção |
| RF-05 | sim | `run-pipeline.test.ts` (`confirmTopicRefList`) e `pipeline-report.test.ts` (candidatos no terminal) |
| RF-06 | sim | `run-pipeline.test.ts` (sinal por etapa-job, abortado); o timeout padrão ganhou teste na correção |
| RF-07 | sim | `run-pipeline.test.ts` (teto igual ao custo da extração) |
| RF-08 | sim | `apps/worker/src/__tests__/cli/pipeline-report.test.ts` (sentinelas fora da saída); `summary.json` reais limpos |
| RF-09 | sim, falta o humano abrir os PDFs | `tests/pedagogy/output/pipeline/f1-09-live-{math,portuguese}/` (fora do git) |

### Achados
- [ALERTA] `apps/worker/scripts/pipeline.ts:69-73` — a recusa por chave de IA ausente mora no script e não tem teste unit; o RF-02 pede um teste por recusa — levar para função pura e testar
- [ALERTA] `apps/worker/src/__tests__/pipeline/run-pipeline.test.ts:61-112` — nenhum teste de parada na geração com último kit nem conferência de que o render não rodou — acrescentar caso que bloqueia nas duas tentativas
- [ALERTA] `apps/worker/scripts/pipeline.ts:97-112` — exceção inesperada sai sem `summary.json`, e o RF-08 diz "sempre" — capturar, gravar resumo mínimo e sair com código distinto
- [ALERTA] `docs/product/roadmap-v1.md:199` — F1-09 marcada `[x]` com o nome da branch antes da revisão e da aprovação do humano — marcar `[x]` com o hash só depois da aprovação, como na F1-08
- [SUGESTÃO] `apps/worker/src/cli/pipeline-input.ts:116` — `--photos a b --photos c` vira `[a, c, b]` e caminho solto sem `--photos` é aceito — seguir a ordem dos tokens e recusar posicional antes do primeiro `--photos`
- [SUGESTÃO] `apps/worker/src/cli/pipeline-input.ts:150` — `--other a` recebe "até 80 caracteres", mas o mínimo é 2 — citar o mínimo, com constante no core
- [SUGESTÃO] `run-pipeline.test.ts:189-200` — o teste do sinal padrão passaria sem timeout — provar `JOB_MAX_RUN_SECONDS * 1000`
- [SUGESTÃO] `apps/worker/src/cli/pipeline-report.ts:239` — literal `"topic_confirmation_required"` em vez da constante
- [SUGESTÃO] `tests/pedagogy/output/pipeline/f1-09-live-math/summary.json` — a confirmação padrão (3 primeiros `high`) deixou de fora `ma5-perimeter-area`, tema da foto "frações, decimais e perímetro" — registrar para a F1-10 e a F2-09

### Regressão pedagógica
Não aplicável: a feature não muda prompt, modelo, taxonomia nem validador.

### Resposta do orquestrador
Todos os alertas e as quatro primeiras sugestões foram corrigidos. Não houve CRÍTICO, então não há rodada de revalidação.

- **Chave de IA:** `parseAiEnvironment` em `src/cli/pipeline-input.ts`, com testes da configuração válida e da recusa. A recusa traz só os nomes, com sentinelas no valor da chave e do esforço.
- **Parada na geração:** teste com bloqueador nas duas tentativas. Confere `generation_blocked`, o último kit, `render` nulo, nenhum documento renderizado e a sequência de chamadas. O teste do teto de custo também passou a conferir que o render não rodou.
- **Erro inesperado:** o script captura a exceção e grava `summary.json` com `status: "crashed"`, a etapa e o nome do erro, sem a mensagem, que pode carregar conteúdo. A saída é 3. As funções `buildPipelineCrashSummary` e `formatPipelineCrashSummary` têm teste. Não há registro das chamadas parciais nesse caminho: uma exceção fora do `Result` é defeito de programação (contrato do `generateKit`, `studyKitSchema.parse`), e o custo fica no painel do provedor.
- **Roadmap:** F1-09 volta a "em andamento", com "Feito até agora". O `[x]` e o hash do merge entram depois da aprovação dos PDFs pelo humano. A contagem da §4 foi corrigida de 7 para 8 de 11.
- **Ordem das fotos:** a lista segue os tokens, e caminho solto antes do primeiro `--photos` é recusado, com testes.
- **Mínimo do "outro":** `MIN_OTHER_TOPIC_LENGTH = 2` no core, usado pelo `otherTopicTextSchema` sem mudar o comportamento. A mensagem e o uso citam de 2 a 80 caracteres.
- **Timeout padrão:** o teste espiona `AbortSignal.timeout` e confere duas chamadas com `JOB_MAX_RUN_SECONDS * 1000`, e que toda requisição leva um desses sinais.
- **Constante:** `pipeline-report.ts` usa `TOPIC_CONFIRMATION_REQUIRED_CODE`.
- **Perímetro fora da confirmação padrão:** registrado como observação, sem mudança. A ordem dos candidatos é a relevância que a extração devolve (spec pedagógica §3.3), e a confirmação padrão segue a sugestão de chips pré-marcados para a F2-09. A F1-10 mede a extração pelos assuntos obrigatórios de cada caso, e a F2-09 decide os chips com o humano.

Depois da correção: `bun run lint` sem achados, `bun run typecheck` com 6 de 6, `bun run test` com worker 277, core 729, integrations 371, db 98, api 25, tudo verde.
