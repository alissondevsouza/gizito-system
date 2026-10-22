---
feature: pedidos-e-upload
module: api
size: L
status: in_progress
branch: feat/api/pedidos-e-upload
updated: 2026-10-22
---

# pedidos-e-upload (F2-01)

## Objetivo
Primeira rota comercial: o responsável manda ano, disciplina e de 1 a 5 fotos. A API cria o pedido em `draft`, grava as fotos no storage privado (sem EXIF, reduzidas, com miniatura e hash) e, na mesma transação, enfileira `order.analyze`. A resposta traz o token público e o código curto. `GET /orders/:token` passa a existir para o web decidir a rota.

Entram também:
- a ação "Trocar foto" (design doc §6.3; `state-machine.md` §2, `photos_changed`, atribuída à F2-01);
- o rate limit da prévia gratuita, por IP e por cookie de dispositivo;
- o adaptador R2 real e o fake do `ObjectStorage`.

Fontes: roadmap F2-01; PRD §5 (etapa 2) e §6 (fotos, tratamento de imagens, economia da prévia); `api.md` §1–3; known-issues da F2-01 (foto repetida; `storageKeySchema` e TTL).

## Contrato

### `POST /orders` (multipart)
Campos:
- `grade` (`gradeList`);
- `subject` (`subjectList`);
- `photos`: de `MIN_PHOTO_COUNT` a `MAX_PHOTO_COUNT` arquivos, cada um com até `MAX_PHOTO_BYTES`, JPEG ou PNG reconhecido pelos bytes iniciais, nunca pelo MIME declarado.

Resposta: `201 { publicToken, shortCode, status: "draft" }`, com `Set-Cookie` do dispositivo quando o pedido chegou sem ele.

Ordem de trabalho:
1. validação barata (contagem, tamanho, assinatura dos bytes);
2. reserva da vaga no rate limit;
3. normalização das fotos;
4. upload da foto e da miniatura de cada uma;
5. transação com `order`, `order_photo` e o job.

Qualquer falha depois do primeiro `put` remove os objetos já enviados (`try/finally`).

### `GET /orders/:token`
`200` com `publicToken`, `shortCode`, `status`, `grade`, `subject` e `insertDatetime`. Em `draft`, `analyzing` e `preview_ready`, traz também `photoList`, na ordem de `photoIndex`: `{ orderPhotoId, photoIndex, thumbnailUrl, legibilityScore }`, com `thumbnailUrl` assinada por `SIGNED_URL_TTL_SECONDS`. Os campos dos outros estados (`api.md` §3) entram nas features que os criam: F2-02 (prévia), F2-03 (cobrança) e F2-05 (kit).

### `PUT /orders/:token/photos` (multipart, "Trocar foto")
Troca uma ou mais fotos de uma vez. O campo `orderPhotoId` se repete de 1 a `MAX_PHOTO_COUNT` vezes, e `photos` traz o mesmo número de arquivos, com as mesmas regras do `POST`; o par i é `orderPhotoId[i]` ↔ `photos[i]`.
- É aceito em `draft` e em `preview_ready`. Em `preview_ready`, faz `photos_changed → draft`.
- Cada foto nova herda o `photoIndex` da antiga.
- Devolve `200` com o mesmo corpo do `GET`.
- Uma chamada é uma prévia: gasta uma vaga do rate limit e uma análise, não importa quantas fotos troque.

### Erros
Todos no formato `{ error, code }` (`apiErrorSchema`). Os erros de foto trazem também `photoIndex`, campo opcional novo: no `POST`, é a posição no envio; no `PUT`, é o `photoIndex` da foto trocada.

| Situação | Status | `code` |
|---|---|---|
| campo ausente, fora do enum, listas do `PUT` de tamanhos diferentes ou `orderPhotoId` repetido | 400 | `validation_error` |
| mais de `MAX_PHOTO_COUNT` fotos | 400 | `too_many_photos` |
| `Content-Length` acima de `MAX_ORDER_UPLOAD_BYTES` | 413 | `payload_too_large` (código novo) |
| foto acima de `MAX_PHOTO_BYTES` | 413 | `photo_too_large` |
| foto que não é JPEG/PNG ou que não decodifica | 422 | `photo_invalid` |
| foto igual (mesmo `content_hash` normalizado) a outra foto atual do pedido | 422 | `photo_duplicate` (código novo) |
| limite de prévias por hora ou por dia | 429 | `challenge_required` (código novo; o desafio vem na F2-09, D-04) |
| token mal formado ou inexistente | 404 | `order_not_found`, neutro |
| `orderPhotoId` que não é foto atual do pedido, inclusive quando outra troca venceu a corrida | 404 | `not_found` |
| troca fora de `draft` ou `preview_ready` | 409 | `invalid_state` |
| storage indisponível ou recusando | 503 | `service_unavailable` (código novo) |

