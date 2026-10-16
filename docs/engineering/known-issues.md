# Gizito — Known Issues & Dívidas Técnicas

Dívidas deliberadas e issues conhecidos, deferidos com decisão registrada. Ao resolver um item, movê-lo para **Resolvidos** com data e commit.

Formato: severidade · descrição · arquivo · origem (review/feature) · condição de resolução.

## Abertos

| Sev | Issue | Arquivo | Origem | Resolver quando |
|-----|-------|---------|--------|-----------------|
| MEDIUM | WhatsApp via Baileys (não oficial) pode ser banido; canal é opt-in e desligável por flag | — | PRD 9.2 (2026-10-14) | Banimento, instabilidade recorrente ou volume: migrar instância para `WHATSAPP-BUSINESS` |
| LOW | Taxa do Mercado Pago (0,99%) vem de fontes de terceiros; confirmar na conta | — | PRD 9.1 (2026-10-14) | Ao criar a aplicação no Mercado Pago |
| LOW | Lock de job sem renovação: um job que passe de `JOB_LOCK_TIMEOUT_SECONDS` (15 min) é devolvido à fila por `recoverExpiredJobs` e pode rodar em paralelo à tentativa original; o lease por `(job_id, attempt_count)` impede a tentativa antiga de concluir e os handlers são idempotentes pelo estado do pedido | `packages/db/src/queue/` | F0-06 (2026-10-15) | Quando F1 medir `order.generate` acima de 10 min, ou antes do piloto: renovar `lock_expire_datetime` durante o job (heartbeat no loop do worker) |
| LOW | `@gizito/db` sem `coverageThreshold`: o Bun avalia o threshold também sobre os arquivos do `core` importados, escondidos do relatório por `coveragePathIgnorePatterns` (cobertura real do db em 15/10/2026: 92% de linhas, 76% de funções na integração) | `packages/db/bunfig.toml` | F0-05 (2026-10-15) | Quando o Bun aplicar `coveragePathIgnorePatterns` ao threshold ou oferecer filtro de inclusão: voltar `coverageThreshold = { lines = 0.7, functions = 0.7 }` |

## Resolvidos

| Data | Issue | Commit |
|------|-------|--------|
