---
feature: confirmacao-e-cobranca-pix
module: api
size: L
status: in_progress
branch: feat/api/confirmacao-e-cobranca-pix
updated: 2026-10-22
---

# confirmacao-e-cobranca-pix (F2-03)

## Objetivo
O responsável confirma os assuntos, o e-mail e o aceite da prévia, e recebe um Pix de R$ 29,90 que vale por 30 minutos. Se o Pix vencer, ele gera outro no mesmo pedido, sem criar compra nova (PRD §5 etapas 4 e 5, exceções "assunto ainda não atendido" e "pagamento expirado"; PRD §9.1; design doc §6.3, §6.4 e §6.8; `api.md` §2 e §3; `state-machine.md` §3).

Entram nesta feature:
- o adaptador `MercadoPagoGateway` da Orders API e o fake `FakePaymentGateway`, os dois atrás da interface `PaymentGateway` do core;
- as rotas `POST /orders/:token/confirm` e `POST /orders/:token/charges`;
- a visão `awaiting_payment` no `GET /orders/:token`.

O webhook e a reconciliação ficam para a F2-04.

Roadmap F2-03. Pronto quando, no sandbox, a cobrança é criada, expira em 30 minutos e é renovada sem duplicar o pedido. Ainda não há credencial de teste do Mercado Pago (o humano confirmou em 22/10/2026). Por isso, o critério do sandbox fica com o comando pronto (RF-12) e pendente para o humano. Todo o resto é provado com o fake e com respostas gravadas.

## Requisitos e critérios de aceite

- **RF-01 — contrato do gateway no core.** Ajustes no `payment-gateway.ts`:
  - `PaymentGatewayError` com `code` em `paymentGatewayErrorCodeList`:
    - `gateway_unavailable`: rede, timeout, 429 ou 5xx;
    - `gateway_rejected`: outro 4xx;
    - `gateway_response_invalid`: resposta 2xx fora do schema.

    Segue o molde do `ObjectStorageError`.
  - `qrCodeBase64` fica nulo em `createdChargeSchema` e em `chargeSchema`, porque o sandbox devolve `""`.
  - `refund(reference)` passa a fazer só reembolso total. Sai o `RefundInput`: o produto só reembolsa o valor inteiro, o Mercado Pago não recebe motivo, e o motivo fica no admin (F2-11).

  · Aceite: unit do schema (`qrCodeBase64` nulo aceito, `""` recusado) e do erro; o teste de contrato do core compila com a interface nova.

- **RF-02 — entrada da confirmação no core.** `confirmOrderInputSchema` recebe:
  - `topicIdList` (default `[]`, sem repetição);
  - `otherTopicText?`;
  - `email`;
  - `noteText?` e `perceivedDifficulty?`;
  - `acceptedTerms: true` (literal).

  Regras:
  - o total de assuntos, `topicIdList.length` mais 1 se houver "outro", fica entre `MIN_TOPIC_COUNT` e `MAX_TOPIC_COUNT` (`countOrderTopics`);
  - `noteText` e `otherTopicText` passam por `sanitizeUntrustedText`, que troca caracteres de controle e de formato (`\p{Cc}`, `\p{Cf}`) por espaço, junta espaços em sequência, apara as pontas e normaliza para NFC. Depois valem os limites já existentes (`noteTextSchema`, `otherTopicTextSchema`);
  - `noteText` e `otherTopicText` que ficam vazios depois do saneamento viram ausentes; `""` não dá erro.

  A decisão `checkConfirmedTopics({ topicIdList, otherTopicText }, grade, subject)` devolve `Result`:
  - erro `invalid_topic` quando um id não é selecionável no ano e na disciplina do pedido (`isSelectableTopic`: inexistente, de outro ano ou disciplina, ou `deprecated`);
  - erro `unsupported_topic`, com os ids reconhecidos, quando o "outro" casa com um assunto ainda não atendido (`findUnsupportedTopicList`, PRD §7.7).

  · Aceite:
  - unit com 0 e 4 assuntos recusados, 3 ids mais "outro" recusados, 2 ids mais "outro" aceitos, aceite `false` ou ausente recusado, e-mail inválido recusado;
  - unit do saneamento: caractere de controle, bidi override e espaço de largura zero;
  - unit da decisão: id de outro ano, id inexistente e "outro" com palavra-chave de não atendido (por exemplo "malha quadriculada" em Matemática) recusados; o mesmo texto em Português aceito, se a palavra-chave for só de Matemática.

