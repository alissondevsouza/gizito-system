# PRD — Gizito | MVP v1.2

**Status:** especificação proposta para implementação  
**Data:** 14/10/2026 · revisão 1.2 em 14/10/2026 (ver seção 13)  
**Produto:** gerador de kits personalizados para preparação de provas escolares  
**Modelo de receita:** pagamento único por kit via Pix  
**Nome:** **Gizito**

## 1. Resumo executivo

O Gizito permite que um adulto responsável transforme **fotos da matéria escolar** em um **kit de revisão personalizado**, apropriado ao ano escolar informado. O comprador fotografa o conteúdo, confirma os assuntos reconhecidos, paga por Pix e recebe **dois PDFs gerados do mesmo conteúdo**: o **caderno de atividades** (revisão, exemplos resolvidos, exercícios de fixação e mini-simulado) e o **gabarito comentado**. A entrega chega por e-mail e, se o responsável quiser, também pelo WhatsApp.

**Promessa do MVP:** “Fotografe a matéria da próxima prova e receba um kit para revisar e praticar em casa.”

**Restrição central:** uma experiência simples, mobile-first e de compra avulsa; sem assinaturas, créditos, aplicativo nativo ou tutor conversacional. **O fluxo é 100% automático, do upload à entrega, sem revisão humana no caminho.** A qualidade depende de validações automáticas, homologação prévia e auditoria amostral posterior (seção 7.6).

## 2. Problema, público e hipóteses

**Problema:** pais e responsáveis frequentemente têm pouco tempo ou dificuldade para transformar o conteúdo específico da escola em explicações e exercícios adequados. Materiais genéricos nem sempre coincidem com o que será avaliado.

**Comprador principal:** adulto responsável pelo estudante. **Usuário final:** estudante acompanhado pelo responsável.

**Foco inicial:** **4º ao 7º ano** do Ensino Fundamental. Uma compra cobre **uma disciplina e até três assuntos relacionados** do material enviado. A faixa foi limitada a quatro anos para manter a homologação pedagógica (seção 7.6) e a taxonomia de assuntos (seção 7.7) tratáveis por uma única pessoa; 8º e 9º ano entram após validação (seção 11, Fase 4).

**Hipóteses a validar:** (H1) a personalização pelo caderno aumenta o valor percebido em relação a um kit genérico do mesmo assunto; (H2) responsáveis aceitam pagar **R$ 29,90** por um kit; (H3) há recompra em novas provas ou matérias; (H4) o custo de aquisição cabe na contribuição unitária. Preço de R$ 29,90 é **hipótese comercial de lançamento**, não preço validado.

**Como H1 será testável:** a extração captura não só os nomes dos assuntos, mas o **perfil do material** (terminologia, notação, tipos de exercício e nível observados no caderno), e a geração usa esse perfil. Sem isso, o kit seria igual ao que sairia digitando “frações, 5º ano”, e H1 não poderia ser distinguida de H2.

## 3. Objetivos e métricas

### Objetivos do MVP
1. Entregar um kit pedagogicamente útil a partir de fotos legíveis, com mínimo atrito.
2. Confirmar que existem compradores dispostos a pagar por um kit avulso.
3. Garantir processamento idempotente do Pix, geração recuperável e suporte a falhas.
4. Medir qualidade do conteúdo, custo por prévia e por kit, conversão em cada etapa do funil e recompra.

### Indicadores de acompanhamento
| Indicador | Definição | Meta inicial de operação/piloto |
|---|---|---|
| Landing → início do upload | Sessões que enviam ao menos 1 foto / sessões na landing | Medir |
| Upload → prévia válida | Prévias com assuntos confirmáveis / uploads concluídos | Medir; principal vazamento esperado (foto ruim) |
| Prévia válida → e-mail informado | Pedidos com e-mail e aceite / prévias válidas | Medir |
| Conversão prévia → Pix pago | Compras pagas / prévias válidas | Medir, sem estabelecer meta fictícia antes do piloto |
| Custo por prévia | IA de extração + armazenamento, incluindo prévias que não convertem | Monitorar; custo-alvo definido na Fase 1 |
| Custo variável por kit | IA (extração, geração, revisão, regeneração) + gateway + arquivos | Monitorar por pedido; referência orçamentária, não SLA |
| Sucesso de geração | Kits entregues sem intervenção / compras pagas | ≥ 95% no piloto, com recuperação de falhas |
| Tempo de geração | Da confirmação do Pix aos dois PDFs prontos | Alvo: 95% em até 5 min, sujeito a medição (20 questões + revisão + 2 renders) |
| Erro pedagógico grave | Resposta/gabarito incorreto ou conteúdo fora do nível | Zero nos casos auditados antes do lançamento; bloquear casos identificados em produção |
| Recompra 30/60 dias | Compradores com 2ª compra / compradores elegíveis | Medir após implantação |
| Reembolso/suporte | Pedidos reembolsados ou que exigem atendimento | Monitorar por motivo |

## 4. Escopo do MVP

