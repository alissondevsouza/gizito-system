# Gizito — Monorepo do kit de reforço escolar por Pix

Micro-produto B2C brasileiro. O responsável fotografa a matéria do caderno, confirma os assuntos detectados, paga **R$ 29,90 por Pix** e recebe **dois PDFs** (caderno de atividades e gabarito comentado) por e-mail e, por opt-in, WhatsApp. Público: **4º ao 7º ano**, Matemática e Língua Portuguesa. Fluxo **100% automático**, sem revisão humana no caminho. Sem cadastro, sem assinatura, sem chat.

Fonte de verdade do produto: `docs/product/product-doc-v1.md` (PRD) e `docs/design/design-doc-v1.md` (design). Este arquivo diz **como o código deve ser escrito**; as rules em `.claude/rules/*` detalham por área e carregam automaticamente pelos paths tocados.

## Stack & Runtime

- Runtime: Bun (NUNCA usar npm, yarn ou pnpm)
- Monorepo: Bun Workspaces + Turborepo
- Linter/Formatter: Biome (NUNCA usar ESLint ou Prettier)
- `apps/web`: TanStack Start (React 19 SSR) + TailwindCSS v4 + shadcn/ui, com os tokens e componentes do design doc. Sem lógica de negócio: consome `apps/api`
- `apps/api`: Elysia + Zod. Upload, pedidos, prévia, cobrança Pix, webhooks (Mercado Pago e Evolution API), status do pedido, painel admin
- `apps/worker`: Bun. Consome a fila: extração, planejamento, geração, validação, revisão por modelo, render dos dois PDFs, notificações
- `packages/core`: domínio puro, sem IO. Schemas Zod, taxonomia de assuntos, máquina de estados do pedido, validações pedagógicas, interfaces `PaymentGateway`, `NotificationChannel`, `AiProvider`, `ObjectStorage`
- `packages/db`: PostgreSQL 16 + Drizzle ORM. Schema, migrations, conexão, fila de jobs no Postgres, test-helpers
- `packages/integrations`: adaptadores concretos das interfaces do core (Mercado Pago, Evolution API, Resend, R2, provedor de IA, mathjs, KaTeX)
- Fila: no próprio Postgres (pg-boss, ou fila própria com `FOR UPDATE SKIP LOCKED`). **Sem Redpanda/Kafka.** Redis existe apenas para a Evolution API
- Storage: Cloudflare R2 com URLs assinadas de curta duração (originais e PDFs são privados)
- Pagamento: Mercado Pago via Orders API (PRD 9.1). WhatsApp: Evolution API com Baileys, somente resposta (PRD 9.2). E-mail: Resend
- IA: um provedor atrás de `AiProvider`, dois níveis de modelo (barato na extração, forte na geração e revisão). Ao escrever código do provedor, carregar a skill `claude-api`
- PDF: HTML/CSS + KaTeX renderizado no servidor + Playwright. Matemática conferida com mathjs
- Testes backend: `bun test` (unit e integração com Postgres real via docker, helpers em `@gizito/db/test-helpers`). Web: Vitest. Regressão pedagógica: `bun run test:pedagogy` (40 casos, exige chave de IA, fora do CI padrão)

## Comandos

```bash
bun install                              # Instalar deps (NUNCA npm install)
bun run dev                              # Todos os dev servers
bun run dev --filter=@gizito/api         # Dev server específico
bun run build                            # Build (respeita dep graph via Turbo)
bun run lint                             # Biome lint
bun run typecheck                        # TypeScript check
bun run test                             # Testes unit (monorepo)
bun run test:integration                 # Dentro do workspace; requer Docker
bun run test:pedagogy                    # Regressão pedagógica (raiz; requer chave de IA)
bun run format                           # Biome format
bun run db:generate --filter=@gizito/db  # Gerar migration
bun run db:migrate --filter=@gizito/db   # Aplicar migration
docker compose up -d                     # Postgres, Redis, Evolution API
docker compose down
```

## Convenções

