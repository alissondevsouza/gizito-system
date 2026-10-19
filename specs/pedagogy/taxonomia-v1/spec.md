---
feature: F1-01 taxonomia-v1
module: pedagogy
size: L
status: done
branch: feat/pedagogy/taxonomia-v1
updated: 2026-10-19
---

# F1-01 taxonomia-v1

## Objetivo
Criar a lista canônica de assuntos por ano × disciplina (4º a 7º × Matemática e Língua Portuguesa) em `packages/core`, versionada, que a extração (F1-06) usa para mapear o caderno, a tela de assuntos (F2-09) mostra como chips, a geração (F1-07) e as validações (F1-03) consultam, e métricas e casos de regressão indexam. Cada assunto tem id estável, nome exibível, descrição curta, habilidades BNCC, pré-requisitos e validações aplicáveis. Fontes: roadmap §4 F1-01, PRD §7.1 (princípio 2), §7.2 (nenhuma questão depende de figura ausente), §7.3, §7.7, rules `core.md` e `ai-pipeline.md`.

## Requisitos e critérios de aceite
- **RF-01** — Formato do assunto em `pedagogy/taxonomy/schemas.ts`: `topicDefinitionSchema` = `{ topicId, label, description, bnccSkillList, prerequisiteList, validationRuleList, deprecated? }` e `topicSchema` = definição + `grade` + `subject`. `topicId` segue `{ma|lp}{ano}-{slug}` em inglês (ex.: `ma5-equivalent-fractions`) e passa em `topicIdSchema` do pedido; `label` pt-BR com 3 a 40 caracteres (cabe num chip no celular); `description` pt-BR com 10 a 160 caracteres; `bnccSkillList` com 1 ou mais códigos `EF{faixa}{MA|LP}{nn}`; listas sem item repetido; `deprecated` só como `true` · Aceite: fixture válida passa; id fora do padrão, rótulo de 41 caracteres, descrição vazia, `bnccSkillList` vazia, código BNCC malformado, item repetido em qualquer lista, regra desconhecida e `deprecated: false` falham.
- **RF-02** — Regras aplicáveis por assunto como enum `topicValidationRuleList` com descrição pt-BR em `topicValidationRuleDescriptionMap`: `rational_equivalence` (frações, decimais e porcentagens: gabarito simplificado, equivalentes aceitos, distratores sem equivalência escondida), `measurement_unit` (resposta com unidade e conversão conferida), `figure_free_statement` (enunciado traz em texto ou tabela todo dado de figura, plano ou gráfico), `text_evidence` (resposta sustentada por trecho do texto-base), `single_normative_answer` (uma só resposta aceita pela norma-padrão; nenhum distrator também correto), `linguistic_variety_respect` (variedade linguística não é tratada como erro). Cada regra pertence a uma disciplina (`topicValidationRuleSubjectMap`: as três primeiras a Matemática, as três últimas a LP). O enum só cresce; a implementação de cada regra é da F1-03 · Aceite: toda regra tem descrição e disciplina; teste total sobre `taxonomyTopicList` com tabela padrão de slug → regra obrigatória (`fraction|decimal|percentage|probability|rational|ratio` → `rational_equivalence`; medidas, perímetro, área, volume, tempo, temperatura, dinheiro, proporção e circunferência → `measurement_unit`; geometria, plano, coordenadas, deslocamento e gráficos → `figure_free_statement`; ortografia, acentuação, pontuação e gramática → `single_normative_answer`; todo outro assunto de LP → `text_evidence`; `linguistic-variety` → `linguistic_variety_respect`).
- **RF-03** — Habilidades BNCC por faixa em `pedagogy/taxonomy/bncc.ts`: faixas `EF04MA` (01–28), `EF05MA` (01–25), `EF06MA` (01–34), `EF07MA` (01–37), `EF15LP` (01–19, 4º e 5º), `EF35LP` (01–31, 4º e 5º), `EF04LP` (01–27), `EF05LP` (01–28), `EF69LP` (01–56, 6º e 7º), `EF67LP` (01–38, 6º e 7º), `EF06LP` (01–12), `EF07LP` (01–14); `isBnccSkillOfGrade(code, grade, subject)` · Aceite: `EF04MA28` vale para 4º Matemática; `EF04MA29`, `EF04MA00`, `EF05MA01` no 4º, `EF35LP03` no 6º e `EF06MA01` em LP são recusados.
- **RF-04** — Integridade como função pura `checkTaxonomyIntegrity(topicList) → TaxonomyIssue[]` com `code` estável: `duplicate_topic_id`, `duplicate_topic_label` (mesmo ano × disciplina), `topic_id_prefix_mismatch` (prefixo diferente de ano e disciplina do assunto), `missing_prerequisite`, `self_prerequisite`, `prerequisite_subject_mismatch`, `prerequisite_from_later_grade`, `deprecated_prerequisite` (assunto ativo depende de descontinuado), `prerequisite_cycle`, `bncc_skill_out_of_grade`, `validation_rule_subject_mismatch` (regra de outra disciplina) · Aceite: para cada código, uma fixture mínima que dispara só ele; lista vazia para fixture íntegra.
- **RF-05** — Conteúdo v1: 8 arquivos `pedagogy/taxonomy/{grade}-{subject}.ts` (`4-math.ts` … `7-portuguese.ts`), cada um com 15 a 30 assuntos derivados da BNCC e dos sumários usuais de livros didáticos, só assuntos que geram 10 + 10 questões sem figura (fora da v1: simetria, ampliação em malha, vistas e plantas, fluxogramas, oralidade, produção de vídeo e gêneros que dependem de imagem, como tirinha e cartum); pré-requisitos podem apontar para anos anteriores da mesma disciplina · Aceite: `checkTaxonomyIntegrity(taxonomyTopicList)` vazio; cada ano × disciplina com 15 a 30 assuntos ativos; todo assunto passa em `topicSchema`.
- **RF-06** — Consulta: fábrica pura `createTaxonomyLookup(topicList)` em `pedagogy/taxonomy/lookup.ts` devolvendo `listTopics(grade, subject)` (ativos, na ordem do arquivo), `findTopic(topicId)` (inclui descontinuados, porque kits antigos os citam) e `isSelectableTopic(topicId, grade, subject)` (existe, ativo, mesmo ano e disciplina); `pedagogy/taxonomy/index.ts` exporta `TAXONOMY_VERSION = "tax-v1"`, `taxonomyTopicList` (todos, com `grade` e `subject`), as três funções ligadas a ela e `taxonomyExclusionList` (áreas fora da v1, pt-BR) · Aceite: na fábrica com fixture, id de outro ano, de outra disciplina, descontinuado e inexistente não são selecionáveis e `findTopic` devolve o descontinuado; na instância real, `listTopics` devolve as seções na ordem do arquivo.
- **RF-07** — Versão e ids estáveis por teste: `__tests__/__fixtures__/taxonomy-history.ts` com `{ taxonomyVersion, fingerprint, topicIdList }` por versão publicada; o teste falha se o conteúdo mudar sem novo `TAXONOMY_VERSION` (SHA-256 do JSON de `taxonomyTopicList` serializado com chaves em ordem fixa, diferente do registrado na versão atual) e se algum id de versão publicada sumir · Aceite: o teste passa na v1; alterar um rótulo localmente faz o teste falhar (verificado à mão na implementação e registrado na review).
- **RF-08** — Documento de revisão para o professor: `renderTaxonomyMarkdown({ topicList, taxonomyVersion, exclusionList })` pura no core gera `docs/pedagogy/taxonomia.md` (por ano × disciplina: id, nome, descrição, BNCC, pré-requisitos por nome, validações; legenda das regras; `taxonomyExclusionList`; link para a BNCC oficial); `bun run taxonomy:doc` grava o arquivo · Aceite: teste compara o arquivo commitado com o render e falha se divergir; o `test` do core no turbo tem o documento como input.
- **RF-09** — Exportação e docs: `index.ts` reexporta schemas, consulta, BNCC, integridade e render; `docs/README.md` aponta `pedagogy/taxonomia.md`; `docs/progress/core.md`; roadmap F1-01 fica `[ ]` **em andamento** com "Feito até agora: implementada; falta a revisão do professor" (o "pronto quando" do roadmap exige a revisão); `known-issues.md` registra a regressão pendente com a condição "F1-10 roda `bun run test:pedagogy` com `tax-v1`" · Aceite: teste do entrypoint acessa `listTopics` e `TAXONOMY_VERSION`; `bun run lint`, `bun run typecheck` e `bun run test` verdes na raiz; cobertura do core ≥ 70%.

