# Gizito — Guia de Design, Identidade Visual e Experiência (v1.4)

**Tipo:** complemento de UI/UX e branding ao `product-doc-v1.md`  
**Data:** 14/10/2026 · revisão 1.4 em 19/10/2026 (ver seção 15)  
**Status:** especificação proposta, pronta para orientar design e implementação  
**Produto:** kit de reforço escolar personalizado, adquirido por Pix a cada necessidade  
**Marca escolhida:** **Gizito**

> **Princípio criativo:** trazer de volta a sensação acolhedora do reforço escolar tradicional — giz, lousa, caderno e explicação paciente — com a praticidade de uma aplicação atual. O mascote Gizito é um assistente original inspirado no **papel** de antigos ajudantes de desktop, como o Clippy, mas **não** em sua aparência protegida ou nos elementos visuais específicos da Microsoft.

## 1. Relação com o PRD

Este documento especifica **como o produto deve parecer, falar e se comportar**. O PRD continua definindo **o que o MVP faz**, suas regras pedagógicas, integrações, pagamentos, segurança e requisitos de operação.

### Decisões preservadas do PRD

- Público comprador: **pais ou responsáveis adultos**; estudantes do **4º ao 7º ano**.
- Entrada: **1–5 fotos JPG/PNG** (até 8 MB cada), ano, disciplina, confirmação de **1–3 assuntos** da taxonomia, campos opcionais (observação e dificuldade percebida), e-mail e aceites.
- Entrega paga: **um kit em dois PDFs A4** gerados do mesmo conteúdo: o **caderno de atividades** (revisão, dois exemplos guiados quando aplicável, dez exercícios de fixação e mini-simulado de dez questões) e o **gabarito comentado das 20 questões**.
- Modelo: **uma compra avulsa por kit via Pix**, preço de lançamento **R$ 29,90**; sem assinatura.
- Jornada: apresentação → upload → identificação e confirmação da matéria → Pix (Mercado Pago) → processamento → download privado, e-mail e, por opt-in, WhatsApp.
- Fluxo **100% automático**, sem revisão humana entre o pagamento e a entrega.
- **Fora de escopo:** tutor de IA em chat, correção interativa, avatar que converse livremente, gamificação e área do aluno.

## 2. Conceito de marca

### 2.1 Posicionamento

**Gizito** é o ajudante de reforço escolar que transforma a matéria do caderno em atividades para revisar e praticar em casa.

- **Promessa principal:** “A matéria da escola vira reforço para estudar em casa.”
- **Assinatura preferida:** **“Uma ajudinha a mais na hora de estudar.”**
- **Frase de apoio:** “Envie fotos da matéria e receba revisão, exercícios, simulado e gabarito em PDF, prontinhos para imprimir.”
- **Personalidade:** paciente, acolhedor, curioso, explicativo, confiável, alegre sem ser barulhento.
- **Arquétipo de interação:** auxiliar de sala de aula, **não** professor infalível nem colega que dá respostas prontas.

### 2.2 O que a marca deve transmitir

| Deve transmitir | Não deve transmitir |
|---|---|
| Confiança para pais e responsáveis | Brinquedo sem utilidade pedagógica |
| Aconchego da escola e da papelaria | Software antiquado e difícil de usar |
| Clareza e simplicidade | Estética de IA genérica com efeitos excessivos |
| Incentivo para aprender | Promessas de notas altas ou aprovação garantida |
| Tecnologia discreta a serviço do ensino | Mascote invasivo, infantilização exagerada |

### 2.3 Voz e microcopy

- Falar em português brasileiro simples, com frases curtas.
- Falar **com o responsável**, não pressupor que há uma criança usando o site sozinha.
- Preferir verbos claros: **Enviar fotos**, **Conferir assuntos**, **Gerar meu Pix**, **Baixar atividades**, **Baixar gabarito**.
- Evitar jargões: “OCR”, “prompt”, “LLM”, “tokens”, “pipeline”, “webhook”.
- Evitar afirmar que o Gizito é humano, um professor ou que conferiu o material pessoalmente.
- Evitar culpa, pressão para comprar, contagens falsas e promessas de desempenho.
- Todo texto de interface, marca e material é em **português**; os textos em inglês das imagens de referência não são usados.

**Exemplo de tom adequado:** “Achei três assuntos nestas fotos. Dá uma conferida antes de continuar?”  
**Tom a evitar:** “Eu sei exatamente tudo o que vai cair na prova!”

## 3. Personagem — Gizito

### 3.1 Conceito visual

O Gizito é **um bastão de giz de quadro-negro humanizado**, com forma reconhecível mesmo sem rosto. Deve parecer amigável e original, com uma leve nostalgia de mascotes dos softwares educacionais dos anos 1990/2000. **O estilo de referência é o das imagens em `docs/gizito-image/`** (seção 3.4), que passam a definir o desenho.

**Especificação do desenho (alinhada às referências):**

