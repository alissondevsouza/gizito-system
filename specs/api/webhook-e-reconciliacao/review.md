---
feature: webhook-e-reconciliacao
module: api
round: 1
verdict: APROVADO
updated: 2026-10-22
---

# Review: webhook-e-reconciliacao (F2-04)

## Revisão da spec

- **Rodada 1 (22/10/2026): REPROVADO.** 1 CRÍTICO: a task 5.3 (api e worker no ar com o fake) era impossível com o fake em memória em dois processos. 4 ALERTAs: desfecho do job nos caminhos de erro não declarado e `WebhookEventNotFoundError` fora da lista; pagamento em dobro sem webhook passava despercebido depois de um `cancel_failed`; `paid` com `gatewayPaymentId` nulo na consulta virava divergência; `recordWebhookEvent` sem o desfecho do passo 4 do RF-08. 4 SUGESTÕES: teto no `action`; índice `(status, insert_datetime)`; fábrica do gateway no `integrations`; nomes de arquivo nos globs de `payments.md`. Tudo incorporado, menos a fábrica (os fakes vivem num entrypoint separado); ver a tabela de Decisões da spec.
- **Rodada 2 (22/10/2026): APROVADO.** 1 ALERTA (nomes da task 4.2) e 3 SUGESTÕES de texto (tasks com o que a rodada 1 acrescentou, efeito do `unknownChargeStatus=paid` na varredura, tasks feitas marcadas), todos aplicados.

