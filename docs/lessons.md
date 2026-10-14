# Gizito — Lessons Learned

Lições operacionais e gotchas graduados dos Decisions Logs das features. Append-only: adicionar no topo, nunca reescrever entradas antigas. Formato: `## [YYYY-MM-DD] Título — origem`.

Diferença para ADRs (`docs/engineering/adr/`): ADR registra uma **decisão arquitetural** (por que escolhemos X); lesson registra um **aprendizado operacional** (como X realmente se comporta, o que quebra e como evitar).

---

## [2026-10-14] Baileys é não oficial: o número pode ser banido sem aviso — docs/product/product-doc-v1.md 9.2

A Evolution API com integração Baileys usa o protocolo do WhatsApp Web e viola os Termos de Serviço do WhatsApp. Decisão aceita para o piloto com salvaguardas: número dedicado e aquecido, modo somente resposta, volume baixo, `WHATSAPP_ENABLED` como desligamento imediato e e-mail como canal obrigatório. Se o número cair, migrar a instância para `WHATSAPP-BUSINESS` na mesma Evolution API.

## [2026-10-14] `z.uuid()` do Zod 4 é RFC-estrito e rejeita UUIDs válidos do Postgres — herdado do figofy-system

Usar `z.guid()` para ids gerados pelo Postgres (`gen_random_uuid()`), não `z.uuid()`.

## [2026-10-14] `mock.module` do Bun é process-wide — herdado do figofy-system

Misturar testes unit (com mock de módulo) e de integração no mesmo processo contamina a resolução de imports. Manter scripts `test` e `test:integration` separados em todo workspace.

## [2026-10-14] Migration já aplicada nunca se edita — herdado do figofy-system

O migrator do Drizzle não valida hash: editar uma migration aplicada é no-op silencioso em bancos existentes e a suíte continua verde porque sobe banco do zero. Toda correção vai em migration nova.
