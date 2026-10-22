---
feature: confirmacao-e-cobranca-pix
module: api
round: 2
verdict: APROVADO
updated: 2026-10-22
---

# Review: confirmacao-e-cobranca-pix (F2-03)

## Rodada 1

Revisão neutra do diff `main...HEAD` até `0847c07`, por um `gizito-implement-verifier` novo.

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint` (orquestrador) | limpo, 432 arquivos |
| `bun run typecheck` (orquestrador) | 6 de 6 |
| `bun run test` (orquestrador) | core 832, integrations 469, worker 343, db 112, api 43; 0 falhas |
| `bun run test:integration` (orquestrador) | db 162, integrations 6, api 68, worker 56; 0 falhas |
| `bun run --cwd packages/integrations test:payment-live` (orquestrador) | 4 pulados, sem `MERCADOPAGO_TEST_ACCESS_TOKEN` |
| mutações do orquestrador no `charges.ts` | sem checagem sob o lock → 1 falha; sem trava do processo → 2; sem releitura do status → 1 |
| `bun test src/__tests__/integration/charges.test.ts` numa cópia do `0847c07` (revisor) | 29 passam |
| mutação do revisor: `amountCents: 1` e outro e-mail na chamada ao gateway | 29 passam: nenhum teste percebe |
| mutação do revisor: e-mail e QR no warn da órfã, sob chaves que o logger não mascara | 29 passam: nenhum teste percebe |
| sondas do revisor no core | "Ampliação na MALHA quadriculada" aceito em Português; máscara válida com `_`, `'` e `+`; saneamento com U+2028, U+00A0 e U+200D |

### Navegador
Não aplicável: a feature não tem UI. A evidência HTTP é o `curl` do orquestrador contra a API no ar com o fake. Resultados: `confirm` 422, 400, 200 e 409; `charges` 409 e 201; `GET` com `charge_expired`; log sem dado pessoal.

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `packages/core/src/__tests__/interfaces/contracts.test.ts`, `charge/schemas.test.ts` |
| RF-02 | sim | `order/confirm.test.ts`, `text/sanitize.test.ts` |
| RF-03 | sim | `order/view.test.ts`, `order/email.test.ts` |
| RF-04 | sim | `api/errors.test.ts`; integração do 422 |
| RF-05 | sim | `packages/integrations/src/__tests__/payment/fake-payment-gateway.test.ts` e a suíte de contrato |
| RF-06 | sim | `mercadopago-gateway.test.ts`, `mercadopago-webhook.test.ts` |
| RF-07 | sim | `0005_confirmacao_e_cobranca_pix.sql` (`DROP NOT NULL`), `charge.test.ts` |
| RF-08 | não | nenhum teste confere o valor e o e-mail enviados ao gateway |
| RF-09 | sim, com ressalva | o e-mail gravado que vai ao gateway não é verificado |
| RF-10 | sim | `charges.test.ts` (`charge_expired`, `charge_missing`) |
| RF-11 | sim | `apps/api/src/__tests__/config.test.ts`, `config/schemas.test.ts` |
| RF-12 | sim, como script | pula sem a variável; a rodada real é do humano |
| RF-13 | não | o teste de logs não provoca uma órfã |

### Achados
- [CRÍTICO] `apps/api/src/__tests__/integration/charges.test.ts:243` — nenhum teste confere que o gateway recebe `KIT_PRICE_CENTS` e o e-mail do pagador. O valor da linha vem da constante, e não do que foi enviado. Com o `decidePaymentConfirmation` ainda sem conferir o valor pago, uma cobrança de R$ 0,01 passaria pela F2-04 sem alarme. Correção: conferir a entrada recebida pelo fake e o `getChargeStatus` no caminho feliz e na renovação.
- [CRÍTICO] `apps/api/src/__tests__/integration/charges.test.ts:561` — o teste do RF-13 não provoca uma órfã, então e-mail ou código Pix no warn da órfã não seriam pegos (invariante 9). Correção: provocar a órfã antes da varredura.
- [ALERTA] `.env.example` — faltam `MERCADOPAGO_TEST_ACCESS_TOKEN` e `MERCADOPAGO_LIVE_EXPIRED_ORDER_ID`. As duas chaves da api já estão lá. A decisão é do humano.
- [ALERTA] `spec.md:302` — a pendência manda pôr `MERCADOPAGO_ACCESS_TOKEN` no `.env` "para rodar o RF-12", mas o teste lê `MERCADOPAGO_TEST_ACCESS_TOKEN`.
- [SUGESTÃO] `apps/api/src/errors.ts:127` — o `gateway_rejected` vira 503 "tente de novo", e o comprador fica sem saída; vale rever na F2-09.
- [SUGESTÃO] `apps/api/src/errors.ts:117` — o rótulo entra com maiúscula no meio da frase.
- [SUGESTÃO] `packages/core/src/__tests__/order/confirm.test.ts:137` — o caso em Português usa outro texto; usar a mesma string.
- [SUGESTÃO] `packages/integrations/src/mercadopago/mercadopago-gateway.ts:140` — timeout na leitura do corpo vira `gateway_response_invalid` sem retentativa.
- [SUGESTÃO] `mercadopago-gateway.ts:229` — o `ts` do `x-signature` não tem janela de tolerância; registrar para a F2-04.
- [SUGESTÃO] `charges.test.ts:432` — o `Cache-Control: no-store` não é conferido no `POST /charges`.