- Silhueta vertical de giz: corpo cilíndrico branco-marfim, topo e base levemente achatados com borda arredondada; proporção aproximada **1:2,2** (largura:altura do corpo). Leve inclinação do corpo nas poses ativas, como nas referências.
- Textura de giz **suave e granulada**, perceptível de perto e invisível em tamanhos pequenos; nunca partículas soltas ou sujeira que prejudiquem leitura e impressão.
- Rosto no terço superior: dois olhos grandes, castanho-escuros, com brilho; sobrancelhas finas e expressivas; boca aberta e sorridente com poucas formas; bochechas rosadas discretas. **Legível a 48–64 px.**
- Braços finos em azul-marinho/grafite com **luvas brancas de quatro dedos**; pernas curtas no mesmo tom escuro e **tênis brancos com detalhes em azul** (cor oficial do mascote, token `--color-gizito-blue`).
- Sem contorno pesado: volumes definidos por sombreamento macio e uma linha fina escura onde necessário para legibilidade.
- Um único acessório por cena, quando útil (mochila, caderninho, apagador ou régua). Óculos e gravata-borboleta são **variante opcional** (“Gizito professor”), não o padrão.
- Não copiar os olhos, gestos, proporções, rosto, balões ou animações específicos do Clippy.

**Preferência estética:** ilustração **2.5D com volumes suaves e sombreamento macio**, como nas referências. A **interface** ao redor permanece plana e sóbria (seção 4), para que o personagem seja o único elemento com volume e não compita com formulários, QR Code e botões.

### 3.2 Expressões e poses P0

| Estado | Expressão/pose | Uso | Referência |
|---|---|---|---|
| `idle` | sorriso leve e postura neutra | Ajuda discreta em telas iniciais | derivar de `mascote-sem-fundo.png` com o braço abaixado |
| `hello` | acena uma vez | Primeiro contato e onboarding | `mascote-sem-fundo.png` |
| `point` | aponta para elemento próximo sem encobri-lo | Dica de fotografia / confirmação | `mascote-formando.png` (sem capelo), `mascote-livros.png` |
| `thinking` | olha para um caderninho, pisca | Pré-análise e geração de kit | nova imagem, a criar a partir das referências |
| `success` | pequeno gesto de comemoração | Kit pronto | miniatura “joinha” em `mascote-professor.png` e `mascote-livros.png` |
| `concern` | expressão acolhedora, sem drama | Foto ilegível, erro ou pedido com falha | nova imagem, a criar a partir das referências |

**P1, não exigido para lançar:** andar pela tela, falar por áudio, personalizar falas com IA, trocar acessórios, expressões contextuais complexas e interagir com respostas digitadas pelo aluno.

### 3.3 Regras de uso

- O Gizito **aparece para orientar**, não para ocupar espaço central em todas as telas.
- Pode surgir ao lado do título na landing e em uma área fixa discreta de auxílio nas etapas do fluxo.
- No mobile, privilegiar personagem de **48–64 px** e balão integrado ao layout; não usar elemento flutuante que esconda campos ou botão de pagamento.
- No desktop, preferir **72–96 px** em ilustrações de ajuda e até 160 px na seção hero; nunca cobrir conteúdo.
- Oferecer ação **“Ocultar dicas”**; respeitar essa preferência durante a jornada.
- Nenhuma informação essencial deve existir **apenas** no balão do Gizito: erros, status e instruções precisam estar também na interface.

### 3.4 Referências e decisões do personagem

As imagens em `docs/gizito-image/` são **explorações geradas por IA** que definem a direção visual do personagem. Novas imagens podem e devem ser geradas a partir delas quando faltar uma pose ou cena. Elas **não** são assets finais de produção.

| Arquivo | O que mostra | Como usar |
|---|---|---|
| `mascote-sem-fundo.png` | Pose acenando, fundo transparente | **Base canônica** do personagem: proporções, rosto, luvas, tênis azul-e-branco |
| `mascote-aluno.png` | Com mochila azul, lousa com lettering de giz, janela com checklist | Referência de cena para a landing; mochila como acessório de “aluno” |
| `mascote-professor.png` | Variante com óculos, gravata-borboleta, ponteiro e livro; miniaturas “joinha” e “abraçando livros”; lettering arredondado com estrela no “i” | Variante “professor” (opcional); **lettering de referência** para o logotipo; miniaturas para `success` |
| `mascote-formando.png` | Capelo de formatura, livro, apontando para a lousa | Pose `point`; capelo reservado para comunicação de conclusão (P1) |
| `mascote-livros.png` | Apontando para balão, carregando livros, miniaturas; lettering “bubble” | Pose `point` e `success`; carregando livros para ilustrações de seção |

**Decisões tomadas a partir das referências:**

- **Manter:** corpo de giz com textura suave, rosto expressivo com bochechas, luvas brancas, braços e pernas escuros, tênis brancos com azul, inclinação dinâmica do corpo, sombreamento macio.
- **Cor de acento do mascote:** o azul dos tênis e da mochila vira o token `--color-gizito-blue` (seção 4.1). O vermelho dos tênis em `mascote-professor.png` **não** é usado; a variante professor também usa tênis azuis.
- **Acessórios:** um por cena. Cenas com mochila, livros, globo e lousa ao mesmo tempo ficam só nas referências.
- **Descartar:** todo texto em inglês, slogans das imagens, o símbolo ™, a tela “Set a goal / Practice / See your progress” (funcionalidades fora do MVP) e o balão brilhante com cursor pixelado de `mascote-livros.png`, que é a referência literal ao Clippy que este guia evita.
- **Lousa de fundo:** pode aparecer na landing e na capa dos PDFs como cenário, sempre em `--color-board`, nunca atrás de formulários.
- **Variação de óculos:** nas interfaces o Gizito aparece sem óculos; a variante professor pode ilustrar dicas pedagógicas e a capa do gabarito.

