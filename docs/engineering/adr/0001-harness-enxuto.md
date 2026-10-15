# ADR-0001: Harness enxuto para modelos de fronteira

**Data:** 2026-10-14
**Status:** aceito
**Decidido por:** Alisson

## Contexto

O harness inicial do Gizito foi herdado do figofy-system: `CLAUDE.md` de 11 KB, quatro rules sempre carregadas (21 KB fixos por turno, também em cada subagente), 22 skills com descrições longas (8,3 KB por turno), e um fluxo `spec-driven` com sete artefatos por feature, loop de revisão de spec para todo tamanho, um subagente implementador por task, e loop de QA que spawnava um verifier novo a cada rodada, inclusive para alertas e sugestões.

Medido na única execução completa desse fluxo com modelos atuais (clientela-app, 2026-09-23, mesmo desenho): 28 subagentes para uma feature, cerca de 2,6 milhões de tokens de saída e 967 milhões de tokens lidos do cache; cada verifier releu o repositório inteiro (~70 M de tokens de cache por rodada); uma alteração de UI trivial no fim ainda disparou implementer, verifier, fixer e verifier. O humano interrompeu: "era uma alteração simples e olha todo tempo e gasto de tokens que já levou".

Ao mesmo tempo, as lições do figofy mostram que a revisão neutra adversarial pegou bugs que 75 a 532 testes verdes não pegaram (marca de idempotência antes da lógica, RLS mascarado por superuser, HMAC sobre query decodificada, wiring de boot sem teste). O valor está na independência do revisor, não no número de rodadas nem de artefatos.

Os guias de outubro de 2026 para modelos de fronteira (OpenAI, "Rethinking skills and prompts for GPT-6 Astra") convergem: descrições de skill curtas e estreitas, documento raiz como roteador, nada de "leia tudo antes de editar", remover mandatos de verificação que o modelo já cumpre, dar permissão explícita para fluxos seguros e definir conclusão de antemão em vez de paradas intermediárias.

## Decisão

1. `CLAUDE.md` com no máximo ~80 linhas: produto, tabela "assunto → seção do doc", stack, comandos, convenções, 11 invariantes e como trabalhar (autonomia explícita, roteamento, git). `AGENTS.md` é link simbólico para ele, para o Codex ler o mesmo arquivo.
2. Toda rule tem `paths`; nenhuma carrega sempre. O conteúdo de `spec-format.md` e `dev-flow-routing.md` foi absorvido pelo `CLAUDE.md` e pela skill.
3. Skills de stack têm `paths` e descrição de uma frase; skills redundantes foram removidas (`context7`, duplicado do servidor MCP; `tanstack`, sobreposto; `drizzle-orm`, sobreposto a `drizzle-postgres`; `better-auth`, ainda não adotado). `shadcn-ui` virou roteador de 1,4 KB com corpo em `references/`.
4. Fluxo `gizito-spec-driven`: o orquestrador implementa; o tamanho decide o caminho; dois artefatos (`spec.md`, `review.md`); revisão de spec só em size L; **uma** revisão neutra do diff por feature, com verifier que lê o diff e os comandos já rodados em vez do repositório; rerodada só para CRÍTICO e só sobre os pontos corrigidos; teto de 2 rodadas; o agente `gizito-fixer` deixa de existir (o orquestrador corrige). Memória gradua só quando há algo durável.
5. O que pode ser imposto por configuração sai das instruções: `git push`, `gh pr` e `git merge` estão em `permissions.deny`; Biome roda por hook em todo Write/Edit.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Manter o fluxo completo (7 artefatos, loops até 3 rodadas, fixer separado) | rastreabilidade máxima | custo e tempo medidos acima; artefatos que ninguém lê |
| Abolir a revisão neutra e confiar na auto-revisão do modelo | mais barato ainda | perde os bugs que só o revisor independente pegou no figofy |
| Implementer por task em paralelo (modelo mais barato) | paralelismo | cada spawn relê o codebase e as rules; perda de contexto entre tasks; só compensa em size L com milestones disjuntos |

## Consequências

### Positivas
- Contexto fixo por turno cai de ~7,3 k para ~2,3 k tokens, e isso se multiplica por cada subagente.
- Feature média passa de ~20 spawns para 1 a 3.
- Menos lugares repetindo a mesma regra; menos deriva entre eles.

### Negativas
- Menos registro automático de processo; o que importa precisa ser graduado conscientemente para `docs/`.
- Features P e M não passam por revisão de spec; o humano lê a spec no handoff.

### Riscos
- Verifier focado no diff pode deixar passar efeito colateral fora do diff. Mitigação: ele roda a suíte dos módulos tocados, e a suíte de integração usa Postgres real.

## O que faria esta decisão mudar

- Bug em produção que a revisão de spec teria pegado em feature M.
- Novo modelo que volte a precisar de itinerário detalhado.
- Mais de um desenvolvedor humano no repositório (rastreabilidade por artefato volta a valer).