- **RF-03 — visão `awaiting_payment` no core.** A variante `awaiting_payment` do `orderViewSchema` ganha estes campos:
  - `charge`: `{ amountCents, qrCode, qrCodeBase64 | null, ticketUrl | null, expireDatetime }` da cobrança mais recente do pedido;
  - `substate`: `deriveAwaitingPaymentSubstate(charge, now)`;
  - `email`: mascarado por `maskEmail`, com a primeira letra do usuário, `***` e o domínio (`m***@example.com`);
  - `confirmedTopicList` (`topicId` e `label` da taxonomia, na ordem confirmada), `otherTopicText` (ou nulo) e `kitPreview`. É o "resumo do kit sempre visível" do design doc §6.4, também para quem abre o link do e-mail `order_link` em outro aparelho.

  `awaitingPaymentViewOf({ chargeList, email, topicIdList, otherTopicText }, now)` escolhe a cobrança mais recente por `insertDatetime`, com desempate por `chargeId`. Os demais estados depois da prévia continuam com os campos base; `paid` e os seguintes são das F2-04 a F2-11. · Aceite:
  - unit com uma e com duas cobranças: a mais recente vence, `pending` vencida dá `charge_expired`, `expired` dá `charge_expired` e ativa dá `null`;
  - unit do `maskEmail` com usuário de uma letra;
  - o schema recusa e-mail sem máscara.

- **RF-04 — códigos de erro.** O `apiErrorCodeList` ganha `unsupported_topic` (422). O corpo leva `unsupportedTopicList` (`unsupportedTopicId`, `label`, `reason`, o mesmo `unsupportedTopicViewSchema` da prévia), campo opcional do `apiErrorSchema`. O `error` sai composto pela api com o texto da seção 5.2 do design doc para o primeiro assunto: "Ainda não consigo preparar {assunto}, porque depende de imagem ou de fala." (`figure`, `orality`) ou "…, porque é produção de texto que precisa de correção." (`open_writing`). Id inválido usa o `400 validation_error` que já existe; é erro do cliente ou taxonomia antiga. · Aceite: unit do enum e do schema; integração (RF-08) com o corpo completo.

- **RF-05 — `FakePaymentGateway` em `integrations/src/fakes/`.** Implementa a interface inteira, de forma determinística e sem rede:
  - `createCharge` é idempotente por `chargeId`: o mesmo `chargeId` com a mesma entrada devolve a mesma cobrança, e com entrada diferente lança `gateway_rejected`, como o 409 `idempotency_key_already_used`;
  - os ids são `fake-order-{chargeId}` e `fake-payment-{chargeId}`;
  - `qrCode` é um texto EMV falso e `qrCodeBase64` é um PNG pequeno válido;
  - `getChargeStatus` lê o estado interno;
  - `refund` marca `refunded` e devolve `fake-refund-{chargeId}`;
  - `parseWebhook` aceita o formato próprio do fake (header `x-fake-signature` e corpo `{ gatewayOrderId, action }`), e `buildFakeWebhookRequest` monta esse formato para a F2-04 e para o E2E.

  Controles:
  - `failNextCreate(code)`, `failCreateAfter(count, code)` e `failNextStatus(code)`;
  - `markPaid(chargeId, paidDatetime)` e `markExpired(chargeId)`;
  - `createdChargeList` e `createCallCount`;
  - `pauseCreate()`: segura os `createCharge` seguintes até `release()`, com `waitForPendingCount(n)`. Serve para a corrida dos RF-08 e RF-09 ser determinística;
  - `createFakePaymentGateway({ withQrImage: false })`: devolve `qrCodeBase64: null`, como o sandbox, para o E2E da F2-09.

  · Aceite: a suíte de contrato `describePaymentGatewayContract` (RF-06) roda no fake; unit dos controles.

