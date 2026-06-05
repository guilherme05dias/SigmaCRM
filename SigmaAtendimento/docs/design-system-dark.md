# Design System Dark Theme Redesign

Este documento consolida os problemas encontrados no design atual, definindo a paleta Dark Mode e documentando a padronização dos componentes UI.

## 1. Problemas e Inconsistências Mapeados (Hardcoded Light Themes)
Foram encontradas diversas referências a temas claros mesclados no que deveria ser uma aplicação voltada ao suporte técnico (`dark mode first / exclusive`).

**Classes Encontradas:**
- Fundo e Componentes Brancos: `bg-white`, `bg-gray-50`, `bg-background-light`.
- Textos Escuros Incompatíveis com Fundo Escuro: `text-gray-400`, `text-gray-500`, `text-gray-700`, `text-gray-800`, `text-sigma-dark`.
- Bordas e Divisores Claros: `border-gray-100`, `border-gray-200`, `border-gray-300`.

**Telas e Componentes Afetados:**
- `ConversationList.tsx`, `ChatWindow.tsx`, `ContactSidebar.tsx` (Módulo da Inbox).
- `Tickets.tsx` (Página de chamados).
- `Login.tsx` (Página de login).
- `SigmaTopbar.tsx` e `Input.tsx`.

A abordagem falha especialmente nos itens com de sombra (`shadow-sm`, `shadow-xl`), bordas e contrastes no envio da bolha de mensagens originais (`bg-white` para recebidas/INBOUND).

## 2. Definição Base de Tokens de Tema Escuro
Para corrigir isso, vamos centralizar a padronização das cores em `tailwind.config.mjs` sem depender de tons abertos (`bg-gray-*`) de forma arbitrária. Em vez disso, focaremos em cores semânticas.

**Paleta Dark - Nova Estrutura (Proposta):**
- **Fondos (App/Surface):** 
  - `bg-app`: `#101622` (Background Principal, ex: Área externa do login, fundo raiz)
  - `bg-surface`: `#1E272E` (Fundo de Cards, Listas, topo das Conversas)
  - `bg-elevated`: `#242E35` (Input backgrounds, painéis elevados, bolha de chat)
- **Textos:**
  - `text-primary`: `#FFFFFF` ou `text-white`
  - `text-secondary` / `muted`: Textos auxiliares e timestamps (ex: `text-gray-400`).
- **Bordas / Linhas Mistas:**
  - Definidas via opacidade: `border-white/10`, `border-white/5` ou uma cor coesa como `border-sigma-dark`.
- **Primary / Acents:** 
  - Laranja: `#FF6600` (Ações afirmativas, botao enviar mensagem).
  - Ciano: `#00E5E5` (Tags, badges, status ativos).

## 3. Padrão para Chat Bubbles (Mensagens)
Atualmente há pouco contraste e clareza no estilo das conversas. O novo mapeamento será:
- **OUTBOUND (Atendente):** Mantém-se de certa forma o Accent (ex: Laranja ou Azul/Ciano esverdeado escuro) com texto branco. Cor atual sugerida `bg-primary`.
- **INBOUND (Cliente):** Sai do `bg-white`, vai para a superfície elevada do tema escuro: `bg-elevated` com texto claro (`text-gray-200`). Borda suave.
- **SYSTEM (Avisos):** Pode usar a cor transparente de fundo e letreiros amarelos/neutros que chamem a atenção de forma elegante.

## 4. O Que Faremos A Seguir
A reconstrução começará modificando o `tailwind.config.mjs`, criando aliases semânticos, refatorando UI de botão e formulário (`Input`, `Select`) caso necessário, e removendo `bg-white` dos componentes da Inbox.