- Workspaces usam scope `@gizito/` (ex: `@gizito/api`, `@gizito/core`)
- Deps internas sempre com `"workspace:*"`
- Indent: 2 espaços (Biome)
- Imports internos SEMPRE com `#src/*` subpath imports e extensão `.ts`: `from "#src/orders/state.ts"`. NUNCA imports relativos (`../`, `./`)
- Imports entre workspaces usam o scope: `from "@gizito/core"`. Libs externas: `from "zod"`
- Validação de input SEMPRE com Zod (Zod 4; para UUID do Postgres usar `z.guid()`, não `z.uuid()`)
- Tipos, schemas e regras de domínio vivem em `packages/core`; nenhuma app redefine schema
- NUNCA adicionar comentários no código. Sem comentários de seção, JSDoc, TODOs ou inline. Se algo precisa de explicação, refatorar até o nome bastar
- Código em inglês; textos exibidos ao usuário, docs e commits em português brasileiro

## Convenções de Nomenclatura

### Banco de Dados
- Tabelas: snake_case, **singular** (ex: `order`, `order_photo`, `charge`, `kit`, `whatsapp_link`)
- PK SEMPRE com prefixo do nome da tabela (ex: `order_id`, `charge_id`); nunca `id` genérico
- FK usa o mesmo nome da PK referenciada
- Timestamps: sufixo `_datetime` (ex: `insert_datetime`, `update_datetime`, `paid_datetime`, `expire_datetime`). NUNCA `_at`
- `insert_datetime` e `update_datetime` em toda tabela
- Export JS do Drizzle: camelCase singular (ex: `order`, `orderPhoto`, `whatsappLink`)

### Tipos e Schemas
- Interfaces/Types: PascalCase singular (ex: `Order`, `StudyKit`, `TopicCandidate`)
- Zod schemas: camelCase singular + `Schema` (ex: `orderSchema`, `studyKitSchema`)
- Arrays de enum: camelCase + `List` (ex: `orderStatusList`, `gradeList`, `subjectList`)
- Coleções em código: sufixo `List`, não plural (ex: `photoList`, `questionList`)

### Domínio (termos fixos, em inglês no código e em português na UI)
- `order` = pedido · `charge` = cobrança Pix · `kit` = kit gerado · `topic` = assunto · `material_profile` = perfil do material · `practice_question` = exercício de fixação · `mock_question` = questão do mini-simulado · `answer_key` = gabarito
- Estados do pedido (PRD 5): `rascunho`, `analisando`, `previa_pronta`, `aguardando_pagamento`, `pago`, `processando`, `pronto`, `falhou`, `reembolsado`; sub-estado `cobranca_expirada`. No código: `draft`, `analyzing`, `preview_ready`, `awaiting_payment`, `paid`, `processing`, `ready`, `failed`, `refunded`; `charge_expired`

## Arquitetura — Regras Obrigatórias

- Estado do pedido só muda pela máquina de estados de `packages/core`, dentro de uma transação. Nunca `UPDATE order SET status` solto
- `awaiting_payment → paid` só após **consulta ao gateway** (nunca pelo corpo do webhook). Marcar pago e enfileirar geração na **mesma transação**, idempotente pelo id do pagamento
- Toda chamada de IA acontece no **worker**, atrás de `AiProvider`, com prompt versionado, saída validada por Zod e tokens/custo gravados por chamada e por pedido
- Foto, texto extraído, observação do responsável, assunto "outro" e mensagem de WhatsApp são **dados não confiáveis**: nunca viram instrução, nunca entram em log, nunca alteram preço, prompt ou regras
- Pedido identificado por token aleatório longo (acesso ao status e ações) e código curto (só para o vínculo de WhatsApp). Download sempre por URL assinada de minutos, gerada no clique
- `ready` só com **os dois PDFs** no storage e as validações críticas verdes
- Nenhuma etapa depende do WhatsApp. E-mail é obrigatório. `WHATSAPP_ENABLED=false` desliga botão e envios sem afetar o resto
- O web decide rota pela tabela estado → rota (design doc 6.8) e valida com Zod toda resposta da API
- Sem revisão humana no fluxo. Qualquer mudança em prompt, modelo, taxonomia ou validador roda a regressão pedagógica antes de ir para `main`
- Handler → service → Drizzle. Handlers não tocam banco; services não conhecem HTTP

