---
feature: F0-02 infra-local-compose
module: infra
round: 1
verdict: APROVADO
updated: 2026-10-15
---

# Review: F0-02 infra-local-compose

## Rodada 1

Verifier: `gizito-implement-verifier` (spawn novo, contexto isolado). Diff: `git diff main...HEAD` nos commits `dcb3319` e `15ca1b3` (8 arquivos, +190/−11, nenhum `.ts`).

### Comandos executados
| Comando | Resultado |
|---|---|
| `docker compose config --quiet` (sem `.env`, como no CI) | exit 0 |
| `docker compose config --format json` → `host_ip` das portas | `127.0.0.1` em evolution, postgres e redis |
| `docker compose down -v && docker compose up -d --wait` (volumes vazios, imagens em cache) | 3 serviços `healthy` em 12 s; log do postgres mostra o script de `initdb` e `CREATE DATABASE` |
| `psql` em `pg_database` | `evolution|gizito`, `gizito|gizito`; 37 tabelas em `evolution`, 0 em `gizito` |
| `curl /`, `/instance/fetchInstances` sem header, com `apikey` correta, com chave errada | 200; 401; 200 `[]`; 401 |
| `redis-cli ping`, `client list` | `PONG`; único cliente de rede é o container `gizito-evolution-1` |
| `bun -e` com `Bun.SQL` e o `DATABASE_URL` do `.env.example` | `{db: "gizito", u: "gizito"}` |
| `docker compose exec evolution env` | `DATABASE_SAVE_DATA_*=false`, `DATABASE_SAVE_DATA_INSTANCE=true`, `TELEMETRY_ENABLED=false`, `DEL_INSTANCE=false`, `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false` |
| grep dos 19 nomes de variáveis em `/evolution/dist/main.js` da imagem | todos existem; nome falso de controle → 0 ocorrências |
| `docker compose logs evolution` (warn/error) | vazio; `Database URL:` impresso sem credencial |
| grep `redis` e `REDIS_URL` em `apps/`, `packages/`, compose e CI | nenhuma ocorrência fora de `.env.example` |
| `bun run typecheck` / `bun run test` | 6/6 ok; 6/6 ok (12 testes) |
| `test:integration` / regressão pedagógica | não aplicável |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `docker-compose.yml:4-19`; script de `initdb` executado; `pg_database` lista os dois bancos; `DATABASE_URL` conecta do host |
| RF-02 | sim | `docker-compose.yml:21-33`; `PONG`; único cliente é a Evolution; nenhum workspace referencia Redis |
| RF-03 | sim | `docker-compose.yml:35-49,60-61,74-75`; 200 `[]` com `apikey`, 401 sem |
| RF-04 | sim | healthchecks 5s/5s/5 nos três, `start_period: 90s`; volumes nomeados; `host_ip` só `127.0.0.1`; `up -d --wait` do zero em 12 s (41 s com pull) |
| RF-05 | sim | `docker-compose.yml:51,56-57,62-69`; env efetivo no container; nomes validados contra o dist da imagem |
| RF-06 | sim | `.env.example` (comentário + `EVOLUTION_API_KEY`); `ci.yml:27`; `config --quiet` passa sem `.env` |
| RF-07 | sim | roadmap (`[x]`, data, `dcb3319`, spec, resumo 2/5); `docs/progress/infra.md`; `docs/README.md` |

### Achados
- [ALERTA] `.env.example:56-57` — `REDIS_URL` não é lido por nada: o compose fixa `redis://redis:6379/0` e nenhum workspace usa Redis; o comentário "Só para o docker-compose" sugeria configurabilidade inexistente — remover a chave ou reescrever o comentário.
- [SUGESTÃO] `docker-compose.yml:50` — default `gizito-local-dev-key` é decisão registrada e a porta é só local; o risco é reaproveitar o arquivo em produção sem `.env` — registrar em `docs/progress/infra.md` que o compose de F2-13 deve usar `${EVOLUTION_API_KEY:?}`.
- [SUGESTÃO] `docs/progress/infra.md:15` — `initdb` só roda com volume vazio; init interrompido deixa `postgres_data` sem o banco `evolution` e a Evolution em crash-loop — anotar que a recuperação é `docker compose down -v`.
- [SUGESTÃO] `.claude/rules/docs.md:15` × spec RF-07 — a rule diz que `docs/progress/*` e a tabela do README mudam por estado de módulo, "não a cada feature"; a spec (e a F0-01) atualizam por feature — alinhar a rule ou o template; decisão do humano.

### Regressão pedagógica
não aplicável

### Resposta do orquestrador
- ALERTA: aplicado. `REDIS_URL` removido do `.env.example`; ficou um comentário informativo de que o Redis é só da Evolution, com URL fixa no compose.
- SUGESTÃO do default da chave: aplicada em `docs/progress/infra.md` (Pendências): compose de produção exige `${EVOLUTION_API_KEY:?}`.
- SUGESTÃO do `initdb`: aplicada em `docs/progress/infra.md` (nota de operação com `docker compose down -v`).
- SUGESTÃO da rule `docs.md`: não aplicada aqui; é decisão do humano. Contexto: a rule diz "não a cada feature", mas o roadmap ("Como marcar") e as duas features de F0 atualizaram `docs/progress/{modulo}.md` e a tabela do README a cada feature concluída. Proposta: tratar "módulo mudou de estado" como "feature do roadmap concluída naquele módulo" e ajustar a frase da rule; alternativa é parar de tocar `docs/progress` por feature e deixar só o roadmap. Fica para o handoff.