Um corpo enviado em chunks sem `Content-Length` e acima do teto do servidor recebe o 413 do próprio Bun, fora do contrato. Navegadores sempre mandam `Content-Length` em `FormData`, então isso fica registrado só como limite conhecido.

## Requisitos e critérios de aceite
- **RF-01 — fotos normalizadas e sem metadados.** Cada foto aceita passa por estas etapas:
  1. é girada pela orientação EXIF;
  2. é reduzida para caber em `AI_IMAGE_MAX_SIDE_PX`, sem ampliar;
  3. é achatada sobre branco (PNG com transparência);
  4. é gravada como JPEG com `AI_IMAGE_JPEG_QUALITY`, sem EXIF, XMP, IPTC ou ICC.

  A miniatura é um JPEG com até `PHOTO_THUMBNAIL_MAX_SIDE_PX` e `PHOTO_THUMBNAIL_JPEG_QUALITY`. O `content_hash` é o SHA-256 em hex dos bytes da foto normalizada: é a mesma função que o worker usa na chave do cache da extração.

  O `sharp` decodifica com teto de `MAX_PHOTO_INPUT_PIXELS` (bomba de descompressão) e só depois de conferido o formato. A concorrência é limitada por processo (`PHOTO_NORMALIZE_CONCURRENCY`), e cada requisição processa as suas fotos uma de cada vez.

  · Aceite (fixtures sintéticas):
  - JPEG com EXIF de GPS e câmera e com orientação 6 sai sem EXIF, girado (largura e altura trocadas) e com o lado maior ≤ 1600;
  - PNG com transparência e chunk de texto sai JPEG, sem o texto;
  - imagem menor que 1600 não é ampliada;
  - imagem acima do teto de pixels, arquivo truncado, HEIC (cabeçalho `ftypheic`), WebP, GIF e SVG dão `photo_invalid`, e SVG e HEIC nunca chegam ao decodificador;
  - a mesma entrada dá o mesmo hash, igual ao do `computeContentHash` usado na extração;
  - com o limite de concorrência em 1, duas normalizações simultâneas rodam em série.
- **RF-02 — criação do pedido.** O pedido nasce em `draft` com:
  - `public_token`: `PUBLIC_TOKEN_BYTES` aleatórios em base64url, que passam em `publicTokenSchema`;
  - `short_code`: `SHORT_CODE_PREFIX` + `SHORT_CODE_LENGTH` letras de `SHORT_CODE_ALPHABET`, com sorteio uniforme.

  Cada foto vira uma `order_photo` com `photo_index` 0..n-1 na ordem do envio, `storage_key` de `photoStorageKey`, `content_hash`, `width` e `height` da foto normalizada. `order.analyze { orderId }` é enfileirado na mesma transação, como singleton por `orderId`. Colisão de `short_code` ou `public_token` no unique (`isUniqueViolation`) refaz a transação com valores novos, até `ORDER_CODE_ATTEMPT_COUNT` vezes.

  · Aceite (integração, Postgres real):
  - pedido, fotos e job são gravados juntos; uma falha na inserção do job não deixa pedido nem foto;
  - uma colisão forçada de `short_code` gera outro código e o pedido sai;
  - a foto e a miniatura existem no storage com content-type `image/jpeg`;
  - uma falha de `put` na 3ª foto, ou da transação, remove os objetos já enviados;
  - a falha da remoção só é logada, e a resposta continua com o erro original.
- **RF-03 — validação de entrada.**
  - Sem `photos`, ou com `grade` ou `subject` fora da lista: `400 validation_error`.
  - O `Content-Length` acima de `MAX_ORDER_UPLOAD_BYTES` é recusado antes de ler o corpo.
  - Contagem, tamanho e formato são conferidos antes de reservar a vaga do rate limit e antes de decodificar.
  - A foto repetida dentro do mesmo envio é recusada com o `photoIndex` da segunda ocorrência.
  - Os schemas de entrada (`createOrderInputSchema` e `replaceOrderPhotoListInputSchema`, que normalizam `File | File[]` para lista) ficam no core, para o web da F2-09 montar o mesmo multipart.

  · Aceite:
  - cada linha da tabela de erros tem teste, com o `photoIndex` certo;
  - o erro de validação não consome vaga;
  - um PNG declarado `image/jpeg`, ou `image/heic`, é aceito pelo conteúdo.
- **RF-04 — `GET /orders/:token`.** Token fora de `publicTokenSchema` e token inexistente devolvem exatamente o mesmo `404 order_not_found`. A resposta passa em `orderViewSchema` (core) e sai com `Cache-Control: no-store`. As miniaturas saem assinadas; foto trocada ou apagada (`replaced_datetime` ou `delete_datetime`) não aparece.

  · Aceite:
  - pedido em `draft` com 3 fotos traz 3 miniaturas, na ordem;
  - depois de uma troca, a nova aparece no mesmo índice;
  - `paid` traz só os campos base;
  - o 404 é igual nos dois casos.
