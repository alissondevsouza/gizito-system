---
feature: F1-04 avaliador-matematico
module: integrations
size: M
status: in_progress
branch: feat/integrations/avaliador-matematico
updated: 2026-10-20
---

# F1-04 avaliador-matematico

## Objetivo
Implementar em `packages/integrations/src/math/` o `MathEvaluator` real com mathjs, que o `validateStudyKit` do core recebe injetado para o recálculo (`math_recalculation_mismatch`, `example_recalculation_mismatch`, `math_expression_invalid`) e para as alternativas de Matemática (`correct_option_mismatch`, `distractor_equivalent`, `option_duplicate`), e a conversão de `expression` para LaTeX que o render da F1-08 usa no `formatExpectedAnswer`. Fontes: roadmap F1-04, spec pedagógica (SP) §2, §7.1, §7.2 e §8.2, §14; `prompts-v1.md` (regra do `calculationExpression`); rules `core.md` e `integrations.md`. Interface já existente em `packages/core/src/interfaces/math-evaluator.ts`, que não muda.

## Requisitos e critérios de aceite
- **RF-01 Expressão aceita** — `calculationExpression` é dado vindo do modelo (invariante 4): o avaliador analisa a árvore do mathjs e só aceita número, parênteses, `+ - * / ^`, sinal, `mod`, `%` de porcentagem, conversão `to`, as funções `sqrt`, `abs`, `floor`, `ceil`, `round`, `mod`, `gcd`, `lcm`, a constante `pi`, as unidades da lista fechada (RF-03) e variáveis de uma letra minúscula fora dessa lista · Aceite: `x = 4`, `f(x) = x`, `"abc"`, `[1, 2]`, `1:3`, `3 > 2`, `min(3, 4)`, `import`, `reais`, `5!` e unidade com variável (`2 m + x`) dão `unsupported`; `1,5`, `2 +` e texto vazio dão `parse_error`.
- **RF-02 `evaluate`** — devolve `number` (com `unit` da tabela ou `null`, `tolerance` 0) para expressão sem variável e `expression` simplificada para expressão com variável; resultado infinito ou indefinido é `not_finite`; erro do mathjs ao calcular (unidades incompatíveis, número de argumentos) e resultado complexo são `unsupported`; o valor sai com 15 algarismos significativos, para ruído de ponto flutuante não aparecer · Aceite: `12 * 3 + 5` → 41; `3/4 + 1/8` → 0,875; `0.1 + 0.2` → 0,3; `25% * 80` → 20; `17 mod 5` → 2; `ceil(130 / 40)` → 4; `gcd(12, 18)` → 6; `2 m + 30 cm` → 2,3 m; `2.5 m to cm` → 250 cm; `2 h + 30 min` → 2,5 h; `90 min to h` → 1,5 h; `3 m * 4 m` → 12 m²; `10 km / 2 h` → 5 km/h; `180 deg - 50 deg - 60 deg` → 70°; `2*x + 3*x` → `expression` equivalente a `5*x`; `1/0` e `0/0` → `not_finite`; `sqrt(-1)` e `1 kg + 2 m` → `unsupported`.
- **RF-03 Unidades** — tabela fechada que liga a unidade escrita no `expectedAnswer` (símbolo e nome pt-BR, singular e plural, sem diferença de maiúscula, `²`/`³` ou `^2`/`^3`) à unidade do mathjs: comprimento (mm, cm, dm, m, km), área (mm², cm², dm², m², km², hectare), volume (cm³, dm³, m³, mL, L), massa (mg, g, kg, t), tempo (s, min, h, dia, semana), ângulo (°), temperatura (°C) e velocidade (km/h, m/s). Unidade fora da tabela (`R$`, `%`, `mês`, `ano`, `pessoas`) é opaca: só é igual à mesma unidade escrita igual · Aceite: `metros`, `M` e `m` são a mesma unidade; `cm²`, `cm^2` e `centímetros quadrados` também; `horas` e `h`; `R$` só igual a `R$`.
- **RF-04 `equals`** — equivalência simétrica e reflexiva entre dois `ExpectedAnswer`:
  - `number`, `fraction` e `expression` sem variável comparam o valor numérico: `|a − b| ≤ max(tolerâncias) + 1e-9 × max(1, |a|, |b|)`, com a tolerância de cada lado na própria unidade;
  - unidades da tabela de mesma grandeza convertem para a unidade do outro lado; grandezas diferentes, tabela × opaca ou opacas diferentes não são iguais; o lado sem unidade é lido na unidade do outro lado;
  - `expression` com variável: as duas expressões avaliadas em 6 pontos fixos, iguais em todos os pontos com valor finito nos dois lados, com no mínimo 3 pontos válidos; contra número, não é igual;
  - `set`: mesmo conjunto de elementos, sem ordem nem repetição; elemento em número pt-BR (`1.250`, `0,5`) ou fração `a/b` compara pelo valor, os demais pelo texto normalizado sem diferença de maiúscula;
  - `text`: `value` e `acceptedList` de um lado contra os do outro, texto normalizado sem diferença de maiúscula;
  - `expression` que o avaliador não aceita só é igual a outra com o mesmo texto sem espaços; demais combinações de tipos não são iguais.

  Aceite (os casos do roadmap): fração equivalente (`2/4` = `1/2`); decimal × fração (`0.5` = `1/2`, `0.333` ≠ `1/3` com tolerância 0 e = com 0,001); unidade errada (`250 cm` ≠ `250 m`, `5 m` ≠ `5 kg`, `30` com `R$` ≠ `30` com `pessoas`); unidade convertida (`2,5 m` = `250 cm`, `0,75 kg` = `750 g`, `3/4 kg` = `750 g`); distratores iguais (`0.5` e `1/2` como alternativas); tolerância convertida (`2,5 m` com 0,01 = `251 cm`); `5*x` = `2*x + 3*x`, `(x+1)*(x-1)` = `x^2 - 1`, `2*x` ≠ `x^2`; conjuntos `1; 2; 3` = `3; 2; 1`; texto `Agudo` = `agudo`; a função é simétrica e reflexiva numa lista com um exemplo de cada tipo.