- **RF-06 — `MercadoPagoGateway` em `integrations/src/mercadopago/`.** A fábrica é `createMercadoPagoGateway({ accessToken, webhookSecret, fetch?, baseUrl?, requestTimeoutMs?, retryDelayMs? })`. Toda chamada leva `Authorization: Bearer`, e toda resposta passa por Zod antes de virar tipo do core.
  - `createCharge`: `POST /v1/orders` com `X-Idempotency-Key` = `chargeId`. O corpo é este, com `total_amount` e `amount` saindo de `amountCents` por `formatCentsAsDecimal` (`2990 → "29.90"`, sem float):
    ```json
    {
      "type": "online",
      "processing_mode": "automatic",
      "external_reference": "<orderId>",
      "total_amount": "29.90",
      "transactions": {
        "payments": [
          {
            "amount": "29.90",
            "payment_method": { "id": "pix", "type": "bank_transfer" },
            "expiration_time": "PT30M"
          }
        ]
      },
      "payer": { "email": "<payerEmail>" }
    }
    ```
    Não envia CPF. `expiration_time` sai de `CHARGE_TTL_MINUTES` e fica dentro de `transactions.payments[0]`, que é onde a doc do Pix o põe. O modo automático não aceita `expiration_time` na raiz.

    Da resposta saem `id` → `gatewayOrderId`, `transactions.payments[0].id` → `gatewayPaymentId`, `qr_code`, `qr_code_base64` (`""` vira `null`) e `ticket_url`. A resposta não traz data de vencimento, então o adaptador devolve o `expireDatetime` da entrada. Ele é calculado antes da chamada e por isso nunca passa do vencimento real no gateway.
  - `getChargeStatus`: `GET /v1/orders/{gatewayOrderId}`. Mapeamento do `status` da order:

    | `status` da order | `ChargeStatus` |
    |---|---|
    | `created`, `processing`, `action_required` | `pending` |
    | `processed` (`accredited` ou `partially_refunded`) e `charged_back` com `status_detail` `in_process` ou `settled` | `paid` |
    | `canceled`, `failed` | `expired` |
    | `refunded` e `charged_back` com `status_detail` `reimbursed` (dinheiro devolvido ao pagador) | `refunded` |
    | outro valor | `gateway_response_invalid` |

    Devolve `amountCents` (de `total_amount`, sem float), `externalReference`, `gatewayPaymentId` (`payments[0].id`) e `paidDatetime` (`last_updated_date` quando `paid`, senão nulo).
  - `refund`: `POST /v1/orders/{gatewayOrderId}/refund` sem corpo (reembolso total), com `X-Idempotency-Key` = `refund-{chargeId}`. Devolve o `id` do último item de `transactions.refunds`.
  - `parseWebhook`:
    1. `type` da query diferente de `order` → `unsupported_event`;
    2. falta `data.id` na query (o `data.id_url` da doc; o do corpo não é usado) → `malformed`;
    3. confere `x-signature`: separa `ts` e `v1` e monta o manifest `id:{data.id em minúsculas};request-id:{x-request-id};ts:{ts};`, omitindo o par cujo valor falta. Calcula o HMAC-SHA256 em hexa com o segredo e compara em tempo constante. Assinatura ausente, sem `v1` ou diferente → `invalid_signature`;
    4. corpo sem JSON válido ou sem `action` → `malformed`;
    5. válido: `externalId` = `{data.id}:{action}`, `gatewayOrderId` = `data.id` como veio e `gatewayPaymentId` nulo. Do corpo, nada além do `action` é usado. O `action` não entra no HMAC: quem forja só o corpo muda o `externalId` e, no máximo, dispara uma reconciliação a mais daquela order, que consulta o gateway. A F2-04 herda essa nota.
  - Erros e retentativa:
    - timeout por chamada de `requestTimeoutMs` (padrão 10 s);
    - `gateway_unavailable` por rede, timeout ou 5xx tem 1 retentativa depois de `retryDelayMs` (padrão 500 ms), só em `createCharge` (protegida pela chave de idempotência), `getChargeStatus` e `refund` (também com chave). O 429 não é retentado, porque a doc manda esperar o `Retry-After`, e o comprador não deve esperar segundos numa requisição;
    - `parseWebhook` não faz IO;
    - o `cause` do erro leva só o status HTTP e o `code` do erro do Mercado Pago, nunca o corpo (que ecoa o e-mail).

  · Aceite:
  - unit com `fetch` injetado e respostas gravadas e sanitizadas em `__fixtures__/mercadopago/` (formato da doc oficial, ids e e-mail fictícios). Cobre o corpo e os headers exatos da criação, `qr_code_base64` vazio, cada linha da tabela de status, status desconhecido, 401 → `gateway_rejected` sem retentativa, 409 → `gateway_rejected`, 429 → `gateway_unavailable` sem retentativa, 500 → retentativa e depois `gateway_unavailable`, 500 seguido de 200 → sucesso com a mesma chave nas duas tentativas, timeout, rede, JSON fora do schema e `cause` sem o e-mail;
  - `parseWebhook` com assinatura calculada com segredo de teste: válida, `data.id` em maiúsculas assinado em minúsculas, sem `x-request-id` (par omitido), adulterada, sem `v1`, `type` diferente de `order` e corpo inválido.

