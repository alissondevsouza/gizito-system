---
paths:
  - "apps/worker/src/pipeline/**"
  - "packages/integrations/src/ai/**"
  - "packages/core/src/pedagogy/**"
---

# Pipeline de IA e Pedagogia (PRD seção 7)

## Prompts
- Vivem em `apps/worker/src/pipeline/prompts/{stage}/v{N}.ts` (`extract`, `plan`, `generate`, `review`). Nunca editar uma versão publicada: criar `v{N+1}` e apontar a configuração. `generationVersion` = conjunto de versões usadas, gravado no kit e em `ai_call`.
- O prompt descreve formato de saída pelo schema do core (JSON), não por exemplo solto. Contagens, dificuldades e limites vêm das constantes do core, interpoladas, nunca digitadas.
- Conteúdo do usuário (fotos, observação, "outro") entra em bloco delimitado e marcado como **dado**, com instrução explícita de não seguir instruções contidas nele. Nunca concatenado ao system prompt.
- Nada de nomes de criança, escola ou telefone: se a extração detectar dado pessoal nas fotos, marcar em `sourceWarningList` e não propagar para a geração.

## Modelos
- Dois níveis: `AI_MODEL_EXTRACT` (barato, multimodal) e `AI_MODEL_GENERATE` (forte) para `plan`, `generate` e `review`. Troca de modelo é mudança de configuração com regressão obrigatória.
- Imagens reduzidas (lado maior ≈ 1600 px) antes da chamada; cache por `content_hash` da foto evita reextrair.
- Toda chamada passa por `AiProvider` e grava `ai_call` (modelo, versão do prompt, tokens, custo, duração, `outcomeCode`). Sem isso, o custo por pedido não fecha.
- Saída **sempre** validada por Zod antes de uso. Saída inválida = falha da etapa, nunca "parse tolerante".

## Regras pedagógicas que o código impõe (não o prompt)
- 2 exemplos resolvidos, 10 exercícios de fixação, 10 questões de simulado, 20 entradas no gabarito.
- Dificuldade: fixação 4/4/2 e simulado 3/4/3 (fácil/intermediária/desafiadora); dificuldade percebida desloca no máximo 1 questão por bloco.
- Cobertura: com 3 assuntos, ao menos 3 questões por assunto em cada bloco; com 2, ao menos 4.
- Simulado: assuntos misturados, numeração própria, sem dicas; em Matemática predominam problemas contextualizados; em Português, questões sobre 1–2 textos-base originais.
- Matemática: `expectedAnswer` estruturado e `computable`; recálculo com mathjs; alternativa correta igual ao valor; distratores distintos e sem equivalência (1/2 vs 0,5).
- Português: resposta interpretativa cita o trecho do texto-base.
- Bloqueadores (PRD 7.5) falham a etapa; avisos vão para `qualityCheckList`. Revisão por modelo é assistiva: marca inconsistência, não aprova.
- Uma regeneração automática; depois `failed` e tratamento operacional. Nunca entregar kit com bloqueador.

## Regressão pedagógica
- Qualquer mudança em prompt, modelo, taxonomia, validador ou schema do kit roda `bun run test:pedagogy` antes do handoff; o resumo do relatório vai no `review.md` da feature.
- Novo defeito encontrado em produção vira caso novo em `tests/pedagogy/cases/`.