**Formato dos assets de produção:** por serem ilustrações 2.5D geradas por IA, os assets do mascote são **PNG/WebP com fundo transparente**, exportados em 2–3 tamanhos (por exemplo 128, 256 e 512 px de altura) e otimizados. SVG fica reservado para logotipo, símbolo e favicon (seção 4.4). Cada pose deve ser gerada a partir da base canônica para manter consistência de rosto, proporção e cores; qualquer imagem nova passa por uma checagem rápida contra esta seção antes de entrar no repositório.

## 4. Linguagem visual: “neo-retrô escolar”

A identidade mistura duas referências complementares:

1. **Escola tradicional:** lousa verde, papel creme, linhas de caderno, giz, fichas de exercício, etiquetas escolares.
2. **Computadores de fim dos anos 1990/início dos 2000:** barras de título discretas, painéis com contornos, pequenas etiquetas de estado e botões táteis reinterpretados.

**Regra:** a nostalgia é visual. A experiência deve seguir expectativas modernas de navegação, acessibilidade, responsividade e desempenho.

### 4.1 Paleta inicial (tokens propostos)

| Token | Cor | Uso |
|---|---|---|
| `--color-board` | `#214C45` | Verde quadro-negro; hero, cabeçalhos e marca |
| `--color-ink` | `#22352F` | Texto principal e contornos |
| `--color-paper` | `#F8F5E9` | Fundo geral tipo papel |
| `--color-card` | `#FFFEFA` | Cards, formulários e superfícies |
| `--color-chalk` | `#FCFAF2` | Letras/ilustrações claras sobre verde |
| `--color-sun` | `#F2BD50` | CTA secundário, destaques e sinal de descoberta |
| `--color-gizito-blue` | `#2B6FD3` | Azul do mascote (tênis, mochila); acentos ilustrativos ligados ao personagem |
| `--color-blue` | `#4774C1` | Acentos de interface (links, etiquetas), nunca texto pequeno sobre fundo claro sem ajuste |
| `--color-muted` | `#54635F` | Textos secundários sobre papel |
| `--color-success` | `#286B4B` | Confirmação e conclusão |
| `--color-error` | `#8E3E34` | Alertas e erros de formulário |
| `--color-line` | `#D8D5C9` | Bordas suaves e divisórias |

**Uso recomendado:** 65% papel/card, 25% verde escuro/tipografia, 10% amarelo e acentos. O azul do mascote aparece apenas onde o personagem aparece; não é cor de botão. Não usar amarelo como corpo de texto. O contraste de todos os estados e combinações finais deve ser validado em WCAG AA; não confiar apenas nos hexadecimais da proposta.

### 4.2 Tipografia

- **Primária:** `Nunito Sans` (alternativa: `Atkinson Hyperlegible`), corpo e títulos com aparência humana e legível.
- **Secundária retrô:** `IBM Plex Mono`, **somente** para etiquetas, passos e pequenos status; não usar em textos longos ou materiais de estudo.
- **Fallback:** fontes de sistema sans-serif; nenhuma etapa depende do download de fontes externas.
- **Nos PDFs:** a mesma família primária, embutida no render; números e frações testados em impressão.

| Uso | Mobile | Desktop |
|---|---:|---:|
| H1 | 30/36 px | 42/48 px |
| H2 | 24/30 px | 30/38 px |
| H3 | 20/26 px | 22/30 px |
| Corpo | 16/24 px | 16/26 px |
| Apoio | 14/21 px | 14/21 px |
| Botões | 16/22 px, sem caixa alta obrigatória | 16/22 px |

Preferir peso 600–800 para títulos; parágrafos regulares 400–500. Evitar letras excessivamente espaçadas, texto todo em maiúsculas e fontes de máquina de escrever para explicações.

### 4.3 Formas, bordas e fundos

- Cards: cantos de **12–16 px**, borda 1–2 px e sombra pequena; evocar janelas antigas de forma sutil.
- Botões: cantos de 10–12 px, altura mínima **48 px**.
- Inputs: altura mínima **48 px**, rótulo sempre visível e estados distintos de foco/erro.
- Grid: base **8 px**; espaçamentos 8/12/16/24/32/48.
- Textura: no máximo **2% de opacidade**, usada apenas em grandes áreas decorativas; nunca atrás de enunciados ou campos.
- Detalhes retrô: uma pequena “aba de caderno”, barras finas de título e rótulos monoespaçados. Não usar ícones de disquete ou componentes Windows 95 em ações críticas só pela nostalgia.

### 4.4 Elementos de marca

- **Logo principal:** lettering “Gizito” de leitura imediata + símbolo simplificado do personagem. **Referência de lettering:** a versão arredondada e encorpada de `mascote-professor.png`, com a **estrela no pingo do “i”** como elemento distintivo, em `--color-board` ou `--color-ink`.
- **Lettering de giz:** a versão manuscrita sobre lousa (como em `mascote-aluno.png` e `mascote-formando.png`) é **secundária**, para hero e capas, nunca em navegação ou botões.
- **Versão horizontal:** símbolo à esquerda, palavra à direita.
- **Versão reduzida:** cabeça/silhueta do giz sem detalhes pequenos.
- **Favicon:** silhueta de giz sobre verde-quadro; testada em 16×16 e 32×32 px.
- **Não depender de emoji** como substituto do mascote final. Não usar ™ ou ® até haver registro.

## 5. Comportamento do assistente (inspiração funcional no Clippy)

