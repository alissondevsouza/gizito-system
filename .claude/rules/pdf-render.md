---
paths:
  - "apps/worker/src/render/**"
---

# Render dos PDFs (design doc seção 9)

## Entrega
- Dois arquivos do mesmo `studyKit`: `activities.pdf` (capa, revisão, exemplos, 10 exercícios, simulado de 10) e `answer-key.pdf` (capa curta, gabarito das 20). Nunca um só.
- A4 retrato, margens 15–18 mm, fundo branco, preparado para impressão em preto e branco. Corpo 12 pt, entrelinha 1,35–1,5, títulos 16–20 pt.
- Cabeçalho discreto com logotipo, ano, disciplina e assuntos; rodapé com número de página e identificação do arquivo. Sem nome de criança ou escola em lugar nenhum.
- Mascote só na capa e em uma dica pontual; variante professor permitida na capa do gabarito.
- Nota discreta: material complementar gerado com apoio de IA; não substitui professor nem garante nota.

## Técnica
- HTML/CSS com templates em `src/render/templates/`; fontes embutidas (família primária do design doc), sem download em runtime.
- Fórmulas e frações via KaTeX renderizado no servidor (`renderToString`), CSS do KaTeX embutido. Nunca MathJax no cliente nem imagens de fórmula.
- Todo texto do kit entra escapado; só os trechos entre `\(` e `\)` passam pelo KaTeX. Nenhum texto vindo do modelo vira HTML.
- Playwright com browser compartilhado e `page.pdf({ format: "A4", printBackground: false })`; timeout por render; semáforo de concorrência (`RENDER_CONCURRENCY`).
- Simulado com cabeçalho de prova (nome, data, tempo sugerido), numeração própria e espaço de resposta padronizado; questões abertas com linhas; Matemática com espaço de cálculo.
- Gabarito começa em página nova, na ordem dos blocos, com a justificativa e as etapas essenciais.

## Verificação antes de publicar
- Contar páginas (esperado: atividades 8–14, gabarito 3–6; fora da faixa é aviso, não bloqueio).
- Conferir no DOM renderizado que todas as 20 questões, os 2 exemplos e as 20 respostas estão presentes e visíveis (nenhum overflow escondido).
- Falha de render de qualquer um dos dois = etapa `render` falha; nunca publicar parcial.

## Testes
- Snapshot estrutural do HTML (não do PDF); teste de integração que renderiza um kit fixture e valida contagem de páginas e presença de todas as questões; teste de fórmula com fração e expoente.