### Incluído (P0)
- Landing page com explicação, **kit de amostra completo para download** (um de Matemática e um de Língua Portuguesa, gerados pelo próprio pipeline) e preço transparente.
- Uso no celular; fluxo sem cadastro prévio obrigatório.
- Upload de **1 a 5 fotos** de material do usuário e formulário curto.
- Extração dos assuntos e do perfil do material por IA multimodal **antes de cobrar**; confirmação/correção pelo responsável.
- Prévia gratuita apenas com assuntos detectados, perfil do material e composição do kit (não gera o PDF).
- Cobrança Pix avulsa; confirmação no backend via webhook e consulta do gateway.
- Geração assíncrona de **dois PDFs** (atividades e gabarito) e página de acompanhamento do status.
- Envio de link privado por e-mail e possibilidade de baixar novamente por 12 meses.
- Botão **“Receber no WhatsApp”** nas páginas de processamento e entrega: opt-in iniciado pelo responsável, que recebe o link e os dois PDFs pelo WhatsApp (seção 9.2). O e-mail continua obrigatório como identificador e fallback.
- Painel administrativo mínimo: localizar pedido, visualizar status, ver o `study_kit.json`, reprocessar falha, republicar PDF corrigido sem nova cobrança, encaminhar reembolso e consultar logs sem expor dados desnecessários.
- Política de privacidade, termos de compra (incluindo direito de arrependimento para produto digital), canal de suporte e mecanismo para exclusão de dados conforme obrigações aplicáveis.

### Fora do MVP (P1/P2)
- Correção automática das respostas preenchidas, pontuação online e progresso por aluno.
- Tutor em chat, áudio, videoaulas, gamificação e aplicativo nativo.
- Assinaturas, carteira de créditos, cupons complexos, afiliados ou planos familiares.
- Mais de duas disciplinas; **8º e 9º ano**, Ensino Médio e preparação para Enem/vestibulares.
- Upload de PDF, vídeos ou gravações de áudio; integração com escolas.
- Recomendação personalizada baseada em histórico acadêmico ou armazenamento de perfil da criança.
- Conversa com o Gizito pelo WhatsApp: o canal só entrega avisos e arquivos; não responde perguntas.

## 5. Jornada e regras de funcionamento

| Etapa | Ação do usuário | Resposta do sistema | Critério de aceite |
|---|---|---|---|
| 1. Entrada | Abre landing page | Explica resultado, oferece kit de amostra e mostra preço | CTA evidente no mobile; sem promessas de nota garantida |
| 2. Dados | Seleciona ano, disciplina e envia fotos | Cria pedido `rascunho`; valida formato/tamanho, remove metadados de localização, reduz resolução, gera miniaturas | Não prossegue com arquivos inválidos |
| 3. Identificação | Aguarda leitura inicial | Pedido em `analisando`; mostra 1–3 assuntos da taxonomia, o perfil do material e sinaliza trechos ilegíveis | Sem checkout se material insuficiente (volta a `rascunho` com avisos) |
| 4. Confirmação | Corrige/seleciona assuntos, preenche opcionais e informa e-mail | Mostra escopo exato do kit e preço | Ano, disciplina e assuntos confirmados; aceite explícito |
| 5. Pagamento | Paga **R$ 29,90** por Pix | Cria cobrança com expiração; exibe QR/Copia e Cola | Não usa estado do navegador como prova de pagamento |
| 6. Geração | Pode acompanhar, fechar a página ou tocar em “Receber no WhatsApp” | Confirma Pix e enfileira geração **na mesma transação**; atualiza status; vincula o WhatsApp se o responsável iniciar a conversa | Repetição de webhook não gera kits duplicados; vínculo de WhatsApp só por mensagem iniciada pelo responsável |
| 7. Entrega | Abre o link privado (e-mail ou WhatsApp) e baixa os PDFs | Exibe status `pronto` e disponibiliza atividades e gabarito; envia e-mail e, se vinculado, mensagem e arquivos no WhatsApp | Download autorizado, acessível no celular |
| 8. Pós-venda | Reporta problema, se houver | Abre ticket; suporte pode corrigir, reprocessar, republicar ou reembolsar | Nenhum pagamento deve ficar sem solução operacional |

**Estados do pedido:** `rascunho` → `analisando` → `previa_pronta` → `aguardando_pagamento` → `pago` → `processando` → `pronto` ou `falhou` → eventual `reembolsado`.

- `analisando` que falha (fotos insuficientes) retorna a `rascunho` com avisos por foto.
- `aguardando_pagamento` tem o sub-estado `cobranca_expirada`; “Gerar novo Pix” cria nova cobrança no mesmo pedido.
- A transição `aguardando_pagamento → pago` só ocorre por confirmação server-side do gateway (webhook verificado ou consulta ativa).
- O mapeamento estado → rota está no guia de design, seção 6.8.

**Identificação do pedido:** o id público é um token aleatório longo, não sequencial; conhecer o token dá acesso somente ao status e às ações daquele pedido. O navegador pode guardar os ids dos pedidos recentes como conveniência (nunca como prova de pagamento). Além do token, cada pedido tem um **código curto** (por exemplo `GZ-7K3M9Q`, seis caracteres sem ambiguidade), exibido na página do pedido e no e-mail e usado apenas para o vínculo com o WhatsApp.

**Exceções obrigatórias:**
- Foto ruim: solicitar nova foto **antes do Pix**; não inventar texto ausente.
- Mais de 3 assuntos: solicitar seleção dos assuntos a cobrir neste kit.
- Pagamento expirado: oferecer nova cobrança sem duplicar pedido pago.
- Pix recebido e webhook atrasado: conciliação por consulta segura ao provedor.
- Falha de geração: uma tentativa automática de reprocessamento; depois atendimento/reembolso conforme política.
- E-mail incorreto: permitir correção verificada pelo suporte ou recuperação segura.
- Arquivo final indisponível: não marcar como `pronto`; reprocessar ou tratar falha.
- WhatsApp desconectado ou número banido: desligar o canal por feature flag, seguir por e-mail e avisar na página; nenhum pedido depende do WhatsApp para ser entregue.