- **RF-05 — "Trocar foto" em lote.** O `PUT /orders/:token/photos` funciona assim:
  1. primeira checagem, antes do rate limit e da normalização: o estado precisa ser `draft` ou `preview_ready`, senão `409 invalid_state`; cada `orderPhotoId` precisa ser foto atual do pedido, senão `404 not_found`;
  2. reserva da vaga, normalização, conferência de duplicata (contra as outras fotos atuais e contra as próprias fotos trocadas) e upload;
  3. a transação trava o pedido (`FOR UPDATE`) e checa de novo, sob o lock, o estado, se cada foto ainda é atual e a duplicata contra as fotos atuais naquele momento;
  4. em `preview_ready`, aplica `transitionOrder(status, "photos_changed")` e limpa `material_profile` (a F2-02 limpa também o que gravar da prévia);
  5. marca as fotos antigas com `replaced_datetime`, insere as novas nos mesmos `photo_index` e enfileira `order.analyze` singleton: com um job pendente ou ativo do pedido, não cria outro;
  6. depois do commit, remove do storage a foto e a miniatura antigas, sem bloquear a resposta; se a remoção dá certo, grava `delete_datetime`; se falha, a purga de 30 dias e a regra de ciclo de vida (RF-08) cuidam.

  A corrida que mesmo assim bata no unique parcial vira `404 not_found`. Qualquer recusa depois do upload remove os objetos novos.

  · Aceite (integração):
  - em `preview_ready`, trocar 2 fotos numa chamada vai para `draft`, limpa `material_profile`, enfileira um job e deixa os dois índices com as fotos novas;
  - em `draft` com `order.analyze` pendente, a troca não cria segundo job;
  - em `analyzing`, `awaiting_payment` e `paid`, a troca dá `409` sem gravar nada no storage;
  - foto de outro pedido ou já trocada dá `404`;
  - duas trocas concorrentes da mesma foto: uma passa, a outra dá `404`, e os objetos da perdedora são removidos;
  - a falha ao remover o objeto antigo não muda a resposta e deixa `delete_datetime` nulo.
- **RF-06 — rate limit da prévia.** Contam como prévia o `POST /orders` e o `PUT /orders/:token/photos`, porque os dois pagam extração.
  - **Limites:** ficam no core, em `PREVIEW_RATE_LIMIT_PER_HOUR` e `PREVIEW_RATE_LIMIT_PER_DAY`, cada um com valor para `device` (6 e 20) e para `ip` (30 e 100) (D-02). Passar de qualquer um dá `429 challenge_required`.
  - **Chaves:** `HMAC-SHA256(CLIENT_HASH_SECRET, "ip:" + normalizeClientIp(ip))` e `HMAC-SHA256(CLIENT_HASH_SECRET, "device:" + deviceId)`. Nem IP nem cookie ficam gravados em claro.
  - **`normalizeClientIp` (core, pura):** IPv4 fica como está; IPv4 mapeado em IPv6 (`::ffff:a.b.c.d`) vira IPv4; IPv6 vira o prefixo /64. Sem IP determinável, vira a chave de IP desconhecido, compartilhada.
  - **`findExceededPreviewLimit` (core, pura):** compara as contagens por chave e janela com os limites.
  - **Reserva:** service `preview-rate-limit`, que recebe as duas chaves já em HMAC, numa transação curta:
    1. `pg_advisory_xact_lock` das duas chaves, em ordem fixa;
    2. contagem na janela;
    3. insert em `preview_request`;
    4. remoção das linhas com mais de `PREVIEW_REQUEST_RETENTION_HOURS`.
  - **Cookie e IP, na camada HTTP (`src/http/client-identity.ts`), não no service:**
    - o cookie `gizito_device` tem 32 bytes aleatórios em base64url, com `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` em produção e validade de `DEVICE_COOKIE_MAX_AGE_DAYS`; é criado quando falta ou é inválido;
    - o IP vem do socket ou, com `TRUSTED_PROXY_HOP_COUNT = n > 0`, da n-ésima entrada a partir da direita de `X-Forwarded-For`.

  · Aceite:
  - **unit:** `normalizeClientIp` com IPv4, mapeado, IPv6 completo e comprimido e lixo; `findExceededPreviewLimit` nas bordas;
  - **integração:**
    - N+1 envios do mesmo dispositivo na hora dão 429 no último;
    - dispositivos diferentes no mesmo IP param no limite de IP;
    - dois endereços do mesmo /64 contam juntos;
    - envios concorrentes no limite não passam do teto (advisory lock);
    - a linha com mais de 24 h é apagada;
    - nenhuma coluna guarda IP ou cookie em claro;
    - com `TRUSTED_PROXY_HOP_COUNT=1`, `X-Forwarded-For: forjado, real` usa `real`.
