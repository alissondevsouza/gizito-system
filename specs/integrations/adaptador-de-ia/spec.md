---
feature: F1-05 adaptador-de-ia
module: integrations
size: M
status: in_progress
branch: feat/integrations/adaptador-de-ia
updated: 2026-10-20
---

# F1-05 adaptador-de-ia

## Objetivo
Implementar o `AiProvider` real com a Anthropic, mais o `FakeAiProvider`. É por ele que a extração (F1-06), a geração (F1-07), o CLI (F1-09) e a regressão (F1-10) chamam a IA.
- **Modelos** (PRD 1.4 §12.1, decisão do humano em 20/10/2026): Claude Haiku 5.5 na extração e Claude Sonnet 5.5 no plano, na geração e na revisão. São configuráveis.
- **Por chamada:** saída validada pelo Zod do schema da etapa, tokens e custo para o `ai_call` (invariante 3), redução da foto (PRD §6: lado maior de cerca de 1.600 px, JPEG com qualidade de cerca de 80), nova tentativa só em erro transitório e erro tipado.
- **Fontes:** roadmap F1-05; rules `integrations.md`, `ai-pipeline.md`, `privacy-security.md`; spec pedagógica §1; referência da API do Claude (skill `claude-api`, preços de 06/10/2026).

## Requisitos e critérios de aceite
- **RF-01 Contrato no core** — `AiProvider` devolve `Promise<Result<AiResult<T>, AiFailure>>` em vez de lançar, para que a F1-07 grave o `ai_call` também nas chamadas que falham (tokens gastos contam no teto do pedido).
  - `AiRequest` ganha `signal?: AbortSignal`, porque o worker interrompe a etapa no desligamento (`jobs.md` §2).
  - `AiFailure = { code, usage | null, model, promptVersion, durationMs }`.
  - `aiFailureCodeList`: `ai_timeout`, `ai_rate_limited`, `ai_unavailable`, `ai_aborted`, `ai_auth_failed`, `ai_request_invalid`, `ai_image_invalid`, `ai_refused`, `ai_output_truncated`, `ai_output_invalid`.
  - `isRetryableAiFailureCode`: verdadeiro só para os quatro primeiros, que voltam à fila; os demais são falha da etapa.
  - No `config` do core: `aiEffortList` (`low`…`max`), `aiModelSettingSchema` (`{ model, effort }`) e `aiEnvironmentSchema`:
    - `AI_API_KEY` obrigatório;
    - `AI_MODEL_EXTRACT` e `AI_MODEL_GENERATE` obrigatórios, sem padrão no core, para não pôr nome de modelo de fornecedor no domínio (os valores sugeridos ficam no `.env.example`);
    - `AI_EFFORT_EXTRACT` e `AI_EFFORT_GENERATE` opcionais; sem eles, vale o padrão do adaptador (`medium` na extração e `high` na geração).

  Aceite: o teste de contrato do core cobre o tipo novo; os códigos e a regra de nova tentativa ficam numa tabela de teste; `aiEnvironmentSchema` exige chave e modelos e recusa chave vazia e esforço fora da lista.
- **RF-02 JSON Schema da saída** — `toOutputJsonSchema(schema)` gera, a partir do schema Zod da etapa (`z.toJSONSchema`, `reused: "ref"`), o subconjunto que a saída estruturada aceita:
  - mantém `type`, `enum`, `const`, `anyOf` (`oneOf` vira `anyOf`), `$ref`/`$defs`, `properties`, `required`, `items`, `minItems` 0 ou 1, `format` suportado, `title` e `description`;
  - todo objeto sai com `additionalProperties: false`;
  - o que a API não aplica (tamanho de texto, `minItems`/`maxItems` maiores, `minimum`/`maximum`, `pattern`) vai para a `description`, como o SDK faz, para o modelo ainda ver o limite;
  - `allOf` só de `pattern`, que o Zod gera para string com duas regex, vira `description`;
  - `$ref` com restrição ao lado é embutido (a definição do `$defs` mesclada com a restrição), para o padrão do schema reutilizado não se perder; `allOf` com `$ref` não é aceito pela API;
  - o JSON Schema descreve a entrada do Zod (`io: "input"`), que é o que o modelo produz;
  - os limites de inteiro seguro do `z.int()` são descartados.

  Aceite:
  - os sete schemas de saída do core (extração, plano, conteúdo e reparo por disciplina, revisão) convertem sem erro, só com palavras-chave da lista e com `additionalProperties: false` em todo objeto;
  - `enum` e `const` sobrevivem (o helper do SDK descarta os dois e falha com `allOf` de padrões);
  - `maxLength: 700` aparece na `description`;
  - todo `pattern` e todo `maxLength` do schema bruto dos sete schemas aparecem na `description` convertida.