O Gizito **não será um chatbot** no MVP. Será um componente de ajuda contextual com textos, poses e transições pré-definidos. A aplicação sabe a etapa do usuário e apresenta instruções correspondentes.

### 5.1 Máquina de estados de apresentação

`oculto ↔ discreto → dica → discreto`  
Estados visuais circunstanciais: `boas-vindas`, `orientação`, `pensando`, `sucesso`, `erro`.

**Regras:**

- Por padrão, uma saudação curta na landing e **no máximo uma dica automática por etapa**.
- Balão de ajuda pode ser fechado a qualquer momento; nunca fica à frente do Pix, upload ou download.
- Ajuda adicional é aberta pelo usuário, via **“Dica do Gizito”**.
- Não disparar sons automaticamente.
- Ao navegar de volta, não repetir apresentações já dispensadas na sessão.
- “Ocultar dicas” desativa os balões opcionais, mas não suprime os avisos obrigatórios do sistema.
- Não usar gatilhos de compra, linguagem de culpa ou mensagens tentando reter crianças.

### 5.2 Microcopy por etapa

| Contexto | Mensagem sugerida |
|---|---|
| Landing | “Oi! Eu sou o Gizito. Vamos transformar essa matéria em um reforço para estudar em casa?” |
| Upload | “Fotografe com boa luz e tente mostrar a página inteira.” |
| Foto ilegível | “Não consegui ler bem esta foto. Quer tirar outra?” |
| Assuntos detectados | “Encontrei estes assuntos. Confere se estão certinhos?” |
| Mais de 3 assuntos | “Vamos escolher até três assuntos para este kit.” |
| Checkout | “Tudo pronto! O material começa a ser preparado depois da confirmação do Pix.” |
| Pix aguardando | “Ainda estou aguardando a confirmação do pagamento.” |
| Pix, nome do recebedor | “No seu banco, o pagamento aparece em nome de {nome civil do titular da conta Mercado Pago}, responsável pelo Gizito, pela instituição Mercado Pago. Está correto.” |
| Geração | “Estou organizando a revisão, os exercícios e o simulado. Você pode voltar depois; aviso por e-mail.” |
| Kit pronto | “Prontinho! Suas atividades e o gabarito estão disponíveis para baixar.” |
| Falha de geração | “Tivemos um problema ao preparar o material. Seu pagamento está registrado e vamos ajudar a resolver.” |
| WhatsApp, vínculo feito | “Oi! Aqui é o Gizito. Vou avisar neste número quando o kit do pedido GZ-7K3M9Q ficar pronto. Se preferir parar, responda SAIR.” |
| WhatsApp, kit pronto | “Prontinho! Seu kit está aqui: {link}. Estou enviando também os dois PDFs: atividades e gabarito.” |
| WhatsApp, mensagem sem código | “Oi! Este número só envia avisos dos kits. Para falar com a gente, acesse gizito.com.br/ajuda.” |
| WhatsApp, saída | “Combinado, não vou mais avisar por aqui. Seu kit continua disponível pelo link do e-mail.” |
| WhatsApp, falha | mesma mensagem de falha de geração, seguida do link de ajuda |

O número do Gizito **nunca puxa conversa nem responde perguntas**: reage apenas à mensagem com o código do pedido e às palavras SAIR ou PARAR. Qualquer outra mensagem recebe, no máximo uma vez por dia, a resposta “mensagem sem código”.

O texto não deve sugerir que um humano conferiu o conteúdo quando somente a IA e verificações automáticas foram utilizadas.

### 5.3 Animações (modo econômico)

| Animação | Duração recomendada | Restrição |
|---|---:|---|
| Entrada suave do mascote | 250–350 ms | Só uma vez por tela |
| Piscar | Curta e ocasional | Não sincronizar loops chamativos |
| Aceno | 600–900 ms | Só na saudação |
| Pensar | 1,2–1,8 s por ciclo | Sem uso permanente fora de carregamento |
| Comemoração | 700–1000 ms | Uma vez na entrega |
| Balão | 150–250 ms | Sem deslocamentos grandes |

Como os assets do mascote são imagens 2.5D (seção 3.4), as animações do MVP são **trocas de pose com crossfade, leve flutuação e piscar por sobreposição**, feitas em CSS. Não há rigging vetorial; Rive/Lottie ficam fora do MVP. Suportar `prefers-reduced-motion: reduce` (sem movimentos, preservando mensagens e estados).

## 6. Arquitetura de informação e telas do MVP

A navegação deve parecer uma sequência de passos simples, com contexto e progresso visíveis:

**Enviar matéria → Conferir assuntos → Pagar Pix → Preparar kit → Baixar PDFs.**

### 6.1 Landing (`/`)

**Objetivo:** explicar a entrega e gerar confiança antes de pedir fotos.

**Acima da dobra:**

- Logo Gizito + link “Como funciona” e “Ajuda”.
- Headline: **“A matéria da escola vira reforço para estudar em casa.”**
- Subheadline: “Envie fotos do caderno e receba revisão, exercícios, simulado e gabarito em PDF.”
- CTA primário: **“Preparar meu kit”**.
- Selo de informação: **“Pagamento único via Pix · R$ 29,90 por kit”**.
- Gizito grande, mas secundário à mensagem; lousa de fundo permitida nesta seção.

