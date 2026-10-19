# API HTTP (`apps/api`)

**Versão:** 1.2 · **Data:** 2026-10-19 · **Fonte:** PRD §5, §6, §9.1, §9.2; design doc §6; `.claude/rules/api.md` · **Implementação:** F0-07 (`/health`), F2-01 a F2-11

Elysia em Bun. Toda rota tem schema Zod de entrada e de resposta; handlers finos chamam services; services usam Drizzle e `transitionOrder` dentro de transação. A API não chama IA. Prefixo sem versão no MVP (`/orders`, não `/v1/orders`); versionar quando houver segundo consumidor.

## 1. Convenções

- JSON em UTF-8; datas em ISO 8601 UTC; ids como uuid; valores em centavos.
- Erros: `{ "error": "mensagem em pt-BR para o usuário", "code": "codigo_estavel" }` com status HTTP adequado. Códigos (`apiErrorCodeList` do core): `invalid_token`, `order_not_found`, `invalid_state`, `photo_too_large`, `photo_invalid`, `too_many_photos`, `charge_expired`, `charge_active`, `rate_limited`, `validation_error`, `unauthorized`, `not_found`, `internal_error`.
- Erros genéricos, tratados no `onError` do app: rota desconhecida → `404 not_found`; corpo malformado, arquivo de tipo inválido ou entrada fora do schema → `400 validation_error`; `throw status(4xx, { error, code })` de handler ou service sai com o mesmo status e corpo; resposta fora do schema, status lançado com corpo fora do contrato ou exceção → `500 internal_error`, com log `error` só do nome do erro (a causa vai para `debug`). Contratos `apiErrorSchema` e `apiHealthSchema` no core, para o web validar.
- Token inexistente ou inválido → **404 neutro** `order_not_found`, sem revelar se o token existiu.
- CORS restrito a `WEB_PUBLIC_URL`. HTTPS atrás do proxy.
- Rate limit: prévia gratuita por IP + cookie de dispositivo (`PREVIEW_RATE_LIMIT_PER_HOUR`, `PREVIEW_RATE_LIMIT_PER_DAY`); webhooks por IP.
- Logs com `orderId`, padrão da rota (`/orders/:token`, nunca a URL, que leva o token), método, status real da resposta (inclusive quando o handler devolve um `Response`), duração e, nas respostas de erro, o `code` do corpo no campo `errorCode`; um log `request` por resposta. Nunca foto, texto extraído, observação, `qr_code`, token, e-mail, telefone completo ou corpo de webhook.

## 2. Rotas públicas (comprador)

| Método e rota | Entrada | Efeito | Resposta |
|---|---|---|---|
| `POST /orders` | multipart: `grade`, `subject`, `photos[]` (1–5, JPG/PNG, ≤ 8 MB cada) | valida, remove EXIF, reduz, calcula hash, grava no R2; cria `draft`; enfileira `order.analyze` na mesma transação | `201 { publicToken, shortCode, status }` |
| `GET /orders/:token` | — | — | `200` com o estado e os dados da etapa atual (seção 3) |
| `POST /orders/:token/confirm` | `topicIdList` (1–3) ou `otherTopicText`, `email`, `noteText?`, `perceivedDifficulty?`, `acceptedTerms: true` | cria a cobrança no gateway primeiro (idempotente por `chargeId`; cobrança órfã expira sozinha em 30 min); depois, numa transação, `preview_ready → awaiting_payment` e insert de `charge` | `200` com a cobrança (`qrCode`, `qrCodeBase64`, `expireDatetime`, `amountCents`) |
| `POST /orders/:token/charges` | — | nova cobrança só se a anterior expirou (`charge_expired`); `charge_active` se ainda válida; `invalid_state` se já pago | `201` com a cobrança |
| `GET /orders/:token/downloads/:kind` | `kind` ∈ `activities`, `answer_key` | só em `ready`; gera URL assinada com TTL de minutos | `200 { url, expiresAt }` |
| `POST /orders/:token/whatsapp/unlink` | — | limpa `whatsapp_phone` e consentimento | `204` |
| `POST /orders/:token/report` | `kind`, `noteText` (≤ 300) | abre `support_ticket` | `201 { supportTicketId }` |
| `GET /health` | — | checa banco (`pingDatabase`) | `200 { status: "ok" }`; sem banco `503 { status: "unavailable" }` |

Não existe `PUT`/`DELETE` de pedido: o comprador não edita pedido confirmado; correção de e-mail é pelo suporte.

## 3. `GET /orders/:token` por estado

A resposta sempre traz `publicToken`, `shortCode`, `status`, `grade`, `subject`, `insertDatetime` e, por estado:

