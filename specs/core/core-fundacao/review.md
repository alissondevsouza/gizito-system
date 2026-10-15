---
feature: F0-04 core-fundacao
module: core
round: 1
verdict: APROVADO
updated: 2026-10-15
---

# Review: F0-04 core-fundacao

## Rodada 1

Verifier: `gizito-implement-verifier` (spawn novo, contexto isolado). Diff: `git diff main...HEAD` nos commits `74c3c61` e `6b302d6`. Zona sensível revisada: máquina de estados contra PRD §5 e rule `core.md`.

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun test` em `packages/core` (com `bunfig.toml`) | 180 pass, 0 fail, 13 arquivos; cobertura 100% funções e linhas |
| `bun run build` (raiz) | 2 tasks successful (api, worker) |
| probe: `guidSchema` com uuid maiúsculo × `photoStorageKey` × `storageKeySchema` | `guidSchema` aceita; a key gerada falhava em `storageKeySchema`/`putObjectInputSchema` (inconsistência confirmada) |
| probe: `publicTokenSchema` com `"a".repeat(43)`; `whatsapp.inbound` com `text: ""`; `isChargeExpired` com `status: "refunded"` | aceito (não canônico); aceito (vazio); `false` (correto) |
| `bun run lint`, `bun run typecheck`, `bun run test` (raiz) | não repetidos; árvore limpa em `6b302d6`, saída do orquestrador consistente com o diff |
| `test:integration` / regressão pedagógica | não aplicável (core sem IO; nenhum prompt, modelo, taxonomia ou validador) |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `constants.ts`; `constants.test.ts` afirma preço, limites, contagens, `ANSWER_KEY_COUNT = 10 + 10`, distribuições somando 10, cobertura mínima, TTL, retenção, alfabeto |
| RF-02 | sim | 19 enums em `enums.ts` com `List` + `Schema` + tipo; `enums.test.ts` fixa os 9 estados na ordem e os 6 jobs; rótulos pt-BR |
| RF-03 | sim | `order/state-machine.ts` com as 13 transições do PRD §5; `transitionOrder` devolve `Result`; teste com tabela independente + 77 combinações inválidas; `refunded` único terminal; `charge_expired` derivado em `charge/rules.ts`. Sem divergência do PRD nem da rule |
| RF-04 | sim | `order/schemas.ts`, `charge/schemas.ts`; testes de token, código, 4 assuntos, 301 chars, e-mail, E.164, phone × consent, `amountCents` 0 e 29.9 |
| RF-05 | sim | união discriminada dos 6 jobs + `jobPayloadSchemaByName` com `satisfies`; testes de válido, nome desconhecido, campo ausente, 1000/1001, descarte de extra |
| RF-06 | sim | relógio por parâmetro; bordas exatas; virada de mês e 29/02 |
| RF-07 | sim | cinco interfaces com Zod; `parseWebhook` discriminado; `AiProvider` 4 métodos genéricos; sem campo de fornecedor; `contracts.test.ts`; `tsc` verde |
| RF-08 | sim | `expected-answer.ts` (5 tipos); `storage/keys.ts`; testes de parse e de path traversal |
| RF-09 | sim | `purity.test.ts` varre `src/**` fora de `__tests__`; `zod` em `dependencies` |
| RF-10 | sim | `bunfig.toml` com threshold 0.7; probe mostra exit 1 abaixo do limiar; raiz verde |
| RF-11 | sim | `index.ts` reexporta os 17 módulos; api segue importando `@gizito/core`; roadmap, progress e README |

### Achados
- [ALERTA] `order/state-machine.ts:73-77` — `paidOrderStatusList`/`isPaidOrderStatus` = `paid|processing|ready` exclui `failed`, que também é pós-pagamento; o nome convida a uso indevido em "não duplicar pedido pago" ou reembolso. O conjunto real é o de vínculo de WhatsApp (PRD §9.2 item 3) — renomear.
- [ALERTA] `jobs/schemas.ts:31-36` — `whatsapp.inbound` carrega `phone` e `text`: duplica dado pessoal na tabela de jobs; log genérico de payload violaria a invariante 9 — carregar só `webhookEventId` ou registrar em F0-06 que payload nunca entra em log e que linhas concluídas são expurgadas.
- [ALERTA] `storage/keys.ts:10` e `common.ts:3` — `GUID_PATTERN` só minúsculo, `guidSchema` aceita maiúsculo: id vindo de rota passa no schema e a key falha no upload.
- [SUGESTÃO] spec RF-03 cita `isTerminalStatus`; código exporta `isTerminalOrderStatus`.
- [SUGESTÃO] `constants.test.ts` só confere a cobertura mínima contra o bloco de fixação; afirmar também contra `MOCK_QUESTION_COUNT`.
- [SUGESTÃO] `enums.ts:45` — `"fake"` em `paymentGatewayList` vai virar valor de `pgEnum` em produção; registrar a decisão.
- [SUGESTÃO] `interfaces/math-evaluator.ts:9-12` — `MathEvaluationError.expression` carrega saída de modelo; o worker deve logar só `code`.
- [SUGESTÃO] `jobs/schemas.ts:35` — `text` aceita string vazia; `whatsapp.md` diz que mensagem sem texto é ignorada; `.min(1)`.
- [SUGESTÃO] `order/schemas.ts:20-22` — `publicTokenSchema` aceita 43 chars não canônicos; restringir o último caractere a `[AQgw]`.
- [SUGESTÃO] `bunfig.toml:4` — `coverageSkipTestFiles` não exclui `__tests__/__fixtures__/entities.ts`; usar `coveragePathIgnorePatterns`.

### Regressão pedagógica
não aplicável

### Resposta do orquestrador
- ALERTA 1: aplicado. Renomeado para `whatsappLinkableOrderStatusList`/`isWhatsappLinkableOrderStatus`; teste renomeado.
- ALERTA 2: mantido o payload com `phone` e `text` (o handler precisa do texto e `webhook_event` não guarda corpo por desenho), com `text` passando a `.min(1)` e a restrição registrada como decisão da spec e pendência explícita de F0-06 em `docs/progress/core.md`: payload de job nunca entra em log em nível nenhum, e linhas concluídas de `whatsapp.inbound` são expurgadas na conclusão. Alternativa (API extrai o comando por regex e enfileira só `{ webhookEventId, phone, command }`) fica anotada para F2-10 decidir, porque muda onde a rule `whatsapp.md` coloca a regex.
- ALERTA 3: aplicado. `GUID_PATTERN` aceita maiúsculas e os builders normalizam para minúsculas; teste novo cobre uuid maiúsculo.
- SUGESTÕES: todas aplicadas (nome na spec; teste contra os dois blocos; `"fake"` registrado em Decisões com a condição de F0-07 rejeitar `PAYMENT_GATEWAY=fake` em produção; nota de log do `MathEvaluationError` em Decisões; `text.min(1)`; token canônico `[AQgw]` com fixture e testes ajustados; `coveragePathIgnorePatterns`). Suíte: 182 pass, cobertura 100%, raiz verde.
