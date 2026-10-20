# Gizito — Known Issues & Dívidas Técnicas

Dívidas deliberadas e issues conhecidos, deferidos com decisão registrada. Ao resolver um item, movê-lo para **Resolvidos** com data e commit.

Formato: severidade · descrição · arquivo · origem (review/feature) · condição de resolução.

## Abertos

| Sev | Issue | Arquivo | Origem | Resolver quando |
|-----|-------|---------|--------|-----------------|
| MEDIUM | E-mail, telefone do WhatsApp, observação, assunto "outro" e `support_ticket.note_text` não têm prazo de retenção; pedidos abandonados em `awaiting_payment` guardam o e-mail para sempre; o erase do admin (`api.md` §5) não cita os textos livres | `packages/db/src/schema/order.ts`, `docs/engineering/data-model.md` §5 | revisão da F0 (2026-10-19), decisão do humano de só registrar | Ao escrever a política de privacidade (antes do piloto): definir prazo de anonimização (proposta da revisão: junto com o kit para pedidos pagos e 30 dias para não pagos), incluir os textos livres no erase e atualizar o PRD §8 |
| MEDIUM | Taxonomia `tax-v1` entrou sem regressão pedagógica (`bun run test:pedagogy` ainda não existe); conteúdo revisado e aprovado pelo professor em 19/10/2026; a lista de assuntos ainda não atendidos ganhou ids e palavras do “outro” na F1-02, também sem regressão; os schemas e validadores do kit da F1-03 também, provados só por fixtures sintéticas | `packages/core/src/pedagogy/` (taxonomia, extração, kit, validação, revisão), `docs/pedagogy/taxonomia.md` | F1-01 e F1-02 (2026-10-19), F1-03 (2026-10-20) | Na F1-10, rodar `bun run test:pedagogy` com `tax-v1` e os validadores da F1-03; correções que a regressão pedir viram `tax-v2` ou constante recalibrada no core |
| LOW | `personal_data_pattern` trata número de 11 algarismos sem separador com 9 no terceiro dígito como celular (“21900000000”), bloqueio falso possível em exercício de classes e ordens; segue a spec pedagógica §8.4, que aceita celular sem separador | `packages/core/src/pedagogy/validation/patterns.ts` | F1-03 (2026-10-20, revisão neutra rodada 2) | Na F1-10, se a regressão ou um caso real disparar o código num número de enunciado, exigir separador também no celular (decisão do humano, nova versão da spec) |
| MEDIUM | WhatsApp via Baileys (não oficial) pode ser banido; canal é opt-in e desligável por flag | — | PRD 9.2 (2026-10-14) | Banimento, instabilidade recorrente ou volume: migrar instância para `WHATSAPP-BUSINESS` |
| LOW | Cobrança: nada impede duas cobranças `pending` no mesmo pedido (duplo toque em "Gerar novo Pix"), não há checks por status (`paid` com `paid_datetime` e `gateway_payment_id`, `refunded` com `refund_id`) e `decidePaymentConfirmation` não confere o valor pago | `packages/db/src/schema/charge.ts`, `packages/core/src/charge/rules.ts` | revisão da F0 (2026-10-19) | Na spec da F2-03/F2-04: unique parcial `charge(order_id) WHERE status = 'pending'` ou trava do pedido documentada, checks por status e comparação com `amountCents` |
| LOW | Kit vigente único por pedido não é garantido no banco, e o unique de `notification` barra um segundo `kit_ready` ao mesmo destinatário depois da republicação | `packages/db/src/schema/{kit,notification}.ts` | revisão da F0 (2026-10-19) | Na F2-11: unique parcial `kit(order_id) WHERE superseded_by_kit_id IS NULL` e decidir entre kind próprio ou `kit_id` na chave da notificação |
| LOW | `storageKeySchema` aceita GUID maiúsculo (os builders geram minúsculo) e `ObjectStorage.getSignedUrl`/`delete` recebem `string`; TTL da URL assinada não é constante do core | `packages/core/src/storage/keys.ts`, `packages/core/src/interfaces/object-storage.ts` | revisão da F0 (2026-10-19) | No adaptador R2 (F2-01) |
| LOW | Config aceita valores frouxos: `HOST` só com espaço, `DATABASE_URL` sem host, porta em hexadecimal, `WEB_PUBLIC_URL` `http` e `LOG_LEVEL=silent` em produção | `packages/core/src/config/schemas.ts`, `apps/api/src/config.ts` | revisão da F0 (2026-10-19) | No deploy (F2-13), junto com o `.env` de produção |
| LOW | CI sem `permissions: contents: read`, actions fixadas por tag e não por SHA, sem `git diff --exit-code` depois do build; imagens do compose sem versão menor; `@types/bun` resolve 1.3.14 com o runtime em 1.3.11; Biome deixa passar `import ".."` | `.github/workflows/ci.yml`, `docker-compose.yml`, `package.json`, `biome.json` | revisão da F0 (2026-10-19) | Antes de pôr segredo na CI ou abrir o repositório; na próxima mudança de infra |
| LOW | `db:migrate` exige `DATABASE_URL` no shell, enquanto os scripts `dev` leem o `.env` da raiz | `packages/db/package.json` | revisão da F0 (2026-10-19) | Na próxima mudança do `packages/db`: `--env-file=../../.env` no script, como nas apps |
| LOW | Taxa do Mercado Pago (0,99%) vem de fontes de terceiros; confirmar na conta | — | PRD 9.1 (2026-10-14) | Ao criar a aplicação no Mercado Pago |
| LOW | `@gizito/db` sem `coverageThreshold`: o Bun avalia o threshold também sobre os arquivos do `core` importados, escondidos do relatório por `coveragePathIgnorePatterns` (cobertura real do db em 15/10/2026: 92% de linhas, 76% de funções na integração) | `packages/db/bunfig.toml` | F0-05 (2026-10-15) | Quando o Bun aplicar `coveragePathIgnorePatterns` ao threshold ou oferecer filtro de inclusão: voltar `coverageThreshold = { lines = 0.7, functions = 0.7 }` |

## Resolvidos

| Data | Issue | Commit |
|------|-------|--------|
| 2026-10-19 | Lock de job sem renovação (job longo rodava em dobro): lease de 2 min renovado a cada 30 s, teto de 15 min, ADR-0009 | `d770f90` |
| 2026-10-19 | Desligamento do worker sem teto: o sinal aborta o handler e o job volta à fila sem gastar tentativa; recuperação em até ~2,5 min se o processo morrer | `d770f90`, `37f121e` |
