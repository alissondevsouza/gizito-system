---
paths:
  - "packages/integrations/**/*.ts"
---

# Integrations — Adaptadores (`@gizito/integrations`)

## Papel
Implementações concretas das interfaces do `core`: `PaymentGateway` (Mercado Pago, Asaas como plano B), `NotificationChannel` (Resend, Evolution API), `AiProvider`, `ObjectStorage` (R2), `MathEvaluator` (mathjs), render de fórmulas (KaTeX). Mais os **fakes** de cada interface para testes.

## Regras
- Um diretório por fornecedor: `src/mercadopago/`, `src/evolution/`, `src/resend/`, `src/r2/`, `src/ai/`, `src/math/`, `src/fakes/`.
- Adaptador não contém regra de negócio: traduz entre o mundo do fornecedor e os tipos do core. Decidir se um pedido muda de estado é do service, nunca do adaptador.
- Toda resposta de fornecedor é validada com Zod antes de virar tipo do core; campos inesperados são ignorados, campos obrigatórios ausentes viram erro tipado (`GatewayResponseError`, `AiOutputError`).
- Timeouts explícitos em toda chamada HTTP; retries só para erros transitórios e só onde a operação é idempotente (criação de cobrança usa `X-Idempotency-Key`).
- Configuração por construtor (`createMercadoPagoGateway({ accessToken, webhookSecret, fetch })`), nunca lendo `process.env` dentro do adaptador; quem lê env é `config.ts` da app.
- Erros de fornecedor são mapeados para códigos estáveis do core; a mensagem bruta do fornecedor vai para o log em nível `debug`, nunca para o usuário.
- Fakes em `src/fakes/` implementam a interface completa com comportamento controlável (`fakeGateway.markPaid(chargeId)`, `fakeAi.nextOutput(fixture)`), são determinísticos e não dependem de rede.
- Ao escrever ou alterar `src/ai/`, carregar a skill `claude-api` e nunca inventar assinatura de SDK; consultar `context7` para os demais SDKs.

## Fornecedores
- Mercado Pago: regras em `payments.md`.
- Evolution API: regras em `whatsapp.md`.
- Resend: template de e-mail por tipo (`kit_ready`, `kit_failed`, `order_link`), remetente e domínio autenticados (SPF/DKIM/DMARC); link do pedido no corpo, PDFs nunca anexados.
- R2: bucket privado; keys `photos/{orderId}/{photoId}.jpg` e `photos/{orderId}/{photoId}-thumbnail.jpg` (prefixo com ciclo de vida de 30 dias), `orders/{orderId}/kits/{kitId}/activities.pdf` e `answer-key.pdf`; `storageKeySchema` só aceita GUID em minúsculas; URLs assinadas com `SIGNED_URL_TTL_SECONDS` (10 minutos) do core, até `MAX_SIGNED_URL_TTL_SECONDS`. Adaptador com `aws4fetch` (ADR-0012); no dev e na CI, o MinIO do compose; `test:storage-live` contra o R2 real.
- IA: dois modelos configuráveis (`AI_MODEL_EXTRACT`, `AI_MODEL_GENERATE`); saída sempre em JSON validado; `usage` com tokens e custo em centavos; `promptVersion` ecoado.

## Testes
- Unit com `fetch` injetado e respostas gravadas (fixtures sanitizadas, sem credenciais nem dados reais).
- Contrato: cada fake e cada adaptador real passam na mesma suíte de contrato da interface.
