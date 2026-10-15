# ADR-0007: Dois PDFs gerados de HTML/CSS com KaTeX no servidor e Playwright

**Data:** 2026-10-15
**Status:** aceito
**Decidido por:** Alisson

## Contexto

O produto comprado são dois arquivos A4 do mesmo `study_kit.json`: o caderno de atividades (revisão, 2 exemplos, 10 exercícios, simulado de 10) e o gabarito comentado das 20 questões (PRD §6, design doc §9). Precisam abrir no celular, imprimir em preto e branco, mostrar frações empilhadas e equações legíveis, e ter cada questão conferida antes de publicar (PRD §7.5: falha de render que esconda questão é bloqueador).

## Decisão

Dois arquivos, sempre: `activities.pdf` e `answer-key.pdf`; o pedido só fica `ready` com os dois no storage (invariante 6). Render por templates HTML/CSS no worker, fórmulas via KaTeX `renderToString` no servidor com CSS embutido, fontes embutidas, e conversão com Playwright (Chromium compartilhado, `page.pdf({ format: "A4" })`, semáforo `RENDER_CONCURRENCY`). Antes de publicar, o worker confere no DOM renderizado a presença das 20 questões, 2 exemplos e 20 respostas, e conta páginas (fora da faixa esperada é aviso). O worker roda em imagem própria com Chromium.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Um PDF só com gabarito no fim | um arquivo | a criança vê as respostas; o responsável não controla o momento; PRD exige dois |
| Geração programática (pdfkit, pdf-lib, @react-pdf) | sem browser, imagem leve | layout de prova, frações empilhadas e quebra de página exigem reimplementar o que CSS já faz; fórmulas viram imagem |
| LaTeX (tectonic/xelatex) | tipografia matemática perfeita | toolchain pesada, templates difíceis de manter, erros de compilação opacos a partir de conteúdo gerado |
| MathJax no cliente / imagem de fórmula | familiar | render no cliente não existe em PDF; imagens perdem nitidez na impressão e pesam |
| Serviço externo de PDF | sem Chromium na imagem | custo por página, dependência de rede no caminho crítico, conteúdo do kit saindo do servidor |

## Consequências

### Positivas
- Design do PDF é CSS: tokens do design doc, cabeçalho e rodapé, espaço de resposta, cabeçalho de prova.
- Verificação de presença das questões é um `querySelector` antes do `page.pdf`.
- Testes: snapshot estrutural do HTML e integração que renderiza um kit fixture.

### Negativas
- Chromium na imagem do worker (centenas de MB) e consumo de memória por render; concorrência limitada.
- Fidelidade de impressão depende do Chromium; validar em impressora real na homologação.

### Riscos
- Playwright em container Alpine/Bun: imagem própria testada em F1-08 (roadmap §1.2).
- Timeout de render em kit longo: limite por render e falha segura (nunca PDF parcial).

## O que faria esta decisão mudar

- Volume que torne o custo de Chromium por render relevante (centenas de kits por hora).
- Necessidade de edição do PDF pelo usuário (fora do MVP).
