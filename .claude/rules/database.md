---
paths:
  - "packages/db/**/*.ts"
  - "packages/db/**/*.sql"
---

# Database — PostgreSQL 16 + Drizzle (`@gizito/db`)

## Padrões
- `pgTable` para schemas; migrations via `drizzle-kit generate` e `drizzle-kit migrate`; migration já aplicada **nunca** se edita (ver `docs/lessons.md`).
- Single-tenant: **não há** `store_id` nem RLS. O isolamento é por pedido: toda leitura pública passa por `order.public_token` (índice único) e nunca por `order_id` sequencial ou enumerável.
- Índices: SEMPRE para colunas de WHERE, JOIN e ORDER BY; em especial `order.public_token`, `order.short_code`, `charge.gateway_payment_id`, `order.status` + `update_datetime` (reconciliação e retenção).
- Soft delete só onde a retenção exige (`delete_datetime`); fotos e PDFs expirados são removidos do storage e marcados, nunca apagados silenciosamente do banco.

## Tabelas do MVP (nomes canônicos)
- `order`: pedido (`order_id`, `public_token`, `short_code`, `status`, `grade`, `subject`, `email`, `topic_id_list` jsonb, `other_topic_text`, `note_text`, `perceived_difficulty`, `material_profile` jsonb, `whatsapp_phone`, `whatsapp_consent_datetime`, `paid_datetime`, `ready_datetime`, `fail_reason_code`)
- `order_photo`: fotos (`order_photo_id`, `order_id`, `storage_key`, `content_hash`, `width`, `height`, `legibility_score`, `delete_datetime`)
- `charge`: cobranças Pix (`charge_id`, `order_id`, `gateway`, `gateway_order_id`, `gateway_payment_id`, `amount_cents`, `status`, `qr_code`, `qr_code_base64`, `ticket_url`, `expire_datetime`, `paid_datetime`, `refund_id`)
- `kit`: resultado (`kit_id`, `order_id`, `study_kit` jsonb, `generation_version`, `taxonomy_version`, `activities_storage_key`, `answer_key_storage_key`, `page_count_activities`, `page_count_answer_key`, `published_datetime`, `superseded_by_kit_id`)
- `ai_call`: toda chamada de IA (`ai_call_id`, `order_id`, `stage`, `model`, `prompt_version`, `input_token_count`, `output_token_count`, `cost_cents`, `duration_ms`, `outcome_code`). **Sem** o conteúdo do prompt nem da resposta.
- `webhook_event`: idempotência (`webhook_event_id`, `source`, `external_id`, `received_datetime`, `processed_datetime`, `outcome_code`); unique em (`source`, `external_id`)
- `notification`: envios (`notification_id`, `order_id`, `channel`, `kind`, `status`, `provider_message_id`, `error_code`)
- `support_ticket`: reportes (`support_ticket_id`, `order_id`, `kind`, `status`, `note_text`)
- Fila: tabelas do pg-boss no schema `pgboss`, ou `job` própria com `FOR UPDATE SKIP LOCKED`. Payloads validados com `jobPayloadSchema` do core na entrada e na saída.

## Convenções de Nomenclatura
- Tabelas: snake_case, **singular**. Export Drizzle: camelCase singular (`order`, `orderPhoto`, `charge`, `kit`, `aiCall`).
- PK com prefixo da tabela (`order_id`, `charge_id`); nunca `id`. JS: `orderId`, `chargeId`.
- Timestamps com sufixo `_datetime`; NUNCA `_at`. `insert_datetime` e `update_datetime` em toda tabela.
- Enums como `pgEnum`, com o array `List` correspondente vindo do `core` (fonte única).
- FKs com `onDelete` explícito; coleções em relações com sufixo `List`.

## Transações obrigatórias
- `markOrderPaidAndEnqueue(tx, ...)`: transição `awaiting_payment → paid` + insert do job de geração + marcação do `webhook_event`, numa única transação. Reexecução com o mesmo `gateway_payment_id` é no-op.
- `publishKit(tx, ...)`: grava `kit` com as duas storage keys + transição `processing → ready`. Nunca `ready` com uma key só.
- Retenção: jobs periódicos apagam fotos após `PHOTO_RETENTION_DAYS` e PDFs após `KIT_RETENTION_MONTHS`, registrando `delete_datetime`.

## Test helpers
- `@gizito/db/test-helpers` sobe Postgres em container docker, roda migrations e expõe `createTestDatabase()`; usado por `api`, `worker` e `integrations`.
