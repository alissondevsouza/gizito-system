---
feature: render-pdf
module: worker
size: M
status: in_progress
branch: feat/worker/render-pdf
updated: 2026-10-21
---

# render-pdf (F1-08)

## Objetivo
Etapa 8 do pipeline (spec pedagógica §1, §2 marcação, §7.2, §8.6): do `studyKit` validado aos dois PDFs A4, `activities.pdf` e `answer-key.pdf`, com KaTeX no servidor, Playwright com Chromium compartilhado, conferência no DOM das 20 questões, dos 2 exemplos e das 20 respostas, e contagem de páginas. O resultado é o par de PDFs ou a falha `render_failed`, depois de uma segunda tentativa. É o que o CLI (F1-09) e o job `order.generate` (F2-05) vão chamar depois do `generateKit`. Inclui a imagem do worker com Chromium. Fontes: design doc §9 e §4, PRD §6 "Saída comercial", ADR-0007, `jobs.md` §2, rule `pdf-render.md`. Roadmap F1-08.

## Contrato
`renderKit(request, deps): Promise<Result<RenderedKit, KitRenderFailure>>` em `apps/worker/src/render/render-kit.ts`.

- `request`: `studyKit` (já validado por `studyKitSchema`) e `generatedAt` (`Date`, a data de geração impressa nas capas).
- `deps`: `pdfRenderer` (`createPdfRenderer`), `retryCount` (padrão `RENDER_RETRY_COUNT`).
- `RenderedKit`: `activities` e `answerKey`, cada um `{ bytes: Uint8Array, pageCount, attemptCount }`; `warningList` (`ValidationIssue[]`, só `page_count_out_of_range`, para a F2-05 juntar ao `qualityCheckList`); `durationMs`.
- `KitRenderFailure`: `code: "render_failed"`, `issueList` (os `render_*` da última tentativa de cada arquivo que falhou, com `itemId` quando há), `durationMs`.

`createPdfRenderer({ concurrency, timeoutMs }): PdfRenderer` em `apps/worker/src/render/pdf-renderer.ts`, com `render(document)` e `close()`. `document` = `{ html, headerHtml, footerHtml, expectedItemIdList, itemAttribute }`; devolve `Result<{ bytes, pageCount }, ValidationIssue[]>`.