## 6. Entradas, validação e saídas

### Entradas obrigatórias
| Campo | Tipo | Regra |
|---|---|---|
| Ano escolar | Enum | 4º, 5º, 6º ou 7º ano |
| Disciplina | Enum | Matemática ou Língua Portuguesa |
| Fotos | Arquivos | 1–5 imagens; JPG/PNG; HEIC se conversão implementada e testada (ver nota abaixo); até 8 MB cada antes de compressão |
| Assuntos | Seleção/edição | 1–3 assuntos da taxonomia após pré-análise, com opção “outro” em texto livre; confirmação explícita |
| E-mail de entrega | Texto | Formato válido; exibido de forma destacada para conferência antes do Pix; sem exigir conta ou nome do aluno |
| Aceite | Checkbox | Termos, privacidade, confirmação de envio autorizado de material para estudo pessoal; nunca pré-marcado |

**Nota sobre HEIC:** o Safari do iOS converte HEIC para JPEG no input de arquivo na maioria dos cenários. Testar em aparelho real antes de implementar conversão no servidor.

### Entradas opcionais
Mantidas conforme necessidade de melhor experiência e qualidade do material. Ficam em uma área secundária da tela de confirmação, nunca bloqueiam o fluxo e são tratadas como **texto não confiável** (mesma regra das fotos).
- Observação curta do responsável (até 300 caracteres), por exemplo: “mais dificuldade com frações”.
- Dificuldade percebida: básica, intermediária ou não sei. **Não altera a expectativa curricular do ano**; ajusta apenas a proporção de questões fáceis dentro dos limites da seção 7.2.
- Telefone de WhatsApp: **não é digitado**. É capturado quando o responsável inicia a conversa pelo botão “Receber no WhatsApp” (seção 9.2), guardado com a data do consentimento e removido a pedido ou junto com a retenção do pedido.

### Tratamento de imagens
- Exibir miniaturas e permitir excluir/refazer antes do envio.
- Remover EXIF, limitar resolução para processamento e armazenar em local privado.
- Enviar à IA somente imagens necessárias ao processamento e evitar logs com imagens/texto integral.
- Conteúdo de foto é **dado não confiável**, não instrução para alterar prompt, preço, regras ou comportamento do sistema.
- Rejeitar arquivos sem matéria escolar suficiente; exibir texto amigável solicitando correção.
- Alertar o responsável para cobrir nomes completos, nomes de escola, telefones e outros dados pessoais antes de fotografar.

### Economia da prévia gratuita (sem perder poder de convencimento)
A extração roda antes do pagamento, em todo visitante, e por isso é o principal custo não recuperável.
- Reduzir as imagens no cliente e no servidor (lado maior ≈ 1600 px, JPEG com qualidade ≈ 80) antes de enviar à IA.
- Usar o modelo multimodal de **menor custo** na extração; o modelo forte fica para geração e revisão.
- Cache por hash da imagem normalizada: reenviar a mesma foto não paga nova extração.
- Rate limit por IP e identificador de dispositivo (por exemplo, 5 prévias/hora e 15/dia); desafio leve apenas ao exceder.
- Custo-alvo por prévia definido na Fase 1 e acompanhado no painel.
- **Qualidade:** a prévia precisa convencer. Mostrar assuntos com nome claro, o perfil do material entendido (sem inventar trechos), a composição exata do kit, o preço e o link para o kit de amostra.

### Saída comercial (um kit por compra, em dois arquivos)
**Dois PDFs A4, legíveis no celular e prontos para impressão, gerados do mesmo `study_kit.json`:**

**`kit-atividades.pdf`** (preferencialmente 8–14 páginas)
1. Capa resumida: ano, disciplina, assuntos e data de geração, sem identificar criança.
2. **Revisão objetiva:** explicação dos conceitos-chave com linguagem compatível com o ano.
3. **Dois exemplos resolvidos e comentados**, quando fizer sentido para o assunto.
4. **Dez exercícios de fixação** (variedade de dificuldade e formato), com espaço para resposta.
5. **Mini-simulado de dez questões**, no formato de prova (seção 7.2), sem respostas.
6. Aviso: material complementar, gerado com assistência de IA; revisar erros reportados e consultar material/professor quando houver dúvida.

**`kit-gabarito.pdf`** (preferencialmente 3–6 páginas)
1. Capa curta com os mesmos identificadores.
2. **Gabarito comentado das 20 questões**, com justificativa compreensível e, em Matemática, as etapas essenciais.

**Não incluído:** nota oficial, certificado, correção pelo professor, garantia de desempenho, reprodução extensa da apostila original.

### Saídas técnicas
- `study_kit.json`: representação estruturada e validada para renderização (uso interno).
- `kit-atividades.pdf` e `kit-gabarito.pdf`: artefatos comprados.
- Registro de assuntos (ids da taxonomia), perfil do material, modelo/versão dos prompts, métricas de tokens/custo, validações e status (sem logar o texto pessoal da criança por padrão).
- E-mail contendo URL privada da página do pedido, não anexo obrigatório.

## 7. Especificação pedagógica (critério central de qualidade)

