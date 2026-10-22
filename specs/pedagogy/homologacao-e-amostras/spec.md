---
feature: F1-11 homologacao-e-amostras
module: pedagogy
size: P
status: in_progress
branch: feat/pedagogy/homologacao-e-amostras
updated: 2026-10-21
---

# F1-11 homologacao-e-amostras

## Objetivo

Fechar a homologação da F1 (PRD §7.6, spec pedagógica §13.3, roadmap F1-11) com três entregas:
- os dois kits de amostra da landing (Matemática e Português), gerados pelo próprio pipeline e marcados como “amostra” (design doc 6.1);
- o pacote da auditoria do professor, com 10 kits e uma planilha pela rubrica do §13.3;
- o custo por prévia e por kit, e o tempo de geração, registrados no PRD §3.

A F1-11 fica pronta quando o professor devolver a auditoria sem erro crítico (critério de lançamento do PRD §7.6).

## Requisitos e critérios de aceite

- **RF-01** — O render aceita `isSample` em `KitRenderRequest`. Com `true`, a capa dos dois arquivos traz o selo “Kit de amostra” com uma frase curta de origem, e o rodapé vira “Atividades · Kit de amostra” e “Gabarito · Kit de amostra”. O comando `render:kit` ganha `--sample`. · Aceite: teste de template com `isSample` verdadeiro e falso. Sem a flag, o HTML não muda, e o snapshot estrutural atual continua passando.
- **RF-02** — Dois kits de amostra `ready`, gerados por `bun run pipeline` com a confirmação padrão e renderizados de novo com `--sample`, versionados em `docs/pedagogy/amostras/{matematica,portugues}/` (`atividades.pdf`, `gabarito.pdf`, `study_kit.json`). · Aceite: os arquivos estão no git, as páginas ficam dentro das faixas da `pdf-render.md`, e o selo aparece nos dois PDFs.
- **RF-03** — Pacote da auditoria em `tests/pedagogy/output/homologacao/pacote-professor/`, fora do git, com 10 kits:
  - 8 sorteados, 1 por ano × disciplina, entre os `ready` da rodada final juntada; a célula do 7º ano de Português vem do único kit `ready` dela em todas as rodadas, o da rodada 2 (Decisões);
  - os 2 kits de amostra.

  Cada kit tem os dois PDFs e um rótulo neutro (`Kit 01`…`Kit 10`). A planilha `.xlsx` tem uma linha por seção de revisão, texto-base, `e1`–`e2`, `p1`–`p10` e `m1`–`m10`, mais uma linha geral por kit, e o defeito é escolhido numa lista com os 14 códigos do §13.3. · Aceite: 10 pastas, cada uma com os dois PDFs; a planilha tem todas as linhas de cada `study_kit.json`; o sorteio está registrado em `docs/pedagogy/homologacao/2026-10-21-auditoria-do-professor.md`, com rótulo, caso e rodada.
- **RF-04** — O PRD §3 registra o custo-alvo e o valor medido da prévia e do kit, e o tempo de geração medido contra o alvo; o PRD sobe para 1.6 com uma entrada no histórico. · Aceite: os números batem com o relatório `docs/pedagogy/regressao/2026-10-21-extract-v1+plan-v1+generate-v2+review-v2.md`.
- **RF-05** — Resultado da auditoria: a planilha devolvida pelo professor é resumida no documento da auditoria, com a contagem por classe e por código, só com ids e códigos. Com zero crítico, a F1-11 é marcada como concluída no roadmap. Cada crítico é corrigido e vira caso com a tag `regression` (PRD §7.6). · Aceite: o documento tem as contagens, e os críticos, se houver, têm um caso novo.

## Fora de escopo

- Servir as amostras na landing; isso é da F2 (landing com kit de amostra).
- Corrigir os 2 críticos residuais da F1-10 (dívida HIGH em `known-issues.md`). A rerodada do 7º ano de Português só fornece kit para a auditoria.
- Mudar prompt, modelo, taxonomia ou validador. Se a auditoria achar crítico que exija isso, a correção vira feature própria, com `bun run test:pedagogy`.
- Ferramenta reutilizável de auditoria semanal (F3). O sorteio e a planilha usam um script avulso fora do repositório.

## Plano

