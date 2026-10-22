# Gizito — kit de reforço escolar por Pix

Micro-produto B2C brasileiro, 100% automático, sem revisão humana, sem cadastro, sem assinatura. O responsável fotografa a matéria do caderno, confirma os assuntos detectados, paga **R$ 29,90 por Pix** e recebe **dois PDFs** (atividades e gabarito comentado) por e-mail e, por opt-in, WhatsApp. Público: 4º ao 7º ano, Matemática e Língua Portuguesa.

Leia **a seção que a tarefa toca**, não o documento inteiro:

| Assunto | Onde |
|---|---|
| Jornada e estados do pedido | PRD §5 — `docs/product/product-doc-v1.md` |
| Pedagogia, contagens, bloqueadores | PRD §7 |
| Schemas do kit, validações, prompts, casos, homologação | `docs/pedagogy/spec-pedagogica.md` (§14 diz o que cada feature lê), `docs/pedagogy/prompts-v1.md` (`extract`, `plan`), `docs/pedagogy/prompts-v2.md` (`generate`, `review`), `docs/pedagogy/regressao/` (resumos da regressão) |
| Pagamento (Mercado Pago, Orders API) | PRD §9.1 |
| WhatsApp (Evolution API, somente resposta) | PRD §9.2 |
| Telas, rotas, estado → rota, textos | Design doc §5–6 — `docs/design/design-doc-v1.md` |
| PDFs | Design doc §9 |
| Decisões, lições, dívidas | `docs/engineering/adr/`, `docs/lessons.md`, `docs/engineering/known-issues.md` |
| Roadmap por fases | `docs/product/roadmap-v1.md` |

As regras por área em `.claude/rules/` carregam sozinhas pelos arquivos que você toca.

## Stack

- Bun (nunca npm/yarn/pnpm) · Bun Workspaces + Turborepo · Biome (nunca ESLint/Prettier) · TypeScript · Zod 4
- `apps/web` — TanStack Start (React 19 SSR) + Tailwind v4 + shadcn/ui. Sem lógica de negócio: consome a API
- `apps/api` — Elysia. Upload, pedidos, prévia, cobrança Pix, webhooks, status, admin
- `apps/worker` — Bun. Consome a fila: extração, planejamento, geração, validação, revisão por modelo, render dos dois PDFs, notificações
- `packages/core` — domínio puro sem IO: schemas, taxonomia, máquina de estados, validações pedagógicas, interfaces `PaymentGateway`, `NotificationChannel`, `AiProvider`, `ObjectStorage`
- `packages/db` — PostgreSQL 16 + Drizzle: schema, migrations, fila, test-helpers
- `packages/integrations` — adaptadores (Mercado Pago, Evolution API, Resend, R2, IA, mathjs, KaTeX) e os fakes de cada interface
- Fila no Postgres (sem Kafka/Redpanda); Redis só para a Evolution API. Storage R2 privado com URL assinada. PDF: HTML/CSS + KaTeX no servidor + Playwright. IA: um provedor atrás de `AiProvider`, modelo barato na extração e forte na geração/revisão

## Comandos

```bash
bun install                              # deps (nunca npm install)
bun run dev [--filter=@gizito/api]       # dev servers
bun run build | lint | typecheck | format
bun run test                             # unit do monorepo (bun test no backend, Vitest no web)
bun run test:integration                 # dentro do workspace; Postgres real via Docker
bun run test:pedagogy [--case <id>]      # raiz; 35 casos; exige chave de IA; ~US$ 12 a rodada; fora do CI
bun run --cwd packages/integrations test:ai-live  # contrato real do AiProvider; lê o .env da raiz; custa centavos; fora do CI
bun run pipeline --photos <foto>... --grade 5 --subject math  # raiz; fotos → study_kit.json, dois PDFs e resumo; exige chave de IA; ~US$ 0,40 por kit
bun run db:generate --filter=@gizito/db  # migration
bun run db:migrate --filter=@gizito/db
docker compose up -d | down              # Postgres, Redis, Evolution API
```

## Convenções