### 7.1 Princípios
1. **Aderência ao material recebido:** trabalhar somente os assuntos confirmados; não criar afirmações sobre páginas ilegíveis ou desconhecidas.
2. **Adequação ao ano:** vocabulário, dificuldade, extensão de enunciado, operações matemáticas e pré-requisitos compatíveis com 4º–7º ano. Referenciar a BNCC por meio da taxonomia (seção 7.7); não prometer certificação BNCC automática.
3. **Aprendizagem antes de memorização:** explicar o raciocínio; misturar compreensão, aplicação e pequenos problemas contextualizados.
4. **Autonomia:** conteúdo inteligível para estudo acompanhado pelos responsáveis, sem exigir conhecimento especializado.
5. **Originalidade e respeito a direitos autorais:** não transcrever integralmente apostilas ou exercícios enviados; produzir explicações e questões originais a partir dos tópicos, salvo pequenos trechos essenciais e permitidos.
6. **Personalização real:** usar o perfil do material (terminologia, notação, formatos de exercício e nível observados) para que o kit “pareça com a aula”, sem copiar o material.

### 7.2 Estrutura e distribuição
- Até **3 assuntos** por kit; distribuir questões proporcionalmente à relevância, garantindo em **cada bloco** ao menos 3 questões por assunto quando houver 3 assuntos e ao menos 4 quando houver 2.
- **20 questões ao todo:** 10 de fixação + 10 de mini-simulado.
- **Dificuldade relativa ao ano:**
  - Fixação (10): 4 fáceis, 4 intermediárias, 2 desafiadoras.
  - Simulado (10): 3 fáceis, 4 intermediárias, 3 desafiadoras.
  - Sem extrapolar currículo ou pré-requisitos não fornecidos. A dificuldade percebida informada pelo responsável pode deslocar até 1 questão de cada bloco entre “fácil” e “intermediária”.
- **Mini-simulado com cara de prova:** mistura os assuntos confirmados em ordem não agrupada, numeração própria, sem dicas ou referências à revisão, cabeçalho de prova (nome, data, tempo sugerido) e espaço de resposta padronizado. Em Matemática, predominam problemas contextualizados; em Língua Portuguesa, questões sobre um ou dois textos-base curtos e originais.
- **Tipos:** combinar múltipla escolha com quatro opções e resposta curta/aberta, conforme adequação ao assunto; nenhuma questão deve depender de figura ausente.
- **Distratores:** respostas incorretas plausíveis, distintas e sem ambiguidade; uma única correta em múltipla escolha.
- **Gabarito:** 100% das 20 questões com resposta e justificativa. Em questões abertas, registrar resposta esperada e alternativas aceitáveis quando cabível.
- **Dois exemplos guiados:** apresentar passos e explicações; em Língua Portuguesa, usar exemplos textuais de autoria própria quando apropriado.

### 7.3 Regras por disciplina
**Matemática**
- Toda questão sai com `expected_answer` **estruturado** (`number`, `fraction`, `expression`, `set` ou `text`, com unidade e tolerância quando aplicável), `solution_steps[]` e a marcação `computable`.
- Para questões `computable`, o worker **recalcula a resposta com mathjs** a partir dos dados do enunciado; divergência bloqueia a publicação.
- Em múltipla escolha, a alternativa correta deve ser igual ao `expected_answer`; distratores devem ser distintos entre si e da correta, sem equivalências escondidas (por exemplo, 1/2 e 0,5).
- Frações no gabarito na forma simplificada, aceitando equivalentes.
- Em enunciados, fornecer todos os dados necessários; não exigir interpretação de desenho indisponível.
- Mostrar etapas essenciais da solução no gabarito, inclusive unidade de medida e simplificação quando relevante.
- Não introduzir conceitos além do ano escolar para resolver problemas.

**Língua Portuguesa**
- Priorizar compreensão leitora e aplicações de gramática contextualizadas; evitar somente decoreba de definições.
- Textos-base curtos e originais, com extensão adequada ao ano; garantir que respostas interpretativas tenham suporte textual (o gabarito cita o trecho que sustenta a resposta).
- Em questões interpretativas abertas, admitir justificativas equivalentes quando tecnicamente defensáveis.
- Evitar julgamentos normativos simplistas sobre variedades linguísticas; diferenciar contexto formal/informal quando pertinente.

### 7.4 Pipeline pedagógico obrigatório
1. **Extrair:** o modelo multimodal lê as fotos e devolve `topic_candidates[]` mapeados para a taxonomia (id, confiança, evidência curta), `material_profile` (terminologia, notação, tipos de exercício observados, nível aparente, presença de figuras), legibilidade por foto e `source_warnings[]`. Sem transcrição integral do material.
2. **Confirmar:** responsável aprova ano, disciplina e 1–3 assuntos (chips da taxonomia ou “outro” em texto livre) e, opcionalmente, observação e dificuldade percebida. A geração não prossegue sem confirmação.
3. **Planejar:** produzir objetivos de aprendizagem, mapa assunto→questões (10 + 10), distribuição de dificuldade, pré-requisitos e diretrizes de estilo derivadas do `material_profile`.
4. **Gerar:** retornar JSON estruturado com resumo, 2 exemplos, 20 questões, alternativas (quando houver), `expected_answer` e explicação.
5. **Validar automaticamente:** schema; contagens (2 exemplos, 10 + 10, 20 respostas); cobertura mínima por assunto e por bloco; duplicatas óbvias; referências quebradas; gabarito/alternativas; **recálculo determinístico em Matemática**; linguagem imprópria; dados pessoais; ausência de dados.
6. **Revisar com modelo (segunda verificação):** confrontar respostas e explicações com questões e assuntos; marcar inconsistências.
7. **Publicar:** renderizar os dois PDFs, conferir contagem de páginas e presença de todas as questões; marcar `pronto` somente com os dois arquivos no storage. Se qualquer validação crítica falhar, tentar regenerar **uma vez**; persistindo falha, não entregar material defeituoso e acionar tratamento operacional.

