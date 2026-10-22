---
feature: F1-11 homologacao-e-amostras
module: pedagogy
round: 1
verdict: APROVADO
updated: 2026-10-21
---

# Review: F1-11 homologacao-e-amostras

## Rodada 1

Revisão do M1 ao M4. O M5 espera a planilha devolvida pelo professor.

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint` (orquestrador) | limpo |
| `bun run typecheck` (orquestrador) | 6 de 6 |
| `bun run test` (orquestrador) | core 730, integrations 378, worker 343, db 98, api 25; 0 falhas |
| `bun test src/__tests__/integration/render.test.ts` no worker (orquestrador) | 19 pass |
| `bun test` de `templates.test.ts` e `render-kit.test.ts` (verifier) | 30 pass; 4 testes de amostra |
| `pdfinfo` e `pdftotext` nas amostras (verifier) | 11 + 6 e 9 + 4 páginas; selo nas capas e rodapé de amostra em todas as páginas |
| Sorteio refeito pelo `origin.json` e pelos `summary.json` (verifier) | as 7 células batem |
| md5 do pacote contra as saídas de origem (verifier) | os 10 kits batem |
| Planilha exportada para CSV e comparada com os `study_kit.json` (verifier) | ordem e `itemId` batem; 252 linhas; lista com 15 opções |
| `validateStudyKit` e `studyKitSchema` atuais nos 10 kits (verifier) | nenhum bloqueador |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `templates.test.ts` e `render-kit.test.ts` (“kit de amostra”); snapshot sem mudança; `--sample` via `parseArgs` |
| RF-02 | sim | `docs/pedagogy/amostras/{matematica,portugues}/`, páginas dentro das faixas, selo nos 4 PDFs |
| RF-03 | sim, com o alerta do sorteio | `tests/pedagogy/output/homologacao/pacote-professor/`, `docs/pedagogy/homologacao/2026-10-21-auditoria-do-professor.md` |
| RF-04 | sim, com o alerta da frase do tempo | PRD 1.6 §3 contra o relatório da rodada final |
| RF-05 | não avaliado | depende da planilha devolvida |

### Achados
- [ALERTA] `docs/product/product-doc-v1.md:47` — “acima do alvo nos kits regenerados” não se sustenta. Dos 4 kits acima de 5 min, 2 não tiveram regeneração, e os 4 são de Português. — Por quê: a frase aponta a ação para o lado errado. — Como corrigir: dizer “4 dos 30 kits prontos, todos de Português, 2 com regeneração”.
- [ALERTA] `specs/pedagogy/homologacao-e-amostras/spec.md:43` — A spec diz que as imagens das amostras “não fazem parte do sorteio”, mas os casos de regressão dessas imagens foram candidatos. O hash não caiu neles. — Por quê: quem seguir a spec reproduz outro sorteio. — Como corrigir: ajustar a frase ou refazer o sorteio do 5º ano, e deixar explícito no documento da auditoria.
- [ALERTA] `auditoria-gizito.xlsx`, aba Instruções, item 5 (fora do git) — “Copie a linha logo abaixo” pode virar colar por cima do item seguinte. Além disso, a lista e o Resumo tinham intervalo fixo até a última linha. — Por quê: um item sem avaliação pode esconder um crítico. — Como corrigir: instrução de inserir linha; no M5, conferir todos os `itemId` de cada kit.
- [SUGESTÃO] `docs/product/product-doc-v1.md:44` — “cerca de R$ 0,01 a R$ 6 por dólar” parece uma faixa.
- [SUGESTÃO] `docs/pedagogy/homologacao/2026-10-21-auditoria-do-professor.md` — O `708b1b9` mudou o texto do `generate` v2 sem subir a versão. Os Kits 01 a 08 vêm de antes dele, e os 09 e 10, de depois. Registrar isso, junto com a ressalva do Kit 08, que saiu com esforço `medium`.

### Regressão pedagógica
Não aplicável. A feature não muda prompt, modelo, taxonomia nem validador. A rerodada dos 2 casos do 7º ano de Português só serviu para buscar um kit para a auditoria, e o resultado está no documento da auditoria.

### Resposta do orquestrador
Todos os achados foram aceitos e corrigidos:
- PRD §3: a frase do tempo diz “Passaram de 5 min 4 dos 30 kits prontos, todos de Português e 2 deles com regeneração”, e o câmbio foi para um parêntese.
- Sorteio: a spec e o documento da auditoria dizem que as amostras se somam aos 8 sorteados e que os casos dessas imagens continuam candidatos. Não refiz o sorteio. A intenção era não repetir a mesma imagem na auditoria, e o hash não caiu nesses casos, então nada muda no resultado.
- Planilha: a instrução 5 manda duplicar a linha inteira com “Inserir células copiadas”, sem colar por cima. A lista, as fórmulas de classe e código e as contagens do Resumo vão até a linha 400. Testado com uma linha a mais no fim: entrou na contagem, com 0 erros nas 864 fórmulas. Mesmo sorteio, e o zip foi refeito. A task 5.1 confere todos os `itemId` de cada kit antes de resumir.
- Documento da auditoria: registra a diferença de texto do `generate` v2 antes e depois do `708b1b9` e a ressalva do Kit 08.

### Depois da revisão
- O `bun run lint` informado ao verifier foi rodado antes do M2. Os dois `study_kit.json` de `docs/pedagogy/amostras/`, copiados da saída do `pipeline`, não passavam no formatador do Biome. Achei isso ao fechar o gate da F1 e formatei os dois arquivos; o conteúdo JSON não mudou. Depois disso, o lint ficou limpo.