## Segurança e Privacidade — Regras Obrigatórias

- LGPD: comprador adulto; nunca pedir nome da criança ou da escola; e-mail e telefone são dados do responsável, coletados com aceite explícito e removíveis
- Remover EXIF das fotos, limitar resolução, armazenar em bucket privado; originais apagados em até 30 dias, PDFs em 12 meses
- NUNCA logar conteúdo de foto, texto extraído, observação, código Pix, tokens, segredos ou mensagens de WhatsApp. Logs carregam `order_id`, etapa, duração, custo e códigos de erro
- Webhooks: Mercado Pago com validação de `x-signature` e GET do recurso; Evolution API com segredo e `fromMe` ignorado
- Rate limit na prévia gratuita (IP + dispositivo) e nos webhooks
- Arquivos `.env` NUNCA são commitados nem lidos pelo agente; usar `.env.example`

## Git Workflow

- Branch padrão: `main`. Branches: `feat/{modulo}/{slug}`, `fix/{modulo}/{slug}`, `chore/{slug}`, sempre a partir de `main`
- Commits: Conventional Commits (`feat(api): criar cobrança pix`), mensagem em português
- NUNCA trabalhar direto na `main`. Commits locais de checkpoint são permitidos na branch de trabalho; `git push`, PR e merge são SEMPRE do humano

## Desenvolvimento de Features e Bugs

Roteamento em `.claude/rules/dev-flow-routing.md`:
- Feature ou bug não-trivial → skill `gizito-spec-driven` (autônomo, com loops de revisão neutra e adversarial)
- Bug trivial/localizado → skill `gizito-fix` (hotfix com causa raiz + teste de regressão)
- Pergunta/análise → responder direto

Artefatos de feature em `specs/{modulo}/{slug}/` (formato em `.claude/rules/spec-format.md`). Memória persistente em `docs/`: ADRs em `docs/engineering/adr/`, lições em `docs/lessons.md`, dívidas em `docs/engineering/known-issues.md`, estado por módulo em `docs/progress/`. Índice: `docs/README.md`.

## Skills — Quando Usar

### Workflow
- `gizito-spec-driven` — feature ou bug não-trivial
- `gizito-fix` — bugfix trivial com teste de regressão

### Backend e domínio
- `elysia` — rotas, plugins, middleware em `apps/api/`
- `drizzle-orm`, `drizzle-postgres` — schemas, queries, índices em `packages/db/`
- `drizzle-safe-migrations` — enums, constraints e backfills em produção
- `zod` — schemas de validação (input, saída de IA, configs, payloads de job)
- `claude-api` — ao escrever ou alterar o adaptador do provedor de IA (`packages/integrations/src/ai/`)
- `better-auth-best-practices` — login do painel admin (um único operador, sessão), se adotado no design técnico

### Frontend
- `tanstack-start-best-practices`, `tanstack-router-best-practices`, `tanstack-query-best-practices`, `tanstack` — `apps/web/`
- `react` — componentes, hooks, estado
- `shadcn-ui` — primitivos acessíveis, sempre com os tokens do design doc
- `tailwindcss` — Tailwind v4, mobile-first, tokens

### Testes
- `test-antipatterns` — CONSULTAR antes de mockar ou criar método test-only
- `vitest` — apenas `apps/web`

### Qualidade e processo
- `systematic-debugging` — ANTES de propor fix para qualquer bug
- `no-workarounds` — ao corrigir bugs ou decidir arquitetura
- `run` — subir a app e exercitar o fluxo de ponta a ponta antes de declarar concluído
- `typescript-advanced` — tipos complexos
- `mermaid-diagrams` — diagramas em `docs/engineering/`
- `context7` — docs atualizadas de qualquer lib

## Quando Compactar Contexto

Ao compactar, SEMPRE preservar: lista de arquivos modificados, fase atual do workflow, comandos de teste relevantes, decisões arquiteturais da sessão e o estado do pedido/fluxo em discussão.