### 7.5 Bloqueadores automáticos de publicação (P0)
- Questão sem resposta, gabarito incompatível com a própria questão ou alternativas duplicadas.
- Operação matemática comprovadamente incorreta ou `expected_answer` divergente do recálculo.
- Questão que depende de informação externa/foto não fornecida.
- Conteúdo totalmente fora do assunto confirmado ou linguagem claramente fora do ano.
- Orientação imprópria ou exposição de dados pessoais capturados da imagem.
- Falha de renderização que esconda questão, equação, resposta ou páginas essenciais, em qualquer um dos dois PDFs.

**Regra de segurança de qualidade:** validação por LLM é assistiva e **não prova correção**. Casos ambíguos ou incorrigíveis devem falhar de forma segura, com nova geração ou suporte/reembolso.

### 7.6 Homologação pedagógica e garantia contínua (sem revisão humana no fluxo)
- Montar **mínimo de 40 casos de teste**: 4 anos × 2 disciplinas × pelo menos 5 materiais/assuntos por combinação.
- Incluir fotos ruins, textos manuscritos, frações, enunciados ambíguos e situações com dados pessoais.
- Revisão por pelo menos um professor com experiência no segmento, em amostra representativa.
- **Critério de lançamento:** nenhum erro crítico (gabarito incorreto, enunciado impossível ou matéria errada) na amostra auditada; todos os defeitos críticos encontrados devem ser corrigidos e os casos adicionados aos testes de regressão. Isso não equivale a garantia de erro zero em produção.
- **Regressão obrigatória:** os 40 casos rodam a cada mudança de prompt, modelo, taxonomia ou validador; nenhuma mudança vai a produção com regressão em bloqueador crítico.
- **Auditoria amostral pós-entrega:** semanalmente, uma amostra dos kits entregues é lida por humano; defeitos viram novos casos de regressão e, se graves, republicação do PDF corrigido sem nova cobrança.
- Em produção: botão “Reportar erro”, trilha de investigação e possibilidade de republicar o PDF corrigido sem nova cobrança.

### 7.7 Taxonomia de assuntos
- Lista canônica por **ano × disciplina** (4º–7º × Matemática/Língua Portuguesa), versionada em `packages/core`, com: id estável, nome exibível, descrição curta, habilidades da BNCC relacionadas, pré-requisitos e validações aplicáveis (por exemplo, assuntos de frações acionam checagem de equivalência).
- Primeira versão com cerca de 15–30 assuntos por combinação, derivada da BNCC e de livros didáticos comuns, revisada pelo professor da homologação.
- A extração mapeia o material para a taxonomia. “Outro” em texto livre é permitido, mas kits com assunto fora da taxonomia recebem validação extra e entram em métricas separadas.
- Métricas, custos e biblioteca de testes indexados por id de assunto.

## 8. Requisitos não funcionais

- **Mobile-first:** fluxo utilizável em tela de 360 px; botões e envio de câmera facilmente acessíveis; PDFs com boa legibilidade.
- **Performance:** páginas estáticas rápidas; upload progressivo; estado visível durante análise e geração; se exceder o alvo, avisar por e-mail, não manter usuário bloqueado.
- **Segurança:** HTTPS; id de pedido como token aleatório longo; **link do pedido (e-mail) de vida longa e somente leitura** separado do **link de download**, que é uma URL assinada do storage com validade de minutos, gerada a cada clique; rate limiting; limite de custo por pedido; segredos fora do repositório; backups testados.
- **Privacidade:** comprador adulto; não solicitar nome da criança ou escola; orientação para ocultar dados pessoais; política de retenção; contratos/termos com fornecedores de processamento de dados; o número de WhatsApp é dado pessoal do responsável, coletado só por opt-in, usado só para avisos do pedido e citado na política de privacidade.
- **Retenção proposta:** fotos originais apagadas após até 30 dias; PDFs disponíveis por 12 meses, salvo solicitação legítima de exclusão e obrigações legais aplicáveis. Revisar com a política de privacidade efetiva.
- **Observabilidade:** ID de pedido em cada log; taxa de erros por fase; gasto de IA por prévia e por pedido; fila e latência; alertas de falha de pagamento e geração.
- **Acessibilidade:** navegação por teclado, contraste, mensagens de erro claras e descrições textuais das etapas.
- **Resiliência:** jobs persistidos no banco, retries controlados, confirmação de Pix idempotente e reconciliação periódica com o gateway.

## 9. Arquitetura (decidida)