- **RF-07 — `ObjectStorage` R2 e fake.**
  - **Interface:** passa a receber `StorageKey` em `getSignedUrl` e `delete`, e `ttlSeconds` validado (inteiro de 1 a `MAX_SIGNED_URL_TTL_SECONDS`). Falha de fornecedor vira `ObjectStorageError` com código estável (`storage_unavailable`, `storage_rejected`).
  - **R2:** `createR2ObjectStorage({ endpoint, bucket, region, accessKeyId, secretAccessKey, fetch, requestTimeoutMs })` assina SigV4 com `aws4fetch` (path-style, `retries: 0`), com `fetch` injetado e timeout em toda chamada. A URL assinada leva `X-Amz-Expires = ttlSeconds` e vale só para `GET`. `delete` de objeto inexistente não é erro.
  - **Fake:** `createFakeObjectStorage()` guarda em memória, gera URL assinada determinística e tem falhas controláveis (`failNextPut`, `failNextDelete`, `failPutAfter(n)`).
  - **Suíte de contrato:** a mesma para o fake (unit), para o R2 contra o MinIO local (integração) e para o R2 real (`test:storage-live`, opt-in, fora do CI).

  · Aceite:
  - unit com `fetch` injetado confere método, URL, content-type, timeout (abort) e o mapeamento 403 → `storage_rejected`, 5xx e rede → `storage_unavailable`;
  - a integração grava, lê pela URL assinada com `fetch` puro, recebe 403 depois da expiração, apaga e confere 404.
- **RF-08 — keys estritas, com prefixo próprio para as fotos.** O `storageKeySchema` aceita só GUID em minúsculas. As fotos e as miniaturas saem de `orders/` e ganham prefixo próprio, para uma regra de ciclo de vida de 30 dias no bucket servir de rede de segurança da invariante 10. Nenhum objeto foi gravado ainda, e o ciclo de vida do R2 filtra por prefixo. Layouts:
  - `photos/{orderId}/{photoId}.jpg` (`photoStorageKey`);
  - `photos/{orderId}/{photoId}-thumbnail.jpg` (`photoThumbnailStorageKey`, nova);
  - `orders/{orderId}/kits/{kitId}/{activities,answer-key}.pdf`, sem mudança.

  `SIGNED_URL_TTL_SECONDS = 10 * 60` vira constante do core.

  · Aceite:
  - a key com GUID maiúsculo é recusada, e os builders continuam devolvendo minúsculas;
  - a miniatura passa no schema;
  - `orders/{id}/photos/...`, `..` e sufixo desconhecido são recusados.
- **RF-09 — config e boot da API.** O `apiConfigSchema` ganha:
  - `storageEnvironmentSchema` (`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`, obrigatórias; `R2_REGION`, default `auto`), compartilhado com o worker da F2-02;
  - `CLIENT_HASH_SECRET`, com 32 caracteres ou mais;
  - `TRUSTED_PROXY_HOP_COUNT`, de 0 a 2, default 0.

  A guarda de produção recusa `R2_ENDPOINT` sem `https` e `TRUSTED_PROXY_HOP_COUNT = 0`: atrás do proxy, todo mundo viraria o IP dele. O CORS passa a `credentials: true`, por causa do cookie do dispositivo.

  · Aceite:
  - o teste de config nomeia cada campo ausente;
  - `http://` e hop 0 em produção são recusados;
  - o boot com o MinIO local responde `/health`.
- **RF-10 — logs sem dado pessoal.** `POST` e `PUT` registram `orderId`, a contagem de fotos, `durationMs` e, na falha, `errorCode`. Nunca registram token, IP, cookie, hash de cliente, nome de arquivo nem bytes. A falha de remoção no storage loga `warn` com `orderId`, `errorCode` e `orderPhotoId`.

  · Aceite: um teste com o `memory-logger` passa por um fluxo feliz, uma troca, um 429 e um 503, e confere que nenhum log contém o token, o IP de teste, o cookie ou o nome do arquivo.
- **RF-11 — infra local e CI.** O `docker-compose.yml` ganha o MinIO (`pgsty/minio`, tag fixa `RELEASE.2026-08-04T00-00-00Z`, só em `127.0.0.1`), com o bucket `gizito` criado sozinho e healthcheck. A CI sobe `postgres` e `minio` antes de `test:integration`.

  · Aceite:
  - `docker compose up -d --wait postgres minio` deixa o bucket pronto;
  - `docker compose config --quiet` passa;
  - a integração do `integrations` roda contra o MinIO.

