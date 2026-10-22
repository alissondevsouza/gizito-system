---
paths:
  - "docker-compose.yml"
  - "docker-compose.*.yml"
  - "**/Dockerfile*"
  - "infra/**"
  - ".github/**/*.yml"
---

# Docker & Infraestrutura

## Infra local (`docker-compose.yml`)
- PostgreSQL 16 (`postgres:16-alpine`): porta 5433 no host; user/pass/db `gizito`; bancos `gizito` (app) e `evolution` (Evolution API) na mesma instância.
- Redis 7 (`redis:7-alpine`): porta 6379; usado **apenas** pela Evolution API.
- MinIO (`pgsty/minio`, tag fixa; o MinIO parou de publicar a imagem comunitária): S3 local no lugar do R2 (ADR-0012), porta 9000 e console 9001 em `127.0.0.1`; credenciais de dev `gizito` / `gizito-local-dev`; o healthcheck cria o bucket `gizito` (idempotente, funciona com `up --wait`). A CI sobe `postgres` e `minio` antes de `test:integration`.
- Evolution API (`evoapicloud/evolution-api`, versão fixada na linha 2.x): porta 8080 só na rede interna (publicar em `127.0.0.1:8080` no dev); `DATABASE_PROVIDER=postgresql`, `CACHE_REDIS_ENABLED=true`, volume `/evolution/instances`, `AUTHENTICATION_API_KEY` por env.
- Sem Redpanda/Kafka. Sem serviço de fila separado: a fila é o Postgres.
- Health checks em todo serviço (interval 5s, timeout 5s, retries 5); volumes nomeados (`postgres_data`, `redis_data`, `minio_data`, `evolution_instances`).

## Padrões Docker
- Imagens Alpine quando possível; multi-stage para produção; `bun install --frozen-lockfile`.
- Worker precisa do Playwright com Chromium: imagem própria com dependências do browser, não instalar em runtime.
- NUNCA incluir `.env` ou segredos na imagem.

## Produção (um VPS)
- Serviços: web, api, worker, postgres, redis, evolution-api, proxy reverso (Traefik ou Caddy) com TLS automático.
- Portas públicas: somente 80/443. Evolution API e Postgres nunca expostos.
- Migrations rodam no deploy via Drizzle antes de subir api/worker; falha de migration aborta o deploy.
- Backups: `pg_dump` diário para R2 com retenção de 7 dias; restauração testada antes do piloto; volume da Evolution incluído no backup (perder a sessão exige novo QR).
- Monitoramento mínimo: health checks, alerta de fila parada, de `CONNECTION_UPDATE` desconectado e de taxa de `failed`.
- Variáveis por serviço documentadas em `.env.example`; `WHATSAPP_ENABLED` e `PAYMENT_GATEWAY` como flags.