### Regressão pedagógica
Não aplicável: a feature não muda prompt, modelo, taxonomia nem validador.

### Resposta do orquestrador
Corrigidos:
- **CRÍTICO 1.** O fake guarda as entradas em `createChargeInputList`. O caminho feliz confere `chargeId`, `orderId`, `KIT_PRICE_CENTS`, o e-mail normalizado e o vencimento, além do `getChargeStatus` (valor e `externalReference`). A renovação confere o e-mail gravado no pedido. As mutações do revisor foram repetidas e agora falham: valor e e-mail errados no gateway → 2 falhas; e-mail errado na renovação → 1 falha.
- **CRÍTICO 2.** O teste do RF-13 provoca uma órfã (`pauseCreate()` com o pedido mudado antes do `release()`), confere que o warn saiu e varre também o token e o QR da órfã. A mutação do revisor (e-mail e QR no warn) agora falha.
- **ALERTA 2.** A pendência da spec cita `MERCADOPAGO_TEST_ACCESS_TOKEN` e a segunda rodada com `MERCADOPAGO_LIVE_EXPIRED_ORDER_ID`.
- **SUGESTÃO do timeout na leitura do corpo.** Falha ao ler o corpo vira `gateway_unavailable` com retentativa e a mesma chave: na criação, a order pode já existir no gateway, e a chave devolve a mesma. Há dois testes novos.
- **SUGESTÃO do Português.** Usa a mesma string, "Ampliação na MALHA quadriculada".
- **SUGESTÃO do `no-store`.** É conferido no `POST /charges`.

Ficaram para o humano ou para outra feature:
- **ALERTA 1** (`.env.example`): o agente não lê nem edita o arquivo (permissão do projeto). `MERCADOPAGO_LIVE_EXPIRED_ORDER_ID` é de uma rodada só e pode ir na linha de comando. `MERCADOPAGO_TEST_ACCESS_TOKEN` fica como pergunta no handoff.
- **SUGESTÃO do `gateway_rejected`**: segue o RF-08 passo 4 da spec. Ficou registrada como herança da F2-09 no Status da spec.
- **SUGESTÃO do `ts`**: ficou registrada como herança da F2-04 no Status da spec.

Contestado:
- **Maiúscula do rótulo no meio da frase**: baixar a inicial estragaria rótulos que começam com sigla ou nome próprio. O web recebe o `unsupportedTopicList` e pode compor o texto na F2-09; o `error` da api é o texto de reserva.

## Rodada 2

Revalidação só dos pontos corrigidos (`git diff 0847c07..56f047d`), por outro `gizito-implement-verifier` novo.

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun test src/__tests__/integration/charges.test.ts` (api, cópia do `56f047d`) | 29 passam |
| `bun test src/__tests__/payment` (integrations, cópia) | 54 passam, 4 pulados (live) |
| `bun test src/__tests__/order/confirm.test.ts` (core, cópia) | 8 passam |
| `bun run test:integration` (integrations, cópia) | 6 passam |
| mutações do revisor: valor 1 no gateway; e-mail errado na renovação; e-mail e QR (juntos e separados) no warn da órfã, no ramo `!committed.ok`; sem o warn; leitura do corpo com `response.json()` ou sem retentativa | todas falham (de 1 a 4 testes) |
| mutação do revisor: e-mail e QR no warn da órfã, no ramo `catch` (exceção no commit) | 29 passam: nada percebe |

### Navegador
Não aplicável.

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-02 | sim | `confirm.test.ts` com "Ampliação na MALHA quadriculada" nas duas disciplinas |
| RF-06 | sim | `mercadopago-gateway.test.ts` (corpo cortado com retentativa e a mesma chave) |
| RF-08 | sim | `charges.test.ts` (entrada recebida pelo fake e `getChargeStatus`) |
| RF-09 | sim | `charges.test.ts` (e-mail gravado na renovação, `no-store`) |
| RF-13 | sim | `charges.test.ts` (órfã provocada e varrida) |

### Achados
- [ALERTA] `apps/api/src/services/charges.ts:204` — a órfã do ramo `catch` (exceção dentro da transação) não passa por nenhuma varredura de log; o invariante 9 só está coberto num dos dois caminhos da órfã.
- [SUGESTÃO] `apps/api/src/__tests__/integration/charges.test.ts:606` — o QR da órfã vem de `createdChargeList.at(-1)`, que depende da ordem das chamadas.

### Resposta do orquestrador
Os dois foram corrigidos:
- O teste da falha no insert do job varre o log atrás de e-mail, token, observação e QR da órfã. A mutação do ramo `catch` (e-mail e QR no warn) agora falha: 28 passam e 1 falha.
- O QR da órfã é localizado pelo `orderId`, cruzando `createChargeInputList` com `createdChargeList`.

Como não houve CRÍTICO, não há rodada 3.