- **RF-03 Custo** — tabela de preço por modelo em US$ por milhão de tokens (entrada, saída e leitura de cache), conforme a tabela de 06/10/2026:
  - Haiku 5.5: 0,10 / 0,50 / 0,01;
  - Sonnet 5.5: 2 / 10 / 0,20;
  - Opus 5.5: 4 / 20 / 0,20.

  Escrita de cache: 1,25× a entrada no TTL de 5 minutos e 2× no de 1 hora. O `costCents` sai em **centavos de dólar**. `inputTokens` soma os tokens sem cache, os escritos e os lidos do cache. Modelo fora da tabela é erro na construção do adaptador.

  Aceite:
  - 1.000.000 de tokens de entrada no Sonnet 5.5 = 200 centavos;
  - leitura e escrita de cache com o preço de cada uma;
  - escrita de 1 hora a 2×;
  - modelo desconhecido recusado.
- **RF-04 Redução de imagem** — `reduceImage` com sharp:
  - gira pela orientação do EXIF e limita o lado maior a `AI_IMAGE_MAX_SIDE_PX` (1.600), sem ampliar;
  - sai em JPEG com `AI_IMAGE_JPEG_QUALITY` (80), fundo branco no lugar da transparência e sem metadado nenhum (EXIF, GPS), em linha com a LGPD;
  - imagem que o sharp não lê dá `ai_image_invalid`.

  Aceite:
  - 4000×3000 vira 1600×1200 em JPEG;
  - 800×600 continua 800×600;
  - PNG sai como JPEG;
  - foto com orientação 6 sai girada e sem EXIF;
  - bytes inválidos dão `ai_image_invalid`.
- **RF-05 Adaptador Anthropic** — `createAnthropicProvider({ apiKey, extract, generate, timeoutMs?, maxRetries?, fetch?, now?, logger? })`.
  - **Modelo por etapa:** `extract` usa o modelo de extração; `plan`, `generate` e `review` usam o de geração.
  - **Requisição:** streaming até a mensagem final; `thinking: adaptive` com o esforço da configuração; `output_config.format` com o RF-02; system em bloco com `cache_control` efêmero (as regras e a taxonomia ficam no system para o cache, `prompts-v1.md`); imagens reduzidas antes do texto do usuário; `max_tokens` do pedido ou o padrão da etapa (extract 16.000, plan 32.000, generate 64.000, review 32.000); `signal`, `timeout` e `maxRetries` explícitos.
  - **Novas tentativas:** o SDK repete sozinho 408, 409, 429, 5xx e erro de rede (padrão 2 vezes); o adaptador não repete nada além disso.
  - **Mapeamento:**
    - timeout → `ai_timeout`;
    - 429 → `ai_rate_limited`;
    - 5xx, 529 e falha de rede → `ai_unavailable`;
    - cancelamento → `ai_aborted`;
    - 401, 403 e 402 → `ai_auth_failed`;
    - 408 e 409 (depois das tentativas do SDK) → `ai_unavailable`; qualquer outro 4xx → `ai_request_invalid`;
    - erro do SDK depois do 200 (conexão cortada, SSE sem `message_stop`, corpo que não é SSE) → `ai_unavailable`;
    - `stop_reason` `refusal` → `ai_refused`;
    - `max_tokens` ou `model_context_window_exceeded` → `ai_output_truncated`;
    - JSON que não analisa ou não passa no Zod → `ai_output_invalid`.
    - Erro que não vem do SDK nem do sharp é bug e propaga.
  - **Retorno:** o `model` é o que a resposta informa, e o `usage` vai junto quando há resposta. Em stream interrompido, o `usage` sai do último retrato da mensagem: entrada e cache exatos, saída estimada pelo texto visível. `durationMs` é inteiro (`ai_call.duration_ms` é `integer`).
  - **Ambiente:** o cliente do SDK recebe URL, `authToken: null`, `logLevel: "off"` e `openTelemetry: false` no construtor, para não ler `ANTHROPIC_*` do ambiente.
  - **Log:** mensagem do fornecedor só em `debug`, com etapa, modelo, status e tipo; nunca prompt, saída ou imagem.

  Aceite: testes com `fetch` injetado devolvendo SSE gravado, um por código e um por etapa, conferindo o corpo enviado (modelo, esforço, formato, `cache_control` no system, imagem em base64 JPEG antes do texto) e o custo.