- **RF-07 — banco.** A migration `0005_confirmacao_e_cobranca_pix` torna `charge.qr_code_base64` nulo, o que não é destrutivo. Não entra índice de "uma ativa por pedido", porque a atividade depende do relógio. A garantia é o `FOR UPDATE` no pedido em toda inserção de cobrança (RF-08 e RF-09). · Aceite: o teste de migration aplica a 0005 do zero; o `core-alignment` confirma a coluna nula.

- **RF-08 — `POST /orders/:token/confirm`.** O corpo é JSON validado por `confirmOrderInputSchema`; fora do schema dá `400 validation_error`.

  Trava por pedido no processo: um `Set` de `orderId` com cobrança em criação, compartilhado por `confirm` e `charges`. O segundo pedido concorrente do mesmo pedido recebe 409 (`invalid_state` no `confirm`, `charge_active` no `charges`) antes de chamar o gateway, e o pedido sai do `Set` no `finally`. Isso limita a uma as orders órfãs por pedido e por processo. Com mais de uma instância da api, o limite vale por instância (linha LOW no `known-issues.md`; o MVP roda uma).

  Passos, nesta ordem:
  1. token inexistente ou mal formado → `404 order_not_found`;
  2. status diferente de `preview_ready` → `409 invalid_state`, sem chamar o gateway. Isso inclui `confirm` repetido com o pedido já em `awaiting_payment`; o web relê o `GET` e vai à rota do estado (design doc §6.8);
  3. `checkConfirmedTopics`: `invalid_topic` → `400 validation_error`; `unsupported_topic` → `422 unsupported_topic`;
  4. gera `chargeId` (UUID v4) e `expireDatetime = chargeExpireDatetime(now)`, e chama `createCharge` com `amountCents = KIT_PRICE_CENTS` e `payerEmail`. `PaymentGatewayError` → `503 service_unavailable`, sem nada gravado;
  5. numa transação: trava o pedido (`FOR UPDATE`). Se ele não estiver mais em `preview_ready` (corrida entre instâncias, ou uma troca de fotos durante a chamada), devolve `409 invalid_state`, e a cobrança criada fica órfã no gateway e expira sozinha em 30 minutos. Qualquer falha depois do `createCharge` (corrida, erro de banco, falha no job) loga `warn` "cobrança órfã" com `orderId`, `chargeId`, `gatewayOrderId` e o código. Se estiver, `transitionOrder(status, "confirm")`, grava `email`, `topic_id_list`, `other_topic_text`, `note_text`, `perceived_difficulty` e o status, insere a `charge` (`gateway` = `gateway.name`, ids, `qr_code`, `qr_code_base64`, `ticket_url`, `amount_cents`, `expire_datetime`, `status = pending`) e enfileira `order.notify { kind: "order_link" }` (`jobs.md` §1; o handler é da F2-07);
  6. responde `200` com o corpo do `GET` (`awaiting_payment`) e `Cache-Control: no-store`.

  · Aceite (integração, Postgres real):
  - caminho feliz: estado, campos gravados, uma `charge` com o `chargeId` passado ao gateway, um job `order.notify`, a resposta, e o gateway chamado uma vez com `KIT_PRICE_CENTS` e o vencimento em `now + 30 min`;
  - `draft`, `analyzing` e `awaiting_payment` → 409 sem chamar o gateway;
  - id de outro ano → 400 sem chamar o gateway;
  - "outro" não atendido → 422 sem chamar o gateway;
  - 4 assuntos e `acceptedTerms: false` → 400;
  - falha do gateway → 503 sem gravar nada;
  - dois `confirm` concorrentes → um 200 e um 409 sem segunda chamada ao gateway (trava do processo);
  - corrida sob o lock, com o fake parado em `pauseCreate()` e o pedido mudado no banco antes do `release()` → 409, nenhuma `charge` e o `warn` da órfã;
  - falha forçada no insert do job → 500, pedido em `preview_ready`, sem `charge`;
  - `noteText` com caractere de controle gravado saneado;
  - 422 com o `unsupportedTopicList` e o texto composto.