**Abaixo:** 3 passos com ilustrações simples; **kit de amostra completo para download** (um de Matemática e um de Língua Portuguesa, com atividades e gabarito, gerados pelo próprio pipeline e marcados como “amostra”); lista do que vem no kit; FAQ objetiva; suporte/privacidade/termos. Não inventar depoimentos ou estatísticas.

**Transparência sobre quem está por trás:** uma linha curta, perto do rodapé ou do bloco de confiança, identificando o Gizito como projeto independente de {nome civil do titular da conta Mercado Pago}, com canal de contato. É o mesmo nome que aparecerá no banco do pagador na hora do Pix (seção 6.4); mostrá-lo antes transforma uma surpresa em sinal de confiança.

### 6.2 Upload e dados (`/criar`)

- Cabeçalho curto: “Vamos preparar o reforço?”
- Campos: **ano escolar** (4º a 7º), **disciplina** e **1–5 fotos** com prévias.
- Uma única coluna no mobile; permitir câmera e galeria.
- Botões para remover/substituir imagem; mensagens de arquivo inválido específicas.
- Lembrete de privacidade: “Evite fotografar nomes completos, telefones e dados da escola.”
- CTA: **“Identificar assuntos”**; desabilitado com motivo claro até preencher entradas. Ao acionar, o pedido é criado e a navegação passa a `/pedido/:id/...`.
- Dica do Gizito sobre iluminação e enquadramento, fechável.

### 6.3 Prévia e confirmação (`/pedido/:id/assuntos`)

- Listar os **assuntos reconhecidos** como chips editáveis, com nomes da taxonomia; opção “outro” em texto livre.
- Bloco curto **“O que entendi do material”**: perfil detectado em linguagem simples (por exemplo, “exercícios com problemas do dia a dia”, “frações escritas como a/b”, “texto manuscrito”). Não exibir trechos do material nem conteúdo inventado.
- Aviso destacado e ação **“Trocar foto”** para páginas insuficientes.
- Limitar a três assuntos e mostrar o que entrará no kit.
- Mostrar composição da entrega (revisão + 2 exemplos + 10 exercícios + simulado de 10 + gabarito das 20 em arquivo separado) e preço de forma transparente.
- **Campos opcionais** em área recolhível “Quer contar algo a mais?”: observação curta (até 300 caracteres) e dificuldade percebida (básica, intermediária, não sei). Nunca bloqueiam o CTA.
- Coletar **e-mail** do responsável, exibido em destaque para conferência, e aceite dos termos; o aceite não pode vir pré-marcado.
- CTA: **“Continuar para o Pix”**.
- Não mostrar trechos de material inventados como “prévia grátis”.

### 6.4 Checkout Pix (`/pedido/:id/pagamento`)

- Valor e resumo do kit sempre visíveis.
- QR Code grande e opção **“Copiar código Pix”** com confirmação de cópia.
- Cobrança gerada no Mercado Pago com validade de 30 minutos (mínimo do gateway), com contagem regressiva visível. QR a partir de `qr_code_base64`; “Copiar código Pix” a partir de `qr_code`; link discreto “Ver instruções no Mercado Pago” (`ticket_url`) como alternativa. A marca do gateway aparece pequena, como sinal de confiança, sem competir com o valor.
- **Aviso obrigatório do recebedor**, fixo logo abaixo do QR e do botão de copiar, visível sem rolar e antes de qualquer dica do Gizito: “No seu banco, o pagamento aparece em nome de {nome civil do titular da conta Mercado Pago}, responsável pelo Gizito, pela instituição Mercado Pago. Está correto.” O nome é escrito exatamente como o banco exibe e vem de configuração (`PIX_RECIPIENT_DISPLAY_NAME`), nunca digitado na tela. Motivo: conta pessoa física mostra o nome do titular, não a marca; o que derruba a conversão é a surpresa no app do banco, não o nome em si. Quando houver conta PJ, só a configuração muda.
- Informar que a liberação depende de **confirmação real do pagamento**, não apenas do envio do Pix.
- Estados: `aguardando`, `confirmando`, `pago`, `expirado`, `erro`.
- Em mobile, o botão **Copiar código Pix** deve ter prioridade sobre QR quando só há um dispositivo.
- Se expirar, ação explícita **“Gerar novo Pix”** sem criar nova compra paga.
- A área do Gizito não deve competir visualmente com QR, valor ou instruções.

### 6.5 Processamento (`/pedido/:id/preparando`)

- Título: **“Estamos preparando seu kit.”**
- Etapas textuais **reais** de processamento (lendo o material, montando a revisão, escrevendo as questões, conferindo as respostas, gerando os PDFs); sem progresso percentual fictício.
- Ícone/Gizito em pose `thinking`, animação discreta.
- Instrução persistente: “Pode fechar esta página. Enviaremos um e-mail quando estiver pronto.”
- Botão secundário **“Receber no WhatsApp”** logo abaixo da instrução, com o texto de apoio “Você envia uma mensagem e a gente avisa por lá, com os PDFs.” Abre o WhatsApp com mensagem pré-preenchida contendo o código curto do pedido. Depois do vínculo, a página passa a mostrar “Vamos avisar no WhatsApp final 1234 e no e-mail”, com ação **“Remover WhatsApp”**. Se o canal estiver desligado por feature flag, o botão simplesmente não aparece; nada mais muda.
- Se o prazo alvo for ultrapassado, mensagem calma e clara; não prometer minutos exatos não verificados.
- Em erro: explicar que o pagamento foi registrado e oferecer suporte; nunca sumir com o pedido.

