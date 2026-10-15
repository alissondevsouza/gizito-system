# ADR-0006: TanStack Start no web, Elysia na API, worker Bun puro

**Data:** 2026-10-15
**Status:** aceito
**Decidido por:** Alisson

## Contexto

O PRD §9 fixa a divisão em `apps/web` (landing e fluxo de compra, conversa só com a API), `apps/api` (upload, pedidos, cobrança, webhooks, admin) e `apps/worker` (fila, IA, render). O web precisa de SSR para a landing e de uma máquina de rotas que redirecione pelo estado do pedido (design doc 6.8); a API precisa de validação Zod em toda rota e de multipart; o worker não serve HTTP além de `/health`. Tudo roda em Bun.

## Decisão

- `apps/web`: TanStack Start (React 19, SSR) com TanStack Router e Query, Tailwind v4 com os tokens do design doc e shadcn/ui. Sem lógica de negócio: valida respostas da API com os schemas do core e decide rota pela tabela estado → rota em um único módulo.
- `apps/api`: Elysia em Bun, handlers finos → services → Drizzle; schema Zod em body, params, query e resposta; config validada no boot; nunca chama IA.
- `apps/worker`: processo Bun sem framework: loop da fila, handlers por job, pipeline, render, notificações; `/health` mínimo.
- Fronteira única entre web e backend: HTTP da API. O web não acessa banco nem fila.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Next.js (web + API routes) | ecossistema | acopla web e API no mesmo deploy; API routes com Node em vez de Bun; o worker ficaria de fora de qualquer forma |
| Web e API no mesmo processo TanStack Start (server functions) | menos serviços | webhooks, rate limit, multipart e admin em server functions; escalar o web escala a API; viola "web sem lógica de negócio" |
| Hono na API | parecido, multi-runtime | Elysia tem integração nativa com Bun e validação de resposta tipada; a portabilidade de runtime não é objetivo |
| Worker como rotas da API | um serviço a menos | geração de minutos com Playwright e IA no mesmo processo que responde webhook em menos de 22 s |

## Consequências

### Positivas
- Três deploys independentes com escala e dependências próprias (só o worker leva Chromium).
- Toda regra de negócio tem um lugar (core + services da API + jobs do worker); o web é substituível.
- Testes: unit sem Docker, integração com Postgres real na API e no worker, E2E Playwright no web com adaptadores falsos.

### Negativas
- Três apps para subir em dev (`bun run dev`) e três imagens em produção.
- TanStack Start é mais novo que Next.js; menos exemplos prontos.

### Riscos
- Mudanças de API do TanStack Start antes da 1.x estável: versões fixadas; skills com padrões em `.claude/skills/`.

## O que faria esta decisão mudar

- Necessidade de app nativo ou de múltiplos frontends (a API já é a fronteira).
- TanStack Start abandonado ou Elysia sem manutenção.
