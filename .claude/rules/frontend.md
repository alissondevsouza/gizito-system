---
paths:
  - "apps/web/**/*.ts"
  - "apps/web/**/*.tsx"
---

# Frontend — `apps/web` (design doc seções 3 a 8)

## Stack
- TanStack Start (SSR) + TanStack Router + TanStack Query; React 19, hooks; shadcn/ui como base acessível; TailwindCSS v4 com os tokens do design doc 4.1 (`--color-board`, `--color-paper`, `--color-sun`, `--color-gizito-blue`…); React Hook Form + Zod para formulários.
- Sem lógica de negócio: toda decisão vem de `apps/api`. O web nunca calcula preço, estado ou validação pedagógica.
- Sem login para o comprador. Não existe "conta"; o pedido é acessado pelo token na URL.

## Rotas (design doc 6)
- `/`, `/criar`, `/pedido/:token/assuntos`, `/pedido/:token/pagamento`, `/pedido/:token/preparando`, `/pedido/:token/kit`, `/pedido/:token/erro`, `/ajuda`, `/privacidade`, `/termos`.
- A rota canônica é decidida pela tabela estado → rota (design doc 6.8) em um único módulo (`src/lib/order-route.ts`); loaders redirecionam ao abrir rota incompatível. Token inválido → página neutra "Pedido não encontrado".
- `localStorage` guarda apenas ids de pedidos recentes como conveniência; nunca como prova de pagamento.

## Padrões
- Respostas da API validadas com Zod (`src/lib/api.ts`), com os schemas vindos de `@gizito/core`.
- Componentes P0 do design doc 7 em `src/components/` com estados `default/hover/focus-visible/disabled/loading/success/error`; páginas em `src/routes/`.
- Mobile-first: tudo utilizável a partir de 360 px; alvos de toque ≥ 44 px (48 nos principais); sem modais para tarefas centrais; câmera e galeria no upload; CTA fixo só se não esconder conteúdo.
- Acessibilidade WCAG 2.2 AA: contraste 4,5:1, foco visível, rótulos sempre visíveis, erros com texto + ícone + `aria-describedby`, `prefers-reduced-motion` respeitado.
- Pix: "Copiar código Pix" com confirmação; QR a partir de `qrCodeBase64`; contagem regressiva da validade; "Gerar novo Pix" em `charge_expired`.
- Downloads: botão primário "Baixar atividades (PDF)", secundário "Baixar gabarito (PDF)"; cada clique pede URL assinada nova.
- WhatsApp: componente `WhatsAppOptIn` só aparece com a flag ligada; estados sem vínculo / vinculado (final 4 dígitos) / remover.

## Mascote e microcopy (design doc 2.3, 3.3, 5)
- `GizitoAssistant`: no máximo uma dica automática por etapa, fechável, "Ocultar dicas" respeitado na sessão; nunca cobre upload, QR, valor ou download; nenhuma informação essencial existe só no balão.
- Poses P0 como imagens estáticas (`idle`, `hello`, `point`, `thinking`, `success`, `concern`); animações só por CSS, desligadas em `prefers-reduced-motion`.
- Textos em português simples, com o responsável; verbos claros; sem jargão (OCR, IA generativa, pipeline), sem promessa de nota, sem sugerir revisão humana, sem pressão de compra, sem apelo a crianças. Fonte dos textos: design doc 5.2 e 6.x, centralizados em `src/copy/`.
- Landing com kit de amostra completo para download, preço visível (R$ 29,90) e sem depoimentos ou números inventados.

## Testes
- Vitest + Testing Library para `order-route`, formulários, componentes de estado; Playwright para o fluxo completo com API real e adaptadores falsos.
