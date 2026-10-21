---
feature: render-pdf
module: worker
round: 1
verdict: APROVADO
updated: 2026-10-21
---

# Review: render-pdf (F1-08)

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `git diff main...HEAD` (verifier, `32645bf`) | 46 arquivos, conferidos contra a spec, as invariantes e as rules `pdf-render`, `worker`, `integrations`, `docker-infra` e `testing` |
| `bun test src/__tests__/render src/__tests__/integration/render.test.ts src/__tests__/config.test.ts` em `apps/worker` (verifier, Chromium real) | 66 pass, 0 fail, 2 snapshots |
| `render:kit` nas 2 fixtures e nos 10 kits reais (verifier) | todos `Ok` na 1ª tentativa, sem aviso, de 0,27 a 0,34 s por kit; `pdffonts` com Nunito Sans nos 4 PDFs, KaTeX_Main nos 2 de Matemática e sem DejaVu |
| `pdftoppm` (verifier): capa, fixação de Matemática, gabarito do 7º ano | frações empilhadas e legíveis, cabeçalho e rodapé certos, nada cortado |
| Sondas (verifier) | `kill -9` do Chromium no meio de um render → `render_failed`, e a tentativa seguinte relança e dá `Ok`; timeout na conversão com 60 mil parágrafos → `RenderTimeoutError` e vaga liberada; `\(25% \text{ de } 80\)` saía "25" no PDF; 22 expressões no `mathExpressionToLatex` → as que falham são as mesmas que o avaliador recusa |
| `bun run lint`, `typecheck`, `test`, `test:integration`, `build` (orquestrador, antes da revisão) | limpos; core 729, api 25, db 98, integrations 370, worker 227; integração api 3, worker 32, db 129 |
| `docker build -f apps/worker/Dockerfile -t gizito-worker:f1-08 .` e `render:kit` no container com `--network none` (orquestrador) | 949 MB; mesmas páginas que o local, como usuário `bun`, sem `.env` na imagem |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `apps/worker/src/__tests__/render/markup.test.ts`, `templates.test.ts` ("nenhum script, atributo de evento ou link…"), `packages/integrations/src/__tests__/katex/markup.test.ts` |
| RF-02 | sim | `templates.test.ts` (snapshot estrutural, capa, simulado, texto-base no bloco, caderno sem resposta, alternativa a partir do `value`) |
| RF-03 | sim | `templates.test.ts` (ordem, letra e alternativa, aceitas, etapas, citação); a capa do gabarito ganhou asserções na resposta |
| RF-04 | sim | `integration/render.test.ts` (fontes, nenhuma requisição de rede); o aceite foi corrigido na spec para KaTeX só em Matemática |
| RF-05 | sim, com prova parcial na rodada | concorrência, timeout na conversão e queda do browser ganharam teste na resposta |
| RF-06 | sim | `integration/render.test.ts` (ausente, duplicado, `display: none`, `visibility: hidden`, sem texto, largo, à esquerda, cortado) |
| RF-07 | sim | `render-kit.test.ts` (segunda tentativa, falha sem PDF, `retryCount` 0, aviso nas 4 bordas, `ParseError` sem chamar o renderer) |
| RF-08 | sim | evidência do orquestrador (build e `render:kit` no container) |
| RF-09 | sim | `apps/worker/scripts/render-kit.ts`, rodado nas fixtures, nos 10 kits e no container |
| RF-10 | sim | tabela abaixo; PDFs de amostra em `tests/pedagogy/output/f1-08-render/` (fora do git) |

**Páginas dos 10 kits reais da F1-07** (código final; atividades na faixa 8–14, gabarito na faixa 3–6):

| Kit | Atividades | Gabarito |
|---|---:|---:|
| 4-math-adicao-valor-posicional-basica | 10 | 6 |
| 4-portuguese-pontuacao | 10 | 5 |
| 5-math-divisao-com-outro | 10 | 5 |
| 5-math-fracoes-decimais-perimetro | 10 | 6 |
| 5-portuguese-informacao-explicita-com-observacao | 10 | 6 |
| 6-math-angulos | 11 | 6 |
| 6-portuguese-substantivos-formacao | 11 | 5 |
| 7-math-equacoes-porcentagem | 10 | 5 |
| 7-math-inteiros-racionais-intermediaria | 11 | 6 |
| 7-portuguese-figuras-de-linguagem | 11 | 6 |

Nenhum fora da faixa; o gabarito fica no teto em 6 dos 10 (known-issue).

### Achados
- [ALERTA] `apps/worker/src/__tests__/integration/render.test.ts:182-204` — três provas do RF-05 passariam com a lógica removida: sem o `semaphore.run`, nenhum teste quebra; o timeout testado só estoura no launch; o relançamento só é testado depois de `close()`, não pelo `disconnected`.
- [ALERTA] `apps/worker/src/render/pdf-renderer.ts:168-178` — `newContext` e `context.close()` sem timeout: um Chromium travado prende a vaga do semáforo para sempre; um launch que nunca resolve deixa o `browserPromise` pendente e o browser nunca é relançado.
- [ALERTA] `packages/integrations/src/katex/markup.ts:15-22` — `%` sem barra dentro de `\( \)` vira comentário do KaTeX e some do PDF sem erro (`\(25% \text{ de } 80\)` sai "25"). Hoje o modelo usa `\%` (39 de 39 nos kits reais).
- [ALERTA] `.env.example` — `RENDER_CONCURRENCY` não está documentada (invariante 10).
- [ALERTA] `specs/worker/render-pdf/spec.md:77` — a task 3.2 marcada sem a tabela no `review.md`.
- [SUGESTÃO] `apps/worker/src/render/pdf-renderer.ts:152-154,193-197` — o `disconnected` zera o `browserPromise` sem conferir se ainda é o dele (browser órfão quando um render chega durante o `close()`); `close()` lança com o launch rejeitado.
- [SUGESTÃO] `apps/worker/src/render/render-kit.ts:115-119` — um único `page_count_out_of_range`, sem dizer qual arquivo nem quantas páginas.
- [SUGESTÃO] `apps/worker/src/render/templates/kit-v1/common.ts:102-108` — o cabeçalho escreve o rótulo do assunto cru e a capa o passa pelo KaTeX; um rótulo com `\( \)` sai diferente nos dois lugares.
- [SUGESTÃO] `specs/worker/render-pdf/spec.md:21-23,37` — contrato diverge do código (`PdfRenderFailure`, `errorNameList`) e o aceite do RF-04 pede KaTeX no PDF de Português.
- [SUGESTÃO] `apps/worker/src/__tests__/render/templates.test.ts:248-254` — a capa do gabarito sem asserção do aviso ao responsável e da data; expoente sem asserção (`msupsub`).