## Fora de escopo
- **Desafio leve ao exceder o rate limit** (PRD §6): entra na F2-09 (D-04), com o widget e a verificação do Cloudflare Turnstile e o fake. Aqui, o 429 já sai com `challenge_required`, para o web saber que deve mostrar o desafio.
- **Conversão de HEIC no servidor:** PRD §6 e §12.2 item 4; só entra se o teste no iPhone mostrar necessidade. HEIC é recusado com `photo_invalid`.
- **Teste em aparelho Android e iPhone:** vai para a F2-09, que tem o `/criar` (D-01).
- **Corrigir ano ou disciplina de um pedido em `draft`** (design doc §5.2, "Confere o ano e a disciplina?"): é um pedido novo pelo `/criar`. A chave do cache da extração inclui ano e disciplina, então a extração precisa rodar de novo de qualquer forma; o pedido novo gasta uma vaga do rate limit.
- **Adicionar ou remover foto de um pedido já criado:** o design doc só prevê "Trocar foto". Para outra matéria, o caminho é um pedido novo.
- **Análise (`order.analyze`), avisos por foto e `legibility_score`:** são da F2-02. Aqui o job só é enfileirado, e `legibilityScore` sai `null`.
- **Campos do `GET` de `preview_ready` em diante, além de `photoList`:** F2-02, F2-03 e F2-05.
- **Purga aos 30 dias:** é da F2-06, que passa a apagar as duas keys de cada foto. A regra de ciclo de vida do bucket fica para a F2-13.
- **Rate limit dos webhooks:** F2-04 e F2-10.
- **Tela `/criar` e uso do cookie pelo web:** são da F2-09. O web chama a API com `credentials: "include"`; se passar a API pelo próprio servidor, repassa o `Cookie` e o `X-Forwarded-For`.
- **`Retry-After` no 429.**

## Plano

### Pesquisa no código
- **`apps/api`:** só tem `/health`. Padrões a seguir:
  - `createApp(deps)` com dependências injetadas;
  - `onError` → `toApiErrorResponse` (`throw status(4xx, { error, code })` passa como está);
  - log `request` por rota;
  - unit com `app.handle(new Request(...))` e integração em `src/__tests__/integration/`.
- **Multipart do Elysia com schema Zod:** `photos` chega como `File` quando vem um só e como `File[]` quando vêm vários (medido em 21/10/2026). O schema normaliza.
- **`@gizito/core`:** já tem as constantes de foto e de token, `publicTokenSchema`, `shortCodeSchema`, `orderPhotoSchema`, `photoStorageKey`, `storageKeySchema` (aceitava maiúscula), `ObjectStorage` (recebia `string`), `apiErrorCodeList` e `transitionOrder` com `photos_changed`.
- **`@gizito/db`:**
  - `order_photo` não tinha posição: as fotos inseridas na mesma transação têm o mesmo `insert_datetime`, e a ordem importa para a junção da extração;
  - não havia tabela de rate limit;
  - `enqueueSingletonJob` existe;
  - o `PostgresError` do Bun SQL traz `errno` e `constraint` (medido), o que permite `isUniqueViolation(error, constraint)`.
- **`@gizito/integrations`:** já depende do `sharp` (`ai/image.ts`, `reduceImage` com os mesmos 1600 e 80). O `computeContentHash` do worker (`apps/worker/src/pipeline/extract.ts`) passa para o `integrations`, e o worker importa de lá, sem mudar o comportamento.

### Decisões técnicas
- **Normalização no `integrations` (`src/photo/`).** O `sharp` é dependência nativa e não cabe no core sem IO. A detecção do formato pelos bytes é pura e fica no core (`detectPhotoFormat`), para o web reaproveitar.
  - O `reduceImage` da IA não muda: na CLI, a saída da extração continua igual.
  - Em produção, o `reduceImage` vai recomprimir um JPEG já normalizado: uma segunda passada de JPEG 80 no mesmo tamanho, sem redução.
  - A invariante 11 não se aplica, porque prompt, modelo, taxonomia e validador não mudam. A F2-02 mede na primeira rodada real.
- **R2 com `aws4fetch`, não com o `Bun.S3Client`.** O cliente nativo do Bun não aceita `fetch` injetado nem `AbortSignal`, e a rule de integrations pede timeout explícito em toda chamada e unit com `fetch` injetado. O `aws4fetch` tem 2,5 kB e nenhuma dependência, e é o caminho documentado pela Cloudflare para o R2. ADR-0012.
- **MinIO local (`pgsty/minio`).** O MinIO parou de publicar as imagens da edição comunitária; o `pgsty/minio` é o fork que segue publicando, com a tag fixa. O dev e a integração usam o mesmo adaptador e as mesmas URLs assinadas da produção, sem credencial do R2. O teste contra o R2 real é opt-in (`test:storage-live`), como o `test:ai-live` (D-03). ADR-0012.
- **Rate limit no Postgres, com HMAC.** O Redis é só da Evolution. O IP é dado pessoal, e o HMAC com segredo impede enumerar o espaço IPv4.
  - O IPv6 é reduzido a /64: as operadoras móveis dão um /64 por assinante, e trocar de endereço dentro dele não pode zerar o limite.
  - A janela é de 24 h, e a linha velha sai no próprio insert, sem depender da F2-06.
  - A reserva acontece depois da validação barata e antes da normalização.
