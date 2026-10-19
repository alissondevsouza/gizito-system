---
paths:
  - "apps/worker/src/pipeline/**"
  - "packages/integrations/src/ai/**"
  - "packages/core/src/pedagogy/**"
---

# Pipeline de IA e Pedagogia (PRD seção 7)

Contratos, códigos de validação e texto dos prompts v1: `docs/pedagogy/spec-pedagogica.md` e `docs/pedagogy/prompts-v1.md`. Este arquivo resume; em conflito, vale a spec.

## Prompts
- Vivem em `apps/worker/src/pipeline/prompts/{stage}/v{N}.ts` (`extract`, `plan`, `generate`, `review`). Nunca editar uma versão publicada: criar `v{N+1}` e apontar a configuração. `generationVersion` = conjunto de versões usadas, gravado no kit e em `ai_call`.
- O prompt descreve formato de saída pelo schema do core (JSON), não por exemplo solto. Contagens, dificuldades e limites vêm das constantes do core, interpoladas, nunca digitadas.
- Conteúdo do usuário (fotos, observação, "outro", perfil vindo das fotos) entra em bloco delimitado e marcado como **dado**, com `<` e `>` removidos e instrução explícita de não seguir instruções contidas nele. Nunca concatenado ao system prompt.
- Fotos só vão à extração (uma chamada por foto); `plan`, `generate` e `review` recebem ids, perfil estruturado e dados do pedido, nunca foto nem texto do material.
- Nada de nomes de criança, escola ou telefone: se a extração detectar dado pessoal nas fotos, marcar `personal_data_visible` em `sourceWarningCodeList`, sem copiar o dado, e não propagar para a geração.

## Modelos
- Dois níveis: `AI_MODEL_EXTRACT` (barato, multimodal) e `AI_MODEL_GENERATE` (forte) para `plan`, `generate` e `review`. Troca de modelo é mudança de configuração com regressão obrigatória.
- Imagens reduzidas (lado maior ≈ 1600 px) antes da chamada; cache por `content_hash` da foto evita reextrair.
- Toda chamada passa por `AiProvider` e grava `ai_call` (modelo, versão do prompt, tokens, custo, duração, `outcomeCode`). Sem isso, o custo por pedido não fecha.
- Saída **sempre** validada por Zod antes de uso. Saída inválida = falha da etapa, nunca "parse tolerante".

## Regras pedagógicas que o código impõe (não o prompt)
- 2 exemplos resolvidos, 10 exercícios de fixação, 10 questões de simulado, 20 respostas no gabarito (a resposta vive dentro de cada questão; `listAnswerKey` monta o gabarito).
- Assunto e dificuldade de cada questão e a ordem do simulado são calculados no core (`planKitSlots`), nunca escolhidos pelo modelo.
- Dificuldade: fixação 4/4/2 e simulado 3/4/3 (fácil/intermediária/desafiadora); dificuldade percebida desloca no máximo 1 questão por bloco.
- Cobertura: com 3 assuntos, ao menos 3 questões por assunto em cada bloco; com 2, ao menos 4.
- Simulado: assuntos misturados, numeração própria, sem dicas; em Matemática predominam problemas contextualizados; em Português, questões sobre 1–2 textos-base originais.
- Matemática: `expectedAnswer` estruturado e `computable` com `calculationExpression`; recálculo com mathjs; alternativa com `value` estruturado igual ao `expectedAnswer` na correta; distratores distintos e sem equivalência (1/2 vs 0,5). Marcação matemática entre `\(` e `\)`; `$` é literal ("R$").
- Português: resposta interpretativa cita o trecho do texto-base.
- Bloqueadores (PRD 7.5) falham a etapa; avisos vão para `qualityCheckList`. A severidade de cada código é do core, não do modelo. Revisão por modelo é assistiva: marca inconsistência, não aprova.
- Uma regeneração automática, que refaz plano, kit ou só os itens marcados conforme o código (spec §10); depois `failed` e tratamento operacional. Nunca entregar kit com bloqueador.

## Regressão pedagógica
- Qualquer mudança em prompt, modelo, taxonomia, validador ou schema do kit roda `bun run test:pedagogy` antes do handoff; o resumo do relatório vai no `review.md` da feature.
- Novo defeito encontrado em produção vira caso novo em `tests/pedagogy/cases/`.