- **RF-05 Cenários de SP §8.2** — o avaliador real atende o contrato `MathEvaluator` do core e os usos de `checkRecalculation` e `checkOptionList`, testados direto no avaliador (as fixtures de kit do core não são exportadas, e montar um `MathStudyKit` inteiro no teste repetiria a fixture) · Aceite: `createMathjsEvaluator()` atribuído a `MathEvaluator` no teste; `evaluate` de uma expressão certa é `equals` à resposta (sem código); de uma conta diferente não é (`math_recalculation_mismatch`); expressão inválida é `err` (`math_expression_invalid`); alternativa `0,5` contra `expectedAnswer` `1/2` é igual (sem `correct_option_mismatch`); distrator `2/4` contra correta `1/2` é igual (`distractor_equivalent`); distratores `0,25` e `1/4` são iguais (`option_duplicate`).
- **RF-06 LaTeX** — `mathExpressionToLatex(expression) → Result<string, MathEvaluationError>` com as mesmas regras de aceitação do RF-01, para o render escrever `expression` dentro de `\( \)` (SP §7.2): número em pt-BR pelo formatador do core (vírgula decimal, ponto de milhar), multiplicação colada antes de variável, potência de variável e parênteses (`5x`, `3(x + 1)`), `\times` nos demais casos, divisão como `\frac`, parênteses só onde precisam · Aceite (o mathjs põe um espaço antes de cada variável, que o KaTeX ignora; abaixo sem ele): `5*x + 3` → `5x+3`; `2.5*x` → `2,5x`; `(x+1)/2` → `\frac{x+1}{2}`; `3*(x+1)` → `3\left(x+1\right)`; `2*3` → `2\times3`; `1250*y` → `1.250y`; `x^2` → `{x}^{2}`; `x = 1` → `unsupported`; cada saída passa no `katex.renderToString` (dependência de teste).
- **RF-07 Fechamento** — `src/index.ts` exporta `createMathjsEvaluator` e `mathExpressionToLatex`; SP 1.2 registra a equivalência do RF-03/RF-04 em §8.2 e §15.7, pendente do aval do humano; roadmap e known-issues atualizados · Aceite: `bun run lint`, `bun run typecheck`, `bun run test` verdes na raiz.