- **RF-09 — `POST /orders/:token/charges` ("Gerar novo Pix").** Sem corpo. Passos:
  1. token → `404 order_not_found`;
  2. status diferente de `awaiting_payment` → `409 invalid_state`, o que inclui `paid` e os seguintes: nunca há cobrança nova para pedido pago;
  3. já existe cobrança ativa (`isChargeActive`) → `409 charge_active`, sem chamar o gateway;
  4. `createCharge` com `chargeId` novo e o e-mail gravado no pedido. Erro → 503;
  5. numa transação: trava o pedido e relê status e cobranças sob o lock. Mudou o status → 409 `invalid_state`; apareceu uma ativa → 409 `charge_active`. Nos dois casos, e em qualquer outra falha depois do `createCharge`, `warn` da órfã. Se nada mudou, insere a cobrança nova.

  Usa a mesma trava por pedido do RF-08.

  A cobrança vencida continua `pending` no banco, porque quem a marca `expired` é a reconciliação da F2-04, depois de consultar o gateway. Marcar aqui, sem consultar, tiraria da varredura um Pix pago no último segundo com webhook perdido (`payments.md`, "pagamento confirmado após expiração").

  Responde `201` com o corpo do `GET`.

  · Aceite (integração):
  - cobrança ativa → 409 `charge_active` sem chamar o gateway;
  - vencida pelo relógio → 201, cobrança nova ativa, a antiga ainda `pending`, o mesmo pedido, nenhum pedido novo, e o `GET` mostra a nova com `substate` nulo;
  - duas renovações concorrentes → uma 201 e uma 409 `charge_active` sem segunda chamada ao gateway, e uma só cobrança ativa;
  - pagamento confirmado durante a chamada (fake parado e pedido levado a `paid` antes do `release()`) → 409 `invalid_state`, nenhuma cobrança nova e o `warn` da órfã;
  - pedido `paid` → 409 `invalid_state` sem chamar o gateway;
  - `preview_ready` → 409;
  - falha do gateway → 503 sem gravar.

- **RF-10 — `GET /orders/:token` em `awaiting_payment`.** Usa o `awaitingPaymentViewOf` (RF-03) sobre as cobranças do pedido, com o `now` injetado. Pedido em `awaiting_payment` sem cobrança é violação de invariante e dá 500, com log `error` `charge_missing` e o `orderId`. · Aceite: integração com a cobrança ativa, com a vencida (`charge_expired`) e depois da renovação; e-mail mascarado na resposta.

- **RF-11 — configuração e montagem da api.**
  - `PAYMENT_GATEWAY=mercadopago` exige `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` (`mercadoPagoEnvironmentSchema` e `checkPaymentGatewayEnvironment` do core). O segredo já é exigido porque o adaptador valida o webhook, e um deploy sem ele ficaria quebrado na F2-04.
  - `PAYMENT_GATEWAY=asaas` é recusado no boot com a mensagem "ainda não tem adaptador".
  - `PAYMENT_GATEWAY=fake` monta o `FakePaymentGateway` (dev e E2E), e o core já o recusa em produção.
  - O `index.ts` monta o gateway, e o `AppDependencies` ganha `paymentGateway`.
  - O worker não muda (o gateway entra nele na F2-04).

  · Aceite: unit do config (falta de cada chave com `mercadopago`, `asaas` recusado, `fake` aceito em dev e recusado em produção); boot do app de teste com o fake.

