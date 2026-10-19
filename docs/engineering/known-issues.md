# Gizito — Known Issues & Dívidas Técnicas

Dívidas deliberadas e issues conhecidos, deferidos com decisão registrada. Ao resolver um item, movê-lo para **Resolvidos** com data e commit.

Formato: severidade · descrição · arquivo · origem (review/feature) · condição de resolução.

## Abertos

| Sev | Issue | Arquivo | Origem | Resolver quando |
|-----|-------|---------|--------|-----------------|
| MEDIUM | E-mail, telefone do WhatsApp, observação, assunto "outro" e `support_ticket.note_text` não têm prazo de retenção; pedidos abandonados em `awaiting_payment` guardam o e-mail para sempre; o erase do admin (`api.md` §5) não cita os textos livres | `packages/db/src/schema/order.ts`, `docs/engineering/data-model.md` §5 | revisão da F0 (2026-10-19), decisão do humano de só registrar | Ao escrever a política de privacidade (antes do piloto): definir prazo de anonimização (proposta da revisão: junto com o kit para pedidos pagos e 30 dias para não pagos), incluir os textos livres no erase e atualizar o PRD §8 |
| MEDIUM | WhatsApp via Baileys (não oficial) pode ser banido; canal é opt-in e desligável por flag | — | PRD 9.2 (2026-10-14) | Banimento, instabilidade recorrente ou volume: migrar instância para `WHATSAPP-BUSINESS` |
| LOW | Taxa do Mercado Pago (0,99%) vem de fontes de terceiros; confirmar na conta | — | PRD 9.1 (2026-10-14) | Ao criar a aplicação no Mercado Pago |
| LOW | `@gizito/db` sem `coverageThreshold`: o Bun avalia o threshold também sobre os arquivos do `core` importados, escondidos do relatório por `coveragePathIgnorePatterns` (cobertura real do db em 15/10/2026: 92% de linhas, 76% de funções na integração) | `packages/db/bunfig.toml` | F0-05 (2026-10-15) | Quando o Bun aplicar `coveragePathIgnorePatterns` ao threshold ou oferecer filtro de inclusão: voltar `coverageThreshold = { lines = 0.7, functions = 0.7 }` |

## Resolvidos

| Data | Issue | Commit |
|------|-------|--------|
| 2026-10-19 | Lock de job sem renovação (job longo rodava em dobro): lease de 2 min renovado a cada 30 s, teto de 15 min, ADR-0009 | `d770f90` |
| 2026-10-19 | Desligamento do worker sem teto: o sinal aborta o handler e o job volta à fila sem gastar tentativa; recuperação em até ~2,5 min se o processo morrer | `d770f90`, `37f121e` |