- **RF-06 Fake** — `createFakeAiProvider({ extractModel?, generateModel? })` com `enqueueOutput(stage, output)`, `enqueueFailure(stage, code)` e `requestList`.
  - Valida a saída enfileirada com o schema do pedido, como o real (inválida dá `ai_output_invalid`).
  - Calcula `usage` e custo determinísticos pela mesma tabela.
  - Respeita `signal` cancelado (`ai_aborted`) e passa as fotos por `reduceImage` (foto ilegível dá `ai_image_invalid`), como o real.
  - Sem nada enfileirado, lança erro de teste.

  Aceite: a suíte de contrato roda no fake.
- **RF-07 Suíte de contrato** — `describeAiProviderContract` cobre:
  - as quatro etapas com saída válida e `usage`, `model`, `promptVersion` e `durationMs` coerentes;
  - extração com imagem;
  - foto ilegível (`ai_image_invalid` sem `usage`);
  - `durationMs` inteiro;
  - saída fora do schema (`ai_output_invalid` com `usage`);
  - saída cortada (`ai_output_truncated`);
  - `signal` cancelado (`ai_aborted`, retentável).

  Roda sempre no fake. Roda no real só com `AI_LIVE_TEST=1` e `aiEnvironmentSchema` válido, pelo script `test:ai-live` do `integrations` (carrega o `.env` da raiz com `--env-file`). O real também confere que a API aceita os sete schemas de saída do core: com `max_tokens` pequeno, o esperado é `ai_output_truncated` e não `ai_request_invalid`. Aceite: `bun run test` não chama a rede nem com a chave no `.env`; `test:ai-live` passa com a chave.
- **RF-08 Fechamento** — `index.ts` e `fakes/index.ts` exportam adaptador, fake, `reduceImage`, `toOutputJsonSchema` e custo. Docs:
  - ADR-0011 (provedor e decisões técnicas do adaptador);
  - `data-model.md` com `cost_cents` em centavos de dólar;
  - comando no `CLAUDE.md`;
  - roadmap.

  As chaves novas do `.env.example` ficam para o humano: a regra `Edit(**/.env*)` bloqueia a edição. Aceite: `bun run lint`, `typecheck`, `test` e `build` verdes na raiz.

## Fora de escopo
- Prompts, builders de placeholder, cache da extração por hash, `ai_call` gravado, teto `MAX_AI_COST_CENTS_PER_ORDER` e orquestração (F1-06, F1-07).
- Ligar o adaptador ao `config.ts` do worker (F1-07 e F1-09 compõem; aqui o `aiEnvironmentSchema` já existe).
- Fallback de recusa do servidor (`fallbacks: "default"`, beta): ver Decisões.
- Preço de prompt acima de 100.000 tokens no Haiku 5.5 (0,50 / 2,50): o pipeline usa cerca de 10.000.
- Segundo provedor (Gemini, GPT): só se o custo medido na F1-10 passar da meta.
- `bun run test:pedagogy`: troca de modelo exige regressão, que só existe na F1-10 (known-issues).