- **RF-12 — teste real no sandbox (pendente do humano).** Comando: `bun run --cwd packages/integrations test:payment-live` (`PAYMENT_LIVE_TEST=1`, `.env` da raiz). Lê `MERCADOPAGO_TEST_ACCESS_TOKEN`, variável própria do teste, e nunca a `MERCADOPAGO_ACCESS_TOKEN` da api: as duas credenciais começam com `APP_USR`, e o nome separado evita apontar o teste para produção (`payments.md`). Sem a variável, pula.
  - Roda a suíte de contrato contra o sandbox: cria a cobrança, confere `qrCode`, `gatewayOrderId`, `getChargeStatus` `pending` com `amountCents = KIT_PRICE_CENTS` e `externalReference`, e repete o `createCharge` com o mesmo `chargeId`, que deve devolver a mesma order (idempotência).
  - Cria uma segunda cobrança para o mesmo `orderId` (renovação) e confere que é outra order, também `pending`.
  - Imprime o `gatewayOrderId`.
  - Com `MERCADOPAGO_LIVE_EXPIRED_ORDER_ID` (o id impresso numa rodada de mais de 30 minutos antes), confere que aquela order está `expired`.

  A renovação sem duplicar pedido é provada na integração com o fake (RF-09). · Aceite: o script existe e pula sem a variável; a rodada real fica pendente no Status.

- **RF-13 — logs sem dado pessoal.** `confirm` e `charges` logam `orderId`, `chargeId`, `gatewayOrderId`, o código de erro e a duração. Nunca logam `qr_code`, `qr_code_base64`, e-mail, token, observação nem "outro". · Aceite: integração com o `memoryLogger`, procurando nos logs o e-mail, o `qrCode`, o token e a observação depois do caminho feliz, da órfã e do 503.

## Fora de escopo
- `POST /webhooks/mercadopago`, `webhook_event` e `charge.reconcile`, inclusive marcar `expired` e cancelar no gateway os outros Pix: F2-04.
- O handler de `order.notify` e o e-mail `order_link`: F2-07. O job fica enfileirado até lá; o worker só reclama nomes com handler (`listHandledJobNames`).
- Telas de confirmação e de pagamento, o QR a partir de `qr_code` quando `qrCodeBase64` é nulo, `PIX_RECIPIENT_DISPLAY_NAME` e a contagem regressiva: F2-09.
- Reembolso pelo admin e auditoria do motivo: F2-11. O adaptador já sabe reembolsar.
- `AsaasGateway`.
- Rate limit de `confirm` e `charges`: os dois exigem um pedido que já passou pelo rate limit da prévia, e `charges` só cria cobrança com a anterior vencida. A trava por pedido no processo (RF-08) limita a rajada concorrente a uma order órfã por pedido e por instância.
- O CLI do pipeline (`apps/worker/src/cli/pipeline-input.ts`) continua com as próprias mensagens por opção. A revisão da spec sugeriu trocá-lo por `checkConfirmedTopics`, mas ele é ferramenta de dev, e a troca mudaria as mensagens do CLI sem ganho para o comprador.

## Plano

### Pesquisa no código
- `PaymentGateway`, `chargeExpireDatetime`, `isChargeActive`, `isChargeExpired`, `deriveAwaitingPaymentSubstate` e `decidePaymentConfirmation` já existem no core (F0). A tabela `charge` já tem os índices de idempotência (`gateway_payment_id`, `(gateway, gateway_order_id)`).
- A transição `confirm` (`preview_ready → awaiting_payment`) já está na máquina. A renovação não muda status.
- O padrão de rota e serviço segue `orders.ts`: o handler converte `Result` em `status()`, e o service usa Drizzle e transação com `FOR UPDATE`. O corpo da resposta é o mesmo do `GET`, como no `PUT /photos`.
- O molde de adaptador HTTP é o `r2-object-storage.ts` (fetch injetado, `AbortSignal.timeout`, erro tipado com `cause`). O molde de fake é o `fake-object-storage.ts`. O molde de suíte de contrato com teste real é o `__tests__/ai/contract.ts` mais `anthropic-live.test.ts`.
- A taxonomia tem `isSelectableTopic(topicId, grade, subject)` e `findUnsupportedTopicList(text, subject)` (core, `pedagogy/taxonomy`).
- O check `order_analysis_check` permite qualquer `analysis` em `awaiting_payment`. Os testes de `confirm` criam o pedido em `preview_ready` com uma análise válida (lição da F2-02).

