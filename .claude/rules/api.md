---
paths:
  - "apps/api/**/*.ts"
---

# API — Elysia (`@gizito/api`)

## Padrões
- TODA rota tem schema Zod para body/params/query e response. Erros no formato `{ error: string, code: string }` com códigos estáveis (`invalid_token`, `order_not_found`, `photo_too_large`, `charge_expired`, `rate_limited`).
- Estrutura: `src/routes/` (handlers) → `src/services/` (regras com Drizzle) → `@gizito/db`. Handlers não tocam banco; services não conhecem HTTP. Sem repository.
- Config validada por Zod no boot (`src/config.ts`): env obrigatória ausente derruba o processo com mensagem nomeando o campo. Envs opcionais com default seguro; ausência de `WHATSAPP_*` apenas desliga o canal com aviso.
- `GET /health` em todo serviço. CORS restrito à origem do web.
- Logs estruturados (Pino, JSON) com `orderId`, rota, duração, código de erro. NUNCA conteúdo de foto, texto extraído, observação, código Pix, token, telefone completo ou mensagem de WhatsApp.

## Superfície pública (PRD seções 5 e 6, design doc 6.8)
- `POST /orders`: cria `draft` com ano, disciplina e fotos (multipart ou presigned + confirm). Valida formato/tamanho, remove EXIF, reduz resolução, gera miniaturas, calcula hash. Enfileira `order.analyze`. Devolve `publicToken` e `shortCode`. **Rate limit por IP + cookie de dispositivo** (`PREVIEW_RATE_LIMIT_PER_HOUR`, `PREVIEW_RATE_LIMIT_PER_DAY`).
- `GET /orders/:token`: estado e dados da etapa atual (assuntos candidatos, perfil, cobrança ativa, links). É o endpoint que o web usa para decidir a rota.
- `POST /orders/:token/confirm`: assuntos (1–3 ids da taxonomia ou `other`), opcionais, e-mail e aceite. Transição `preview_ready → awaiting_payment` + criação da cobrança via `PaymentGateway`.
- `POST /orders/:token/charges`: nova cobrança quando a anterior expirou (`charge_expired`). Nunca cria cobrança para pedido `paid` ou posterior.
- `GET /orders/:token/downloads/:kind`: gera URL assinada de curta duração para `activities` ou `answer_key`. 404 neutro para token inexistente.
- `POST /orders/:token/whatsapp/unlink`: remove vínculo.
- `POST /orders/:token/report`: abre `support_ticket`.
- Webhooks: `POST /webhooks/mercadopago` e `POST /webhooks/whatsapp` (regras em `payments.md` e `whatsapp.md`). Respondem 200 rápido; processamento pesado vai para a fila.
- Admin: `/admin/*` atrás de autenticação de operador único (sessão). Localizar pedido por e-mail/código, ver `study_kit`, reprocessar, republicar, reembolsar, ver `ai_call` e logs. Nunca exibe fotos originais sem ação explícita e auditada.

## Regras de domínio na API
- Toda transição usa `transitionOrder` do core dentro da transação do service.
- A API **não chama IA**; só enfileira (`order.analyze`). A extração roda no worker.
- Token do pedido: 32 bytes aleatórios em base64url; `shortCode` com 6 caracteres sem ambiguidade (`GZ-` + alfabeto sem 0/O/1/I).
- Download: nunca redirecionar para URL permanente do bucket; sempre URL assinada com TTL de minutos.
- Conteúdo de foto, observação e "outro" assunto são dados não confiáveis: sanitizar, limitar tamanho, nunca interpolar em prompt na API.

## Testes
- Unit: schemas, services com fakes, máquina de estados nos services.
- Integração: Postgres real; webhook duplicado; cobrança expirada; `confirm` repetido; download de pedido não `ready`; rate limit da prévia.

## Skills Relacionadas
- `elysia`, `zod`, `drizzle-orm`, `test-antipatterns`, `systematic-debugging`, `better-auth-best-practices` (admin)
