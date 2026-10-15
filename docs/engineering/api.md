# API HTTP (`apps/api`)

**Versão:** 1.0 · **Data:** 2026-10-15 · **Fonte:** PRD §5, §6, §9.1, §9.2; design doc §6; `.claude/rules/api.md` · **Implementação:** F0-07 (`/health`), F2-01 a F2-11

Elysia em Bun. Toda rota tem schema Zod de entrada e de resposta; handlers finos chamam services; services usam Drizzle e `transitionOrder` dentro de transação. A API não chama IA. Prefixo sem versão no MVP (`/orders`, não `/v1/orders`); versionar quando houver segundo consumidor.

## 1. Convenções

- JSON em UTF-8; datas em ISO 8601 UTC; ids como uuid; valores em centavos.
- Erros: `{ "error": "mensagem em pt-BR para o usuário", "code": "codigo_estavel" }` com status HTTP adequado. Códigos: `invalid_token`, `order_not_found`, `invalid_state`, `photo_too_large`, `photo_invalid`, `too_many_photos`, `charge_expired`, `charge_active`, `rate_limited`, `validation_error`, `unauthorized`.
- Token inexistente ou inválido → **404 neutro** `order_not_found`, sem revelar se o token existiu.
- CORS restrito a `WEB_PUBLIC_URL`. HTTPS atrás do proxy.
- Rate limit: prévia gratuita por IP + cookie de dispositivo (`PREVIEW_RATE_LIMIT_PER_HOUR`, `PREVIEW_RATE_LIMIT_PER_DAY`); webhooks por IP.
- Logs com `orderId`, rota, status, duração, `code`. Nunca foto, texto extraído, observação, `qr_code`, token, e-mail, telefone completo ou corpo de webhook.

## 2. Rotas públicas (comprador)

| Método e rota | Entrada | Efeito | Resposta |
|---|---|---|---|
| `POST /orders` | multipart: `grade`, `subject`, `photos[]` (1–5, JPG/PNG, ≤ 8 MB cada) | valida, remove EXIF, reduz, calcula hash, grava no R2; cria `draft`; enfileira `order.analyze` na mesma transação | `201 { publicToken, shortCode, status }` |
| `GET /orders/:token` | — | — | `200` com o estado e os dados da etapa atual (seção 3) |
| `POST /orders/:token/confirm` | `topicIdList` (1–3) ou `otherTopicText`, `email`, `noteText?`, `perceivedDifficulty?`, `acceptedTerms: true` | `preview_ready → awaiting_payment`; cria cobrança via `PaymentGateway` na mesma transação | `200` com a cobrança (`qrCode`, `qrCodeBase64`, `expireDatetime`, `amountCents`) |
| `POST /orders/:token/charges` | — | nova cobrança só se a anterior expirou (`charge_expired`); `charge_active` se ainda válida; `invalid_state` se já pago | `201` com a cobrança |
| `GET /orders/:token/downloads/:kind` | `kind` ∈ `activities`, `answer_key` | só em `ready`; gera URL assinada com TTL de minutos | `200 { url, expiresAt }` |
| `POST /orders/:token/whatsapp/unlink` | — | limpa `whatsapp_phone` e consentimento | `204` |
| `POST /orders/:token/report` | `kind`, `noteText` (≤ 300) | abre `support_ticket` | `201 { supportTicketId }` |
| `GET /health` | — | checa banco | `200 { status: "ok" }` |

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
| `refunded` | `refundedDatetime` |

O web usa só `status` (e `substate`) para decidir a rota (design doc §6.8).

## 4. Webhooks

| Rota | Validação | Efeito | Resposta |
|---|---|---|---|
| `POST /webhooks/mercadopago` | header `x-signature` (HMAC com `ts` e `v1`, segredo por env) | registra `webhook_event` (unique por `source` + `external_id`); duplicado → 200 sem efeito; consulta o recurso no gateway e, se pago, `markOrderPaidAndEnqueue`; nunca confia no corpo | `200` em menos de 22 s |
| `POST /webhooks/whatsapp` | segredo na URL ou header; ignora `fromMe`, grupos e mensagens sem texto; desligado com `WHATSAPP_ENABLED=false` | registra `webhook_event`; enfileira `whatsapp.inbound` com telefone e texto limitados | `200` |

Processamento pesado nunca acontece inline: o webhook registra, enfileira ou faz uma consulta curta, e responde.

## 5. Admin (`/admin/*`)

Operador único com sessão (login por senha forte em env, cookie `HttpOnly`, expiração curta). Ações auditadas com quem e quando.

| Rota | Ação |
|---|---|
| `POST /admin/login`, `POST /admin/logout` | sessão |
| `GET /admin/orders?email=\|shortCode=` | busca; e-mail e telefone mascarados |
| `GET /admin/orders/:orderId` | pedido, cobranças, kits, `ai_call`, notificações, tickets; fotos só por ação explícita e auditada |
| `POST /admin/orders/:orderId/reprocess` | `failed → paid` + `order.generate` |
| `POST /admin/orders/:orderId/republish` | novo kit a partir do `study_kit` corrigido; supersede o anterior; sem nova cobrança |
| `POST /admin/orders/:orderId/refund` | reembolso no gateway com motivo; `→ refunded` |
| `POST /admin/orders/:orderId/email` | corrige e-mail, com verificação |
| `POST /admin/orders/:orderId/whatsapp/unlink` | remove vínculo |
| `PATCH /admin/tickets/:supportTicketId` | resolve ticket |
| `POST /admin/orders/:orderId/erase` | remoção a pedido do titular (e-mail, telefone, fotos, PDFs) |

## 6. Configuração

`src/config.ts` valida o ambiente com Zod no boot; variável obrigatória ausente derruba o processo nomeando o campo. Ausência de `WHATSAPP_*` com `WHATSAPP_ENABLED=false` é válida. Lista em `.env.example`.

## Histórico

- **1.0 (2026-10-15):** versão inicial (F0-03). Os schemas de entrada e resposta entram em `packages/core` conforme as rotas forem implementadas (F2-01 em diante).