## Fora de escopo
- Implementar as regras de `validationRuleList` no kit (F1-03) e o mapeamento da extração (F1-06).
- Validar `topicIdList` do pedido contra a taxonomia na API (F2, `POST /orders/:token/confirm`, usando `isSelectableTopic`).
- Tratamento do assunto "outro" (já em `orderSchema`; validação extra é F1-03).
- Coluna ou tabela de taxonomia no banco: a taxonomia é código; pedido e kit guardam ids e `taxonomy_version`.
- Revisão pelo professor: pendência do humano (roadmap §1.4); a v1 sai pronta para ela, e correções viram `tax-v2`.
- `bun run test:pedagogy`: o runner é a F1-10; a regressão desta mudança fica registrada como pendência.

## Plano
- **Pesquisa no código.** `topicIdSchema` (`order/schemas.ts`) aceita `^[a-z0-9]+(?:[-_][a-z0-9]+)*$` até 64; `kit.taxonomy_version` já existe no banco e em `publishKitInputSchema`; `gradeSchema`/`subjectSchema` em `enums.ts`; `purity.test.ts` exige que `src/` importe só `zod` e `#src/*.ts` e não use `Bun.`, relógio ou IO. Testes espelham `src/` em `src/__tests__/`; `tsconfig` do core inclui só `src`.
- **Prefixo no id.** `ma4-…`/`lp6-…` dá unicidade global (pré-requisito atravessa anos, métricas indexam por id) e deixa o id legível em log e relatório. A redundância com `grade`/`subject` é conferida por `topic_id_prefix_mismatch`.
- **Arquivo por seção.** Cada arquivo exporta `readonly TopicDefinition[]` sem repetir ano e disciplina; `index.ts` monta `taxonomyTopicList` juntando a seção. `deprecated` opcional evita 170 `deprecated: false`.
- **BNCC só da própria faixa.** Um assunto do 6º não cita `EF05MA`: revisão de ano anterior entra como pré-requisito. A tabela de faixas com o último número de cada uma barra código inventado (o maior risco de conteúdo gerado). As descrições das habilidades não entram no código: o professor confere pelo código.
- **Regras por assunto, não gerais.** Contagem, cobertura, recálculo e dado pessoal valem para todo kit e são da F1-03; `validationRuleList` só marca o que o assunto acrescenta. Seis regras bastam para os 8 arquivos; a F1-02 pode acrescentar (enum só cresce).
- **Versão.** `tax-v1` muda a cada mudança de conteúdo (`tax-v2`…), nunca por ajuste de código. O fingerprint usa `node:crypto` no teste (fora de `src/`, a pureza não se aplica).
- **Documento gerado, não escrito.** O professor não lê TypeScript; o render pt-BR fica no core porque é puro e o teste de sincronia precisa importá-lo por `#src/`. Script em `packages/core/scripts/write-taxonomy-doc.ts` (IO fora de `src/`), `tsconfig` do core passa a incluir `scripts`; tarefa `taxonomy:doc` no turbo (`cache: false`) e na raiz, como `db:generate`.
- **Arquivos.** Criar: `packages/core/src/pedagogy/taxonomy/{schemas,bncc,integrity,lookup,index,markdown}.ts`, os 8 arquivos de conteúdo, `packages/core/scripts/write-taxonomy-doc.ts`, testes em `src/__tests__/pedagogy/taxonomy/`, fixture `__fixtures__/taxonomy-history.ts`, `docs/pedagogy/taxonomia.md`. Modificar: `src/index.ts`, `__tests__/index.test.ts`, `packages/core/{package.json,tsconfig.json}`, `package.json`, `turbo.json`, `docs/README.md`, `docs/progress/core.md`, `docs/product/roadmap-v1.md`, `docs/engineering/known-issues.md`.
- **Riscos.** Código BNCC certo na faixa mas errado no assunto: a integridade não pega; mitigação é a revisão do professor sobre o documento gerado. Assunto largo ou estreito demais para 20 questões: mitigação é a regressão da F1-10 e casos reais. Turbo sem a tarefa nova falha em silêncio: conferir `bun run taxonomy:doc` na raiz.

