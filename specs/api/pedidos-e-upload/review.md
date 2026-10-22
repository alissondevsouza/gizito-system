---
feature: pedidos-e-upload
module: api
round: 1
verdict: REPROVADO
updated: 2026-10-22
---

# Review: pedidos-e-upload (F2-01)

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint`, `typecheck`, `test`, `test:integration`, `build` (orquestrador, antes da revisão) | limpos; unit: core 777, db 105, integrations 424 (16 live pulados), api 40, worker; integração: api 29, db 136, worker 37, integrations 5 (contrato do R2 contra o MinIO); a integração da api rodou mais 3 vezes, 29/29 em todas |
| `docker compose up -d --wait postgres minio` (orquestrador) | os dois saudáveis, bucket `gizito` criado pelo healthcheck |
| API no ar, com o banco descartável `gizito_smoke_f201`, o MinIO e `curl` (orquestrador) | ver tabela abaixo |
| Cópia do repositório + `orders.ts` instrumentado (verifier) | "duas trocas concorrentes" ×5 → 5/5 verdes; o perdedor sempre sai pela checagem sob o lock |
| Mutação: `enqueueSingletonJob` do POST fora da transação (verifier) | 26 integrações verdes → CRÍTICO 1 |
| Mutação: `normalize.ts` sem `semaphore.run` (verifier) | 7 testes de foto verdes → CRÍTICO 2 |
| Sondas (verifier) | listas desiguais e id repetido → 400; 6 pares → 404, em vez de 400 (ALERTA); aparelho novo com 422 → Set-Cookie e no-store; PUT com falha no put → 503 sem objeto novo; trocar as fotos 0 e 1 entre si → 422 `photo_duplicate` |

API no ar (orquestrador, curl, `TRUSTED_PROXY_HOP_COUNT=1`):

| Passo | Resultado |
|---|---|
| `POST /orders` com JPEG 3000×2000 (EXIF com GPS e orientação 6) e PNG | 201, `Set-Cookie: gizito_device=…; HttpOnly; SameSite=Lax`, `Cache-Control: no-store`. O objeto em `photos/{orderId}/{photoId}.jpg` saiu com 1067×1600, sem EXIF, ICC nem orientação, e o sha256 dele é igual ao `content_hash`. Ficou um `order.analyze` pendente, singleton |
| `GET /orders/:token` e a miniatura pela URL assinada | `draft` com 2 fotos na ordem; miniatura 200 `image/jpeg`, 267×400, sem EXIF |
| `PUT /orders/:token/photos` | 200 `draft`; a linha antiga ficou com `replaced_datetime` e `delete_datetime`, os objetos antigos saíram do MinIO, e o job continuou sendo um só |
| Erros | foto já trocada → 404 `not_found`; token curto e token inexistente → o mesmo 404; HEIC na 2ª posição → 422 `photo_invalid` com `photoIndex: 1`; 45 MB → 413 `payload_too_large`; 8,4 MB → 413 `photo_too_large` com `photoIndex: 0`; 7ª prévia na hora → 429 `challenge_required`; outro aparelho no mesmo IP → 201 |
| Log e banco | log sem token, cookie, IP nem nome de arquivo; `preview_request` só com HMAC |

### Navegador
Não aplicável: a feature não tem UI.

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | faltando: o teste da serialização passava sem o semáforo | `packages/integrations/src/__tests__/photo/normalize.test.ts` |
| RF-02 | faltando: nada provava a atomicidade do pedido, das fotos e do job | `apps/api/src/__tests__/integration/orders.test.ts` |
| RF-03 | sim | `orders.test.ts` ("recusa entrada inválida…", "foto que não decodifica…"), `packages/core/src/__tests__/order/photo.test.ts` |
| RF-04 | sim | `orders.test.ts` (GET) |
| RF-05 | sim | `orders.test.ts` (PUT, inclusive a corrida pelo lock) |
| RF-06 | sim | `orders.test.ts` (rate limit), `packages/core/src/__tests__/preview/rate-limit.test.ts`, `apps/api/src/__tests__/http/client-identity.test.ts` |
| RF-07 | sim | `packages/integrations/src/__tests__/storage/*`, `src/__tests__/integration/r2-minio.test.ts` |
| RF-08 | sim | `packages/core/src/__tests__/storage/keys.test.ts` |
| RF-09 | sim | `apps/api/src/__tests__/config.test.ts`, `boot.test.ts`, `integration/health.test.ts` |
| RF-10 | sim, com ressalva (ALERTA dos logs de falha) | `orders.test.ts` (logs) |
| RF-11 | sim | `docker-compose.yml`, `.github/workflows/ci.yml` |

### Achados
- [CRÍTICO] `apps/api/src/services/orders.ts:260`. Nada prova que pedido, fotos e `order.analyze` são atômicos: com o enqueue fora da transação, as integrações continuam verdes. O RF-02 pede esse teste. Correção: fazer o insert do job falhar (trigger só no banco do teste) e conferir 0 pedido, 0 foto, 500 e os objetos removidos; o mesmo no `commitReplacement`.
- [CRÍTICO] `packages/integrations/src/__tests__/photo/normalize.test.ts:119`. O critério "com o limite em 1, rodam em série" não tem teste: o teste passa sem `semaphore.run`. Correção: injetar o semáforo e provar a serialização.
- [ALERTA] `apps/api/src/services/orders.ts:495`. A remoção das fotos antigas roda com `await` antes da resposta, mas a spec pede "sem bloquear". Uma falha no `UPDATE` do `delete_datetime` depois do commit vira 500 numa troca já gravada.
- [ALERTA] `packages/core/src/order/photo.ts:50` e `orders.ts:461`. PUT com mais de `MAX_PHOTO_COUNT` pares dá 404; a tabela de erros pede 400 `too_many_photos`.
- [ALERTA] `orders.ts:295/496`. Na falha, o POST e o PUT não logam `orderId`, `photoCount` nem `errorCode`.
- [SUGESTÃO] `orders.ts:410`. A duplicata sob o lock (duas trocas concorrentes para o mesmo conteúdo) não tem teste.
- [SUGESTÃO] `orders.ts:176`. A key só entra em `uploadedKeyList` depois do `put`; um `put` que estoura o timeout com o objeto já gravado deixa um órfão.
- [SUGESTÃO] `preview-rate-limit.ts:57`. Com pouco tráfego, a linha velha passa de 24 h; incluir `preview_request` na purga da F2-06.
- [SUGESTÃO] `app.ts:18`. O fator 2 de `SERVER_MAX_REQUEST_BODY_BYTES` é número na app.
- [SUGESTÃO] `orders.ts:43`. O service importava o tipo `ClientKeyHashMap` de `#src/http/`.
- [SUGESTÃO] `known-issues.md:36-37`. Os itens resolvidos citavam a branch em vez do commit.

### Regressão pedagógica
Não aplicável: nenhum prompt, modelo, taxonomia ou validador mudou. O `reduceImage` da IA não mudou.

### Resposta do orquestrador
Todos os achados foram corrigidos; nenhum foi contestado.

- **CRÍTICO 1:**
  - testes "falha no insert do job não deixa pedido nem foto e remove os objetos" (POST) e "falha no insert do job desfaz a troca inteira e remove os objetos novos" (PUT);
  - trigger `BEFORE INSERT ON job` com `RAISE EXCEPTION`, criado e removido dentro do teste;
  - mutação conferida: com o enqueue fora da transação, cada um dos dois testes falha.
- **CRÍTICO 2:**
  - o `createPhotoNormalizer` recebe o `Semaphore` do processo (default: `PHOTO_NORMALIZE_CONCURRENCY`);
  - o teste usa um semáforo de 1 vaga que registra entrada e saída e exige `entra, sai, entra, sai` em duas normalizações simultâneas;
  - mutação conferida: sem `semaphore.run`, o teste falha;
  - um segundo teste mostra que formato recusado nem entra no semáforo.
- **ALERTA da remoção:**
  - a remoção das fotos trocadas sai por `runInBackground` (dependência do service; default no app com `catch` que loga `error`);
  - o `UPDATE` do `delete_datetime` ganhou `try/catch` com `warn` (`photo_delete_mark_failed`);
  - o teste prova que a resposta sai antes da remoção: `delete_datetime` nulo e objeto presente até o `settle`.
- **ALERTA dos pares:** o service confere `replacementList.length > MAX_PHOTO_COUNT` antes de buscar o pedido; teste com 6 pares → 400 `too_many_photos`.
- **ALERTA dos logs:**
  - "pedido recusado" (POST, já com `orderId`) e "troca de fotos recusada" (PUT, com o pedido encontrado) levam `orderId`, `photoCount`, `durationMs` e `errorCode`, inclusive no erro inesperado (`internal_error`);
  - o teste de logs ganhou um PUT com 503 e confere os dois.
- **Sugestões:**
  - teste da duplicata sob o lock, em que a perdedora dá 422 e os objetos dela saem;
  - key registrada antes do `put` (o teste da 3ª gravação passou a esperar 3 remoções);
  - purga do `preview_request` registrada para a F2-06 na spec e no `data-model.md`;
  - `MAX_SERVER_REQUEST_BODY_BYTES` no core. O fator 2 fica: o Bun recusa pelo `Content-Length` antes do handler, com 413 sem corpo, medido. O `api.md` diz agora o que acontece acima do dobro;
  - `ClientKeyHashMap` vive no service `preview-rate-limit.ts`;
  - commits `63de6b9` e `07fba78` nos itens resolvidos.

Depois da correção, todos limpos:
- `bun run lint`, `typecheck` e `build`;
- `bun run test`: core 777, db 105, integrations 409 (16 pulados), api 40, worker 340 (15 pulados);
- `bun run test:integration`: api 33, db 136, worker 37, integrations 5.
