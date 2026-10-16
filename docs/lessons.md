# Gizito — Lessons Learned

Lições operacionais e gotchas graduados dos Decisions Logs das features. Append-only: adicionar no topo, nunca reescrever entradas antigas. Formato: `## [YYYY-MM-DD] Título — origem`.

Diferença para ADRs (`docs/engineering/adr/`): ADR registra uma **decisão arquitetural** (por que escolhemos X); lesson registra um **aprendizado operacional** (como X realmente se comporta, o que quebra e como evitar).

---

## [2026-10-15] O `jsonb` do Drizzle grava string JSON com o driver `bun-sql` — F0-06

O `jsonb()` do `drizzle-orm` aplica `JSON.stringify` no valor, e o Bun.SQL, ao ver que o parâmetro é `jsonb`, codifica de novo: o banco guarda `"{\"name\": ...}"` com `jsonb_typeof = 'string'`. Ida e volta pelo Drizzle devolve o objeto (ele faz `JSON.parse` na leitura), então os testes de F0-05 passaram; o defeito só apareceu quando o SQL leu um campo (`payload->>'name'` nulo) e um check com `=` passou por comparar com nulo. Usar a coluna própria de `packages/db/src/schema/jsonb.ts`, testar o tipo no SQL (`jsonb_typeof`) e escrever checks com `IS NOT DISTINCT FROM` quando o lado esquerdo pode ser nulo. O mesmo vale para `sql` cru: `${valor}::jsonb` com um objeto JS, nunca com `JSON.stringify(valor)`.

## [2026-10-15] `coverageThreshold` do Bun avalia arquivos escondidos por `coveragePathIgnorePatterns` — F0-05

Os testes de `@gizito/db` importam `@gizito/core`, e o Bun instrumenta os arquivos do core (resolvidos pelo realpath do workspace, fora de `node_modules`). `coveragePathIgnorePatterns` só tira esses arquivos do relatório; o threshold continua considerando-os, e `bun test` sai com 1 mesmo com "All files" em 92% de linhas. Workspace que importa outro workspace não consegue usar `coverageThreshold`; ficou só no core (ver known-issues).

## [2026-10-15] O último caractere canônico de base64url depende do resto de `bytes mod 3` — F0-05

32 bytes deixam 2 bits de padding, então o último caractere é múltiplo de 4 (`AEIMQUYcgkosw048`, 16 opções); `[AQgw]` vale para resto 1 (4 bits de padding). O `publicTokenSchema` rejeitava 75% dos tokens reais e ninguém viu porque as fixtures eram fixas. Testar schemas de formato com valores gerados pelo mesmo caminho que a produção vai usar (`randomBytes(32).toString("base64url")`), não só com exemplos escritos à mão.

## [2026-10-15] Trocar de branch com a stack do compose no ar recria o bind mount do initdb como root — merge de F0-03

Fazer checkout de uma branch sem `docker-compose.yml`/`infra/` com os containers rodando faz o Docker recriar `infra/postgres/initdb` como root ao reiniciar; o merge seguinte falha com "Permissão negada". Corrigir com `docker run --rm -v "$PWD/infra:/fix" alpine chown -R $(id -u):$(id -g) /fix`, ou derrubar a stack antes de trocar de branch.

## [2026-10-14] Baileys é não oficial: o número pode ser banido sem aviso — docs/product/product-doc-v1.md 9.2

A Evolution API com integração Baileys usa o protocolo do WhatsApp Web e viola os Termos de Serviço do WhatsApp. Decisão aceita para o piloto com salvaguardas: número dedicado e aquecido, modo somente resposta, volume baixo, `WHATSAPP_ENABLED` como desligamento imediato e e-mail como canal obrigatório. Se o número cair, migrar a instância para `WHATSAPP-BUSINESS` na mesma Evolution API.

## [2026-10-14] `z.uuid()` do Zod 4 é RFC-estrito e rejeita UUIDs válidos do Postgres — herdado do figofy-system

Usar `z.guid()` para ids gerados pelo Postgres (`gen_random_uuid()`), não `z.uuid()`.

## [2026-10-14] `mock.module` do Bun é process-wide — herdado do figofy-system

Misturar testes unit (com mock de módulo) e de integração no mesmo processo contamina a resolução de imports. Manter scripts `test` e `test:integration` separados em todo workspace.

## [2026-10-14] Migration já aplicada nunca se edita — herdado do figofy-system

O migrator do Drizzle não valida hash: editar uma migration aplicada é no-op silencioso em bancos existentes e a suíte continua verde porque sobe banco do zero. Toda correção vai em migration nova.