## Fora de escopo
- Fake do `MathEvaluator`: o adaptador é puro, determinístico e sem rede; worker e regressão usam o real, e o core segue com o avaliador de tabela de `__fixtures__/` (o core não depende de `integrations`).
- `checkMathMarkup` com o KaTeX (F1-07) e o render (F1-08). Aqui o KaTeX entra só como dependência de teste do RF-06.
- Código de validação para `expression` de `expectedAnswer` ou de alternativa que o avaliador não aceita: SP §8.2 só valida o `calculationExpression`. Fica como pendência para o humano (Status).
- Calibrar tolerância de dinheiro e de dízima: a regressão da F1-10 mede.
- `bun run test:pedagogy`: o runner é a F1-10 (known-issues).

## Plano
- **Arquivos.** Criar `packages/integrations/src/math/units.ts` (tabela do RF-03, normalização e resolução de unidade), `src/math/expression.ts` (análise da árvore do RF-01 e classificação de símbolos, compartilhada por `evaluate`, `equals` e LaTeX), `src/math/mathjs-evaluator.ts` (RF-02, RF-04), `src/math/latex.ts` (RF-06); testes em `src/__tests__/math/`. Modificar `src/index.ts`, `package.json` (`mathjs` em dependências, `katex` em devDependencies) e, no core, exportar o formatador de número pt-BR que o `formatExpectedAnswer` já usa (`formatBrazilianDecimal`, hoje `formatDecimal` privado em `kit/answer-key.ts`), para o LaTeX não repetir a regra.
- **Instância padrão do mathjs** (ver Decisões), sem alterar configuração global. A árvore é validada antes de qualquer avaliação; nada de `math.evaluate` sobre o texto cru.
- **Unidades no escopo.** No mathjs, `min` resolve para a função de mínimo antes da unidade (`30 min` falha). As unidades usadas na expressão entram no escopo da avaliação como unidade sem valor, o que também deixa a lista fechada valendo de fato.
- **Unidade do resultado.** Unidade simples sai como está (`2,5 m to cm` → `cm`); composta é montada do `formatUnits()` com fator repetido virando potência (`m m` → `m²`, `km / h`). Unidade fora da tabela cai na unidade de referência da grandeza (m, m², m³, kg, s, °, °C, m/s), já que `equals` converte de qualquer jeito; grandeza fora da tabela é `unsupported`.
- **Pontos de amostragem** fixos, não inteiros e com sinal trocado (0,7; 1,3; 2,9; −1,7; 3,1; −2,3), deslocados por variável, para a comparação ser determinística e não cair em zero de denominador comum.
- **Testes.** Unit por RF, tabelados; RF-05 testa no avaliador os usos do core; a integração com `validateStudyKit` acontece na F1-07 e na regressão da F1-10.
- **Riscos.** `R$` com divisão não exata exige `tolerance` do modelo (SP §7.1: "salvo arredondamento pedido"); se a regressão mostrar bloqueio por centavo, é calibração do prompt ou do core na F1-10.

## Tasks
Verificação de toda task: `bun test` e `bunx tsc --noEmit` em `packages/integrations`; no fim do milestone, `bunx biome check packages/integrations packages/core` e commit.

