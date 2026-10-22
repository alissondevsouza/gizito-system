# ADR-0013: conclusão do job na transação do handler (`completeWithin`)

**Data:** 2026-10-22
**Status:** aceito em 2026-10-22 (F2-02)
**Decidido por:** Alisson

## Contexto

O `order.analyze` é enfileirado com `enqueueSingletonJob`, com chave `orderId`. O POST e a troca de fotos (`PUT /orders/:token/photos`, F2-01) dependem disso para não criar uma segunda análise. A troca é recusada em `analyzing`. Ela é aceita em `draft` e em `preview_ready`, e enfileira a análise na mesma transação.

Até a F2-01, o `workJob` (ADR-0008, ADR-0009) concluía o job num comando próprio, depois que o handler voltava. Isso abria uma janela: o handler já tinha gravado `analysis_succeeded` ou `analysis_failed`, mas o job ainda estava `active`. Uma troca de fotos nessa janela tentava enfileirar a análise, encontrava o singleton ativo e não enfileirava nada. Depois o job era concluído, e o pedido ficava em `draft` com a análise limpa e nenhum job. Na tela, ele aparecia como "análise pendente" para sempre. A F2-01 deixou isso registrado para a F2-02 (Status de `specs/api/pedidos-e-upload/spec.md`).

## Decisão

- O `JobHandlerContext` ganha `completeWithin(tx)`. Ele conclui o job dentro da transação do handler, com a mesma condição de lease do `completeJob`, e devolve `false` se o lease não é mais daquela tentativa.
- Quando o handler devolve `Ok`, o `workJob` tenta concluir o job como antes. Se não conseguir e o handler tiver chamado `completeWithin`, relê o job por `(job_id, attempt_count)` com status `completed`. Assim, uma transação desfeita depois do `completeWithin` não vira `completed` por engano.
- O `order.analyze` chama `completeWithin` em todo fim que libera a troca de fotos:
  - na transação final (prévia pronta, falha da prévia ou `analysis_unavailable`), antes de `finishOrderAnalysis`;
  - na transação do início, quando a decisão é `skip`.

  Com `false`, o handler desfaz a transação e devolve falha `lease_lost`.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Reenfileirar na api quando o singleton estiver ativo | não mexe na fila | o unique parcial de `(name, singleton_key)` cobre `pending` e `active`, então não cabe um segundo job; distinguir job "antes de começar" de job "depois do fim" exigiria estado novo no pedido |
| Unique do singleton só para `pending` | a troca sempre enfileira | dois jobs do mesmo pedido em paralelo, e o `resume` em `analyzing` não saberia de quem é a análise; os periódicos agendados (`scheduled`) perderiam a proteção contra execução dupla |
| Aceitar a janela, que dura milissegundos com o worker vivo | nada a fazer | a revisão da F2-01 apontou a corrida, e o caso que trava o pedido não tem saída sem suporte |
| `completeWithin` no contexto do handler | fecha a janela, é opcional para os outros jobs e o caminho antigo continua igual | o handler passa a conhecer a conclusão do próprio job |

## Consequências

### Positivas
- Quem trava o pedido depois da transação final já vê o job `completed`, e a troca enfileira a análise nova.
- O `completeWithin` também faz de cerca: se o lease se perdeu, a transação do handler é desfeita e não grava sobre o trabalho de outra tentativa.
- Os outros handlers não mudam. Quem não chama `completeWithin` tem o mesmo comportamento de antes.

### Negativas
- Uma falha que não volta à fila no `order.analyze` (`ai_auth_failed`, `ai_request_invalid`, foto ausente) termina com o job `completed`, e não `failed`. O pedido volta a `draft` com `analysis_unavailable`. O código vai para o log `error` e para `ai_call.outcome_code`, e o alerta da F2-13 precisa olhar ali. Um `failWithin` resolveria, mas nenhum outro job precisa disso hoje.

### Riscos
- **Ordem das travas.** A compensação do esgotamento (`failJob` + `onExhausted`) trava o job e depois o pedido. A transação final do `order.analyze` segue a mesma ordem, porque chama `completeWithin` antes de `finishOrderAnalysis`. No `skip`, a ordem é a inversa (pedido e depois job), porque a decisão só sai depois de travar o pedido. Ali, um deadlock com a varredura só acontece com o lease vencido. O Postgres desfaz uma das duas transações, a que sobra decide, e o job desfeito segue o caminho de falha da fila.

## O que faria esta decisão mudar

- Outro job precisar concluir como `failed` dentro da própria transação: acrescentar `failWithin` com a mesma releitura.
- A fila sair do Postgres (ADR-0003), o que acaba com a transação compartilhada entre o job e o pedido.
