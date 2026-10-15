---
feature: F0-02 infra-local-compose
module: infra
size: P
status: in_progress
branch: feat/infra/infra-local-compose
updated: 2026-10-15
---

# F0-02 infra-local-compose

## Objetivo
Subir a infra local do Gizito com um comando: Postgres 16 (bancos `gizito` e `evolution`), Redis 7 e Evolution API fixada na linha 2.x, com healthchecks e portas publicadas só em `127.0.0.1`. Destrava F0-05 (`test-helpers` com Postgres real) e F2-10 (WhatsApp). Fontes: roadmap §3 F0-02, PRD §9.2 "Infra", rule `docker-infra.md`.

## Requisitos e critérios de aceite
- **RF-01** — `docker-compose.yml` na raiz com `postgres:16-alpine` em `127.0.0.1:5433`, user/senha/banco `gizito` e um segundo banco `evolution` criado por script em `infra/postgres/initdb/` na mesma instância · Aceite: `psql -l` dentro do container lista `gizito` e `evolution`; o `DATABASE_URL` do `.env.example` conecta do host.
- **RF-02** — `redis:7-alpine` em `127.0.0.1:6379`, `appendonly`, volume `redis_data`, usado só pela Evolution · Aceite: `redis-cli ping` responde `PONG`; nenhum workspace referencia Redis.
- **RF-03** — `evoapicloud/evolution-api:v2.3.7` em `127.0.0.1:8080`, `DATABASE_PROVIDER=postgresql` no banco `evolution`, `CACHE_REDIS_ENABLED=true`, volume `evolution_instances:/evolution/instances`, `AUTHENTICATION_API_KEY` vinda de `EVOLUTION_API_KEY`, subindo só depois de Postgres e Redis saudáveis · Aceite: `GET /instance/fetchInstances` com header `apikey` responde 200 `[]`; sem o header responde 401.
- **RF-04** — Healthcheck em todo serviço (interval 5s, timeout 5s, retries 5; `start_period` na Evolution para cobrir as migrations do Prisma), volumes nomeados `postgres_data`, `redis_data`, `evolution_instances`, nenhuma porta publicada fora de `127.0.0.1` · Aceite: `docker compose up -d --wait` termina com os três serviços `healthy`; `docker compose config` só tem `host_ip: 127.0.0.1`.
- **RF-05** — Evolution guarda o mínimo: instância persistida; mensagens, contatos, chats, histórico, labels e cache "está no WhatsApp" não gravados; telemetria desligada; instância não é apagada ao desconectar · Aceite: variáveis `DATABASE_SAVE_DATA_*=false`, `DATABASE_SAVE_DATA_INSTANCE=true`, `TELEMETRY_ENABLED=false`, `DEL_INSTANCE=false` no compose.
- **RF-06** — `.env.example` com `EVOLUTION_API_KEY` de exemplo e comentário sobre o compose; CI valida o compose com `docker compose config --quiet` · Aceite: `.env.example` atualizado; step no `ci.yml`.
- **RF-07** — Docs de estado: roadmap (F0-02 `[x]`, resumo por fase), `docs/progress/infra.md` e linha Infra de `docs/README.md` · Aceite: arquivos atualizados com data e caminho da spec.

## Fora de escopo
- Compose de produção, proxy com TLS, backups e Dockerfiles das apps (F2-13); imagem do worker com Chromium (F1-08).
- Criação da instância WhatsApp (`POST /instance/create`), webhook e adaptador Evolution (F2-10).
- `test-helpers` e migrations (F0-05): só o Postgres pronto para eles.
- Evolution Manager (frontend da Evolution): não é necessário; a instância será criada por API em F2-10.

## Plano
- **Imagem fixada em `v2.3.7`**: última tag estável da linha 2.x no Docker Hub (05/12/2025); `2.4.0` só tem release candidate. Tag com prefixo `v` no Docker Hub (sem `v` no GitHub).
- **Dois bancos na mesma instância** via `/docker-entrypoint-initdb.d/01-create-evolution-database.sql` (`CREATE DATABASE evolution OWNER gizito`). O entrypoint da Evolution roda `prisma migrate deploy` no boot, então o banco precisa existir e o serviço depende de `postgres` com `condition: service_healthy`.
- **Healthcheck do Postgres com `-h 127.0.0.1`**: durante o init a imagem sobe um servidor temporário só em socket Unix; checar por TCP evita marcar saudável antes dos scripts de init rodarem.
- **Healthcheck da Evolution com `node -e fetch(...)`**: a imagem final (`node:24-alpine`) tem `bash`, `openssl` e `ffmpeg`, mas não `curl` nem `wget`. `GET /` da Evolution responde 200 sem autenticação.
- **`EVOLUTION_API_KEY` com default local** (`${EVOLUTION_API_KEY:-gizito-local-dev-key}`): o compose sobe sem `.env` (útil para o CI de F0-05 subir só o Postgres) e a porta é só local. Em produção (F2-13) a variável é obrigatória.
- **Projeto `name: gizito`** no compose para volumes e containers previsíveis (`gizito-postgres-1`, volume `gizito_postgres_data`).
- Arquivos: `docker-compose.yml`, `infra/postgres/initdb/01-create-evolution-database.sql`, `.env.example`, `.github/workflows/ci.yml`, `docs/product/roadmap-v1.md`, `docs/progress/infra.md`, `docs/README.md`, esta spec.
- Riscos: Evolution demorar mais que o `start_period` na primeira subida (migrations) → medir e ajustar; `GET /` exigir auth nesta versão → trocar o healthcheck para checagem TCP via `/dev/tcp` do bash.

## Tasks
### M1 — Compose e init do Postgres
- [x] 1.1 `docker-compose.yml` com os três serviços, healthchecks, volumes, `depends_on` condicional e portas em `127.0.0.1` · Verificação: `docker compose config --quiet`
- [x] 1.2 `infra/postgres/initdb/01-create-evolution-database.sql` · Verificação: `docker compose exec postgres psql -U gizito -c '\l'` lista `evolution`
- [x] 1.3 `docker compose up -d --wait` saudável; Evolution responde 200 com `apikey` e 401 sem · Verificação: `docker compose ps`, `curl`
- [x] 1.4 Reinício (`down` + `up`) mantém os volumes e volta saudável · Verificação: `docker compose down && docker compose up -d --wait`

### M2 — Env, CI e docs
- [x] 2.1 `.env.example` (`EVOLUTION_API_KEY` de exemplo, comentário do compose) e step `docker compose config --quiet` no CI · Verificação: `bun -e` parse do YAML
- [ ] 2.2 Roadmap, `docs/progress/infra.md`, `docs/README.md` · Verificação: leitura
- [ ] 2.3 Commit; revisão neutra (toca config da Evolution: zona WhatsApp/LGPD); `review.md`

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-15 | `evoapicloud/evolution-api:v2.3.7` | última estável da linha 2.x; `2.4.0` só em RC |
| 2026-10-15 | Evolution não grava mensagens, contatos, chats, histórico nem labels (`DATABASE_SAVE_DATA_*=false`) | o canal só reconhece código, SAIR e PARAR; guardar conversa de responsável no banco da Evolution é dado pessoal sem uso (invariante 10). Instância continua persistida para sobreviver a restart |
| 2026-10-15 | `EVOLUTION_API_KEY` com default só-local no compose | sobe sem `.env`; porta só em `127.0.0.1`; produção exige a variável |
| 2026-10-15 | Healthcheck da Evolution por `node -e fetch` | imagem final sem curl/wget |

## Status
Fase: M1 e 2.1 concluídos; docs de estado e revisão neutra pendentes.
