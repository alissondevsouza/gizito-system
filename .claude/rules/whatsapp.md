---
paths:
  - "packages/integrations/src/evolution/**"
  - "apps/api/src/routes/webhooks/whatsapp*"
  - "apps/worker/src/jobs/whatsapp*"
  - "apps/worker/src/notify/**"
  - "apps/web/src/components/WhatsAppOptIn*"
---

# WhatsApp — Evolution API com Baileys, somente resposta (PRD 9.2)

## Princípios inegociáveis
- O Gizito **nunca inicia conversa**. Só envia mensagem para número que escreveu primeiro com o código do pedido e ainda não pediu SAIR/PARAR.
- O canal **não conversa**: reconhece apenas código de pedido, SAIR e PARAR. Qualquer outra mensagem recebe no máximo uma resposta de ajuda por 24 horas por número.
- Nenhuma etapa depende do WhatsApp. `WHATSAPP_ENABLED=false` esconde o botão, ignora o webhook e pula o envio; e-mail segue sempre.
- Baileys é não oficial e o número pode ser banido (registrado em `docs/engineering/known-issues.md`). O código deve tornar a migração para `WHATSAPP-BUSINESS` uma troca de configuração da instância, não de código.

## Fluxo
1. Botão "Receber no WhatsApp" abre `https://wa.me/55{DDD}{número}?text=` com texto contendo `shortCode`.
2. Webhook `POST /webhooks/whatsapp` recebe `MESSAGES_UPSERT`: validar segredo da URL/header; ignorar `fromMe`, grupos e mensagens sem texto; registrar em `webhook_event`; enfileirar `whatsapp.inbound`.
3. `whatsapp.inbound`: extrair `shortCode` por regex estrita (`GZ-[A-Z2-9]{6}`); localizar pedido em `paid|processing|ready`; gravar `whatsapp_phone` + `whatsapp_consent_datetime`; responder a confirmação. Pedido `ready` recebe link + PDFs na hora. SAIR/PARAR → limpar vínculo e confirmar. Sem código reconhecido → resposta de ajuda (com limite diário).
4. `order.notify` com vínculo: `POST /message/sendText/{instance}` com link do pedido; `POST /message/sendMedia/{instance}` com `mediatype: "document"`, `fileName` e `media` = URL assinada de curta duração, para cada PDF. `delay` aleatório entre envios.
5. `failed` também avisa, com a mensagem de falha do design doc 5.2.

## Operação
- Uma instância por número (`POST /instance/create`, `integration: "WHATSAPP-BAILEYS"`); webhook por evento com `MESSAGES_UPSERT`, `CONNECTION_UPDATE`, `QRCODE_UPDATED`.
- `CONNECTION_UPDATE` desconectado → alerta e `WHATSAPP_ENABLED` efetivo false até reconectar; nunca enfileirar envios cegos.
- Limite de envio: poucos por minuto (`WHATSAPP_MAX_SENDS_PER_MINUTE`, default 10); fila com limite.
- Textos das mensagens vêm do design doc 5.2 e vivem em um único módulo (`notify/whatsapp-copy.ts`), em português, sem promessas.

## Privacidade e logs
- Telefone é dado pessoal: guardado só com consentimento, exibido mascarado (final 4 dígitos), removível pelo pedido e pelo admin, apagado com a retenção.
- Logar `orderId`, evento, `outcomeCode` e os 4 últimos dígitos; **nunca** o texto da mensagem recebida nem o número completo.
- `AUTHENTICATION_API_KEY` da Evolution e segredo do webhook só por env.

## Testes
- `FakeWhatsAppChannel` registra envios; testes cobrem: código válido, código de pedido não pago, SAIR, mensagem sem código (limite diário), `fromMe`, flag desligada, instância desconectada.