- Marca de amostra: `isSample` em `KitRenderRequest` (opcional, padrão `false`) e em `KitTemplateContext` (obrigatório). Um helper `sampleMarkHtml` em `common.ts` vale para as duas capas, e um helper de rótulo do rodapé vale para os dois arquivos. Não há marca-d'água, para economizar impressão (design doc §9). Arquivos: `render-kit.ts`, `templates/kit-v1/{common,activities,answer-key,styles}.ts`, `scripts/render-kit.ts` e `__tests__/render/templates.test.ts`.
- Entradas das amostras: `5-matematica-fracoes-decimais-e-perimetro.png` (frações, decimais e perímetro, que mostram o KaTeX) e `5-portugues-classes-de-palavras.png` (`lp5-word-classes`, aprovado pelo professor). As duas imagens estão em tamanho cheio e não fazem parte do sorteio.
- Sorteio determinístico: em cada célula, a lista dos `ready` em ordem alfabética do id; o índice sorteado é `uint32(sha256("f1-11|<ano>-<disciplina>")[0..4]) mod n`. Qualquer pessoa reproduz o resultado com os mesmos dados.
- Planilha: abas “Instruções”, “Revisão” e “Rubrica”. Na aba “Revisão”, a coluna “Defeito” é uma lista suspensa em português, e a classe e o código saem por fórmula a partir da aba “Rubrica”. Os rótulos “Onde” seguem o PDF: “Revisão: título”, “Texto: título”, “Exemplo n”, “Fixação n” e “Simulado n”.
- Risco: o 7º ano de Português pode falhar de novo na rerodada (2 de 2 falharam na rodada final). Se nenhum kit sair `ready`, o ponto é escalado ao humano, sem forçar a geração. Foi o que aconteceu (Decisões).

## Tasks

### M1 — Marca de amostra no render
- [x] 1.1 `isSample` no request e no contexto, selo na capa, rótulo no rodapé, `--sample` no `render:kit` · Arquivos: `apps/worker/src/render/**`, `apps/worker/scripts/render-kit.ts` · Verificação: `bun test` no worker, lint e typecheck
- [x] 1.2 Design doc §9 com a marca de amostra, versão 1.8

### M2 — Kits de amostra
- [x] 2.1 `bun run pipeline` de Matemática e de Português do 5º ano, os dois `ready`
- [x] 2.2 `render:kit --sample` dos dois e cópia para `docs/pedagogy/amostras/`

### M3 — Pacote da auditoria
- [x] 3.1 Rerodada de `7-portuguese-carta-cortada` e `7-portuguese-figuras-de-linguagem` pelo `test:pedagogy`
- [x] 3.2 Sorteio, as 10 pastas e a planilha
- [x] 3.3 Documento da auditoria com o sorteio e o estado

### M4 — Métricas no PRD
- [x] 4.1 PRD §3 e histórico 1.6

### M5 — Resultado da auditoria (depende do professor)
- [ ] 5.1 Resumo da planilha devolvida e, se houver crítico, a correção e o caso novo
- [ ] 5.2 F1-11 marcada no roadmap

## Decisões

| Data | Decisão | Justificativa |
|---|---|---|
| 21/10/2026 | “Marcado como amostra” = selo “Kit de amostra” na capa dos dois PDFs, com a frase de origem, e no rodapé; sem marca-d'água | Detalha o design doc 6.1 sem divergir; marca-d'água gasta tinta (design doc §9) |
| 21/10/2026 | Amostras de Matemática e de Português do 5º ano, nas imagens de frações, decimais e perímetro e de classes de palavras | Ano do meio da faixa; fotos em tamanho cheio; o assunto de Português foi aprovado pelo professor; frações mostram o KaTeX. O humano pode trocar ao ver os PDFs (cerca de US$ 0,40 por kit) |
| 21/10/2026 | A célula do 7º ano de Português vem de uma rerodada dos seus 2 casos pelo `test:pedagogy` | A rodada final juntada não tem kit `ready` nessa célula, e o §13.3 pede 1 kit por ano × disciplina |
| 21/10/2026 | A rerodada falhou de novo (`ai_output_invalid` e recusa na prévia). Decisão do humano: auditar o único kit `ready` do 7º ano de Português, o da rodada 2 (prompts v2, tax-v2, esforço `medium`), e registrar a taxa de falha da célula (1 em 7) na dívida HIGH, com a proposta de corrigir antes do piloto | Não gasta mais e o pacote vai ao professor hoje; o conteúdo vem dos mesmos prompts |
| 21/10/2026 | Kits com rótulo neutro para o professor; a relação entre rótulo e caso fica só no documento da auditoria | O id do caso revela a intenção do teste (por exemplo, `dado-pessoal`) e enviesa a leitura |

## Status

M1 a M4 concluídos. O pacote está em `tests/pedagogy/output/homologacao/pacote-professor.zip`. Próximo passo: revisão neutra do diff. Depois, o humano envia o pacote ao professor, e M5 espera a planilha devolvida.