## Tasks
### M1 — Formato, BNCC, integridade e consulta
- [x] 1.1 `schemas.ts` (RF-01, RF-02) e `bncc.ts` (RF-03) com testes · Arquivos: `src/pedagogy/taxonomy/{schemas,bncc}.ts`, `__tests__/pedagogy/taxonomy/{schemas,bncc}.test.ts` · Verificação: `bun test` no core
- [x] 1.2 `integrity.ts` (RF-04) com uma fixture por código · Arquivos: `src/pedagogy/taxonomy/integrity.ts`, `__tests__/pedagogy/taxonomy/integrity.test.ts` · Verificação: `bun test`
- [x] 1.3 `lookup.ts` com teste por fixture e `index.ts` da taxonomia (RF-06), reexport em `src/index.ts` · Verificação: `bun test` + `tsc`

### M2 — Conteúdo de Matemática
- [x] 2.1 `4-math.ts`, `5-math.ts`, `6-math.ts`, `7-math.ts` · Verificação: teste de conteúdo (RF-05) para Matemática

### M3 — Conteúdo de Língua Portuguesa
- [x] 3.1 `4-portuguese.ts`, `5-portuguese.ts`, `6-portuguese.ts`, `7-portuguese.ts` · Verificação: teste de conteúdo (RF-05) completo

