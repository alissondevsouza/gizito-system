# ADR-0010: Pipeline pedagógico com regras no core, fotos só na extração e regeneração por reparo

**Data:** 2026-10-19
**Status:** proposto (vira aceito com a aprovação da F1-02)
**Decidido por:** Alisson

## Contexto

A F1-02 (`specs/pedagogy/spec-pedagogica-executavel/`) transformou o PRD §7 no contrato que as features F1-03 a F1-10 implementam (`docs/pedagogy/spec-pedagogica.md`). O PRD exige 20 questões com distribuição fixa de assuntos e dificuldades, recálculo matemático, nenhum dado pessoal da foto no kit, extração barata antes do Pix e uma única regeneração automática (`jobs.md` §2). Deixar essas regras ao modelo gera falhas que custam a regeneração e terminam em `generation_failed` depois do Pix.

## Decisão

1. **O código decide as regras; o modelo escreve o conteúdo.** Assunto e dificuldade de cada questão, a ordem do simulado e os assuntos dos exemplos são calculados no core (`planKitSlots`). A severidade de cada problema, inclusive dos achados da revisão por modelo, é fixa por código no core.
2. **Fotos só na extração, uma chamada por foto.** `plan`, `generate` e `review` recebem ids da taxonomia, o perfil estruturado e os dados do pedido. Por foto, o cache por `content_hash` serve à troca de foto, e o core junta os resultados.
3. **Resposta dentro da questão.** O gabarito é derivado das questões (`listAnswerKey`); não há lista separada que possa divergir delas.
4. **Regeneração por reparo.** A única regeneração refaz o plano, o kit inteiro ou só os itens com bloqueador, conforme o código; uma nova chamada de revisão por saída inválida não gasta a regeneração; o "outro" inviável e os códigos de defesa falham sem regenerar.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Modelo planeja a distribuição | um passo a menos no core | erro de contagem gasta a regeneração; difícil de testar |
| Extração com todas as fotos numa chamada | uma chamada por prévia; contexto entre páginas | trocar uma foto paga a extração inteira de novo; índice de foto errado vira saída inválida |
| Fotos também na geração | kit mais parecido com a aula | risco de cópia (PRD §7.1.5) e de dado pessoal; custo maior com o modelo forte |
| Regeneração sempre do kit inteiro | simples | pode introduzir defeito novo em item que estava certo, sem segunda chance |

## Consequências

### Positivas
- Contagem, cobertura e dificuldade certas por construção, com teste de referência no core.
- Prévia mais barata na troca de foto; nenhum texto do material chega à geração.
- Regeneração mais barata e com menos risco de piorar o kit.

### Negativas
- O core ganha funções que não existiam (`planKitSlots`, `composeStudyKit`, `mergePhotoExtractionList`, `interpretReview`) e o worker, um modo de reparo com schema próprio.
- Assunto que só aparece combinando duas fotos pode passar despercebido pela extração por foto.

### Riscos
- A relevância dos assuntos vira a ordem da prévia, e o modelo não redistribui questões por relevância.
- A revisão por modelo vê o kit inteiro e pode ancorar no gabarito; mitigado com a folha de questões antes da folha de gabarito.

## O que faria esta decisão mudar

- A regressão da F1-10 mostrar extração por foto perdendo assuntos que a extração conjunta acharia.
- A taxa de regeneração por reparo ficar acima da regeneração completa nos 40 casos.
- O professor apontar que a distribuição fixa por ordem produz kits desequilibrados.