## Rodada 1 (código)

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint` (raiz) | limpo, 446 arquivos |
| `bun run typecheck` (raiz) | 6 tasks ok |
| `bun run test` (raiz) | 6 workspaces verdes (core 848; integrations 481 e 21 pulados; api 45; worker 346 e 15 pulados; db 112; web) |
| `bun run test:integration` em `packages/db` | 169 pass |
| `bun run test:integration` em `packages/integrations` | 6 pass |
| `bun run test:integration` em `apps/api` | 78 pass |
| `bun run test:integration` em `apps/worker` | 72 pass |
| `bun run --cwd packages/db db:generate` (revisor) | "No schema changes": snapshot 0006 alinhado ao schema |
| Task 5.3: api e worker no ar com o fake contra o banco de dev | `confirm` 200; webhook `queued`, repetido `duplicate`, `type=payment` `ignored`, sem assinatura 401; `GET` → `paid`; `charge` paga, `webhook_event` processado `paid`, `charge.reconcile` `completed`, `order.generate` `pending`; logs sem e-mail, `qr_code`, assinatura, `action` ou payload |

### Navegador
não aplicável (sem superfície de UI)

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `packages/core/src/jobs/schemas.ts` (`superRefine`); `__tests__/jobs/schemas.test.ts` |
| RF-02 | sim | `packages/core/src/interfaces/payment-gateway.ts`; contrato em `__tests__/payment/contract.ts` (fake e live) |
| RF-03 | sim | `packages/core/src/charge/reconcile.ts`; `__tests__/charge/reconcile.test.ts` |
| RF-04 | sim | `packages/core/src/charge/rules.ts`; unit e `mark-order-paid-and-enqueue.test.ts` (valor divergente sem escrita) |
| RF-05 | sim | `packages/db/src/order/mark-order-paid-and-enqueue.ts`; teste confere `expiredChargeList` e os `charge.reconcile` agendados |
| RF-06 | sim | migration 0006; `charge.test.ts` (checks), `charge-reconcile.test.ts` (db), `webhook-and-notification.test.ts` |
| RF-07 | sim | `mercadopago-gateway.test.ts` (cancel), `mercadopago-webhook.test.ts` (teto do `action`), `fake-payment-gateway.test.ts` |
| RF-08 | sim | `apps/api/src/routes/webhooks/mercadopago.ts`, `services/charge-webhooks.ts`; `__tests__/integration/webhooks.test.ts` (inclusive adaptador real assinado) |
| RF-09 | sim | `apps/worker/src/config.ts`, `index.ts`, `jobs/index.ts`; `config.test.ts`, `scheduler.test.ts`, `lanes.test.ts` |
| RF-10 | sim | `apps/worker/src/jobs/charge-reconcile.ts`; `__tests__/integration/charge-reconcile.test.ts` |
| RF-11 | sim | varredura do `memoryLogger` nos testes da api e do worker |
| RF-12 | pendente do humano | notificação real do sandbox exige túnel e credencial; roteiro no Status da spec e linha LOW no `known-issues.md` |

### Achados
- [ALERTA] `packages/integrations/src/mercadopago/mercadopago-gateway.ts:265`, `apps/api/src/services/charge-webhooks.ts:91` — a dedup é por `{data.id}:{action}`; duas notificações legítimas com o mesmo `action` para a mesma order deixariam a segunda como `duplicate` sem job, e a confirmação viria só pela varredura (até 2 min mais o atraso do gateway) — o corpo não entra na assinatura; o `x-request-id` (assinado) é único por notificação — ao fazer o RF-12, registrar os `action` reais; se repetirem, incluir o `x-request-id` no `externalId` ou reenfileirar no `duplicate` de evento processado como `pending`.
- [SUGESTÃO] `apps/worker/src/jobs/charge-reconcile.ts` — cobrança sem `gatewayOrderId` sai com `error` e `failed` no job dirigido, e o RF-10 dizia "pulada com `warn`"; caminho inatingível hoje — alinhar o texto.
- [SUGESTÃO] `packages/integrations/src/fakes/fake-payment-gateway.ts` — com `unknownChargeStatus=paid`, o `cancelCharge` de order desconhecida era no-op e a consulta seguinte continuava `paid`, então no dev a varredura podia pagar o Pix antigo e abrir `duplicate_payment` para o novo — guardar os cancelados e responder `expired`.
- [SUGESTÃO] `apps/api/src/http/webhook-rate-limit.ts` — chave do rate limit com o IP cru; a prévia usa `normalizeClientIp` — normalizar antes do `take`.
- [SUGESTÃO] `apps/worker/src/__tests__/integration/charge-reconcile.test.ts` — a afirmação "varredura e job dirigido ao mesmo tempo dão um `paid` e um `already_paid`" não tinha teste no nível do job.
- [SUGESTÃO] `apps/worker/src/__tests__/runner/lanes.test.ts` — o aceite do RF-09 pede `buildJobLaneList(handledJobNameList)`; o teste usava `jobNameList`.
- [SUGESTÃO] pendências do humano já no Status da spec: `.env.example` sem `FAKE_GATEWAY_UNKNOWN_CHARGE_STATUS` e o RF-12.

### Regressão pedagógica
não aplicável (sem mudança em prompt, modelo, taxonomia ou validador)

### Resposta do orquestrador
- ALERTA da dedup por `action`: **registrado como dívida LOW** no `known-issues.md`, condicionada à notificação real do sandbox (RF-12). A doc do Mercado Pago lista ações por transição (`order.processed`, `order.action_required`, `canceled`, `failed`), então o mesmo `action` repetido deve ser o reenvio da mesma notificação, que é exatamente o caso a deduplicar; trocar a chave agora sem evidência tiraria o no-op do webhook duplicado, que é critério do roadmap. A varredura limita o atraso a 2 min mais o lag do gateway se a hipótese falhar.
- SUGESTÕES 1 a 5 aplicadas: texto do RF-10 alinhado ao código (`gateway_order_missing` é anomalia com `error` e job `failed`); o fake guarda as orders desconhecidas canceladas e responde `expired` (teste no `fake-payment-gateway.test.ts`; RF-07 e `payments.md` atualizados); `normalizeClientIp` antes do `take` na rota do webhook; teste de concorrência varredura × job dirigido no worker (um `paid`, um `already_paid`, um `order.generate`); caso com `handledJobNameList` no `lanes.test.ts`. Suíte rerodada depois: worker 346 unit e 72 integração, integrations 481, api 45 e 78, lint e typecheck limpos.
- SUGESTÃO 6: as pendências continuam no Status da spec e no handoff.
