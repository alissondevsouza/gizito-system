# ADR-0012: storage R2 com `aws4fetch`, MinIO local e fotos no prefixo `photos/`

**Data:** 2026-10-22
**Status:** aceito em 2026-10-22 (F2-01; fechar sem o bucket R2 foi decisão do humano, D-03)
**Decidido por:** Alisson

## Contexto

A F2-01 (`specs/api/pedidos-e-upload/`) grava as fotos do pedido no storage privado e serve as miniaturas por URL assinada (invariantes 5 e 10). A F2-05 vai gravar os PDFs pelo mesmo `ObjectStorage`.

A rule de integrations pede três coisas: timeout explícito em toda chamada HTTP, `fetch` injetado nos testes unit e a mesma suíte de contrato para o fake e para o adaptador real. No começo da F2, o bucket R2 ainda não existia, e o dev precisa subir a API e o worker sem credencial de produção.

Havia também uma restrição de retenção. As fotos expiram em 30 dias e os PDFs em 12 meses. Uma foto órfã (o processo cai entre o upload e o commit, ou a remoção falha) não tem linha em `order_photo`, então a purga da F2-06, que parte do banco, nunca a encontraria. O ciclo de vida do R2 filtra por prefixo, e no layout anterior as fotos e os PDFs dividiam `orders/{orderId}/`.

## Decisão

- **Adaptador R2 com `aws4fetch`.** A assinatura SigV4 vai no cabeçalho e na query, em path-style e com `retries: 0`. O `fetch` é injetado, e cada chamada tem `AbortSignal.timeout`. O hash do corpo vai assinado no `put`. A URL assinada leva `X-Amz-Expires`.
- **MinIO no `docker-compose.yml` para o dev, a integração e a CI.** A imagem é a `pgsty/minio` com tag fixa. O bucket é criado pelo healthcheck, que é idempotente e não quebra o `up --wait`. O teste contra o R2 real fica opt-in (`test:storage-live`), como o `test:ai-live`.
- **Fotos e miniaturas no prefixo `photos/{orderId}/`.** Os PDFs continuam em `orders/{orderId}/kits/`. Uma regra de ciclo de vida de 30 dias no prefixo `photos/` (F2-13) é a rede de segurança da invariante 10.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| `Bun.S3Client` (nativo) | sem dependência; presign pronto | não aceita `fetch` injetado nem `AbortSignal`: sem timeout explícito e sem unit com respostas gravadas |
| `@aws-sdk/client-s3` | completo, retries e checksums | dezenas de pacotes para três operações; retries internos a desligar; mais difícil de injetar `fetch` |
| `aws4fetch` | 2,5 kB, sem dependência, caminho documentado pela Cloudflare para o R2, recebe `Request` e devolve `Request` assinado | por padrão assina `UNSIGNED-PAYLOAD` no S3 (resolvido passando `x-amz-content-sha256`); a lógica de status fica no adaptador |
| Storage em disco no dev | sem contêiner novo; a rule de testes cita "storage em disco" para o E2E | outro adaptador só para o dev; URL assinada precisaria de rota própria na API; não exercita a assinatura real |
| `minio/minio` | imagem oficial | o MinIO parou de publicar imagens da edição comunitária |

## Consequências

### Positivas
- O dev, a integração e a produção usam o mesmo adaptador e o mesmo formato de URL assinada. Só o endpoint muda.
- A suíte de contrato roda contra o fake (unit), o MinIO (integração) e o R2 (live).
- Objeto órfão de foto expira pelo bucket, sem depender da purga.

### Negativas
- Mais um serviço no compose e na CI.
- O `pgsty/minio` é um fork de terceiros. Uma falha dele afeta só o dev e a CI, nunca a produção.

### Riscos
- Diferença de comportamento entre o MinIO e o R2. O `test:storage-live` precisa passar antes do deploy (F2-13), e há `known-issue` para isso.
- O `aws4fetch` assina com a hora local. Um relógio errado no servidor invalida as URLs.

## O que faria esta decisão mudar

- Necessidade de multipart upload (arquivos grandes) ou de checksums além do SHA-256 do corpo: passar para o SDK oficial.
- Troca de fornecedor de storage para um sem API compatível com o S3.
