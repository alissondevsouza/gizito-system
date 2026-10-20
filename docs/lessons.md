# Gizito — Lessons Learned

Lições operacionais e gotchas graduados dos Decisions Logs das features. Append-only: adicionar no topo, nunca reescrever entradas antigas. Formato: `## [YYYY-MM-DD] Título — origem`.

Diferença para ADRs (`docs/engineering/adr/`): ADR registra uma **decisão arquitetural** (por que escolhemos X); lesson registra um **aprendizado operacional** (como X realmente se comporta, o que quebra e como evitar).

---

## [2026-10-20] mathjs 15: `simplify` e `toTex` de função crescem de forma explosiva; unidade simplificada depende de estado global — F1-04

Três armadilhas do mathjs 15.2 com expressão vinda do modelo, todas medidas na revisão da F1-04:
- `simplify` levou mais de 60 s numa soma de 30 termos `k*x` (139 caracteres) e não terminou em 300 s com 40 termos;
- `FunctionNode.toTex` calcula o LaTeX de cada argumento duas vezes, então `sqrt(` aninhado 26 vezes levou 31 s. Os dois travariam o worker de forma síncrona. O avaliador não simplifica (compara por amostragem) e monta o LaTeX de toda função no próprio `handler`, calculando cada argumento uma vez;
- `Unit.simplify()` usa o sistema "auto", que lembra a última unidade usada de cada grandeza no estado global: `3 m * 4 m` saiu como hectare depois de um teste com hectare. O nome da unidade é montado do `formatUnits()`.

Ainda no mathjs, `min` resolve para a função antes da unidade, então `30 min` falha; a unidade entra no escopo da avaliação.

Processo: o verifier deixou um arquivo de sonda em `src/`, e um `git add -A` o levou ao commit, com import por caminho absoluto que quebraria o CI. Depois de spawn de verifier, conferir `git status` antes de adicionar tudo.

## [2026-10-20] Zod 4: fábrica genérica de schema perde o tipo dentro do `refine` — F1-03

Uma função `schemaOf<TShape>(shape: TShape)` que devolve `z.strictObject({ ...shape }).refine(fn)` não compila: dentro da fábrica o tipo de saída fica `$InferObjectOutput<... & TShape>`, que o TypeScript não resolve, e nenhuma função de `refine` com parâmetro estrutural é aceita. Funciona escrever os schemas por extenso (um por disciplina e por bloco), compartilhando os *shapes* como objetos e as funções de `refine` com parâmetro estrutural (`{ optionList: readonly unknown[] | null; ... }`). O mesmo vale para generics sobre listas de união (`MathStudyQuestion[] | PortugueseStudyQuestion[]`): tipar o parâmetro pelo que a função lê (`readonly { readonly [key in K]: string }[]`), nunca com `as`.

## [2026-10-19] Pino roda `formatters.log` antes dos serializers e não formata bindings de filho; TanStack manda o erro do loader no HTML — revisão da F0 (M5)

No Pino 10.4, `formatters.log` recebe o objeto **antes** de `serializers`; por isso a máscara do `createLogger` deixa a chave `err` para o `serializers.err` e serializa `Error` nas outras chaves. Bindings de `logger.child({...})` não passam pelo formatter (o `redact` antigo cobria): o `createLogger` envolve o `child` para mascará-las. No TanStack Start, o `errorComponent` da raiz não vale para rotas filhas no SSR (vale o `defaultErrorComponent` do router), e o `Error` lançado num loader vai serializado no payload do HTML mesmo com a página de erro própria: loaders lançam erro com mensagem neutra, nunca com dado do pedido.

---

## [2026-10-19] `close()` do Bun.SQL não resolve com uma conexão ainda pendente — revisão da F0

Contra um servidor que aceita o TCP e nunca responde, a consulta falha em `connectionTimeout` (padrão de 30 s, agora 5 s no `createDatabase`) e o `close()` seguinte volta na hora. Se o `close()` for chamado enquanto a tentativa de conexão ainda está pendente, porém, ele não resolve, nem com `{ timeout: 0 }` (medido em 19/10/2026, Bun 1.3.11). Em teste, espere a consulta pendente falhar antes de fechar; no desligamento, a espera fica limitada pelo `connectionTimeout`. Achado também: com índices parciais por status, consulta com `status IN (...) OR ...` não usa nenhum deles e varre a tabela; separe por status.

## [2026-10-16] Turbo 2 em strict mode descarta variáveis do shell nas tasks — revisão da F0-07

Por padrão o Turbo só repassa às tasks as variáveis declaradas em `env`/`passThroughEnv` do `turbo.json`. `DATABASE_URL=... bun run dev` chegava às apps sem `DATABASE_URL` e o config derrubava o processo; o caminho com `.env` funcionava só porque o próprio Bun lê o arquivo. A task `dev` usa `passThroughEnv: ["*"]` (não tem cache, então não muda hash); tasks com cache declaram cada variável em `env`.

## [2026-10-16] Testes do Elysia com `app.handle`: host com ponto e `onAfterResponse` depois da resposta — F0-07

`app.handle(new Request("http://x/health"))` devolve 404 para toda rota: o Elysia acha o início do path por posição na URL e erra com host curto sem ponto. Usar `http://localhost/...` nos testes. E o `onAfterResponse` roda depois de `handle` resolver, então asserção sobre o log de request logo após o `await` falha de forma intermitente; esperar a entrada no destino do logger (`createMemoryLogger().waitForEntryList`), nunca `sleep`.

## [2026-10-16] No Vitest com jsdom, `readFileSync(new URL(...))` falha — F0-07

O ambiente jsdom troca o `URL` global pelo do jsdom, e o `fs` do Node não reconhece essa instância como URL de arquivo. Passar `fileURLToPath(new URL(caminho, import.meta.url).href)` (string) ao `fs` em testes de `apps/web`.

## [2026-10-15] Datas lidas pelo driver têm milissegundo; o Postgres grava microssegundo — F0-06

Comparar `update_datetime` antes e depois de um UPDATE feito logo em seguida falha de forma intermitente: as duas operações cabem no mesmo milissegundo e o `Date` do JavaScript trunca o resto. O teste de trigger de F0-05 passava e começou a falhar quando as queries ficaram mais rápidas. Em teste de tempo, gravar uma data antiga explícita e conferir que ela foi sobrescrita, ou injetar o relógio; nunca depender da distância entre dois `now()` reais.

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