| Status | Campos adicionais |
|---|---|
| `draft` | `photoList` (id, miniatura assinada, `legibilityScore`, aviso), `warningList` quando a análise voltou a `draft` |
| `analyzing` | `photoList` |
| `preview_ready` | `topicCandidateList` (id, nome, confiança), `materialProfile` resumido, `kitPreview` (contagens e preço vindos do core) |
| `awaiting_payment` | `charge` (`qrCode`, `qrCodeBase64`, `ticketUrl`, `expireDatetime`, `amountCents`), `substate: "charge_expired" \| null`, `email` mascarado |
| `paid`, `processing` | `whatsapp` (`enabled`, `linked`, `phoneLast4`), `startedDatetime` |
| `ready` | `kit` (`publishedDatetime`, `pageCountActivities`, `pageCountAnswerKey`, `topicIdList`), `whatsapp`; os downloads vêm por rota própria |
| `failed` | `failReasonCode` mapeado para a mensagem do design doc 5.2; `supportUrl` |
| `refunded` | `refundedDatetime` (de `charge.refund_datetime`) |

O web usa só `status` (e `substate`) para decidir a rota (design doc §6.8).

## 4. Webhooks

| Rota | Validação | Efeito | Resposta |
|---|---|---|---|
| `POST /webhooks/mercadopago` | header `x-signature` (HMAC com `ts` e `v1`, segredo por env) | registra `webhook_event` (unique por `source` + `external_id`) e enfileira `charge.reconcile { orderId, webhookEventId }` na mesma transação; localiza a cobrança pelo unique `(gateway, gateway_order_id)`; duplicado → 200 sem efeito; a consulta ao gateway e `markOrderPaidAndEnqueue` acontecem no worker; o corpo serve só para localizar o pedido, nunca como prova de pagamento | `200` em menos de 22 s |
| `POST /webhooks/whatsapp` | segredo na URL ou header; ignora `fromMe`, grupos e mensagens sem texto; desligado com `WHATSAPP_ENABLED=false` | registra `webhook_event`; enfileira `whatsapp.inbound` com telefone e texto limitados | `200` |

Nada acontece inline além de validar, registrar e enfileirar: o webhook responde 200 e o worker faz o resto.

## 5. Admin (`/admin/*`)

Operador único com sessão (login por senha forte em env, cookie `HttpOnly`, expiração curta). Ações auditadas com quem e quando.

| Rota | Ação |
|---|---|
| `POST /admin/login`, `POST /admin/logout` | sessão |
| `GET /admin/orders?email=\|shortCode=` | busca; e-mail e telefone mascarados |
| `GET /admin/orders/:orderId` | pedido, cobranças, kits, `ai_call`, notificações, tickets; fotos só por ação explícita e auditada |
| `POST /admin/orders/:orderId/reprocess` | `failed → paid` + `order.generate` |
| `POST /admin/orders/:orderId/republish` | novo kit a partir do `study_kit` corrigido, gravando `superseded_by_kit_id` no anterior; sem transição de estado nem nova cobrança |
| `POST /admin/orders/:orderId/refund` | reembolso no gateway com motivo; `→ refunded` |
| `POST /admin/orders/:orderId/email` | corrige e-mail, com verificação |
| `POST /admin/orders/:orderId/whatsapp/unlink` | remove vínculo |
| `PATCH /admin/tickets/:supportTicketId` | resolve ticket |
| `POST /admin/orders/:orderId/erase` | remoção a pedido do titular (e-mail, telefone, fotos, PDFs) |

## 6. Configuração

`src/config.ts` valida o ambiente com Zod no boot (`apiConfigSchema`, que estende `sharedEnvironmentSchema` do core); variável obrigatória ausente faz o `index.ts` escrever no stderr cada campo (`z.prettifyError`) e sair com 1, antes de abrir porta ou banco. Obrigatórias hoje: `DATABASE_URL`, `WEB_PUBLIC_URL` (o CORS usa a origem dela) e `PAYMENT_GATEWAY` (sem default, para um deploy não cair no fake por esquecimento); `API_PORT` (3001), `HOST` (`127.0.0.1`), `LOG_LEVEL` (`info`) e `NODE_ENV` (`development`) têm default. Com `NODE_ENV=production`, `checkProductionEnvironment` do core recusa `PAYMENT_GATEWAY=fake` e `LOG_LEVEL` `debug` ou `trace`. O logger serializa `err` só com tipo, código, mensagem e stack, com e-mail, telefone e token mascarados (`serializeLogError` em `integrations`). Ausência de `WHATSAPP_*` com `WHATSAPP_ENABLED=false` é válida. `SIGTERM`/`SIGINT` param o servidor e fecham o banco; segundo sinal sai com 1. Lista em `.env.example`.

## Histórico

- **1.0 (2026-10-15):** versão inicial (F0-03). Os schemas de entrada e resposta entram em `packages/core` conforme as rotas forem implementadas (F2-01 em diante).
- **1.1 (2026-10-16):** F0-07: `/health` com `503 unavailable`, códigos `not_found` e `internal_error`, erros genéricos do `onError` (status lançado com corpo do contrato passa como está), log por padrão de rota, config com obrigatórias e defaults, desligamento por sinal.
- **1.2 (2026-10-19):** revisão da F0: o webhook do Mercado Pago enfileira `charge.reconcile` com `webhookEventId`, para o worker marcar `processed_datetime` em `markOrderPaidAndEnqueue`; log `request` com status real e `code`; `listen` sem `reusePort`; desligamento fecha o banco com teto.
