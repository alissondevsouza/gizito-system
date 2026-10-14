---
paths:
  - "docs/**/*.md"
  - "specs/**/*.md"
---

# Documentação

- Idioma: português brasileiro. Nomes de código, rotas, campos e comandos ficam como no código.
- `docs/product/product-doc-v1.md` e `docs/design/design-doc-v1.md` são a fonte de verdade do produto. Mudança de comportamento visível exige: editar a seção certa, subir a versão no cabeçalho e adicionar entrada no histórico de revisões. Nunca reescrever entradas antigas do histórico.
- Números do produto (preço, contagens, anos, prazos) existem em um lugar só no doc; ao mudar, buscar todas as ocorrências nos dois docs antes de encerrar.
- ADRs em `docs/engineering/adr/NNNN-titulo.md` a partir do template; imutáveis depois de aceitos (substituir com novo ADR). Linha no índice de `docs/README.md`.
- `docs/lessons.md` é append-only, entrada no topo, com data e origem.
- `docs/engineering/known-issues.md`: dívida só entra com condição de resolução; ao resolver, mover para Resolvidos com data e commit.
- `docs/progress/{modulo}.md` e a tabela de estado em `docs/README.md` são atualizados juntos ao fechar trabalho num módulo.
- Diagramas em Mermaid (skill `mermaid-diagrams`), nunca imagens de diagrama.
- Specs em `specs/` seguem `.claude/rules/spec-format.md`.
- Não registrar nos docs conteúdo de fotos, textos extraídos reais ou dados de clientes do piloto.
