---
feature: F1-04 avaliador-matematico
module: integrations
round: 1
verdict: REPROVADO
updated: 2026-10-20
---

# Review: F1-04 avaliador-matematico

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun test` em `packages/integrations` | 177 pass, 0 fail |
| `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` (raiz, pelo orquestrador) | verdes; core 691, integrations 177, db 98, api 25, worker 21 |
| sondas do verifier no scratchpad (sem arquivo do repositório alterado) | matriz 70×70 de `equals` sem falha de simetria ou reflexividade; `simplify` com somas longas cronometrado; 60 expressões no LaTeX com KaTeX |
| `bun run test:pedagogy` | não existe até a F1-10 |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `mathjs-evaluator.test.ts`; lista fechada resiste a `__proto__`, `Infinity`, `evaluate(...)` e acessores |
| RF-02 | em parte | aceite atendido, mas `simplify` explode (CRÍTICO) e `x/0` dava `ok` |
| RF-03, RF-04, RF-05, RF-07 | sim | `units.test.ts`, `mathjs-evaluator.test.ts`, docs |
| RF-06 | em parte | parêntese de negativo perdido (ALERTA) |

### Achados
- [CRÍTICO] `mathjs-evaluator.ts:70-81` — `evaluate` chamava o `simplify` do mathjs no `calculationExpression`; `1*x+…+30*x` (139 caracteres) levou mais de 60 s e a soma de 40 termos (200 caracteres) não terminou em 300 s — trava o event loop do worker num job que volta para a fila travando de novo; dado do modelo derrubando o worker (invariante 4) — tirar o `simplify` e devolver o texto normalizado; teste com limite de tempo.
- [ALERTA] `expression.ts:51-62`, `units.ts` — `m`, `l`, `g`, `t`, `s`, `h` eram sempre unidade: `b*h` ≠ `h*b`, `4*l` ≠ `l+l+l+l`, `h*h + h` virava `math_expression_invalid` — bloqueador falso e distratores equivalentes não detectados — letra é unidade só colada a número ou com `to`.
- [ALERTA] `latex.ts:161` — `5 - (-3)` saía `5--3` com `parenthesis: "auto"` — erro visível no PDF de 7º ano — envolver o negativo à direita de `+`/`-`.
- [ALERTA] `latex.ts:163-167` — argumentos de função separados por vírgula colidem com a vírgula decimal depois da troca do render (`12{,}18`) — usar `;`.
- [ALERTA] `prompts-v1.md:232` — o prompt manda usar "unidades do mathjs", mas o avaliador aceita só a tabela; `3 year to month`, `5 hm to m` e `%` sem `*100` viram bloqueador falso — registrar pendência para o prompt.
- [NOTA] `mathjs-evaluator.ts:78-81` — `x/0` devolvia `"Infinity * x"` em vez de `not_finite`.
- [NOTA] `mathjs-evaluator.ts:24` — pontos de amostra em [−2,3; 3,1]: `floor(x/10)` = `floor(x/20)`.
- [NOTA] `units.ts` — `º`, `ºC` e nomes sem acento ficavam opacos.
- [NOTA] `latex.ts` — letra que o mathjs conhece como unidade saía em `\mathrm` (`a*b` → ` a\mathrm{b}`); `degC`, `to` e `25%` com aparência de mathjs.
- [NOTA] testes — nada provava `MIN_VALID_SAMPLE_COUNT` nem o deslocamento por variável (`a - b` × `b - a`); o teste do KaTeX não rodava a tabela inteira do RF-06.
- [NOTA] `units.ts`, `mathjs-evaluator.ts` — tabela de apelidos e igualdade de conjunto e texto seriam regra de domínio do core; o avaliador de tabela do core tem outra semântica e não passa por suíte comum.

### Regressão pedagógica
Pendente: `bun run test:pedagogy` só existe a partir da F1-10 (known-issues, linha da regressão estendida à F1-04).

### Resposta do orquestrador
Corrigido:
- CRÍTICO: `simplify` removido; expressão com variável sai como `node.toString()` e exige 3 pontos de amostra finitos, senão `not_finite` (resolve também a NOTA de `x/0`). Teste: soma de 40 termos avaliada e comparada em menos de 500 ms (mediu 3,5 ms).
- ALERTA das letras: letra que também é unidade só é unidade em expressão com unidade (número colado, unidade de mais de uma letra ou `to`); testes de classificação e `b*h` = `h*b`, `4*l` = `l+l+l+l`, `2*t + 3` = `3 + 2*t`. Limite registrado em Decisões e na SP §15.7 (d): `3h + 2h` é lido como horas.
- ALERTA do negativo: `+`, `-`, multiplicação e sinal envolvem o negativo à direita em `\left(\right)`; tabela de teste com `5 - (-3)`, `-3 + (-5)`, `x - (-1)`, `2*(-3)`, `2*-3`, `-(-3)`, `(-3)^2`.
- ALERTA da vírgula: função de dois argumentos sai com `;`, `gcd` e `lcm` como `\text{mdc}` e `\text{mmc}`.
- ALERTA do prompt: pendência em known-issues para a F1-07 (prompt `generate` v1: unidades aceitas, mês e ano sem unidade, `%` como `a/b*100`; mudança de texto aprovado com aval do humano). Na tabela entraram dam, hm, dag, hg, dg, cg, dL e cL, do quadro de unidades da escola.
- NOTAs: ponto de amostra 37,3; `º` como `°` e apelidos sem acento; variável em itálico no LaTeX; testes de `MIN_VALID_SAMPLE_COUNT`, de `a - b` × `b - a`, de função em degrau e KaTeX sobre a tabela inteira.

Contestado:
- NOTA de mover tabela de apelidos e igualdade de conjunto e texto para o core: a tabela liga a unidade escrita em pt-BR à unidade do mathjs, que é tradução de fornecedor (`integrations.md`), e a rule `core.md` põe o `MathEvaluator`, com `equals`, em `integrations`. A semântica fica documentada na SP §8.2, que é a fonte que o core e a regressão leem. O avaliador de tabela do core é dublê de teste com semântica mínima, de propósito; os testes do core não dependem de conversão de unidade.
- NOTA de aparência de `degC`, `to` e `25%` no LaTeX: só aparece em resposta do tipo `expression` com unidade, que o prompt não pede; fica como está.

Comandos depois da correção: `bun run lint` verde (237 arquivos); `bun run typecheck` verde; `bun run test` verde (core 691, integrations 218, db 98, api 25, worker 21).