- **Troca em lote.** Com uma foto por chamada, o primeiro `PUT` enfileira a análise; o worker pega o job em cerca de 1 s, e o segundo `PUT` dá 409 até a análise acabar. Trocar 2 de 5 fotos, o caso comum, ficaria lento, em série e gastaria duas vagas e duas análises.
- **Troca com linha nova e `replaced_datetime`.** A key vem do id da foto, então a foto nova tem id e key novos. A antiga fica com `delete_datetime` nulo até a remoção no storage dar certo; se não der, a purga da F2-06 a encontra pelos 30 dias. As fotos atuais são as que têm `replaced_datetime IS NULL AND delete_datetime IS NULL`. O unique parcial `(order_id, photo_index)` vale para as fotos não trocadas.
- **`order.analyze` singleton por `orderId`.** A troca em `draft` com análise pendente não duplica o job.
- **Prefixo `photos/` para as fotos.** O objeto órfão (processo que cai entre o `put` e o commit, ou remoção que falha) não tem linha em `order_photo`, então a purga da F2-06 não o encontra. Uma regra de ciclo de vida de 30 dias no prefixo `photos/` cobre esse caso. Como os PDFs (12 meses) ficam em `orders/`, a regra não os pega.
- **`photoIndex` opcional no `apiErrorSchema`.** O design doc §6.2 pede mensagem específica por arquivo; o campo é aditivo.

### Arquivos
- **core:**
  - `constants.ts`;
  - `storage/keys.ts`;
  - `interfaces/object-storage.ts`;
  - `api/errors.ts`;
  - `order/photo.ts` (`detectPhotoFormat`, `photoIndexSchema`, `createOrderInputSchema`, `replaceOrderPhotoListInputSchema`);
  - `order/codes.ts` (`buildPublicToken`, `buildShortCode`, `buildDeviceId`, `deviceIdSchema`);
  - `order/view.ts` (`orderViewSchema`, `createOrderResponseSchema`, listas de status);
  - `preview/rate-limit.ts` (`normalizeClientIp`, `findExceededPreviewLimit`);
  - `config/schemas.ts` (`storageEnvironmentSchema`, `clientHashEnvironmentSchema`, `trustedProxyEnvironmentSchema`, guardas de produção);
  - testes.
- **db:**
  - `schema/order-photo.ts`;
  - `schema/preview-request.ts`;
  - `schema/index.ts`;
  - `drizzle/0003_pedidos_e_upload.sql`, com o trigger;
  - `postgres-error.ts`;
  - testes.
- **integrations:**
  - `photo/normalize.ts`, com o limite de concorrência;
  - `photo/content-hash.ts`;
  - `r2/r2-object-storage.ts`;
  - `fakes/fake-object-storage.ts`;
  - `__tests__/storage/contract.ts`, mais unit, integração e live;
  - `package.json` (`aws4fetch`, `test:integration`, `test:storage-live`).
- **worker:** `pipeline/extract.ts` (import do `computeContentHash`).
- **api:**
  - `config.ts`, `app.ts` e `index.ts`;
  - `http/client-identity.ts`;
  - `routes/orders.ts`;
  - `services/orders.ts`;
  - `services/preview-rate-limit.ts`;
  - `errors.ts`;
  - testes.
- **infra:** `docker-compose.yml` e `.github/workflows/ci.yml`.
- **docs e rules:**
  - `api.md` 1.3, `data-model.md` 1.5, `jobs.md`, `architecture.md` (keys e MinIO);
  - ADR-0012, com a linha no `docs/README.md`;
  - `known-issues.md`;
  - roadmap (F2-01 e F2-09);
  - PRD 1.7 (números do rate limit, desafio na F2-09);
  - `.claude/rules/integrations.md` (keys) e `.claude/rules/docker-infra.md` (MinIO).
- **`.env.example`:** o agente não lê o arquivo; o humano acrescenta as chaves, com a lista no handoff.

### Estratégia de testes
- **Unit (sem Docker):** schemas e funções puras do core; normalização com fixtures sintéticas geradas pelo `sharp` no teste; R2 com `fetch` falso; rotas com `app.handle` e services com storage, relógio e bytes aleatórios injetados.
- **Integração:**
  - api com Postgres real e storage fake: transações, rate limit, concorrência, troca e 404 neutro;
  - integrations com o MinIO real: contrato do storage.
- **No ar (skill `run`):** API com o MinIO e `curl` multipart com JPEG e PNG sintéticos, conferindo o `GET` com a miniatura baixada pela URL assinada, a troca, o 429 e a ausência de EXIF no objeto gravado. Não há UI, então o Playwright MCP não se aplica.