**Monorepo com três aplicações e um pacote compartilhado:**
- `apps/web`: **TanStack Start** + TypeScript. Landing, fluxo de compra e páginas do pedido. Conversa apenas com `apps/api`.
- `apps/api`: **Bun + Elysia** + TypeScript. Upload, pedidos, prévia, cobrança Pix, webhook do gateway, páginas de status, admin.
- `apps/worker`: **Bun** + TypeScript. Consome a fila: extração, planejamento, geração, validação, revisão, render dos PDFs, e-mail.
- `packages/core`: schemas Zod (`study_kit`, taxonomia, eventos, payloads da API), tipos de domínio, máquina de estados do pedido e regras de validação. Compartilhado por `api` e `worker`; nenhuma regra de negócio vive só em uma app.
- **PostgreSQL + Drizzle.** A **fila de jobs vive no próprio Postgres** (pg-boss, verificando compatibilidade com Bun na Fase 1, ou fila própria com `FOR UPDATE SKIP LOCKED`), de forma que “marcar pedido como pago” e “enfileirar geração” aconteçam na **mesma transação**; a idempotência do webhook decorre disso.
- **IA multimodal por um único provedor inicial**, atrás de uma interface interna (`extractTopics`, `generateKit`, `reviewKit`) com retorno em JSON validado por Zod e prompts versionados. Dois níveis de modelo: o de menor custo na extração, o forte na geração e revisão.
- **Render:** HTML/CSS + **KaTeX renderizado no servidor** + Playwright → dois PDFs. **mathjs** para o recálculo das questões de Matemática.
- **Storage:** R2 para originais e PDFs privados, com URLs assinadas de curta duração.
- **Pagamento:** **Mercado Pago** (seção 9.1). **E-mail:** Resend ou similar. **WhatsApp:** **Evolution API** (seção 9.2). Os três ficam atrás de interfaces em `packages/core` (`PaymentGateway`, `NotificationChannel`) para troca sem reescrever o domínio.
- **Operação:** Docker Compose em um VPS (web, api, worker, Postgres, Redis, Evolution API); backups externos; monitoramento básico.

**Campos essenciais do kit gerado (schema conceitual):** `grade`, `subject`, `topic_ids[]`, `material_profile`, `learning_objectives[]`, `summary_sections[]`, `worked_examples[2]`, `practice_questions[10]`, `mock_questions[10]`, `answer_key[20]`, `source_warnings[]`, `quality_checks`, `generation_version`.

### 9.1 Gateway Pix: Mercado Pago (decidido)

**Por que:** aceita conta de pessoa física com CPF; menor taxa efetiva entre os candidatos para um ticket de R$ 29,90 (0,99% por Pix, com o valor disponível na hora, segundo tabelas de terceiros de setembro de 2026; **confirmar na página de taxas da própria conta ao criar a aplicação**); documentação em português, SDK Node, ambiente de testes com usuários de teste, webhooks assinados e reembolso por API.

**Candidatos avaliados (valores de terceiros, sujeitos a confirmação):**

| Gateway | Pessoa física | Pix por cobrança | Custo em R$ 29,90 | Integração | Observação |
|---|---|---|---|---|---|
| **Mercado Pago** | Sim | 0,99% | ≈ R$ 0,30 | Orders API, SDK Node, sandbox, webhooks assinados | **Escolhido.** Contas novas podem passar por análise de risco |
| Efí | A confirmar | 1,19% | ≈ R$ 0,36 | API Pix padrão BCB com certificado mTLS | Setup mais complexo |
| AbacatePay | A confirmar | R$ 0,80 fixo | R$ 0,80 | REST simples, webhooks | Empresa nova; aceitação de CPF não confirmada |
| Asaas | Sim | R$ 1,99 fixo (R$ 0,99 nos 3 primeiros meses) | R$ 1,99 | REST simples, sandbox, webhooks | **Plano B**, atrás da mesma interface |
| PagBank | Sim | Fontes divergem (grátis a 1,89% + R$ 0,40) | Indefinido | Orders API | Taxa precisa de confirmação |
| InfinitePay | A confirmar | R$ 0 | R$ 0 | API de links/webhooks menos madura | Verificar CPF e API antes de considerar |
| Woovi/OpenPix, Stripe, Pagar.me | Tendem a exigir CNPJ | — | — | — | Descartados nesta versão |

**Integração (Orders API):**
1. Conta Mercado Pago pessoa física com **chave Pix cadastrada**; aplicação criada em “Suas integrações” com credenciais de produção e de teste; usuários de teste para o sandbox.
2. Criar cobrança: `POST https://api.mercadopago.com/v1/orders` com header `X-Idempotency-Key` (id interno da cobrança), `type: "online"`, `total_amount: "29.90"`, `external_reference: <id do pedido>`, `processing_mode: "automatic"`, `transactions.payments[0]` com `amount`, `payment_method: {id: "pix", type: "bank_transfer"}` e `expiration_time: "PT30M"` (o mínimo do gateway é 30 minutos), e `payer.email`. A resposta traz `qr_code` (copia e cola), `qr_code_base64` (imagem) e `ticket_url`. Só o e-mail do pagador é exigido; **não pedir CPF do comprador**.
3. Webhook: URL configurada em “Webhooks > Configurar notificação”; validar o header `x-signature` (HMAC com a assinatura secreta, campos `ts` e `v1`, conforme a doc oficial); responder 200 em menos de 22 segundos e processar de forma assíncrona (o gateway reenvia a cada 15 minutos sem confirmação).
4. Após o webhook, **consultar o recurso** (`GET /v1/orders/{id}` ou `GET /v1/payments/{id}`) e só então aplicar a transição `aguardando_pagamento → pago` e enfileirar a geração, na mesma transação, com idempotência pelo id do pagamento. Nunca confiar no corpo do webhook.
5. Reconciliação: job a cada 2 minutos consulta cobranças `aguardando_pagamento` com mais de 1 minuto; cobrança vencida marca `cobranca_expirada`.
6. Reembolso: via API de reembolso, acionado pelo painel admin; registrar o id do reembolso no pedido.
7. Interface em `packages/core`: `PaymentGateway` com `createCharge`, `getChargeStatus`, `refund` e `parseWebhook`. Plano B (Asaas) implementa a mesma interface.

