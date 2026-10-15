# ADR-0005: WhatsApp por Evolution API (Baileys), somente resposta e desligável

**Data:** 2026-10-15
**Status:** aceito
**Decidido por:** Alisson

## Contexto

Responsáveis brasileiros vivem no WhatsApp; receber o kit lá é parte da proposta (PRD §5, etapa 7). A API oficial exige verificação de negócio, templates aprovados e custo por conversa; para um piloto de dezenas de usuários isso é desproporcional. O PRD §9.2 decide pela Evolution API autohospedada com Baileys, ciente de que Baileys viola os Termos do WhatsApp e o número pode ser banido (lesson de 2026-10-14; known issue MEDIUM).

## Decisão

Evolution API em container próprio (`evoapicloud/evolution-api`, linha 2.x fixada), com uma instância `WHATSAPP-BAILEYS` em número dedicado e aquecido. O canal é **somente resposta**: o Gizito nunca inicia conversa; responde a quem mandou o código curto do pedido, a SAIR/PARAR e, no máximo uma vez por 24 h, a mensagens sem código. Nenhuma etapa depende do WhatsApp: e-mail é obrigatório e `WHATSAPP_ENABLED=false` desliga botão, webhook e envios. O domínio só conhece `NotificationChannel`; o adaptador vive em `packages/integrations/src/evolution/`. A Evolution persiste só a instância; mensagens, contatos, chats, histórico e labels ficam desligados (`DATABASE_SAVE_DATA_NEW_MESSAGE/CONTACTS/CHATS/HISTORIC/LABELS=false`, F0-02). A migração para a API oficial é trocar a integração da instância para `WHATSAPP-BUSINESS` na mesma Evolution, sem mudar o código do Gizito.

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| API oficial (Meta Cloud API) desde o início | sem risco de banimento | verificação de negócio, templates para avisos, custo por conversa; semanas de setup para um piloto |
| Só e-mail | zero risco | perde o canal onde o responsável está; e-mail de PF cai em promoções |
| Link `wa.me` sem automação (responder à mão) | simples | não escala nem de noite; o fluxo é 100% automático por definição |
| Twilio/Zenvia | suporte | mesma exigência de templates e custo por mensagem; CNPJ |

## Consequências

### Positivas
- Custo zero por mensagem; PDFs enviados como documento; setup de minutos.
- Modo somente resposta reduz o risco de banimento e dispensa opt-in separado: a mensagem do responsável é o consentimento, registrado com data.
- Desligamento imediato por flag sem afetar entrega.

### Negativas
- Operação manual do aparelho e do QR; sessão perdida exige novo QR (volume da Evolution entra no backup).
- Banimento é possível sem aviso; o número e o aparelho são custo afundado.

### Riscos
- Evolution API é um projeto comunitário com mudanças rápidas entre versões: tag fixada, atualização só com teste manual do fluxo.

## O que faria esta decisão mudar

- Banimento do número, instabilidade recorrente ou volume que justifique a verificação de negócio → `WHATSAPP-BUSINESS` (roadmap F4).
- Mudança nos Termos que torne a API oficial acessível a PF sem templates.