### Decisões técnicas
- **Gateway antes da transação** (`api.md` §2): segurar o lock do pedido durante uma chamada HTTP de até 10 s travaria as escritas do pedido. A órfã de uma corrida nunca chega ao comprador (a resposta só sai depois do commit) e expira em 30 minutos. A checagem de status antes da chamada evita a chamada no caso comum (`confirm` repetido).
- **`confirm` repetido dá 409, não replay**: o pedido confirmado não se edita, e devolver 200 ignorando um corpo novo (outro e-mail) esconderia o erro. O web resolve pelo estado.
- **Resposta com o corpo do `GET`** em vez da cobrança solta: o web decide a rota pelo `status` (design doc §6.8) e recebe tudo numa chamada. Muda o `api.md` §2.
- **Renovação não marca a antiga `expired`** (RF-09).
- **`charged_back` → `paid`**: o pagamento aconteceu. A disputa é operacional (admin) e não pode voltar o pedido para `pending` nem `expired`.
- **`paidDatetime` de `last_updated_date`**: é o único campo de data documentado na order. A doc não garante `date_approved` na Orders API.

### Arquivos
- core:
  - `interfaces/payment-gateway.ts`, `charge/schemas.ts`, `order/confirm.ts` (novo: input, `checkConfirmedTopics`), `order/view.ts` (visão `awaiting_payment`), `order/email.ts` (novo: `maskEmail`) e `text/sanitize.ts` (novo);
  - `api/errors.ts`, `config/schemas.ts`, `index.ts` e os testes.
- db: `schema/charge.ts`, `migrations/0005_*.sql` e `meta`, os testes de migration e alinhamento.
- integrations:
  - `mercadopago/` (`mercadopago-gateway.ts`, `amount.ts` e `webhook-signature.ts`);
  - `fakes/fake-payment-gateway.ts`;
  - `__tests__/payment/` (`contract.ts`, `fake-payment-gateway.test.ts`, `mercadopago-gateway.test.ts`, `mercadopago-webhook.test.ts` e `mercadopago-live.test.ts`), `__fixtures__/mercadopago/` e o `package.json` (script `test:payment-live`).
- api:
  - `services/charges.ts` (novo: `confirmOrder`, `renewCharge`), `services/orders.ts` (visão `awaiting_payment`), `routes/orders.ts`, `errors.ts`, `app.ts`, `config.ts` e `index.ts`;
  - os testes `__tests__/integration/charges.test.ts` (novo), `orders.test.ts` (o `GET` em `awaiting_payment`), `config.test.ts` e o fixture `app.ts`.
- docs: `api.md` (§1 códigos, §2 rotas, §3 visão, §6 config), `data-model.md` (`qr_code_base64` nulo), `.claude/rules/payments.md` (`expiration_time` dentro do pagamento, reembolso total), `known-issues.md` (sandbox pendente) e o roadmap (F2-02 `[x]`, F2-03 em andamento).

### Testes
Unit no core e no integrations, e integração na api com Postgres real e o fake. A suíte de contrato roda no fake (unit) e no sandbox (live, pendente). As fixtures do Mercado Pago seguem o formato da doc oficial, com ids e e-mail fictícios e sem credencial.

### Riscos
- **A Orders API diferir da doc no Pix** (posição do `expiration_time`, campos de data, `qr_code_base64`). O adaptador valida só o que usa e ignora o resto, e o teste no sandbox é o que fecha. Até lá, há uma linha MEDIUM no `known-issues.md`.
- **`data.id` em minúsculas no manifest**: a doc de notificações diz isso para ids alfanuméricos. O teste cobre, e a prova real fica para a F2-04, com o webhook do sandbox.

## Tasks

### M1 — core
- [x] 1.1 `PaymentGatewayError`, `qrCodeBase64` nulo e `refund(reference)` · Arquivos: `interfaces/payment-gateway.ts`, `charge/schemas.ts`, `__tests__/interfaces/contracts.test.ts` e `__tests__/charge/schemas.test.ts` · Verificação: `bun test` no core e `bun run typecheck` do monorepo
- [x] 1.2 `sanitizeUntrustedText`, `confirmOrderInputSchema` e `checkConfirmedTopics` · Arquivos: `text/sanitize.ts`, `order/confirm.ts` e os testes · Verificação: `bun test`
- [x] 1.3 `maskEmail`, `awaitingPaymentViewOf` e a variante `awaiting_payment` do `orderViewSchema`; `unsupported_topic` e `unsupportedTopicList` no erro · Verificação: `bun test` e `bun run typecheck` do monorepo
- [x] 1.4 `mercadoPagoEnvironmentSchema` e `checkPaymentGatewayEnvironment` · Verificação: `bun test`, typecheck do monorepo