**Riscos aceitos:** contas novas podem passar por análise de risco e retenção temporária; suporte lento; limites de recebimento para pessoa física podem exigir verificação de identidade. Manter o plano B pronto.

### 9.2 WhatsApp: Evolution API (decidido para o piloto)

**Decisão:** usar **Evolution API** autohospedada, com a integração **Baileys** (protocolo do WhatsApp Web, não oficial), em **modo somente resposta**: o Gizito nunca inicia conversa; só responde a quem enviou o código do pedido. A mesma Evolution API suporta a integração `WHATSAPP-BUSINESS` (API oficial da Meta), que é o caminho de migração.

**Por que, e a que custo:** zero custo por mensagem, instalação em minutos (um container e a leitura de um QR), sem templates nem verificação de negócio, e envio dos PDFs como documento. Em troca, **Baileys viola os Termos de Serviço do WhatsApp e o número pode ser banido sem aviso e sem recurso**. Esse risco é aceito para o piloto, com as salvaguardas abaixo, porque nenhum pedido depende do WhatsApp para ser entregue.

**Fluxo:**
1. A página de processamento (e a de entrega) mostra o botão **“Receber no WhatsApp”**, que abre `https://wa.me/55<DDD><número>?text=Quero%20receber%20o%20kit%20do%20pedido%20GZ-XXXXXX`.
2. O responsável envia a mensagem. A Evolution API dispara o evento `MESSAGES_UPSERT` para `POST /webhooks/whatsapp` em `apps/api` (URL com segredo; validar o segredo e ignorar mensagens com `fromMe`).
3. A API extrai o código curto, localiza o pedido (estados `pago`, `processando` ou `pronto`), grava `whatsapp_phone` e `whatsapp_consent_at` e responde com a confirmação (microcopy no guia de design, seção 5.2). Pedido já `pronto` recebe o link e os PDFs imediatamente.
4. Ao marcar `pronto`, o worker enfileira `notify`: e-mail sempre; se houver WhatsApp vinculado, `POST /message/sendText/{instancia}` com o link da página do pedido e, para cada um dos dois PDFs, `POST /message/sendMedia/{instancia}` com `mediatype: "document"`, `fileName` e `media` apontando para uma URL assinada de curta duração.
5. `falhou` também avisa no WhatsApp. Mensagem sem código reconhecido recebe uma resposta de ajuda, no máximo uma por 24 horas por número. `SAIR` ou `PARAR` remove o vínculo e confirma. Nenhuma outra mensagem é respondida; o canal não conversa.
6. O vínculo pode ser removido pela página do pedido ou pelo admin.

**Operação e salvaguardas contra banimento:**
- **Número dedicado**, nunca o pessoal: chip em nome do responsável pelo projeto, com WhatsApp instalado em um aparelho que fica ligado; a Evolution API conecta como aparelho vinculado via QR. Perfil preenchido (nome, foto, descrição) e número “aquecido” com uso normal por uma ou duas semanas antes do piloto.
- Só responder a conversas iniciadas pelo usuário; nunca enviar a quem não escreveu; sem listas, grupos ou marketing.
- Volume baixo e humano: `delay` aleatório entre envios, poucos envios por minuto, fila com limite.
- Monitorar `CONNECTION_UPDATE` e `QRCODE_UPDATED`; alertar desconexão; feature flag `WHATSAPP_ENABLED` desliga o botão e o envio na hora, sem afetar e-mail nem entrega.
- Se o número for banido: desligar a flag, seguir por e-mail e migrar para a integração `WHATSAPP-BUSINESS` na mesma Evolution API. Com a API oficial, respostas dentro da janela de 24 horas aberta pelo cliente continuam sem template; só avisos fora da janela precisariam de template aprovado.

**Infra:** container `evoapicloud/evolution-api` com versão fixada (linha 2.x), no mesmo VPS; banco próprio na mesma instância Postgres (`DATABASE_PROVIDER=postgresql`); Redis para cache (`CACHE_REDIS_ENABLED=true`); volume `/evolution/instances`; `AUTHENTICATION_API_KEY` forte; porta 8080 apenas atrás do proxy reverso; uma instância por número (`POST /instance/create` com `integration: "WHATSAPP-BAILEYS"`); webhook por evento para `apps/api` com `MESSAGES_UPSERT`, `CONNECTION_UPDATE` e `QRCODE_UPDATED`. Interface em `packages/core`: `NotificationChannel` com adaptadores `EmailChannel` e `WhatsAppChannel`.

**Privacidade:** o número é dado pessoal do responsável, coletado só por opt-in, usado só para avisos do pedido, citado na política de privacidade e apagado a pedido ou junto com a retenção do pedido.

## 10. Critérios de aceite para liberar o MVP

