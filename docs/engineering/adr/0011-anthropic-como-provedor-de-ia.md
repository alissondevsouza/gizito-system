# ADR-0011: Anthropic como provedor de IA na F1, com adaptador por `Result`, saída estruturada e custo em centavos de dólar

**Data:** 2026-10-20
**Status:** aceito em 2026-10-20 (provedor e modelos decididos pelo humano; desenho do adaptador na F1-05)
**Decidido por:** Alisson

## Contexto

O PRD 1.3 §12.2 deixava o provedor de IA em aberto: dois níveis de modelo multimodal, escolha por benchmark, custo, estabilidade e política de dados. A F1-05 (`specs/integrations/adaptador-de-ia/`) precisa do `AiProvider` real para que a extração (F1-06), a geração (F1-07) e a regressão (F1-10) existam. Invariante 3: IA só no worker, prompt versionado, saída validada por Zod e tokens e custo gravados por chamada.

## Decisão

1. **Anthropic na F1:** Claude Haiku 5.5 na extração e Claude Sonnet 5.5 no plano, na geração e na revisão (PRD 1.4 §12.1). Os modelos e o esforço são configuração; Gemini ou GPT entram atrás da mesma interface se o custo por kit medido na F1-10 passar da meta.
2. **O `AiProvider` devolve `Result<AiResult, AiFailure>`.** A falha carrega um código estável, o `usage` quando houve resposta, o modelo e a duração. Só timeout, 429, indisponibilidade e cancelamento voltam à fila (`isRetryableAiFailureCode`); recusa, corte e saída inválida são falha da etapa.
3. **Saída estruturada com JSON Schema gerado do schema Zod da etapa,** por conversão própria. A conversão mantém `enum`, `const`, `anyOf` e `$ref`. O que a API não aplica (tamanhos, limites numéricos, padrões) vai para a `description`, e o Zod confere tudo depois.
4. **System em bloco com cache efêmero,** imagens reduzidas a 1.600 px em JPEG sem metadado e streaming em toda chamada.
5. **`costCents` em centavos de dólar,** a moeda da fatura, pela tabela de preço por modelo do adaptador. Modelo fora da tabela é erro na construção.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Gemini 2.5 Flash / Flash-Lite | geração de 4 a 5 vezes mais barata | acesso limitado a quem já usava os modelos 2.5; sucessores mais caros (o Flash-Lite atual passa da meta da prévia); escolha adiada pelo humano |
| Lançar exceção em vez de `Result` | interface mais curta | a F1-07 perde o `usage` das chamadas que falham depois da resposta, e o teto de custo do pedido sai errado |
| `zodOutputFormat` do SDK | sem código próprio | no SDK 0.135, falha nos schemas do core (`allOf` de padrões sem `type`) e descarta `enum` e `const` |
| `fallbacks: "default"` (beta) para recusa | menos falha por recusa | o modelo de reserva é escolhido pelo servidor, e o custo de um modelo fora da tabela não pode ser gravado |
| Custo em centavos de real | compara direto com o preço do kit | exige guardar o câmbio do dia em cada chamada; a fatura é em dólar |

## Consequências

### Positivas
- Cada chamada, com sucesso ou não, tem código, tokens e custo para o `ai_call`.
- A saída estruturada com `enum` e `const` reduz saída inválida; o Zod continua sendo a última palavra.
- O fake e o adaptador real passam na mesma suíte de contrato; o teste real (`test:ai-live`) também confere que a API aceita os sete schemas de saída do core.

### Negativas
- A tabela de preço do adaptador precisa ser atualizada quando a Anthropic mudar preço ou quando um modelo novo for configurado.
- Comparar com metas em reais (gate F1 → F2, custo por prévia) exige converter no relatório.

### Riscos
- Recusa do modelo vira falha da etapa sem reserva; com conteúdo escolar, o risco é baixo, e a F1-10 mede.
- Preço de prompt acima de 100.000 tokens no Haiku 5.5 é outro e não está na tabela; o pipeline usa cerca de 10.000.
- O timeout do SDK cobre só até os cabeçalhos da resposta; um stream que para depois do 200 só é cortado pelo `signal` do worker (teto de execução do job) e vira `ai_aborted`, não `ai_timeout`.
- Em stream interrompido, o `usage` vem do último retrato da mensagem: entrada e cache exatos, saída estimada pelo texto visível (limite inferior, porque o raciocínio oculto também é cobrado).
- O SDK ainda aplica `ANTHROPIC_CUSTOM_HEADERS` do ambiente, sem opção para desligar; as demais variáveis do SDK (URL, token, log, OpenTelemetry) são fixadas no construtor.

## O que faria esta decisão mudar

- Custo por kit medido na F1-10 acima de 10% do preço do kit, mesmo com esforço menor: testar Gemini ou GPT com um segundo adaptador.
- Regressão dos 40 casos com qualidade insuficiente no Sonnet 5.5: medir o Opus 5.5 (só configuração).
- SDK passar a manter `enum` e `const` e aceitar `allOf` de padrões: trocar a conversão própria pelo helper.
