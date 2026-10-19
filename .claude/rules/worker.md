---
paths:
  - "apps/worker/**/*.ts"
---

# Worker — Fila no Postgres (`@gizito/worker`)

## Jobs (nomes em `jobNameList` do core)
- `order.analyze`: extração dos assuntos e do perfil do material a partir das fotos (modelo barato). `draft → analyzing → preview_ready` ou volta a `draft` com avisos por foto.
- `order.generate`: planejamento → geração → validação automática → revisão por modelo → render dos dois PDFs → publicação. `paid → processing → ready | failed`. Uma regeneração automática; depois `failed`.
- `order.notify`: e-mail sempre; WhatsApp se vinculado e `WHATSAPP_ENABLED`.
- `charge.reconcile` (periódico): consulta cobranças `awaiting_payment` com mais de 1 minuto no gateway; marca pagas ou expiradas.
- `retention.purge` (periódico): fotos após 30 dias, PDFs após 12 meses.
- `whatsapp.inbound`: processa mensagem recebida (vínculo, SAIR/PARAR, ajuda).

## Padrões
- TODO job é **idempotente**: checar estado atual antes de agir; reexecução não duplica kit, cobrança, e-mail nem mensagem.
- Padrão de handler: carregar pedido → validar que o estado permite a etapa → executar → transição + efeitos na mesma transação. Handler chama service; service fala com Drizzle. Sem repository.
- Payload do job validado com Zod ao enfileirar e ao consumir; payload inválido vai para falha com `outcome_code`, nunca é "corrigido" em runtime.
- Retry com backoff exponencial para falhas transitórias (rede, 5xx, rate limit); falhas de validação pedagógica **não** são transitórias: contam como a única regeneração permitida.
- Concorrência limitada por tipo (`GENERATE_CONCURRENCY`, default 2); `order.generate` tem limite de custo por pedido (`MAX_AI_COST_CENTS_PER_ORDER`): ao exceder, falhar seguro.
- Health check HTTP simples e métricas por etapa (duração, custo, tokens, resultado).
- Logs estruturados com `orderId`, `jobName`, `stage`, duração, custo, `outcomeCode`. **NUNCA** logar imagens, texto extraído, prompt, resposta do modelo, observação ou mensagem de WhatsApp.

## Pipeline de geração (ordem obrigatória, PRD 7.4; contrato em `docs/pedagogy/spec-pedagogica.md` §1 e §5–§10)
1. Alocação: `planKitSlots` do core define assunto e dificuldade de cada vaga (10 + 10) e dos exemplos; o modelo não escolhe.
2. `plan`: objetivos, tipo e foco de cada vaga, textos-base, diretrizes do `materialProfile`; saída em `kitPlanSchema`, conferida por `validateKitPlan`.
3. `generate`: conteúdo do kit (modelo forte) em `kitContentSchema`; `composeStudyKit` junta vagas, plano e pedido em `studyKitSchema` antes de qualquer uso.
4. `validate`: `validateStudyKit` do core com o `MathEvaluator` (mathjs) + `checkMathMarkup` (KaTeX).
5. `review`: segunda verificação por modelo; `interpretReview` dá a severidade pelo código (bloqueador ou aviso, spec §8.5).
6. `render`: dois PDFs; conferir contagem de páginas e presença de todas as questões (regras em `pdf-render.md`).
7. `publish`: upload dos dois arquivos → `publishKit` (transação) → enfileirar `order.notify`.
- Bloqueador em qualquer etapa usa a única regeneração, que refaz plano, kit ou só os itens marcados conforme o código (spec §10).
- Cada chamada de IA grava uma linha em `ai_call` com modelo, versão do prompt, tokens, custo e `outcomeCode`.

## Estrutura
- `src/jobs/{nome}.ts` (um handler por job), `src/pipeline/` (stages puros + orquestração), `src/pipeline/prompts/` (prompts versionados, ver `ai-pipeline.md`), `src/render/` (HTML → PDF), `src/notify/`.

## Testes
- Unit: stages com `FakeAiProvider` e fixtures JSON; validações; mapeamento de erros para `outcomeCode`.
- Integração: Postgres real; job reexecutado; regeneração única; `ready` só com dois arquivos; `WHATSAPP_ENABLED=false`.