### M2 — db
- [x] 2.1 `qr_code_base64` nulo, migration 0005 e testes de migration e alinhamento · Verificação: `bun run test:integration` no db

### M3 — integrations
- [x] 3.1 `describePaymentGatewayContract` e `FakePaymentGateway` com os controles · Verificação: `bun test` no integrations
- [x] 3.2 `MercadoPagoGateway` (`createCharge`, `getChargeStatus`, `refund`, erros e retentativa) com fixtures gravadas · Verificação: `bun test`
- [x] 3.3 `parseWebhook` com HMAC · Verificação: `bun test`
- [x] 3.4 `mercadopago-live.test.ts` e script `test:payment-live` (pula sem `PAYMENT_LIVE_TEST`) · Verificação: `bun run test:payment-live` sem a variável pula

### M4 — api
- [x] 4.1 config e montagem do gateway (`config.ts`, `index.ts`, `app.ts`, fixture) · Verificação: `bun test` na api
- [x] 4.2 `GET` em `awaiting_payment` (RF-10) · Verificação: `bun run test:integration` na api
- [x] 4.3 `POST /orders/:token/confirm` (RF-08, RF-13) · Verificação: integração
- [x] 4.4 `POST /orders/:token/charges` (RF-09, RF-13) · Verificação: integração
- [ ] 4.5 API no ar com `PAYMENT_GATEWAY=fake`: `curl` de `confirm` e de `charges` contra o banco de dev, com o pedido levado a `preview_ready` pelo worker com a IA real ou por análise gravada de teste. Para o `charges` chegar ao 201, o `expire_datetime` da cobrança é recuado no banco de dev (o fake não tem relógio próprio) · Verificação: respostas e linhas no banco; dados apagados depois

### M5 — docs e fechamento
- [ ] 5.1 `api.md`, `data-model.md`, `payments.md`, `known-issues.md` e roadmap
- [ ] 5.2 lint, typecheck e a suíte inteira (`bun run lint`, `bun run typecheck`, `bun run test` e `test:integration` em db, integrations e api)

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-22 | Sem credencial do sandbox: implementar e testar com fake e respostas gravadas; o teste real fica com o humano (RF-12) | resposta do humano em 22/10/2026 ("nenhuma ainda") |
| 2026-10-22 | `qrCodeBase64` nulo no core e no banco | o sandbox devolve `""` (doc oficial, teste de Pix); em produção vem preenchido; o web desenha o QR pelo `qr_code` quando faltar (F2-09) |
| 2026-10-22 | Reembolso só total, sem `RefundInput` | PRD §9.1 item 6 e admin; o Mercado Pago faz total sem corpo; o motivo é do admin |
| 2026-10-22 | `confirm` repetido → 409; resposta de `confirm` e `charges` = corpo do `GET` | ver Plano; muda o `api.md` §2 (doc técnico, não PRD) |
| 2026-10-22 | Renovação não marca a vencida `expired` | a reconciliação (F2-04) consulta o gateway antes; marcar sem consultar perderia Pix pago no limite |
| 2026-10-22 | O aceite não é gravado em coluna própria | o `data-model.md` não o prevê, e o `insert_datetime` da primeira cobrança marca o momento da confirmação; revisitar na F2-12 se os termos ganharem versão |
| 2026-10-22 | `MERCADOPAGO_WEBHOOK_SECRET` exigido com `mercadopago` já na F2-03 | o adaptador depende dele; falhar no boot é melhor que falhar no primeiro webhook |
| 2026-10-22 | Revisão da spec (rodada 1, aprovada com 6 alertas): visão do pagamento com assuntos e kit; corpo do 422; barreira no fake; trava por pedido no processo; teste real com `MERCADOPAGO_TEST_ACCESS_TOKEN` e segunda cobrança; 429 sem retentativa; `charged_back` pelo `status_detail`; `warn` da órfã em qualquer falha | alertas e sugestões aceitos; a sugestão do CLI do pipeline ficou fora (ver Fora de escopo) |

## Status
Spec escrita e aprovada na rodada 1 da revisão em 22/10/2026, com os alertas incorporados. M1 a M4.4 feitos. Próximo passo: 4.5 (API no ar) e M5 (docs).

Pendências para o humano:
- credencial de teste do Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`) no `.env`, para rodar o RF-12;
- perguntar se o `.env.example` deve ganhar as duas chaves; o agente não lê o arquivo.
