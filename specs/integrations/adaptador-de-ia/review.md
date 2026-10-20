---
feature: F1-05 adaptador-de-ia
module: integrations
round: 1
verdict: REPROVADO
updated: 2026-10-20
---

# Review: F1-05 adaptador-de-ia

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint`, `typecheck`, `test`, `build` (raiz, pelo orquestrador) | verdes; core 710, integrations 317 com 16 pulados, db 98, api 25, worker 21 |
| `bun test` em `integrations` com chave no ambiente e sem `AI_LIVE_TEST` | 317 pass, 16 skip; o teste real continua pulado |
| `AI_LIVE_TEST=1` contra servidor SSE local (sondas no scratchpad) | 16 pass; o harness do teste real funciona |
| sondas de conexão cortada, SSE sem `message_stop`, corpo não SSE, cancelamento no meio, `$ref` com padrão, ambiente do SDK e PNG transparente | reproduziram os achados abaixo |
| `test:ai-live` contra a API real | não rodado: sem chave (pendência do humano) |
| `bun run test:pedagogy` | não existe até a F1-10 |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | em parte | tipo e testes certos, mas o adaptador lançava em falha depois do 200 (CRÍTICO 1) |
| RF-02 | não | `$ref` com padrão ao lado perdia o padrão em `photoExtractionSchema` (CRÍTICO 3) |
| RF-03, RF-04, RF-08 | sim | `pricing.test.ts`, `image.test.ts`, docs |
| RF-05 | não | falha depois do 200 escapava e o `usage` de stream interrompido se perdia (CRÍTICOs 1 e 2) |
| RF-06 | em parte | fake não passava a foto pela redução (ALERTA 3) |
| RF-07 | sim | suíte no fake; `bun run test` sem rede; real só contra servidor local |

### Achados
- [CRÍTICO] `anthropic-provider.ts:81-90` — erro de rede depois do HTTP 200 (conexão cortada, SSE sem `message_stop`, proxy com HTML) chega como `AnthropicError`, que não é `APIError`, e o adaptador relançava — fere o RF-01 e o RF-05 e some do `ai_call` — mapear `AnthropicError` para `ai_unavailable`.
- [CRÍTICO] `anthropic-provider.ts:153-175` — `usage` descartado quando o stream falha depois do `message_start` (abort no teto de 15 min depois de 30.000 tokens: cerca de 30 centavos de dólar fora do `ai_call` e do teto, e a chamada volta à fila) — invariante 3 — montar o `usage` do retrato parcial.
- [CRÍTICO] `output-schema.ts:74` — `{ $ref, allOf: [padrões] }` virava só `{ $ref }`; o `photoExtractionSchema` perdia `^(?:ma|lp)[4-7]-…` no `topicId` — `ai_output_invalid` evitável na extração — manter a restrição ao lado do `$ref`.
- [ALERTA] `anthropic-provider.ts:233-238` — o SDK lia `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_LOG`, `ANTHROPIC_CUSTOM_HEADERS` e o modo de conteúdo do OpenTelemetry do ambiente; a chave foi enviada para o host do ambiente — configuração só por construtor e invariante 9.
- [ALERTA] `anthropic-provider.ts:206,225` — `durationMs` fracionário contra `ai_call.duration_ms` `integer`.
- [ALERTA] `fake-ai-provider.ts:69-99` — o fake não passava a foto por `reduceImage`; foto ilegível dava sucesso no fake.
- [ALERTA] `ai-provider.ts:52-57` — 401, 402 e 403 não voltam à fila: conta sem crédito ou limite de gasto manda pedido pago para `failed`; `jobs.md` §4 sem os códigos `ai_*`.
- [NOTA] `image.ts` — PNG transparente saía como JPEG todo preto.
- [NOTA] `output-schema.ts:116` — `z.toJSONSchema` no modo `output` descreve a saída do Zod, não a entrada do modelo.
- [NOTA] `anthropic-provider.ts:75-79` — 4xx fora da lista (405, 410, 451) virava `ai_unavailable`, retentável.
- [NOTA] `anthropic-provider.ts:235` — o timeout do SDK cobre só até os cabeçalhos.
- [NOTA] `data-model.md` — entrada 1.4 antes da 1.3.

### Regressão pedagógica
Pendente: escolha de modelos sem `test:pedagogy`, que só existe na F1-10 (known-issues).

### Resposta do orquestrador
Corrigido:
- CRÍTICO 1: `AnthropicError` genérico, depois dos casos específicos, vira `ai_unavailable`. Testes: SSE fechado sem `message_stop` e corpo que falha no meio dão `ai_unavailable`.
- CRÍTICO 2: o adaptador guarda o último retrato da mensagem pelo evento `streamEvent`, porque o SDK apaga o `currentMessage` ao terminar o stream. Na falha, o `usage` sai desse retrato: entrada e cache exatos, saída como o maior valor entre o informado e a estimativa pelo texto visível. É um limite inferior, porque o raciocínio oculto também é cobrado; isso está registrado no ADR-0011. Testes: conexão fechada, falha no meio e cancelamento no meio, todos com `usage` não nulo.
- CRÍTICO 3: `$ref` com restrição ao lado vira `allOf: [{ $ref }]` com a restrição na `description`. Teste novo nos sete schemas do core: todo `pattern` e todo `maxLength` do schema bruto aparecem na descrição convertida.
- ALERTA do ambiente: o cliente recebe `baseURL`, `authToken: null`, `logLevel: "off"` e `openTelemetry: false`. O teste com o ambiente poluído confere o host e a ausência de `Authorization`. `ANTHROPIC_CUSTOM_HEADERS` não tem opção no SDK para desligar; fica como risco aceito no ADR-0011, porque o ambiente de produção é controlado pelo deploy.
- ALERTA da duração: `Math.round` no adaptador; a suíte de contrato exige `Number.isInteger`.
- ALERTA do fake: o fake passa as fotos por `reduceImage`; caso novo na suíte de contrato, "foto ilegível é `ai_image_invalid` sem `usage`".
- NOTAs: `.flatten` com fundo branco (teste de PNG transparente); `io: "input"` (teste com `pipe`); 4xx desconhecido vira `ai_request_invalid`, menos 408 e 409 (tabela de teste); o timeout que só cobre os cabeçalhos está no ADR-0011; histórico do `data-model.md` em ordem.

Registrado para a F1-07, em known-issues:
- ALERTA da conta (401, 402, 403, limite de gasto em 400, teto do tier em 429 `enforced_spend_limit_reached`) e alinhamento do `jobs.md` §4. A decisão de manter o pedido na fila e alertar o operador é da orquestração do `order.generate`, que ainda não existe; o adaptador já devolve códigos distintos.

Comandos depois da correção: `bun run lint`, `bun run typecheck` e `bun run build` verdes; `bun run test` verde (core 710, integrations 338 com 17 pulados, db 98, api 25, worker 21).