- [ ] O responsável consegue iniciar a compra e receber os PDFs pelo celular, sem criar senha.
- [ ] Upload funciona para fotos tiradas por Android/iPhone nos formatos anunciados.
- [ ] A prévia apresenta assuntos da taxonomia e o perfil do material, permite corrigir, e fotos insuficientes são recusadas antes da compra.
- [ ] Pix só é considerado pago mediante confirmação válida do provedor, mesmo com webhook duplicado; pagamento e enfileiramento são atômicos.
- [ ] Cada compra bem-sucedida produz exatamente **um kit em dois PDFs**: atividades (revisão, 2 exemplos, 10 exercícios, simulado de 10) e gabarito (20 respostas comentadas).
- [ ] Todas as questões passaram por verificações estruturais, recálculo matemático quando aplicável e as validações críticas.
- [ ] PDFs A4 abrem no celular, podem ser baixados e imprimem corretamente; o gabarito é um arquivo separado.
- [ ] Falhas de geração geram tratamento visível; não há pedidos pagos silenciosamente abandonados.
- [ ] Link do pedido é privado e recuperável por e-mail; o download usa URL assinada de curta duração; originais e PDFs seguem regras de retenção.
- [ ] Responsável encontra suporte, preço, kit de amostra e informações de compra/privacidade antes do pagamento.
- [ ] Painel administrativo permite detectar e resolver falhas e republicar PDFs sem editar banco manualmente.
- [ ] “Receber no WhatsApp” vincula o número apenas por mensagem iniciada pelo responsável, entrega link e PDFs, e o pedido é entregue por e-mail mesmo com o WhatsApp desligado.
- [ ] Homologação pedagógica de 40 casos concluída, sem erros críticos pendentes, com os casos rodando como regressão.

## 11. Prioridade de implementação

**Fase 1 — Prova técnica/pedagógica:** taxonomia v1 (4º–7º × 2 disciplinas) → upload local de fotos → extração com perfil do material → JSON validado → recálculo matemático → dois PDFs; biblioteca de 40 casos rodando como regressão; medição de custo por prévia e por kit; geração dos dois kits de amostra. Tudo isso antes de qualquer checkout.

**Fase 2 — Fluxo comercial:** landing com amostra → prévia → e-mail → Pix (Mercado Pago) → webhook → job → entrega privada por e-mail e WhatsApp (Evolution API); incluir termos, suporte e painel admin.

**Fase 3 — Piloto pago controlado:** rodar com responsáveis voluntários, auditar amostras dos kits entregues, medir funil, custo e qualidade e corrigir falhas.

**Fase 4 — Somente depois de validação:** 8º e 9º ano, novas matérias, correção online, combos por disciplina, migração do WhatsApp para a API oficial se o volume justificar, área do estudante, assinatura opcional (se um dia fizer sentido).

## 12. Decisões tomadas e em aberto

### 12.1 Decididas nesta revisão
- **Gateway Pix: Mercado Pago**, Orders API, conta pessoa física (seção 9.1). Pendências operacionais: cadastrar chave Pix na conta, confirmar a taxa vigente, criar usuários de teste.
- **WhatsApp: Evolution API com Baileys, em modo somente resposta**, já no piloto (seção 9.2). Pendências: chip e aparelho dedicados, aquecimento do número, política de privacidade atualizada.

### 12.2 Em aberto (não bloqueiam o protótipo)
1. **Marca:** consulta de anterioridade de “Gizito” no INPI e disponibilidade de domínio (`gizito.com.br` e variações) antes de divulgar.
2. **Preço:** R$ 29,90 é o preço de lançamento. Testar sensibilidade (por exemplo, R$ 19,90) apenas após qualidade demonstrada no piloto; não criar múltiplos planos no MVP.
3. **Provedor de IA:** sem restrição de dados ou preferência. Candidato inicial: um provedor com dois níveis de modelo multimodal (pequeno para extração, grande para geração e revisão). Selecionar por benchmark nos 40 casos, custo real medido, estabilidade e política de dados. Ordem de grandeza esperada com modelos atuais: centavos de dólar por prévia e menos de um dólar por kit; confirmar na Fase 1.
4. **Prazo de retenção e políticas:** validar adequação jurídica à LGPD, CDC e prestação de serviço digital antes de comercializar, incluindo o tratamento do número de WhatsApp.
5. **Conversão de HEIC no servidor:** só se o teste em iPhone real mostrar necessidade.
6. **Migração do WhatsApp para a API oficial:** gatilhos são banimento, instabilidade recorrente ou volume que justifique a verificação de negócio. A Evolution API mantém os mesmos endpoints; muda a integração da instância.

## 13. Histórico de revisões

- **1.2 (14/10/2026):** gateway Pix decidido: Mercado Pago via Orders API, conta pessoa física, com tabela comparativa e roteiro de integração (9.1); WhatsApp entra no MVP via Evolution API com Baileys em modo somente resposta, com fluxo, salvaguardas e caminho de migração para a API oficial (9.2); botão “Receber no WhatsApp” nas páginas de processamento e entrega; código curto do pedido; feature flag do canal; interfaces `PaymentGateway` e `NotificationChannel`; Redis e Evolution API no Compose; seção 12 reorganizada em decididas e em aberto.
- **1.1 (14/10/2026):** nome definitivo Gizito; preço R$ 29,90; anos 4º–7º; kit com 10 + 10 = 20 questões em dois PDFs (atividades e gabarito); campos opcionais mantidos e tratados como texto não confiável; funil completo nas métricas; taxonomia de assuntos (7.7); perfil do material e personalização real; simulado com formato de prova; recálculo matemático com mathjs; KaTeX no servidor; fila em Postgres com transação única; stack decidida (TanStack Start, Bun + Elysia, worker Bun, `packages/core`); link do pedido separado do link de download; estado `analisando`; economia da prévia; homologação sem revisão humana no fluxo, com regressão e auditoria amostral; decisões abertas sobre gateway para CPF e WhatsApp.
- **1.0 (14/10/2026):** versão inicial.

---

**Princípio norteador:** o produto não é “conversar com uma IA”; é **comprar, em poucos passos, um kit de estudo útil, específico para a prova e confiável o suficiente para voltar a usar**.
