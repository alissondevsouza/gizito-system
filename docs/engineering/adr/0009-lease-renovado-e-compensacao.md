# ADR-0009: Lease curto renovado e compensação atômica do job esgotado

**Data:** 2026-10-19
**Status:** aceito (substitui a parte de lock do ADR-0008; o resto do ADR-0008 continua valendo)
**Decidido por:** Alisson

## Contexto

A revisão da F0 em 19/10/2026 (`specs/cross/revisao-f0/`) reproduziu no Postgres local três falhas do lock fixo de 15 min do ADR-0008:

- **Job em dobro:** quando o lock vence com o handler ainda rodando, `recoverExpiredJobs` devolve o job e outra vaga o roda de novo. A primeira execução termina `lease_lost`, mas os efeitos dela já aconteceram.
- **Vaga presa e recuperação lenta:** um handler travado ocupa a vaga para sempre. Worker morto ou deploy deixa o job ~16 min parado (15 de lock e 1 de manutenção) com o cliente olhando "gerando".
- **Pedido pago parado:** `order.generate` que esgota as 4 tentativas por falha transitória vira `failed` na tabela `job`, mas o pedido fica em `paid`/`processing` sem `kit_failed` e sem caminho de `reprocess`.

O `known-issues.md` já registrava as duas primeiras como dívida ("lock sem renovação" e "desligamento sem teto").

## Decisão

O lock passa a ser um **lease curto renovado**, com teto por execução, e o esgotamento ganha **compensação na mesma transação do `failed`**:

- **Lease:** o claim grava `lock_expire_datetime` com 2 min (`JOB_LOCK_TIMEOUT_SECONDS`). `workJob` renova a cada 30 s (`JOB_LEASE_RENEW_INTERVAL_SECONDS`) com `renewJobLease`, um `UPDATE` sobre o par `(job_id, attempt_count)` com `status = 'active'`. Renovação que não acha o lease aborta o handler (`lease_lost`).
- **Teto:** passados 15 min (`JOB_MAX_RUN_SECONDS`), a renovação para e o handler recebe o sinal abortado. Falha transitória vira `job_timeout`. Um handler que ignore o sinal perde o lease 2 min depois e o job é recuperado.
- **Sinal:** o handler recebe `{ signal }`. O desligamento do worker aborta o sinal. Falha transitória durante o desligamento devolve o job à fila com `releaseJob`, sem gastar tentativa; para não repetir o par `(job_id, attempt_count)` com um lease novo, a renovação para antes da liberação.
- **Precedência:** falha não retryable do handler vence desligamento e teto, porque o handler já tratou o pedido.
- **Código de erro:** um código que não passa em `outcomeCodeSchema` vira `invalid_error_code`, em vez de lançar e deixar o job `active`.
- **Esgotamento:** cada job pode declarar `onExhausted(tx, exhaustedJob)`. `workJob` o chama na mesma transação do `failed` definitivo de uma falha transitória. `recoverExpiredJobs` o chama ao falhar um job esgotado por lock vencido. Se o callback lança, nada é gravado e o job continua `active` até a próxima varredura. A varredura pula o job que falhou, segue com os outros e devolve `compensationFailureList` para log `error` (`job_compensation_failed`).
- **Recuperação:** a manutenção roda a cada 30 s. Worker morto volta à fila em até ~2,5 min.

A máquina de estados ganha `paid → failed` (`generation_failed`), decidido pelo humano em 19/10/2026, para o `onExhausted` de `order.generate` levar a `failed` um pedido que esgotou antes de começar a gerar.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Manter o lock de 15 min e só subir o valor | nenhuma mudança de código | job longo ainda roda em dobro; recuperação ainda mais lenta; vaga travada continua presa |
| Lease renovado sem teto | simples | handler travado renova para sempre e nunca é recuperado |
| Varredura periódica de pedidos parados em `paid`/`processing` para compensar | cobre qualquer causa | consulta por `payload->>'orderId'`, lógica de domínio duplicada fora do handler, janela entre o `failed` e a varredura |
| Job de compensação (`order.fail`) enfileirado no `failed` | durável | enum novo, mais um handler, mais uma volta pela fila só para aplicar uma transição |
| Relógio do Postgres (`now()`) no lease | uma referência de tempo para todas as réplicas | perde o relógio injetado que torna a fila testável; com renovação a cada 30 s, alguns segundos de diferença entre réplicas não mudam nada |

## Consequências

### Positivas
- Job longo não roda em dobro enquanto o worker está vivo; worker morto volta à fila em minutos.
- Handler travado é abortado no teto e o job segue para retentativa.
- Pedido pago nunca fica parado por esgotamento: a compensação commita junto com o `failed` ou não commita nada.
- Deploy durante a geração não gasta tentativa.

### Negativas
- Uma escrita a cada 30 s por job em curso; com `GENERATE_CONCURRENCY = 2` é desprezível.
- O pool do worker dobra (duas conexões por vaga: handler e renovação).
- Quando a compensação é refeita pela varredura, o callback recebe `lock_expired`, e não o código original da falha.

### Riscos
- Handler que segura uma transação aberta enquanto faz IO consome a conexão da renovação e o lease pode vencer; a regra continua sendo nunca fazer IO dentro de transação.
- Geração legítima acima de 15 min seria abortada; o teto é uma constante do core para ajustar quando a F1 medir.

## O que faria esta decisão mudar

- `order.generate` medido acima de 10 min na F1: subir `JOB_MAX_RUN_SECONDS` ou dividir o job em etapas.
- Necessidade de fluxos entre jobs, prioridade ou cron persistente: o gatilho do ADR-0008 para migrar ao pg-boss continua valendo.
