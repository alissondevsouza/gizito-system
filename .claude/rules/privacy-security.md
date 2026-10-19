---
paths:
  - "apps/**"
  - "packages/**"
  - "tests/**"
---

# Privacidade e Segurança (detalha os invariantes 4, 5, 9 e 10 do CLAUDE.md)

## Dados pessoais (LGPD)
- O comprador é adulto. Nunca pedir, inferir ou armazenar nome da criança, escola, turma ou telefone da criança. Se aparecer em foto, marcar `personal_data_visible` em `sourceWarningCodeList`, sem copiar o dado, e não propagar.
- E-mail e telefone são do responsável: coletados com aceite explícito nunca pré-marcado, usados só para o pedido, exibidos mascarados no admin (domínio do e-mail, 4 últimos dígitos do telefone), removíveis a pedido.
- Retenção: fotos originais 30 dias (`PHOTO_RETENTION_DAYS`); PDFs e `study_kit` 12 meses (`KIT_RETENTION_MONTHS`); `ai_call` sem conteúdo fica para métricas. Remoção registra `delete_datetime`, nunca apaga a linha em silêncio.

## Dados não confiáveis
- Fotos, texto extraído, observação (≤ 300 caracteres), assunto "outro", mensagens de WhatsApp e corpos de webhook: sanitizar e limitar antes de persistir e de renderizar; em prompt, só em bloco delimitado marcado como dado, com instrução de não seguir instruções contidas nele.

## Logs
- Permitido em qualquer nível: `orderId`, estado, etapa, duração, tokens, custo, códigos de erro, 4 últimos dígitos de telefone, domínio do e-mail.
- Só em `debug` (desligado em produção): mensagem bruta de fornecedor. Nunca, em nível nenhum: imagens, texto extraído, prompts, respostas de modelo, `qr_code`, e-mail ou telefone completos, token do pedido, corpo bruto de webhook, mensagens de WhatsApp, segredos.

## Acesso, webhooks e segredos
- Webhooks validam assinatura ou segredo antes de qualquer efeito e registram em `webhook_event` (unique por `source` + `external_id`); duplicado responde 200 sem efeito.
- Rate limit na prévia gratuita (IP + cookie de dispositivo) e nos webhooks; `MAX_AI_COST_CENTS_PER_ORDER` limita o custo de IA por pedido.
- Segredos só por variável de ambiente lida em `config.ts` da app; adaptadores recebem configuração por construtor. Fixtures nunca contêm credenciais nem dados reais.
- Admin atrás de autenticação de operador único com sessão; reprocessar, republicar, reembolsar e ver foto são auditados (quem, quando).

## Conteúdo
- Não transcrever apostilas ou exercícios enviados: explicações, questões e textos-base são originais.
- O PDF nunca identifica a criança; a capa traz ano, disciplina, assuntos e data.
