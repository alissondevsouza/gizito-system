# Gizito — Known Issues & Dívidas Técnicas

Dívidas deliberadas e issues conhecidos, deferidos com decisão registrada. Ao resolver um item, movê-lo para **Resolvidos** com data e commit.

Formato: severidade · descrição · arquivo · origem (review/feature) · condição de resolução.

## Abertos

| Sev | Issue | Arquivo | Origem | Resolver quando |
|-----|-------|---------|--------|-----------------|
| MEDIUM | WhatsApp via Baileys (não oficial) pode ser banido; canal é opt-in e desligável por flag | — | PRD 9.2 (2026-10-14) | Banimento, instabilidade recorrente ou volume: migrar instância para `WHATSAPP-BUSINESS` |
| LOW | Taxa do Mercado Pago (0,99%) vem de fontes de terceiros; confirmar na conta | — | PRD 9.1 (2026-10-14) | Ao criar a aplicação no Mercado Pago |
| LOW | `@gizito/db` sem `coverageThreshold`: o Bun avalia o threshold também sobre os arquivos do `core` importados, escondidos do relatório por `coveragePathIgnorePatterns` (cobertura real do db em 15/10/2026: 92% de linhas, 76% de funções na integração) | `packages/db/bunfig.toml` | F0-05 (2026-10-15) | Quando o Bun aplicar `coveragePathIgnorePatterns` ao threshold ou oferecer filtro de inclusão: voltar `coverageThreshold = { lines = 0.7, functions = 0.7 }` |

## Resolvidos

| Data | Issue | Commit |
|------|-------|--------|