### Riscos
- O `aws4fetch` com a região `auto` no MinIO: se o MinIO recusar, o compose define `MINIO_REGION` igual à `R2_REGION` local.
- Um contêiner que cria o bucket e sai pode quebrar o `docker compose up --wait`. A alternativa é criar o bucket no healthcheck do próprio MinIO (idempotente). Decidir com teste na 3.4.
- Câmeras de 50 a 108 MP: o JPEG delas quase sempre passa de 8 MB e já cai no tamanho. `MAX_PHOTO_INPUT_PIXELS = 70_000_000` cobre 64 MP.
- Memória do `sharp` com PNG grande (sem shrink-on-load): limite de concorrência por processo.

## Tasks

### M1 — core
- [x] 1.1 Constantes da F2-01: TTL e teto da URL assinada; miniatura; teto de pixels e do upload; rate limit e retenção do `preview_request`; dispositivo; tentativas de código; hops de proxy. · Verificação: `bun run --cwd packages/core test`.
- [x] 1.2 `storageKeySchema` estrito e `photoThumbnailStorageKey`; `ObjectStorage` com `StorageKey`; `signedUrlTtlSecondsSchema` e `ObjectStorageError`. · Verificação: `keys.test.ts` e `contracts.test.ts`.
- [x] 1.3 `detectPhotoFormat`, `photoIndexSchema`, códigos (`buildPublicToken`, `buildShortCode`, `buildDeviceId`), `orderViewSchema` e `createOrderResponseSchema`; `photo_duplicate` e `photoIndex` nos erros; `photoIndex` e `replacedDatetime` no `orderPhotoSchema`. · Verificação: unit.
- [x] 1.4 `storageEnvironmentSchema`, `clientHashEnvironmentSchema`, `trustedProxyEnvironmentSchema` e a guarda do `https`. · Verificação: `config/schemas.test.ts`.
- [x] 1.5 Ajustes da revisão da spec:
  - prefixo `photos/` nas keys de foto;
  - códigos `challenge_required`, `payload_too_large` e `service_unavailable`;
  - `createOrderInputSchema` e `replaceOrderPhotoListInputSchema`;
  - `preview/rate-limit.ts` (`normalizeClientIp`, `findExceededPreviewLimit`);
  - guarda de produção do hop ≥ 1;
  - `PHOTO_NORMALIZE_CONCURRENCY`.

  · Verificação: unit do core, typecheck do monorepo.

### M2 — db
- [x] 2.1 `order_photo.photo_index` e `replaced_datetime`, com check e unique parcial. · Verificação: `order.test.ts` (integração).
- [x] 2.2 `preview_request` com checks de hash, índices e trigger. · Verificação: `order.test.ts` (integração).
- [x] 2.3 Migration `0003`, `isUniqueViolation` e testes de convenção e de migração. · Verificação: `bun run --cwd packages/db test` e `test:integration`.

### M3 — integrations e infra
- [x] 3.1 `normalizePhoto(bytes) → Result<NormalizedPhoto, "photo_invalid">` (foto, miniatura, `width`, `height`, `contentHash`), com limite de concorrência; `computeContentHash` movido para o `integrations`. · Verificação: unit com fixtures sintéticas e `bun run --cwd apps/worker test`.
- [x] 3.2 `createFakeObjectStorage` e a suíte de contrato. · Verificação: unit.
- [x] 3.3 `createR2ObjectStorage` com `aws4fetch`, mais unit com `fetch` falso. · Verificação: unit.
- [x] 3.4 MinIO no compose, com bucket e healthcheck; CI; `test:integration` do `integrations` contra o MinIO; `test:storage-live`. · Verificação: `docker compose up -d --wait postgres minio` e `bun run --cwd packages/integrations test:integration`.

### M4 — api
- [ ] 4.1 Config (RF-09) e deps do app (`storage`, `now`, `randomBytes`, `clientHashSecret`, `trustedProxyHopCount`); recusa por `Content-Length`; CORS com credenciais; `index.ts` monta o R2. · Verificação: `config.test.ts` e `boot.test.ts`.
- [ ] 4.2 `http/client-identity.ts` (IP e cookie) e `services/preview-rate-limit.ts` (reserva com advisory lock). · Verificação: unit e integração (concorrência e /64).
- [ ] 4.3 `POST /orders`: route, service de criação, retry de colisão e limpeza em `try/finally`. · Verificação: unit e integração.
- [ ] 4.4 `GET /orders/:token`: 404 neutro, `orderViewSchema` e `no-store`. · Verificação: unit e integração.
- [ ] 4.5 `PUT /orders/:token/photos` em lote: `photos_changed`, nova checagem sob o lock, `replaced_datetime`, job singleton, remoção depois do commit e corrida. · Verificação: integração.
- [ ] 4.6 Teste de logs (RF-10) e 503 do storage. · Verificação: `bun run --cwd apps/api test` e `test:integration`.

