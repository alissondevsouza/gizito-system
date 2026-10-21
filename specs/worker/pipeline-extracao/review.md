---
feature: pipeline-extracao
module: worker
round: 1
verdict: APROVADO
updated: 2026-10-20
---

# Review: pipeline-extracao (F1-06)

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint` | limpo (261 arquivos; 265 depois da correção) |
| `bun run typecheck` | 6 de 6 tasks |
| `bun run test` | core 710, integrations 349, worker 72, db 98, api 25, 0 fail; depois da correção: core 720, worker 75 |
| `bun run --cwd apps/worker test:integration` | 17 pass, 0 fail (antes e depois da correção) |
| `bun run --cwd apps/worker test:extract-live` | 5 de 5 contra a API (Haiku 5.5), antes e depois da correção; US$ 0,0004 a 0,0015 por foto, 3 a 5,5 s por chamada |
| metadados das três JPG de fixture (verifier, sharp) | 1000×1400, sem EXIF, ICC, XMP ou IPTC; páginas sintéticas |
| `bun run test:pedagogy` | não existe até a F1-10 (known-issues) |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `src/__tests__/pipeline/prompts/extract-v1.test.ts` (template igual ao doc, 8 pares sem `{{`, listas, schema, system estável), `template.test.ts` |
| RF-02 | sim | `extract.test.ts`, "chamada por foto" (com o teste de paralelismo da correção) |
| RF-03 | sim | `extract.test.ts`, "falha da etapa" e "falha do cache" |
| RF-04 | sim, com o critério corrigido | `extract.test.ts`, "cache por hash"; `extraction-cache.test.ts` |
| RF-05 | sim | `extract.test.ts`, "resultado" |
| RF-06 | sim | `extract.test.ts`, "custo por chamada" e "falha da etapa"; `ai-call.test.ts` |
| RF-07 | sim | `packages/integrations/src/__tests__/ai/fake-ai-provider.test.ts`; contrato do fake verde |
| RF-08 | sim | `extract-live.test.ts`, 5 de 5 contra a API |

### Achados
- [ALERTA] `apps/worker/src/pipeline/extract.ts:123,138-144` — exceção da porta do cache fazia `analyzeMaterial` rejeitar e perder o `aiCallList` das chamadas pagas (invariante 3); a reexecução pagaria tudo de novo — converter em `Err` com as chamadas ou tratar o `save` como melhor esforço; teste com `save` que rejeita.
- [ALERTA] `apps/worker/src/__tests__/pipeline/extract.test.ts:280` — o critério do RF-04 fala em "termo com nome de escola", mas o teste usa um e-mail; `sanitizePhotoExtraction` só reconhece telefone, e-mail e CPF, e um nome de escola vindo do modelo chega ao cache — corrigir o critério e registrar no known-issues que nome depende do prompt, a medir na F1-10.
- [SUGESTÃO] `apps/worker/src/pipeline/extract.ts:157-159` — nenhum teste falha se as chamadas virarem sequenciais — contar chamadas em voo.
- [SUGESTÃO] `apps/worker/src/pipeline/extract.ts:61-65` — `invalidOutputCodeList` é classificação de `AiFailureCode`, irmã de `retryableAiFailureCodeList` no core; a F1-07 vai precisar — mover para o core.
- [SUGESTÃO] `apps/worker/src/pipeline/extract.ts:92-100` — duas fotos com os mesmos bytes no pedido pagam duas chamadas e contam duas vezes na junção; avaliar também `AI_EFFORT_EXTRACT` na chave (decisão do humano).
- [SUGESTÃO] `apps/worker/src/__tests__/pipeline/extract-live.test.ts:10-18` — o RF-08 dizia "geradas no teste", mas três páginas foram commitadas como JPG sem o gerador — registrar a decisão ou commitar a fonte.

### Regressão pedagógica
Não aplicável ainda: o prompt `extract` v1 entrou e `bun run test:pedagogy` só existe a partir da F1-10. A pendência está no known-issues (entrada da regressão, agora com o `extract` v1 e os 10 casos reais).

### Resposta do orquestrador
- ALERTA 1, corrigido: consulta ou gravação do cache que rejeita devolve `Err` `extraction_cache_failed`, retryable, com a causa (para o log de `debug` do job) e as chamadas já feitas. Escolhi o `Err` em vez do melhor esforço porque, com o cache no banco (F2-02), a queda que derruba a gravação derruba também a transição do job. Testes: gravação que rejeita devolve o registro da chamada paga; consulta que rejeita não chama o modelo.
- ALERTA 2, corrigido: critério do RF-04 reescrito (padrões do §8.4) e nome do teste ajustado; known-issues MEDIUM com a condição da F1-10. Uma regra nova de nome na sanitização mudaria a spec pedagógica aprovada, então fica para o humano.
- SUGESTÃO paralelismo, feita: teste com o provedor embrulhado conta 3 chamadas em voo para 3 fotos.
- SUGESTÃO core, feita: `invalidOutputAiFailureCodeList` e `isInvalidOutputAiFailureCode` em `packages/core/src/interfaces/ai-provider.ts`, com teste; o fake passou a usar a mesma lista.
- SUGESTÃO foto repetida, adiada: o lugar é o upload da F2-01, que já tem o `content_hash` (known-issues LOW). `AI_EFFORT_EXTRACT` fica fora da chave na v1, por decisão do humano em 20/10/2026 (known-issues LOW).
- SUGESTÃO fixtures, feita: fonte HTML e CSS das três páginas em `apps/worker/src/__tests__/pipeline/__fixtures__/photos/source/` e o comando do Chrome headless nas Decisões da spec.
- Sem CRÍTICO: pelo fluxo, não há rodada 2 de verifier.

## Pronto quando: casos das imagens da regressão (21/10/2026)

Os casos usam as imagens de caderno geradas por IA, que substituem as fotos reais por decisão do humano (PRD 1.5 §7.6). São 10 imagens de `docs/materiais-fotograficos/` e 1 variação desfocada.

Os assuntos esperados foram definidos pelo orquestrador ao ver cada imagem. Não houve verificador neutro nesta rodada.

Comando: `bun run --cwd apps/worker test:extract-cases-live`, com o modelo de `AI_MODEL_EXTRACT` (Haiku 5.5). Resultado: 11 de 11, 72,6 s.

| Caso | Prévia | Candidatos (todos `high`) | Não atendido | Chamadas | Custo (¢ US$) |
|---|---|---|---|---|---|
| `4-math-adicao-subtracao-cortada` | `preview_ready` | 1, obrigatório | — | 1 | 0,120 |
| `4-portuguese-pontuacao` | `preview_ready` | 1, obrigatório | — | 1 | 0,147 |
| `4-portuguese-producao-textual` | `only_unsupported_topics` | 0 | `lp-essay-writing` | 1 | 0,052 |
| `5-math-divisao-cortada` | `preview_ready` | 1, obrigatório | — | 1 | 0,118 |
| `5-math-fracoes-decimais-perimetro` | `preview_ready` | 5: 3 obrigatórios, 2 aceitáveis | — | 1 | 0,117 |
| `5-portuguese-interpretacao-e-redacao` | `preview_ready` | 1, obrigatório | `lp-essay-writing` | 1 | 0,166 |
| `6-math-angulos` | `preview_ready` | 1, obrigatório | — | 1 | 0,152 |
| `6-portuguese-substantivos` | `preview_ready` | 1, obrigatório | — | 1 | 0,139 |
| `7-math-inteiros-e-fracoes` | `preview_ready` | 4: 2 obrigatórios, 2 aceitáveis | — | 1 | 0,181 |
| `7-portuguese-figuras-de-linguagem` | `preview_ready` | 1, obrigatório | — | 2 (`ai_output_invalid`, depois `ok`) | 0,219 |
| `4-portuguese-pontuacao-desfocada` | `photos_unreadable` | 0 | — | 1 | 0,054 |

Resultado das verificações:
- Nenhum `material_copied`: nenhum trecho do material aparece na evidência nem no perfil gravados no cache.
- Nenhum aviso de fonte.
- Nenhuma issue da sanitização.

Custo e tempo: de US$ 0,0005 a 0,0022 por foto, com 6,6 mil a 8,7 mil tokens de entrada, e de 3,4 a 8,4 s por chamada. As chamadas mais baratas leram o system do cache do provedor. Uma prévia de 5 fotos sai abaixo de R$ 0,10.

Observações para a F1-10:
- **Saída inválida:** 1 das 12 chamadas voltou `ai_output_invalid`, e a nova chamada resolveu. O motivo não aparece no `AiFailure`. Vale medir a taxa nos 35 casos.
- **Corte das fatias:** as imagens cortadas saíram `good`; só uma recebeu `cropped`.