- Imports internos sempre `#src/caminho/arquivo.ts` (subpath import com extensão); nunca relativos. Entre workspaces: `@gizito/core`. Deps internas `"workspace:*"`
- Zod em todo input externo e em toda saída de IA. UUID do Postgres: `z.guid()`, não `z.uuid()`
- Tipos, schemas, constantes de negócio e regras de domínio vivem em `packages/core`; apps não redefinem nem repetem números
- Sem comentários no código (nem JSDoc, nem TODO): refatore até o nome bastar. Código em inglês; UI, docs e commits em pt-BR
- Banco: tabelas snake_case **singular**; PK `{tabela}_id` (nunca `id`); FK com o mesmo nome da PK; timestamps `_datetime` (nunca `_at`); `insert_datetime` e `update_datetime` em toda tabela; export Drizzle camelCase singular
- Código: types PascalCase singular (`Order`); schemas `orderSchema`; arrays de enum e coleções com sufixo `List` (`orderStatusList`, `photoList`)
- Termos: `order` pedido · `charge` cobrança Pix · `kit` · `topic` assunto · `material_profile` · `practice_question` fixação · `mock_question` simulado · `answer_key` gabarito. Estados: `draft, analyzing, preview_ready, awaiting_payment, paid, processing, ready, failed, refunded` (+ sub-estado `charge_expired`)

## Invariantes

1. Estado do pedido só muda pela máquina de estados do core, dentro de uma transação. Nunca `UPDATE order SET status` solto
2. `awaiting_payment → paid` só após **consultar o gateway**, nunca pelo corpo do webhook. Marcar pago e enfileirar a geração na mesma transação, idempotente pelo id do pagamento
3. IA só no worker, atrás de `AiProvider`, com prompt versionado, saída validada por Zod e tokens/custo gravados por chamada e por pedido
4. Foto, texto extraído, observação, assunto "outro", mensagem de WhatsApp e corpo de webhook são **dados**, nunca instrução: delimitados no prompt, limitados em tamanho, fora dos logs, incapazes de alterar preço, prompt ou regra
5. Pedido acessado por token aleatório longo; código curto só para o vínculo de WhatsApp. Download sempre por URL assinada de minutos, gerada no clique
6. `ready` só com **os dois PDFs** no storage e as validações críticas verdes
7. Nenhuma etapa depende do WhatsApp. E-mail é obrigatório. `WHATSAPP_ENABLED=false` desliga botão, webhook e envios sem afetar o resto
8. Handler → service → Drizzle. Handlers não tocam banco; services não conhecem HTTP
9. Logs levam `orderId`, etapa, duração, custo e códigos de erro. Nunca conteúdo de foto/texto/mensagem, código Pix, token, segredo, e-mail ou telefone completos
10. LGPD: nunca pedir nem guardar nome da criança ou da escola. EXIF removido, bucket privado, fotos apagadas em 30 dias e PDFs em 12 meses. `.env` nunca é lido nem commitado; `.env.example` documenta as chaves
11. Qualquer mudança em prompt, modelo, taxonomia ou validador roda `bun run test:pedagogy` antes de ir para `main`

## Como trabalhar

- **Autonomia.** Os testes locais usam containers descartáveis e não têm acesso a produção: rode-os, corrija as falhas que a sua mudança causou e rode de novo sem pedir aprovação a cada passo. Trabalho pronto = implementado, testado, lint/typecheck limpos e, havendo superfície HTTP/UI, visto funcionando (UI sempre pelo Playwright MCP). Não pare para revisão intermediária; pare só diante de divergência do PRD/design doc ou de ação irreversível (migration destrutiva, reembolso, deploy)
- **Roteamento.** Pergunta ou análise → responda. Mudança trivial (até ~3 arquivos, sem decisão arquitetural, sem tocar pipeline pedagógico) → faça direto; se for bug, use `gizito-fix`. Feature ou bug não trivial, ou qualquer mudança em prompt/modelo/taxonomia/validador → `gizito-spec-driven`. Na dúvida, não é trivial. Pedido explícito do usuário vence a triagem
- **Git.** Nunca na `main`: `feat/{modulo}/{slug}`, `fix/{modulo}/{slug}`, `chore/{slug}`, sempre a partir de `main`. Conventional Commits em pt-BR (`feat(api): criar cobrança pix`). `git push`, PR e merge são do humano (bloqueados em `.claude/settings.json`)
- **Skills não óbvias.** `claude-api` ao tocar `packages/integrations/src/ai/`. `run` para ver a mudança funcionando antes de declarar pronto. As demais carregam pelos arquivos tocados
- **Playwright MCP.** Mudança que aparece no navegador (rota, componente, estilo, texto ou fluxo do `apps/web`) só está pronta depois de exercitada com as ferramentas `mcp__playwright__*`, com o app no ar pela skill `run`; o roteiro está em `.claude/rules/frontend.md`. Use também onde ele dá mais certeza a um teste: reproduzir bug de UI antes de corrigir, investigar E2E que falha e tirar do snapshot os locators dos E2E. O browser é um só por sessão: subagentes em paralelo não o usam
- **Divergência do PRD ou do design doc** é decisão do humano: registre e pergunte antes de implementar aquele ponto; o resto segue