### 6.6 Entrega (`/pedido/:id/kit`)

- Dois CTAs, com hierarquia clara: **“Baixar atividades (PDF)”** como primário e **“Baixar gabarito (PDF)”** como secundário logo abaixo, com a dica “Guarde o gabarito para depois da prática”.
- Cada clique gera um link de download de curta duração; se expirar, basta clicar de novo.
- Resumo: ano, disciplina, assuntos, 20 questões e data.
- Orientação: “Imprima as atividades e deixe o gabarito para conferir depois.”
- Link para suporte/reportar problema; mostrar prazo de acesso aos arquivos.
- Se houver WhatsApp vinculado, nota “Também enviamos os arquivos no seu WhatsApp”. Se não houver, **“Receber no WhatsApp”** aparece como ação terciária para quem quiser os PDFs por lá.
- CTA terciário e discreto: **“Preparar outro kit”** (sem upsell agressivo).
- Gizito em pose `success` uma única vez; não obstruir download.

### 6.7 Páginas operacionais obrigatórias

- `/ajuda`: FAQ curta, contato e suporte. A FAQ inclui obrigatoriamente “Por que o Pix aparece em nome de uma pessoa?”, com a mesma explicação da seção 6.4 e a linha de transparência da 6.1.
- `/privacidade` e `/termos`: links disponíveis antes do checkout.
- `/pedido/:id/erro`: recuperação e atendimento, sem exposição de informações pessoais.

### 6.8 Estado do pedido → rota

O `:id` é o token público do pedido (PRD, seção 5). A API informa o estado; a web decide a rota e redireciona quando o usuário abre uma rota incompatível.

| Estado do pedido | Rota canônica | Ao abrir outra rota do pedido |
|---|---|---|
| (sem pedido) | `/`, `/criar` | — |
| `rascunho` | `/criar` (fotos ainda sendo escolhidas) ou `/pedido/:id/assuntos` com aviso de fotos insuficientes | — |
| `analisando` | `/pedido/:id/assuntos` em modo carregando | redireciona para assuntos |
| `previa_pronta` | `/pedido/:id/assuntos` | redireciona para assuntos |
| `aguardando_pagamento` | `/pedido/:id/pagamento` | `/kit` e `/preparando` redirecionam para pagamento |
| `aguardando_pagamento` + `cobranca_expirada` | `/pedido/:id/pagamento` com “Gerar novo Pix” | idem |
| `pago`, `processando` | `/pedido/:id/preparando` | `/pagamento` e `/kit` redirecionam para preparando |
| `pronto` | `/pedido/:id/kit` | `/preparando` e `/pagamento` redirecionam para kit |
| `falhou` | `/pedido/:id/erro` | qualquer rota redireciona para erro |
| `reembolsado` | `/pedido/:id/erro` com mensagem de reembolso | idem |

Token inválido ou inexistente: página neutra “Pedido não encontrado” com link para suporte, sem revelar se o token existiu.

## 7. Componentes e estados visuais

**P0 de UI:** `SiteHeader`, `PrimaryButton`, `SecondaryButton`, `Field`, `Select`, `UploadDropzone`, `PhotoThumbnail`, `TopicChip`, `MaterialProfileCard`, `OptionalDetails`, `StepIndicator`, `PriceSummary`, `PixPaymentPanel`, `StatusPanel`, `WhatsAppOptIn`, `KitDownloadCard`, `HelpLink`, `GizitoAssistant`.

Cada componente terá estados `default`, `hover` quando aplicável, `focus-visible`, `disabled`, `loading`, `success` e `error` conforme seu papel.

### 7.1 Botões

- Primário verde com texto claro para ações principais; secundário sobre papel com borda escura.
- Usar amarelo apenas como destaque/CTA contrastante cuidadosamente validado; não criar vários botões competidores na mesma tela.
- Rótulo deve indicar a ação: “Identificar assuntos”, não apenas “Continuar” quando houver ambiguidade.

### 7.2 Feedback de erro

- Texto objetivo + solução: “Esta foto está acima de 8 MB. Escolha uma imagem menor.”
- Não depender de cor: incluir texto, ícone e `aria-describedby`.
- Evitar mensagens genéricas “Ops! Algo deu errado” sem orientação.
- Erro inesperado ao abrir uma página: a página mantém o documento em pt-BR, explica em uma frase que não foi possível abrir agora e que o pedido continua salvo, e oferece duas saídas (tentar de novo e voltar ao início); nunca mostra mensagem técnica nem detalhe do erro.

### 7.3 Estados vazios e carregamento

- Sem fotos: exemplo ilustrativo da foto esperada.
- Extração em andamento: indicador discreto e instrução para não reenviar imediatamente.
- Falha pedagógica: não exibir PDF parcial como pronto; indicar suporte ou reprocessamento.

## 8. Layout e responsividade

### Breakpoints orientadores

- **Mobile:** 320–639 px — coluna única, controles grandes, textos fluidos.
- **Tablet:** 640–1023 px — conteúdo centralizado; duas colunas só quando simplificar leitura.
- **Desktop:** 1024 px ou mais — largura de conteúdo máxima de ~1120 px; formulários ~640–720 px.

### Regras de mobile-first