### M5 — docs e verificação
- [ ] 5.1 Atualizar os docs da lista de Arquivos, com o roadmap da F2-01 e da F2-09 (aparelho, HEIC e desafio) e o PRD 1.7. Mudanças no `known-issues.md`:
  - os dois LOW da F2-01 vão para Resolvidos;
  - entra o LOW "adaptador R2 sem teste contra o R2 real", com a condição "`test:storage-live` verde antes da F2-13";
  - entra o LOW "objeto órfão até a regra de ciclo de vida de `photos/`", com a condição F2-13.
- [ ] 5.2 `bun run lint`, `typecheck`, `test`, `test:integration` e `build`.
- [ ] 5.3 API no ar com o MinIO (skill `run`): `curl` nas três rotas, miniatura baixada, ausência de EXIF no objeto gravado, 429, 404 neutro e 413.

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-21 | "Trocar foto" entra na F2-01 | `state-machine.md` §2 e a revisão da F0 atribuem `photos_changed` à "rota de fotos (F2-01)"; o design doc §6.3 prevê a ação |
| 2026-10-22 | Troca em lote (`PUT /orders/:token/photos`), uma vaga e uma análise por chamada | revisão da spec: com uma foto por chamada, a troca de 2 fotos fica em série e esbarra em `analyzing` |
| 2026-10-21 | Miniatura gravada como objeto próprio | PRD §5, etapa 2 ("gera miniaturas"), e `api.md` §3 ("miniatura assinada") |
| 2026-10-21 | HEIC recusado com `photo_invalid` | PRD §6 e §12.2 item 4 |
| 2026-10-21 | `aws4fetch` no adaptador R2; MinIO (`pgsty/minio`) no dev e na integração | timeout e `fetch` injetado (rule de integrations); ADR-0012 |
| 2026-10-21 | Rate limit em `preview_request` no Postgres, com HMAC e IPv6 /64 | sem Redis nas apps; IP é dado pessoal; o /64 é a unidade do assinante móvel |
| 2026-10-22 | Fotos no prefixo `photos/`, fora de `orders/` | regra de ciclo de vida de 30 dias como rede de segurança da invariante 10; nenhum objeto gravado ainda |
| 2026-10-21 | `photo_duplicate` e `photoIndex` opcional nos erros | known-issue da F2-01; design doc §6.2 |
| 2026-10-22 | `payload_too_large` e `service_unavailable` como códigos novos | revisão da spec: o corpo grande e o storage fora do ar precisam de contrato |
| 2026-10-22 | Hop do proxy ≥ 1 obrigatório em produção | sem ele, o limite por IP vira limite do site inteiro |
| 2026-10-22 | Corrigir ano ou disciplina é um pedido novo | a chave do cache inclui ano e disciplina; design doc §5.2 só pede a conferência |
| 2026-10-21 | **D-01 (humano, 21/10/2026):** o teste em aparelho Android e iPhone vai para a F2-09 | a F2-01 não tem tela; o input de arquivo do Safari decide se chega HEIC |
| 2026-10-21 | **D-02 (humano, 21/10/2026):** dispositivo com 6 por hora e 20 por dia; IP com 30 por hora e 100 por dia | folga para o CGNAT; a prévia custa US$ 0,0011 (PRD 1.6 §3); o PRD §6 passa a citar estes valores |
| 2026-10-21 | **D-03 (humano, 21/10/2026):** a F2-01 fecha com o MinIO; `test:storage-live` roda quando o bucket existir | o bucket R2 ainda não foi criado |
| 2026-10-22 | **D-04 (humano, 22/10/2026):** o PRD §6 pede "desafio leve apenas ao exceder"; a F2-01 responde 429 `challenge_required`, e o desafio (Turnstile) entra na F2-09 | revisão da spec (CRÍTICO): divergência do PRD levada ao humano |

## Status
- **Fase:** spec revisada (rodada 1, reprovada com 1 CRÍTICO e 10 ALERTAs, todos tratados nesta versão). M1 1.1–1.4 e M2 feitos.
- **Próximo passo:** 1.5, depois o M3.
- **Para a F2-02:**
  - ler as fotos atuais (por `photo_index`) depois de travar o pedido e aplicar `start_analysis`, na mesma transação;
  - em `photos_changed`, limpar o que gravar da prévia;
  - concluir o job na mesma transação de `analysis_failed → draft`, ou reenfileirar se as fotos mudaram enquanto o job ainda estava ativo: uma troca nesse intervalo vê o singleton ainda `active` e não enfileira nada.
- **Para a F2-06:** apagar também a miniatura de cada foto.
- **Para a F2-09:** desafio Turnstile no `challenge_required`, teste em aparelho e uso de `credentials: "include"`.
- **Para a F2-12:** a política de privacidade cita o cookie de dispositivo e o HMAC do IP guardado por 24 h.
- **Para a F2-13:** regra de ciclo de vida de 30 dias no prefixo `photos/`, `TRUSTED_PROXY_HOP_COUNT` do proxy e `test:storage-live` verde.
- **Pendências do humano:** chaves novas no `.env.example` e no `.env` (lista no handoff); bucket R2 para o `test:storage-live`.