### Regressão pedagógica
Não aplicável à feature: não muda prompt, modelo, taxonomia nem validador. O único arquivo de validador tocado (`packages/core/src/pedagogy/validation/patterns.ts`) teve refatoração de comportamento idêntico: `listMathMarkupSegment` passou a derivar de `splitMathMarkup`, com a mesma regex e as mesmas capturas, coberta pelos testes do core. O `bun run test:pedagogy` ainda não existe (F1-10, known-issues).

### Resposta do orquestrador
Corrigido (sem CRÍTICO, então sem nova rodada de verifier):
- **Provas do RF-05:** `createPdfRenderer` aceita `launchBrowser` (padrão: `chromium.launch`), e os testes usam um espião no `newContext` do browser real. Com `concurrency` 1, dois renders em paralelo nunca têm dois contextos abertos; com 2, têm (o espião mede sobreposição de verdade). O timeout na conversão é testado com o browser aquecido e um documento de 100 mil parágrafos: dá `RenderTimeoutError`, libera a vaga, e o render seguinte lança outro browser. O browser fechado por fora entre renders é relançado pelo `disconnected`.
- **Timeout:** um `withTimeout` único cobre esperar o browser, abrir o contexto, converter e fechar o contexto. No estouro, o browser compartilhado é esquecido e fechado em segundo plano (erro ao fechar um browser descartado é ignorado, porque ele já foi trocado), e o próximo render lança outro. Nenhum Chromium órfão depois da suíte (`pgrep`).
- **`%` sem barra:** o `renderMathMarkup` troca `%` sem barra por `\%`, como já fazia com a vírgula decimal, com teste. O `checkMathMarkup` não muda, porque mudar validador pede `test:pedagogy` e nova versão da spec pedagógica. Risco residual registrado na spec: um `%` que esconde LaTeX inválido passa na validação e falha no render.
- **`review.md`:** este arquivo, com a tabela dos 10 kits.
- **`disconnected` e `close()`:** o handler só zera a referência do próprio browser, e `close()` não lança com o launch rejeitado.
- **Spec:** contrato com `PdfRenderFailure`, `errorNameList` e `launchBrowser`; aceite do RF-04 com KaTeX só em Matemática, e o teste confere o KaTeX nos dois PDFs de Matemática.
- **Testes da capa do gabarito e do expoente:** asserções do aviso ao responsável, da data, dos assuntos e de `msupsub`.

Contestado:
- **`.env.example`:** a permissão do projeto (`Read(**/.env*)`, `Edit(**/.env*)`) bloqueia o agente. Fica como pendência do humano antes do merge: a linha `RENDER_CONCURRENCY=2`. O config tem padrão, então nada quebra sem ela.
- **Um aviso por arquivo com as páginas:** o `ValidationIssue` só leva `excerpt` (trecho do kit) e `note` (nota da revisão), e o `itemId` é id do kit; pôr "answer-key: 7" num deles quebraria o contrato do §2 da spec pedagógica. O número de páginas de cada arquivo já sai no `RenderedKit` (`activities.pageCount`, `answerKey.pageCount`), para a F2-05 gravar e logar.
- **Rótulo do assunto no cabeçalho:** o cabeçalho do Playwright é outro documento, sem o CSS do KaTeX, e não consegue renderizar fórmula. Os rótulos da taxonomia não têm marcação; só o rótulo do "outro", escrito pelo modelo, poderia ter. Escrever cru no cabeçalho e renderizado na capa é a melhor saída de cada lugar.

Depois das correções: `bun run lint` limpo, `typecheck` 6/6, `test` com core 729, api 25, db 98, integrations 371 e worker 228, `test:integration` com api 3, worker 36 e db 129, `build` 3/3; os 10 kits com as mesmas páginas; imagem reconstruída e `render:kit` no container de novo `Ok`.

## Depois da aprovação do humano (21/10/2026)
O humano aprovou os PDFs (celular, computador e impressão) e escolheu o caminho 2 para o gabarito: capa curta no alto da primeira página e respostas logo abaixo. As respostas aceitas passaram para a mesma linha, separadas por "·". Páginas do gabarito nos 10 kits reais: 4-math 5, 4-portuguese 5, 5-math-divisao 5, 5-math-fracoes 5, 5-portuguese 5, 6-math 5, 6-portuguese 4, 7-math-equacoes 5, 7-math-inteiros 5, 7-portuguese 5; atividades sem mudança. Mudança de layout coberta pelo snapshot estrutural (só saiu o título "Assuntos" da capa do gabarito) e pelos testes da capa; sem nova rodada de verifier, pelo fluxo enxuto (um verifier por feature).