- Todas as etapas completas e utilizáveis a partir de **360 px**, com tolerância até 320 px onde aplicável.
- CTA pode ser fixo ao rodapé em formulários longos, **desde que não esconda conteúdo**, teclado virtual ou balão do assistente.
- Alvos de toque de no mínimo **44×44 px**; preferir 48 px em controles principais.
- Evitar diálogos modais para tarefas centrais e não exigir arrastar arquivos.
- O usuário pode voltar sem perder fotos e escolhas já confirmadas, respeitando privacidade e segurança.

## 9. Design dos PDFs entregues

Os PDFs são o **produto comprado**, portanto devem expressar qualidade superior à interface decorativa. São dois arquivos gerados do mesmo conteúdo.

- **A4 retrato**, margens de 15–18 mm, fundo essencialmente branco, preparado para impressão comum em preto e branco.
- Cabeçalho discreto com logotipo Gizito, ano, matéria e assunto; rodapé com número de página e identificação do arquivo (“Atividades” ou “Gabarito”).
- **Corpo 11–12 pt** (preferência 12), entrelinha de 1,35–1,5; títulos 16–20 pt; contraste alto.
- Revisão organizada com subtítulos claros e exemplos em blocos bem delimitados.
- **2 exemplos guiados**, **10 exercícios**, **10 questões de mini-simulado** no caderno de atividades; **20 respostas comentadas** no gabarito, conforme PRD.
- Matemática com equações renderizadas por KaTeX, frações corretamente empilhadas e espaço para cálculo.
- Língua Portuguesa com textos-base originais e espaço para responder questões abertas.
- **Mini-simulado com aparência de prova:** cabeçalho com nome, data e tempo sugerido, numeração própria, questões em ordem mista de assuntos, sem dicas.
- Mascote pode aparecer pequeno na capa e em uma dica pedagógica pontual, **não em cada página**. A variante professor pode ilustrar a capa do gabarito.
- Evitar fundos escuros, grandes manchas de tinta, ruídos de papel e elementos supérfluos; preservar economia de impressão.
- Nota discreta: material complementar gerado com apoio de IA; não substitui professor nem garante nota.

### Páginas conceituais

**`kit-atividades.pdf`**
1. Capa: “Meu reforço de Matemática” + assuntos + Gizito pequeno.
2. Revisão: tópicos e explicações.
3. Exemplos: resoluções passo a passo.
4. Exercícios: dez questões com espaço para respostas.
5. Mini-simulado: dez questões em formato de prova, sem respostas visíveis.

**`kit-gabarito.pdf`**
1. Capa curta com os mesmos identificadores.
2. Gabarito: respostas e comentários das 20 questões, na ordem dos blocos.

A paginação exata varia conforme os assuntos e não deve forçar páginas vazias.

## 10. Acessibilidade, confiança e privacidade

- Adotar **WCAG 2.2 AA** como meta de implementação: contraste, navegação por teclado, foco visível, rótulos, mensagens de erro e fluxo sem barreiras.
- Contraste mínimo de texto normal **4,5:1** e componentes visuais relevantes **3:1**, com testes reais das combinações utilizadas.
- Respeitar zoom de 200%, aumento de texto e `prefers-reduced-motion`.
- Não fazer o Gizito “falar” por voz automaticamente nem usar piscadas excessivas.
- Mensagens essenciais fora dos balões do mascote e acessíveis a leitores de tela.
- A criança **não é convidada a fornecer dados pessoais**; comunicação comercial e pagamento para o responsável adulto.
- Evitar elementos persuasivos direcionados a crianças (“peça para seus pais comprarem mais”).
- Informar claramente preço, conteúdo recebido, armazenamento do material, canais de suporte e, antes do Pix, o nome que aparecerá no banco do pagador.
- Mostrar apenas selos de segurança ou avaliações que sejam verdadeiros e verificáveis.

## 11. Assets e arquivos de design a produzir

**Identidade**

- `logo-horizontal.svg`, `logo-stacked.svg`, `mark.svg`, `favicon.svg`.
- `brand-tokens.css` ou tokens equivalentes, guia de cores e tipografia.
- Templates de OG/social (1200×630) e avatar de perfil.

**Mascote P0** (PNG/WebP com fundo transparente, 128/256/512 px de altura, gerados a partir de `mascote-sem-fundo.png`)

- `gizito-idle.png`
- `gizito-hello.png`
- `gizito-point.png`
- `gizito-thinking.png`
- `gizito-success.png`
- `gizito-concern.png`
- Opcional: `gizito-professor.png` para capa do gabarito e dicas pedagógicas.

**Interface**

- Layouts de referência: landing mobile/desktop, upload, confirmação, Pix, processamento, entrega, estados de erro.
- Componentes reutilizáveis com seus estados e foco.
- Modelo dos dois PDFs A4 com páginas exemplares em Matemática e Português.

**Importante:** esta especificação **não pressupõe que os assets finais já existam**. As imagens em `docs/gizito-image/` são referências; os arquivos acima são entregáveis da etapa de design visual.

## 12. Critérios de aceite de design para o MVP