### M1 — Avaliador
- [x] 1.1 `mathjs` e `katex` no `package.json`; `formatBrazilianDecimal` exportado no core · Arquivos: `packages/integrations/package.json`, `packages/core/src/pedagogy/kit/answer-key.ts`
- [x] 1.2 `units.ts` (RF-03) e `expression.ts` (RF-01) com testes
- [x] 1.3 `mathjs-evaluator.ts` (RF-02, RF-04) com testes, incluindo simetria e reflexividade
- [x] 1.4 Cenários de SP §8.2 e contrato `MathEvaluator` (RF-05)

### M2 — LaTeX e fechamento
- [x] 2.1 `latex.ts` (RF-06) com testes e parse do KaTeX
- [x] 2.2 `index.ts`; SP 1.2 (§8.2, §15.7, §16); roadmap; known-issues (regressão e pendência de `expression` sem código) (RF-07)
- [x] 2.3 `bun run lint`, `bun run typecheck`, `bun run test` na raiz
- [x] 2.4 `bun run test:pedagogy`: não existe até a F1-10; registrar em known-issues
- [ ] 2.5 Revisão neutra (`review.md`)

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-20 | `mathExpressionToLatex` é função exportada do adaptador, fora da interface `MathEvaluator` | só o render usa; pôr na interface obrigaria o avaliador de tabela do core a implementar LaTeX sem motivo |
| 2026-10-20 | Sem fake do `MathEvaluator` | puro, determinístico e sem rede: um fake só trocaria o comportamento real por um falso nos testes do worker |
| 2026-10-20 | Lista fechada de nós, funções, unidades e da constante `pi`; variável é uma letra minúscula fora da lista de unidades | a expressão vem do modelo (invariante 4); a lista fechada impede atribuição, definição de função e `import`, e deixa o resultado previsível. Letra que é unidade (`m`, `g`, `h`, `s`, `t`, `l`) é unidade, e `e` e `i` são variáveis, não as constantes do mathjs |
| 2026-10-20 | Mês e ano ficam fora da tabela de unidades (opacos) | na escola, mês tem 30 dias e ano 365; no mathjs, `month` = 30,44 dias e `year` = 365,25 dias, e a conversão daria divergência falsa |
| 2026-10-20 | O lado sem unidade é lido na unidade do outro | a expressão quase sempre é aritmética sem unidade (`2.5 * 100`) e a resposta tem unidade (`250 cm`); exigir unidade nos dois lados bloquearia o kit sem erro. A unidade errada continua pega quando a expressão tem unidade (`2.5 m to cm` contra `250 m`) e pela revisão por modelo |
| 2026-10-20 | Porcentagem é unidade opaca, não fator 1/100 | lida como 1/100, `0,25` e `25%` seriam iguais e, pela regra anterior, `25` e `25%` também, o que é contraditório; o modelo escreve a expressão que dá o número do gabarito (`15/60*100` para `25%`) |
| 2026-10-20 | Unidade do resultado montada do `formatUnits()` do mathjs, sem `Unit.simplify()` | o `simplify` usa o sistema de unidades "auto", que guarda a última unidade usada de cada grandeza no estado global do mathjs: `3 m * 4 m` saiu como hectare depois de um teste com hectare. Fator repetido vira potência (`m m` → `m^2`) e o que não está na tabela cai na unidade de referência da grandeza |
| 2026-10-20 | Instância padrão do mathjs, sem `create(all)` | com `noUncheckedIndexedAccess`, o tipo de `all` no mathjs 15 inclui `undefined`; nenhuma configuração global é alterada, então a instância padrão serve |
| 2026-10-20 | Texto e conjunto sem diferença de maiúscula em Matemática | `Agudo` e `agudo` como alternativas são a mesma resposta; em Português o core mantém a maiúscula (F1-03) porque ela é conteúdo |

## Status
M1 e M2 implementados; lint, typecheck, build e `bun run test` verdes na raiz (core 691, integrations 177, db 98, api 25, worker 21). Próximo: revisão neutra (2.5). Pendências para o humano: aval da SP §15.7 (equivalência) e decisão sobre `expression` sem código (known-issues, F1-07).
