# Artefatos de feature

Diretório: `specs/{modulo}/{slug}/`, na raiz do monorepo. Dois arquivos, criados a partir de `specs/_templates/`:

| Arquivo | Quem escreve | Conteúdo |
|---|---|---|
| `spec.md` | orquestrador | objetivo, requisitos com critérios de aceite, fora de escopo, plano, tasks por milestone com verificação, decisões, status |
| `review.md` | orquestrador, a partir do veredito do verifier | comandos executados, critérios de aceite × evidência, achados por severidade, regressão pedagógica, resposta do orquestrador |

Regras:
- Frontmatter mínimo em ambos (`feature`, `module`, `size`, `status`, `branch`, `updated`). A seção **Status** do `spec.md` é o ponto de retomada do `--resume`.
- Checkbox de task no `spec.md` é a fonte de verdade do progresso. Não há arquivo de progresso separado.
- Toda feature que toca prompt, modelo, taxonomia ou validador tem uma task explícita "rodar `bun run test:pedagogy`" e o resumo do relatório no `review.md`.
- `review.md` acumula rodadas (seção por rodada). CRÍTICO em aberto = não pronto.

## O que passar a cada subagente

Pouco e preciso. O subagente recebe `CLAUDE.md` e as rules sozinho.

- **gizito-spec-verifier**: a descrição original do pedido, o caminho de `spec.md`, e a frase "avalie só o que está escrito".
- **gizito-implementer**: caminho de `spec.md`, o milestone (número e tasks) que ele deve fazer, os arquivos que são dele e a instrução de não tocar nos demais, e a nota "não commite".
- **gizito-implement-verifier**: caminho de `spec.md`, a branch, a lista `comando → resultado` do que você já rodou, e, em rerodada, o `review.md` anterior com a instrução de revalidar só os pontos corrigidos.

Não passe seu raciocínio, hipóteses ou "acho que está certo". A independência é o valor do spawn.