- [ ] A identidade remete a reforço escolar e é compreensível sem mencionar IA.
- [ ] O desenho do Gizito é consistente com a base canônica e legível em tamanhos pequenos.
- [ ] A interface usa nostalgia de forma sutil e mantém navegação moderna.
- [ ] O responsável entende, antes do Pix, que comprará **um kit em dois PDFs** por **R$ 29,90**, sem assinatura.
- [ ] As cinco etapas da compra são claras, sem cadastro obrigatório.
- [ ] O Gizito pode ser ocultado e não bloqueia tarefas essenciais.
- [ ] Acessibilidade básica validada, inclusive teclado, contraste e redução de movimento.
- [ ] Upload, Pix e download funcionam confortavelmente no mobile.
- [ ] Estados de erro têm mensagens úteis; falhas após pagamento indicam solução.
- [ ] Os PDFs mantêm prioridade pedagógica, imprimem bem e o gabarito é um arquivo separado.
- [ ] Nenhum componente promete nota garantida, revisão humana inexistente ou prazo irreal.
- [ ] Materiais comerciais não estimulam crianças a realizar compras.
- [ ] Toda rota do pedido respeita a tabela estado → rota.
- [ ] O vínculo com WhatsApp é iniciado pelo responsável, pode ser removido na página do pedido, e nenhuma etapa depende dele.
- [ ] A tela do Pix mostra, antes do pagamento e sem rolar, o nome do titular exatamente como o banco exibe; a landing e a ajuda identificam o responsável pelo projeto.

## 13. Prioridades de execução

**Etapa 1 — Fundamentos (P0):** validar marca; criar logo (lettering de referência da seção 4.4), base canônica do Gizito, paleta e tipografia; definir tokens.

**Etapa 2 — Fluxo principal (P0):** desenhar e implementar landing, upload, confirmação, Pix, processamento e entrega em mobile; preparar variantes desktop.

**Etapa 3 — Produto comprado (P0):** desenhar os dois PDFs A4 e validar legibilidade, espaços de resposta, impressão, formato de prova do simulado e gabarito separado.

**Etapa 4 — Personagem contextual (P0):** gerar as 6 poses a partir da base canônica, balões opcionais e duas ou três transições discretas. Não construir um motor conversacional.

**Etapa 5 — Polimento após piloto (P1):** animações mais expressivas, materiais para campanhas, variantes do mascote, refinamentos de marca baseados em testes com pais e professores.

---

## 14. Prompt de direção criativa (para designer ou ferramenta visual)

> Desenvolver identidade original para “Gizito”, uma aplicação brasileira de reforço escolar para pais de alunos do 4º ao 7º ano. Mascote: bastão de giz antropomórfico branco-marfim com textura suave, braços e pernas finos em azul-marinho, luvas brancas de quatro dedos, tênis brancos com detalhes azuis, olhos grandes castanhos, bochechas rosadas, sorriso aberto, postura prestativa e levemente inclinada. Estilo 2.5D com sombreamento macio, idêntico às imagens de referência em `docs/gizito-image/` (usar `mascote-sem-fundo.png` como base de consistência), discreta nostalgia dos assistentes de desktop dos anos 1990, sem copiar o personagem Clippy e sem balões brilhantes ou cursores pixelados. Um acessório por cena. Interface neo-retrô escolar: lousa verde-escura, papel creme, detalhes amarelo-escolar, cartões discretamente contornados, microdetalhes de papelaria e tipografia muito legível; a interface é plana para que só o mascote tenha volume. A experiência deve parecer moderna, acessível, confiável e ótima em celular. Mostrar exemplo de landing com foco em fotografar a matéria, confirmar assuntos, Pix avulso e receber dois PDFs. Todo texto em português. Evitar estética infantil excessiva, gradientes genéricos de startup, excesso de efeitos, aparência de Windows antigo literal e componentes que escondam conteúdo.

**Critério final de sucesso:** o adulto deve sentir que encontrou **um reforço escolar prático e confiável**, enquanto o estudante reconhece o **Gizito como um ajudante simpático** — sem que o mascote se torne uma distração ou que a nostalgia complique a experiência.

## 15. Histórico de revisões

- **1.4 (19/10/2026):** erro inesperado de página (7.2): texto objetivo com as saídas "tentar de novo" e "voltar ao início", sem detalhe técnico. Motivo: a raiz do web passa a ter `errorComponent` (revisão da F0); o texto exato fica em `apps/web/src/copy/`.
- **1.3 (14/10/2026):** aviso obrigatório do recebedor na tela do Pix (6.4), com o nome do titular vindo de configuração; linha de transparência na landing (6.1); pergunta obrigatória na FAQ (6.7); microcopy do recebedor (5.2); item de confiança (10) e critério de aceite (12). Motivo: conta pessoa física no Mercado Pago exibe o nome civil do titular no app do banco do pagador, e MEI não resolve.
- **1.2 (14/10/2026):** checkout com detalhes do Mercado Pago (validade de 30 minutos, QR, copia e cola, `ticket_url`); botão “Receber no WhatsApp” nas telas de processamento e entrega, com estados de vínculo e remoção; microcopy das mensagens de WhatsApp e regra de canal somente resposta; componente `WhatsAppOptIn`; critério de aceite do vínculo.
- **1.1 (14/10/2026):** anos 4º–7º; preço R$ 29,90; kit em dois PDFs com 10 + 10 = 20 questões; campos opcionais na tela de confirmação; bloco “O que entendi do material”; kit de amostra completo na landing; seção 3.4 com referências e decisões do personagem baseadas em `docs/gizito-image/`; spec do mascote alinhada ao estilo 2.5D das referências e assets em PNG/WebP; token `--color-gizito-blue`; lettering de referência para o logotipo; rota `/pedido/:id/assuntos`; tabela estado → rota (6.8); tela de entrega com dois downloads e links de curta duração; simulado com formato de prova nos PDFs; textos somente em português.
- **1.0 (14/10/2026):** versão inicial.
