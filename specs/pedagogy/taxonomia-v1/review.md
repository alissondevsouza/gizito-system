---
feature: F1-01 taxonomia-v1
module: pedagogy
round: 1
verdict: APROVADO
updated: 2026-10-19
---

# Review: F1-01 taxonomia-v1

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun test` em `packages/core` (revisor) | 330 pass, 0 fail, 2084 expect, cobertura 100% em `pedagogy/taxonomy/` |
| `bunx turbo --version` (revisor) | 2.11.8, aceita `$TURBO_ROOT$` no `inputs` de `@gizito/core#test` |
| Mutação numa cópia do core (revisor) | não rodou (permissão negada); força dos testes avaliada pela leitura |
| `bun run lint` / `bun run typecheck` / `bun run test` (orquestrador) | limpo / 6 tarefas verdes / verde |
| `bun run taxonomy:doc` (orquestrador) | gera `docs/pedagogy/taxonomia.md` igual ao commitado |
| Rótulo alterado em `5-math.ts` (orquestrador) | teste de versão falha; revertido |
| Linha acrescentada ao documento (orquestrador) | `bun run test --filter=@gizito/core` dá cache miss e falha na sincronia |
| Depois das correções: lint, typecheck, `bun run test`, `bun test` no core (orquestrador) | limpo, verde, 331 pass, cobertura 100% |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `__tests__/pedagogy/taxonomy/schemas.test.ts` (todos os inválidos do aceite, repetição nas 3 listas, campo extra) |
| RF-02 | sim | `schemas.test.ts` (descrição e disciplina por regra); `content.test.ts` (tabela slug → regra sobre os 179 assuntos e LP fora da gramática → `text_evidence`) |
| RF-03 | sim | `bncc.test.ts` (primeiro e último código de cada faixa e os exemplos do aceite); as 12 faixas conferem com a BNCC |
| RF-04 | sim | `integrity.test.ts` (uma fixture por código, 11 códigos, dispara só aquele código) |
| RF-05 | sim | `content.test.ts`: integridade vazia, 22/20/25/23 assuntos em Matemática e 24/23/22/20 em LP, schema verde para os 179 |
| RF-06 | sim | `lookup.test.ts` (outro ano, outra disciplina, descontinuado, inexistente); `content.test.ts` (ordem de cada seção igual à do arquivo) |
| RF-07 | sim | `version.test.ts` (fingerprint, última versão, ids atuais registrados, versões e fingerprints distintos, ids publicados não somem) |
| RF-08 | sim | `markdown.test.ts` (sincronia byte a byte); `turbo.json` com o documento no `inputs` |
| RF-09 | sim | `index.test.ts`; `docs/README.md`, `docs/progress/core.md`, roadmap (F1-01 em andamento) e `known-issues.md` |

### Achados
- [ALERTA] `packages/core/src/pedagogy/taxonomy/7-math.ts:116` — `ma7-cartesian-symmetry` entrou, mas o RF-05 diz que simetria fica fora da v1. A exclusão foi estreitada sem registro nas Decisões — registrar ou remover.
- [ALERTA] `packages/core/src/pedagogy/taxonomy/5-portuguese.ts:54` — `lp5-conjunctions` sem `single_normative_answer`, e o padrão do teste foi ajustado ao conteúdo. "mas" e "porém" valem na mesma lacuna — acrescentar a regra e `conjunctions` ao padrão.
- [ALERTA] `4-math.ts:127,152,169`, `ma5-solids`, `ma6-angles`, `ma7-circle` — descrições pedem figura ("contando quadradinhos", "planificações", medida com transferidor). A descrição vai para a geração e leva ao bloqueador `figure_free_statement` depois do Pix — reescrever em termos só de texto.
- [ALERTA] `packages/core/src/pedagogy/taxonomy/markdown.ts:73` — "até três" fixo, embora exista `MAX_TOPIC_COUNT` — interpolar.
- [SUGESTÃO] `version.test.ts:19` — não confere que o `topicIdList` da versão atual é igual aos ids atuais nem impede reescrever o fingerprint da mesma versão.
- [SUGESTÃO] `content.test.ts:155` — a ordem do arquivo só é conferida pelo primeiro item.
- [SUGESTÃO] `markdown.ts:66` — a assinatura difere do RF-08 (objeto com `exclusionList`); ajustar a spec.
- [SUGESTÃO] `6-math.ts:30` — `ma6-powers-roots` cita EF06MA03, que não trata de potenciação, e raiz quadrada é do 8º ano na BNCC (EF08MA02).

O revisor conferiu os 179 códigos BNCC um a um contra o assunto: só `ma6-powers-roots` não batia.

### Regressão pedagógica
Pendente: `bun run test:pedagogy` só existe a partir da F1-10. Registrado em `docs/engineering/known-issues.md` (MEDIUM) com a condição "na F1-10, rodar `bun run test:pedagogy` com `tax-v1`". Liberar a `main` com essa exceção à invariante 11 é decisão do humano.

### Resposta do orquestrador
Todos os achados aplicados. A `tax-v1` ainda não foi publicada na `main`, então o conteúdo mudou dentro da própria v1, com fingerprint e lista de ids regenerados:
- Simetria: `ma7-cartesian-symmetry` mantido (o simétrico por coordenadas se resolve em texto); decisão na spec, e a exclusão no documento diz "a simetria por coordenadas do 7º ano entra".
- `lp5-conjunctions` ganhou `single_normative_answer`; `conjunctions` entrou no padrão de gramática do teste.
- Descrições de `ma4-area-units`, `ma4-location-movement`, `ma4-prisms-pyramids`, `ma5-solids`, `ma6-angles` e `ma7-circle` reescritas sem malha, planificação ou instrumento.
- `MAX_TOPIC_COUNT` interpolado no documento.
- `version.test.ts` confere os ids da versão atual e exige versões e fingerprints distintos; `content.test.ts` compara cada seção com o seu arquivo; RF-08 da spec ajustado.
- `ma6-powers-roots` virou `ma6-powers` ("Potenciação", EF06MA11 e EF06MA12), sem raiz quadrada. O id pôde mudar porque nunca foi publicado. Fica como ponto para o professor, porque muitos livros do 6º ano trazem raiz quadrada exata.

Sem CRÍTICO: não há segunda rodada.