## Requisitos e critérios de aceite
- **RF-01 — texto do kit nunca vira HTML.** Os templates montam HTML por um `html` com tag que escapa toda interpolação (`&`, `<`, `>`, `"`, `'`), salvo o `SafeHtml` que o próprio render produz. Texto do kit passa por `kitTextHtml`: as partes fora de `\(`…`\)` (`listMathMarkupSegment` do core) entram escapadas; cada trecho de marcação vai ao `renderMathMarkup` (integrations, KaTeX `renderToString` com `output: "html"`, `throwOnError: true`, `strict: "ignore"`, `trust: false`), que antes troca a vírgula decimal entre dígitos por `{,}` (spec pedagógica §2). Delimitador sem par fica como texto escapado. Trecho que o KaTeX não analisa é falha do render (o kit já passou por `checkMathMarkup`). · Aceite: enunciado com `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `&` e aspas sai escapado, e o HTML do documento não tem `<script` nem `onerror=` vindos do kit; `\(\frac{3}{4}\)` gera fração empilhada do KaTeX (`mfrac`); `\(2,5 \times 3\)` sai igual a `2{,}5 \times 3`; `R$ 12,50` fora da marcação fica intacto; `\(` sem par aparece literal.
- **RF-02 — caderno de atividades (`kit-v1`).** Na ordem do PRD §6 e do design doc §9:
  1. capa: "Meu reforço de {disciplina}", ano, assuntos na ordem do `topicList`, data de geração (`dd/mm/aaaa`, fuso `America/Sao_Paulo`), Gizito pequeno (pose `hello`), o que tem no kit, aviso de que o gabarito está no outro arquivo e a nota de IA;
  2. revisão: por assunto, título, parágrafos e pontos-chave;
  3. exemplos: os 2, com título, enunciado, tabela, passos numerados, resposta (`formatExpectedAnswer`) e comentário;
  4. dica do Gizito: o `studyTip` com a pose `point`, única aparição do mascote fora da capa;
  5. exercícios: em página nova, os textos-base do bloco `practice` e as 10 questões numeradas de 1 a 10;
  6. mini-simulado: em página nova, cabeçalho de prova (Nome, Data, "Tempo sugerido: {mockSuggestedMinutes} minutos"), os textos-base do bloco `mock` e as 10 questões numeradas de 1 a 10, sem dica, mascote ou referência à revisão.
  Cada questão tem enunciado, tabela, alternativas `A`–`D` (Matemática escreve a alternativa a partir do `value` com `formatExpectedAnswer` e a expressão em LaTeX por `mathExpressionToLatex`; Português usa o `text`) e espaço de resposta padronizado: Matemática com espaço de cálculo e, na aberta, linha de resposta; Português aberta com linhas. Questão com texto-base indica o título do texto. O caderno não traz resposta de questão (letra certa, resposta esperada, etapas, explicação, citação).
  · Aceite: snapshot estrutural (seções, itens, títulos) das fixtures de Matemática e Português do core; capa com ano, disciplina, assuntos e data, e sem nenhum outro dado do pedido; simulado com o tempo sugerido e sem a dica; texto-base no bloco certo; nenhuma `explanation` nem `solutionStepList` de questão no HTML do caderno; alternativa de Matemática igual ao `formatExpectedAnswer` do `value`.
- **RF-03 — gabarito (`kit-v1`).** Capa curta com os mesmos identificadores, a data, o Gizito (pose `success`), o aviso "para o responsável conferir depois que a criança resolver" e a nota de IA; o gabarito em página nova, na ordem de `listAnswerKey`: "Exercícios de fixação" 1–10 e "Mini-simulado" 1–10. Cada resposta: número, letra e alternativa correta formatada (múltipla escolha) ou resposta formatada (aberta), respostas também aceitas (`acceptedList`), etapas (`solutionStepList`), explicação e, com texto-base, o trecho citado (`evidenceQuote`) com o título do texto. · Aceite: 20 respostas na ordem `p1..p10, m1..m10`; fração em KaTeX, expressão pelo `mathExpressionToLatex`, conjunto unido por "; ", número com unidade e `R$` como no §7.2; `acceptedList` e citação presentes quando existem.
- **RF-04 — layout de impressão.** A4 retrato, margens de 16 mm nas laterais, corpo 12 pt com entrelinha 1,4, títulos de 16 a 20 pt, Nunito Sans e fontes do KaTeX embutidas em `data:` (nada baixado em runtime), fundo branco e `printBackground: false` (cor só em texto e borda, tokens do design doc §4.1), cabeçalho discreto (Gizito, disciplina, ano e assuntos) e rodapé ("Atividades" ou "Gabarito" e "página X de Y") em todas as páginas, questão e exemplo sem quebra no meio (`break-inside: avoid`), tabela de largura fixa e quebra de palavra longa. Mascote em PNG reduzido a partir das poses de `docs/gizito-image/mascotes-poses/` (01 `hello`, 02 `success`, 05 `point`, roadmap §1). · Aceite: os dois PDFs de cada fixture embutem as fontes `NunitoSans` e `KaTeX_Main`; nenhuma requisição de rede sai do render.
- **RF-05 — conversão com Playwright.** `createPdfRenderer` lança o Chromium sob demanda, uma vez, e relança se ele cair; limita renders simultâneos pelo `concurrency` (`RENDER_CONCURRENCY` do config do worker, padrão 2); cada documento abre em contexto novo, sem JavaScript da página e com toda requisição de rede abortada; `setContent` → fontes prontas → conferência do DOM (RF-06) → `page.pdf({ format: "A4", printBackground: false, displayHeaderFooter: true })` → contagem de páginas com `pdf-lib`; `timeoutMs` em cada passo; `close()` fecha o browser. · Aceite: integração com Chromium real gera PDF que começa com `%PDF-`, com a contagem de páginas certa; com `concurrency: 1`, dois renders não ficam ativos ao mesmo tempo; `timeoutMs` estourado vira `render_failed`.
- **RF-06 — conferência do DOM antes do PDF.** Com a largura da área útil da página A4 e mídia `print`: cada id esperado aparece exatamente uma vez no atributo do documento (`data-kit-item` no caderno: `e1`, `e2`, `p1`..`p10`, `m1`..`m10`; `data-kit-answer` no gabarito: `p1`..`p10`, `m1`..`m10`), visível (caixa com largura e altura, sem `display: none` nem `visibility: hidden`); ausente, duplicado ou invisível é `render_item_missing` com o `itemId`; item com algum descendente além da largura útil ou cortado por `overflow` é `render_overflow` com o `itemId`. · Aceite: HTML sem `m3` dá `render_item_missing` `m3`; item com `display: none` dá `render_item_missing`; item com elemento mais largo que a página dá `render_overflow`; as fixtures reais passam sem issue.
- **RF-07 — orquestração e segunda tentativa.** `renderKit` escolhe o template pelo `formatVersion`, monta os dois documentos e renderiza cada um com até `1 + RENDER_RETRY_COUNT` tentativas (core, *nova*, 1; `jobs.md` §2); exceção do Playwright vira `render_failed`. Qualquer um dos dois falhando nas duas tentativas → `Err` `render_failed`, nunca um PDF só. Atividades fora de `ACTIVITIES_PAGE_RANGE` ou gabarito fora de `ANSWER_KEY_PAGE_RANGE` → aviso `page_count_out_of_range`, sem falhar. · Aceite: renderer que falha uma vez dá `Ok` com `attemptCount` 2; que falha duas vezes no gabarito dá `Err` `render_failed` com os issues e sem PDF; 20 páginas dá o aviso; as duas fixtures reais dão `Ok`.
- **RF-08 — imagem do worker com Chromium.** `apps/worker/Dockerfile` multi-stage sobre `oven/bun:1.3.11-slim` (Debian: o Chromium do Playwright não roda em Alpine/musl), `bun install --frozen-lockfile --production`, Chromium headless e dependências do sistema instalados no build em `PLAYWRIGHT_BROWSERS_PATH`, execução como usuário `bun`, sem `.env` nem segredo; `.dockerignore` na raiz. · Aceite: `docker build -f apps/worker/Dockerfile -t gizito-worker .` passa, e `render:kit` dentro do container gera os dois PDFs de uma fixture real com as páginas esperadas.
- **RF-09 — `render:kit`.** `bun run --cwd apps/worker render:kit <study_kit.json> <pasta>` valida o arquivo com `studyKitSchema`, renderiza e grava `activities.pdf` e `answer-key.pdf`, imprimindo páginas, tentativas, avisos e duração, nunca conteúdo do kit. · Aceite: roda com as fixtures e dentro do container.
- **RF-10 — visto funcionando (pronto quando).** Os 10 kits reais da rodada final do `test:generate-live` da F1-07 (`tests/pedagogy/output/`, fora do git) renderizam com os dois PDFs, todos os itens e nenhum overflow; páginas de cada um registradas no `review.md`; páginas convertidas em imagem e conferidas (frações empilhadas e legíveis, nada cortado). Abrir no celular e imprimir é conferência do humano no handoff. · Aceite: tabela de páginas dos 10 kits no `review.md`, com os que caírem fora da faixa.

## Fora de escopo
- Upload no R2, `publishKit`, transições, juntar o `warningList` ao `qualityCheckList`, logs da etapa, `signal` e ligar o renderer no boot e no desligamento do worker: F2-05. Nome do arquivo no download (`kit-atividades.pdf`, `kit-gabarito.pdf`): F2.
- Logotipo: o SVG do design doc §11 ainda não existe; o cabeçalho e a capa usam a palavra "Gizito" em texto, com a fonte e a cor da marca (known-issue).
- Variante "Gizito professor" na capa do gabarito (opcional no design doc §9): não há asset limpo; a capa usa a pose `success`.
- PDF marcado para acessibilidade (tags) e PDF/A.
- Imagem do worker na CI e deploy: F2-13. A CI ganha só a instalação do Chromium para o teste de integração.
- `.env.example`: a permissão do projeto bloqueia ler e editar `.env*`; a linha `RENDER_CONCURRENCY=2` fica como pendência do humano (o config tem padrão, nada quebra sem ela).
- CLI do pipeline completo: F1-09. Calibrar as faixas de páginas: F1-10, com os números medidos aqui.

## Plano
- **Pesquisa no código.** O core já dá `studyKitSchema` com `formatVersion` `kit-v1`, `listAnswerKey`, `listStudyQuestion`, `formatExpectedAnswer(answer, { formatExpression })`, `listMathMarkupSegment`, `createValidationIssue` com os quatro códigos `render_*`/`page_count_out_of_range` (estágio `render`), `ACTIVITIES_PAGE_RANGE`, `ANSWER_KEY_PAGE_RANGE`, `gradeLabelMap`, `subjectLabelMap`, `kitFileKind` e `generationFailReasonCodeList` com `render_failed`. Integrations já tem `isKatexParsable` (KaTeX 0.19) e `mathExpressionToLatex` (`Result`). As fixtures sintéticas do core (`@gizito/core/testing`) servem aos testes unitários; dois kits reais da F1-07 (Matemática com frações e três assuntos; Português com três textos-base, o maior dos dez) viram fixtures JSON do render.
- **Onde fica cada coisa.** KaTeX é adaptador: `renderMathMarkup` e `loadKatexStylesheet` (CSS do KaTeX com as fontes woff2 em `data:`) em `packages/integrations/src/katex/`. O resto em `apps/worker/src/render/`: `html.ts` (`html`, `SafeHtml`, escape), `kit-text.ts` (texto do kit e resposta formatada), `assets.ts` (fontes, CSS do KaTeX e mascotes, carregados uma vez), `templates/kit-v1/` (estilos, capa, cabeçalho e rodapé, caderno, gabarito), `templates/index.ts` (template por `formatVersion`), `pdf-renderer.ts`, `render-kit.ts`, `assets/*.png`. Script em `apps/worker/scripts/render-kit.ts`, como o `taxonomy:doc` do core.
- **Dependências.** Worker: `playwright` (1.64.1), `pdf-lib` (1.17.1, contagem de páginas), `@fontsource/nunito-sans` (woff2 latin e latin-ext, OFL). O teste rápido no scratchpad confirmou Playwright + Chromium headless sob o Bun 1.3.11 (launch, DOM e PDF em ~350 ms). Script `browser:install` (`playwright install --only-shell chromium`), porque o linker isolado do Bun deixa o binário só no workspace.
- **Página sem JavaScript.** O documento não tem script; a conferência usa `page.evaluate`, que roda fora do mundo da página. Se o `javaScriptEnabled: false` impedir o `evaluate`, a página fica com JavaScript e sem script nenhum, com a rede bloqueada; a decisão vai para a tabela.
- **Conferência na largura do papel.** O DOM é conferido com viewport da largura útil do A4 (210 mm − 2 × 16 mm) e `emulateMedia({ media: "print" })`, para o layout conferido ser o que o `page.pdf` imprime.
- **Testes.** Unitários sem browser: escape, KaTeX, vírgula, alternativas, ordem do gabarito, snapshot estrutural (via `HTMLRewriter` do Bun, só tags e atributos de estrutura e texto dos títulos), capa sem dado extra, `renderKit` com renderer falso (tentativas, falha, aviso de páginas), semáforo. Integração com Chromium real em `src/__tests__/integration/render.test.ts`: fixtures reais nos dois PDFs, fontes embutidas, frações, item ausente, invisível e overflow, timeout. A CI instala o Chromium antes do `test:integration`.
- **Riscos.** Fonte do cabeçalho e do rodapé do Playwright (documento separado, sem as fontes da página): conferir no PDF e, se faltar, embutir a fonte no próprio template do cabeçalho. Faixa de páginas: os 10 kits reais dizem se 8–14 e 3–6 se sustentam com o espaço de resposta escolhido.

## Tasks
### M1 — HTML seguro e templates
- [x] 1.1 `RENDER_RETRY_COUNT` no core · Arquivos: `packages/core/src/constants.ts` · Verificação: `bun run --cwd packages/core test`
- [x] 1.2 `renderMathMarkup` e `loadKatexStylesheet` com testes · Arquivos: `packages/integrations/src/katex/`, `src/index.ts`, testes · Verificação: `bun run --cwd packages/integrations test`
- [x] 1.3 dependências, `html.ts`, `kit-text.ts`, `assets.ts` e PNGs do mascote · Verificação: testes de escape e marcação
- [x] 1.4 templates `kit-v1` do caderno e do gabarito, registro por `formatVersion`, fixtures reais · Verificação: testes unitários e snapshot estrutural

### M2 — Playwright, conferência e orquestração
- [ ] 2.1 `pdf-renderer.ts` (browser compartilhado, semáforo, contexto isolado, conferência do DOM, PDF, páginas) e `RENDER_CONCURRENCY` no config · Verificação: integração com Chromium
- [ ] 2.2 `render-kit.ts` (template, dois documentos, segunda tentativa, aviso de páginas) · Verificação: unit com renderer falso e integração com as fixtures reais
- [ ] 2.3 script `render:kit` e `browser:install`; passo do Chromium na CI · Verificação: `render:kit` nas fixtures; `bun run lint`, `typecheck`, `test`, `test:integration`, `build`

### M3 — Imagem e visto funcionando
- [ ] 3.1 `apps/worker/Dockerfile` e `.dockerignore` · Verificação: `docker build` e `render:kit` dentro do container
- [ ] 3.2 os 10 kits reais renderizados, páginas medidas, páginas em imagem conferidas · Verificação: tabela no `review.md`
- [ ] 3.3 known-issues (logotipo em texto, imagem fora da CI) e lessons, se houver · Verificação: leitura

### M4 — Revisão neutra
- [ ] 4.1 `gizito-implement-verifier` com spec, branch e comandos; veredito no `review.md` · Verificação: sem CRÍTICO aberto

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-21 | KaTeX (`renderMathMarkup`, CSS com fontes) em `packages/integrations`; Playwright, templates e conferência em `apps/worker/src/render/` | CLAUDE.md põe o adaptador do KaTeX em integrations; ADR-0007 e a rule `pdf-render.md` põem o render no worker |
| 2026-10-21 | `html` com tag que escapa por padrão, e só `SafeHtml` do próprio render passa cru | "Nenhum texto do modelo vira HTML" (§8.6) vira propriedade do tipo, não disciplina de cada template |
| 2026-10-21 | Segunda tentativa por arquivo, para qualquer falha (exceção, item ausente, overflow) | §8.6 manda os três códigos seguirem `render_failed`, e a tentativa custa cerca de um segundo |
| 2026-10-21 | `page_count_out_of_range` volta em `warningList`, e quem publica junta ao `qualityCheckList` | o render não altera o kit; a publicação é da F2-05 |
| 2026-10-21 | Base `oven/bun:1.3.11-slim` (Debian), não Alpine | o Chromium do Playwright exige glibc; a rule pede Alpine "quando possível" |
| 2026-10-21 | Palavra "Gizito" em texto no lugar do logotipo; pose `success` na capa do gabarito | o SVG do logo e a variante professor limpa ainda não existem (design doc §11) |
| 2026-10-21 | Cada trecho de marcação renderizado em `\displaystyle` | o `\frac` inline do KaTeX sai com dígitos de ~7 pt; em `\displaystyle` a fração empilha com dígitos do tamanho do texto (pronto quando: "frações legíveis"), ao custo de linhas mais altas onde há fração |
| 2026-10-21 | `splitMathMarkup` no core, ao lado do `listMathMarkupSegment` (que passa a derivar dele), e `BRAZIL_TIME_ZONE` no core | a gramática da marcação e o fuso da data impressa ficam num lugar só |
| 2026-10-21 | `DOM` no `lib` do tsconfig do worker | a conferência roda dentro do Chromium (`page.evaluate`) e precisa dos tipos do DOM; o resto do worker não usa |
| 2026-10-21 | Nunito embutida também no cabeçalho e no rodapé (só 400 e 800) | o Chromium renderiza o cabeçalho num documento separado, sem as fontes da página, e caía no DejaVu |
| 2026-10-21 | Respostas aceitas em lista, uma por linha | unidas por "; ", respostas que terminam em ponto saíam com ".;" |
| 2026-10-21 | Nota de IA nas duas capas: "Material complementar gerado com apoio de inteligência artificial. Não substitui o professor nem garante nota. Em caso de dúvida, consulte o material da escola ou o professor." | junta o texto do PRD §6 e o do design doc §9 |

## Status
M1 feito (checkpoint). M2: renderer e orquestração escritos com testes unitários; falta a integração com Chromium, o passo da CI e conferir o script. Pendência do humano: linha `RENDER_CONCURRENCY=2` no `.env.example`; abrir os PDFs no celular e imprimir (pronto quando).