### M4 — Versão, documento e fechamento
- [x] 4.1 Fixture `taxonomy-history.ts` e teste de versão (RF-07); provar a falha alterando um rótulo localmente · Verificação: `bun test`
- [x] 4.2 `markdown.ts`, script, tarefas `taxonomy:doc`, `docs/pedagogy/taxonomia.md` e teste de sincronia (RF-08) · Verificação: `bun run taxonomy:doc` na raiz + `bun test`
- [x] 4.3 Rodar `bun run test:pedagogy` — não existe até a F1-10: pendência registrada em `known-issues.md` e na review
- [x] 4.4 Docs (RF-09); `bun run lint`, `bun run typecheck`, `bun run test` na raiz; revisão neutra (zona sensível: pedagogia)

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-19 | Id `{ma\|lp}{ano}-{slug-em-inglês}` | unicidade global com pré-requisito entre anos; código em inglês (CLAUDE.md); `ma`/`lp` espelham os componentes da BNCC |
| 2026-10-19 | Fora da v1 os assuntos que só funcionam com figura ou oralidade | PRD §7.2: nenhuma questão depende de figura ausente; o PDF não desenha figura. Pergunta ao humano, respondida em 2026-10-19: a prévia sinaliza esses assuntos como ainda não atendidos, sem deixar confirmá-los nem pedi-los como "outro"; o kit sai com os demais e, sem nenhum, não há checkout (PRD 1.3 §7.7, design doc 1.5 §6.3) |
| 2026-10-19 | Regras de assunto por disciplina e conferidas por padrão de slug | uma marcação esquecida desligaria a checagem da F1-03 sem aviso (revisão da spec) |
| 2026-10-19 | Consulta por fábrica `createTaxonomyLookup` | testar descontinuado sem `mock.module` (process-wide, `docs/lessons.md`) |
| 2026-10-19 | `ma7-cartesian-symmetry` (EF07MA19/20) entra; sai só a simetria desenhada em malha | o simétrico de um ponto por coordenadas se resolve em texto; a exclusão no documento diz isso (revisão neutra) |
| 2026-10-19 | `ma6-powers` só com potenciação, sem raiz quadrada | a raiz quadrada está na BNCC no 8º ano (EF08MA02) e o PRD §7.3 proíbe conceito além do ano; muitos livros do 6º a trazem, então fica como ponto para o professor (revisão neutra) |
| 2026-10-19 | `lp5-conjunctions` com `single_normative_answer` | "mas" e "porém" cabem na mesma lacuna: distrator também correto é o risco do assunto (revisão neutra) |
| 2026-10-19 | Descrições de geometria reescritas sem malha, planificação ou medição com instrumento | a descrição vai para o prompt da geração (F1-07); pedir figura levaria ao bloqueador depois do Pix (revisão neutra) |
| 2026-10-19 | `validationRuleList` com 6 regras específicas de assunto; regras gerais ficam na F1-03 | evita repetir em 170 assuntos o que vale para todo kit |
| 2026-10-19 | Documento de revisão gerado do código, com teste de sincronia | o professor revisa um documento legível que nunca diverge da taxonomia em uso |
| 2026-10-19 | Professor aprovou a `tax-v1` sem mudanças | F1-01 concluída; `ma6-powers` segue sem raiz quadrada e não há `tax-v2` |

## Status
Spec revisada (APROVADO com alertas, todos incorporados em 2026-10-19). M1 a M4 implementados e revisados (revisão neutra APROVADO, achados aplicados; `review.md`). Mesclada na `main` (`92cbec0`) pelo humano, com a exceção do `bun run test:pedagogy` registrada em known-issues (F1-10). Professor revisou e aprovou a v1 sem mudanças em 2026-10-19: F1-01 concluída. A pergunta sobre assuntos excluídos foi respondida (Decisões) e vira regra na F1-02 e na F1-06.
