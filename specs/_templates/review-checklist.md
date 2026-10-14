---
feature: {{FEATURE_NAME}}
module: {{MODULE_NAME}}
phase: review
status: draft
created: {{DATE}}
updated: {{DATE}}
depends_on: [spec.md, plan.md]
---

# Code Review: {{FEATURE_NAME}}

## Checklist

### Segurança e privacidade
- [ ] Todo input externo (HTTP, webhook, mensagem de WhatsApp, saída de IA) validado com Zod na borda
- [ ] Conteúdo de foto, texto extraído, observação do responsável e mensagens de WhatsApp NÃO aparecem em logs
- [ ] Pedido acessado só por token; download só por URL assinada de curta duração
- [ ] Webhook do Mercado Pago: assinatura validada e recurso consultado por GET antes de qualquer transição
- [ ] Webhook da Evolution API: segredo validado, `fromMe` ignorado, só código do pedido/SAIR/PARAR reconhecidos
- [ ] Nenhum dado da criança ou da escola solicitado ou persistido; e-mail e telefone tratados como dados pessoais do responsável
- [ ] Segredos só por variável de ambiente; nada em código ou fixtures

### Domínio e estado
- [ ] Transições de estado do pedido passam pela máquina de estados de `packages/core`, dentro de transação
- [ ] `pago` + enfileiramento na mesma transação; reprocessar o mesmo webhook não duplica job nem kit
- [ ] `pronto` só com os dois PDFs no storage
- [ ] Nenhuma etapa depende do WhatsApp; `WHATSAPP_ENABLED=false` mantém o fluxo íntegro

### Pipeline pedagógico (se tocado)
- [ ] Prompts versionados; `generation_version` gravado no kit
- [ ] Saída da IA validada por Zod antes de qualquer uso; custo e tokens registrados por chamada e por pedido
- [ ] Contagens (2 exemplos, 10 + 10 questões, 20 respostas), cobertura por assunto e recálculo matemático verificados
- [ ] Regressão pedagógica (`bun run test:pedagogy`) rodada e sem bloqueador crítico, quando prompt/modelo/taxonomia/validador mudou

### Tipos e contratos
- [ ] Sem `any`, `as` ou `!` desnecessários
- [ ] Tipos e schemas exportados de `packages/core`; nenhum schema duplicado em apps
- [ ] `bun run typecheck` limpo

### Testes
- [ ] Testes cobrem os critérios de aceite do spec
- [ ] Casos de erro e bordas (webhook duplicado, cobrança expirada, falha de geração, foto ilegível) cobertos
- [ ] Integração usa Postgres real (docker), nunca mock de banco
- [ ] `bun run test` e, quando aplicável, `test:integration` verdes

### Consistência
- [ ] Imports `#src/*.ts`; nomenclatura de banco e de código conforme `CLAUDE.md`
- [ ] Sem comentários no código
- [ ] Conventional Commits; Biome limpo
- [ ] Nenhum arquivo fora do escopo alterado

### Conformidade com plan e docs
- [ ] Todas as tasks do plan implementadas; nada além do escopo
- [ ] Decisões arquiteturais do plan e ADRs respeitados
- [ ] PRD/design doc atualizados se o comportamento visível mudou

## Issues Encontrados

| # | Severidade | Descrição | Arquivo | Sugestão |
|---|-----------|-----------|---------|----------|
| 1 | <!-- crítico/alerta/sugestão --> | <!-- descrição --> | <!-- path:line --> | <!-- como corrigir --> |

## Veredito
<!-- APROVADO / REPROVADO -->
