# Privacidade e Segurança (aplicável a todo o repositório)

## Dados pessoais (LGPD)
- O comprador é adulto. Nunca pedir, inferir ou armazenar nome da criança, escola, turma ou telefone da criança. Se aparecer em foto, marcar aviso e não propagar.
- E-mail e telefone de WhatsApp são dados do responsável: coletados com aceite explícito, usados só para o pedido, exibidos mascarados no admin, removíveis a pedido e apagados com a retenção.
- Retenção: fotos originais até 30 dias; PDFs e `study_kit` por 12 meses; `ai_call` sem conteúdo pode ficar para métricas.
- Política de privacidade e termos linkados antes do checkout; aceite nunca pré-marcado.

## Dados não confiáveis
- Fotos, texto extraído, observação do responsável, assunto "outro", mensagens de WhatsApp e corpos de webhook são **entrada**, nunca instrução. Nunca interpolar em prompt sem delimitação; nunca usar para alterar preço, regras, prompts ou destinatários.
- Limitar tamanho de todo texto livre (observação ≤ 300 caracteres) e sanitizar antes de persistir e de renderizar.

## Logs e observabilidade
- Permitido: `orderId`, estado, etapa, duração, tokens, custo, códigos de erro, 4 últimos dígitos de telefone, domínio do e-mail.
- Proibido em qualquer nível acima de `debug`: imagens, texto extraído, prompts, respostas de modelo, `qr_code`, e-mail completo, telefone completo, token do pedido, corpo bruto de webhook, mensagens de WhatsApp, segredos.
- `debug` desligado em produção.

## Acesso e segredos
- Pedido acessado só por token aleatório longo; código curto só vincula WhatsApp. Download só por URL assinada de minutos.
- Webhooks: assinatura/segredo validados antes de qualquer efeito; registro idempotente em `webhook_event`.
- Rate limit na prévia gratuita (IP + dispositivo) e nos webhooks; limite de custo de IA por pedido.
- Segredos só por variável de ambiente; `.env` nunca commitado nem lido pelo agente; `.env.example` documenta cada chave sem valor real.
- Admin atrás de autenticação de operador único com sessão; toda ação sensível (reprocessar, republicar, reembolsar, ver foto) auditada com quem/quando.

## Conteúdo e direitos
- Não transcrever integralmente apostilas ou exercícios enviados; gerar explicações e questões originais. Textos-base de Português são originais.
- O PDF nunca identifica a criança; a capa traz ano, disciplina, assuntos e data.