## Plano
- **Arquivos.** Core: `interfaces/ai-provider.ts`, `config/schemas.ts`, `constants.ts` (`AI_IMAGE_MAX_SIDE_PX`, `AI_IMAGE_JPEG_QUALITY`), teste de contrato e de config. Integrations: `src/ai/output-schema.ts`, `src/ai/pricing.ts`, `src/ai/image.ts`, `src/ai/anthropic-provider.ts`, `src/fakes/fake-ai-provider.ts`; testes em `src/__tests__/ai/` (`contract.ts` com a suíte, `sse.ts` com o gerador de SSE para o `fetch` injetado, `anthropic-live.test.ts` só com chave). `package.json` ganha `@anthropic-ai/sdk`, `sharp`, `zod` e o script `test:ai-live`.
- **Por que `Result`.** O worker já trata falha de job como `Result` com `retryable` (`job-runner.ts`). Chamada que falha depois da resposta gastou tokens que precisam entrar no `ai_call`, e uma exceção perderia isso.
- **Imagem sintética.** Nos testes, gerada pelo sharp (nunca foto real).
- **Riscos.**
  - A API pode recusar alguma construção dos schemas reais (400 na compilação). O `test:ai-live` confere os sete.
  - O Haiku 5.5 conta cerca de 30% mais tokens que o Haiku 4.5 (tokenizador novo); o custo real sai do `usage`.

## Tasks
Verificação de toda task: `bun test` e `bunx tsc --noEmit` no pacote; no fim do milestone, `bunx biome check` e commit.

### M1 — Contrato no core
- [x] 1.1 `ai-provider.ts` com `Result`, `AiFailure`, códigos e `signal`; `aiEffortList`, `aiModelSettingSchema`, `aiEnvironmentSchema`; constantes de imagem; testes (RF-01)

### M2 — Peças do adaptador
- [x] 2.1 `output-schema.ts` com testes nos sete schemas (RF-02)
- [x] 2.2 `pricing.ts` com testes (RF-03)
- [x] 2.3 `image.ts` com testes (RF-04)

### M3 — Adaptador, fake e contrato
- [x] 3.1 `anthropic-provider.ts` com testes de `fetch` injetado e SSE (RF-05)
- [x] 3.2 `fake-ai-provider.ts` e suíte de contrato no fake (RF-06, RF-07)
- [x] 3.3 `anthropic-live.test.ts` e script `test:ai-live` (RF-07)

### M4 — Fechamento
- [x] 4.1 Exportações, ADR-0011, `data-model.md`, `CLAUDE.md`, roadmap (RF-08)
- [x] 4.2 `bun run lint`, `typecheck`, `test`, `build` na raiz
- [x] 4.3 `bun run test:pedagogy`: não existe até a F1-10 (known-issues)
- [ ] 4.4 Revisão neutra (`review.md`)

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-20 | Anthropic na F1, com Haiku 5.5 na extração e Sonnet 5.5 em plano, geração e revisão | decisão do humano (PRD 1.4 §12.1); Gemini ou GPT se o custo por kit passar da meta |
| 2026-10-20 | `costCents` em centavos de dólar | é a moeda da fatura e não depende de câmbio guardado; a comparação com o preço em reais (gate F1 → F2, meta da prévia) converte no relatório. A coluna `cost_cents` não muda de nome |
| 2026-10-20 | Conversão própria do JSON Schema em vez do `zodOutputFormat` do SDK | o helper do SDK 0.135 falha nos schemas do core (`allOf` de padrões sem `type`) e descarta `enum` e `const`, que a API aceita e que deixam a saída mais confiável |
| 2026-10-20 | Sem `fallbacks: "default"` (beta) para recusa | o fallback escolhe o modelo de reserva por categoria, e o custo de um modelo fora da tabela não pode ser gravado (invariante 3). Recusa vira `ai_refused`, e a F1-07 decide (conteúdo escolar torna a recusa improvável). Para o Sonnet 5.5 a API só aceita a forma `"default"` |
| 2026-10-20 | Esforço padrão `medium` na extração e `high` na geração (o padrão de cada modelo), configurável | a F1 prova qualidade primeiro; a F1-10 mede o custo e pode baixar o esforço |
| 2026-10-20 | Streaming em toda chamada | a geração pode passar de 30.000 tokens de saída com o raciocínio; o streaming evita o timeout HTTP |

## Status
M1 a M4 implementados. Revisão neutra REPROVADO nas rodadas 1 e 2; as correções da rodada 2 (embutir a definição em vez de `allOf` com `$ref`) não passaram por verifier, pelo teto de 2 rodadas: escalado ao humano. A confirmação definitiva de que a API aceita os sete schemas é o `test:ai-live`, que depende da chave. Pendências do humano: chaves no `.env` e no `.env.example` e rodar `test:ai-live`.
