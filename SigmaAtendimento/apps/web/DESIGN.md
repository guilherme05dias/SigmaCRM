# Sigma Design System

## Direção visual

O frontend usa o **Sigma Design System**, um sistema próprio que combina a familiaridade operacional do WhatsApp Web com a densidade produtiva de ferramentas como Airtable: claro, restrito em cor e focado em leitura rápida. A identidade visual é construída sobre preto, roxo e branco.

O design deve parecer uma ferramenta confiável de trabalho, não uma landing page. A interface serve ao atendimento, CRM e visitas técnicas.

## Tecnologia

- React 18.
- Vite.
- Tailwind CSS.
- CSS Custom Properties para tokens.
- Dark mode por classe `.dark`.
- Ícones via `lucide-react`, centralizados em `components/ui/Icon.tsx`.
- Componentes próprios em `components/ui`.

## Tipografia

Fonte principal:

- `Plus Jakarta Sans`
- fallback: `system-ui`, `sans-serif`

Uso:

- mesma família para títulos, corpo, botões e dados;
- títulos com peso forte, sem exagero;
- labels compactas e consistentes;
- evitar display typography em controles de produto.

## Tokens principais

Os tokens vivem em `src/index.css` e são expostos ao Tailwind em `tailwind.config`.

### Superfícies

- `background`: fundo geral do app.
- `surface`: cards, painéis e formulários.
- `surface-alt`: áreas secundárias, filtros, blocos internos.
- `elevated`: superfícies elevadas.
- `border`: divisórias e contornos.

### Conteúdo

- `foreground`: texto principal.
- `muted-foreground`: texto secundário.

### Marca

Base da identidade:

- preto: `#000000`
- roxo: `#6d28d9`
- branco: `#ffffff`

Light mode:

- primary/link: `#5b21b6`
- primary-solid: `#6d28d9`
- accent: `#7c3aed`

Dark mode:

- primary/link: `#c4b5fd`
- primary-solid: `#6d28d9`
- accent: `#a78bfa`

Uso do roxo:

- ações primárias;
- estado ativo;
- foco;
- links;
- pequenas indicações de navegação.

Não usar roxo como decoração gratuita em grandes áreas. Preto e branco estruturam a interface; o roxo indica ação, seleção, foco e vínculo. Verde é reservado para sucesso; laranja para aviso; vermelho para erro ou ação destrutiva.

`primary` é usado em texto, foco e seleção. `primary-solid` é usado como fundo de botão para manter contraste AA nos dois temas.

## Status semânticos

O sistema usa tons `soft` para estados:

- `success`
- `warning`
- `danger`
- `info`

Esses tons aparecem em badges, alertas e feedbacks. O contraste deve continuar legível em light e dark mode.

## Componentes base

Componentes já existentes e preferenciais:

- `Button`
- `Badge`
- `StatusBadge`
- `PriorityBadge`
- `EmptyState`
- `Skeleton`
- `Icon`
- `ThemeToggle`
- `SigmaSidebarIcon`

Ao criar novas telas, preferir estes componentes antes de inventar novos padrões.

## Layout

Estrutura predominante:

- sidebar fixa no desktop e bottom nav no mobile;
- área principal com `max-w-container` ou `max-w-[1440px]`;
- cards com `rounded-xl` ou `rounded-2xl`;
- borda `border-border`;
- painéis principais sem sombra decorativa, separados por superfície e borda;
- grid responsivo para dashboards e filtros.

### Modelo estrutural do inbox

O inbox usa o WhatsApp Web como referência de organização e comportamento, sem copiar sua identidade visual:

- desktop: lista de conversas à esquerda, conversa ativa ao centro e informações do contato à direita;
- tablet: lista e conversa dividem a área útil; o painel de contato fica oculto;
- mobile: lista e conversa alternam em tela cheia, com retorno explícito para a lista;
- cabeçalho da conversa permanece fixo;
- histórico de mensagens ocupa a área flexível e rolável;
- compositor de mensagem permanece fixo na base e respeita a safe area;
- mensagens recebidas ficam à esquerda e mensagens enviadas à direita;
- a navegação, as ações de CRM e a identidade preto/roxo/branco continuam próprias do Sigma.

`apps/web/DESIGN.md` é a única fonte de verdade do Design System. Documentos históricos de paletas anteriores não devem ser recriados ou usados como referência.

Evitar:

- nested cards excessivos;
- sombras grandes com bordas decorativas;
- brilhos coloridos em cards, logotipos ou botões;
- cards com raio maior que `rounded-2xl`, salvo elementos especiais da navegação;
- gradientes decorativos;
- glassmorphism.

Sombras profundas são reservadas a elementos realmente suspensos, como modais e menus. Cards, métricas e botões usam acabamento plano, bordas precisas e contraste de superfície para sustentar a direção premium/luxury.

## Formulários

Campos devem usar:

- altura padrão `h-11`;
- `rounded-lg`;
- `border border-border`;
- `bg-surface`;
- foco com `focus:border-primary` e `focus:ring-2 focus:ring-primary/30`.

Labels:

- texto curto;
- geralmente `text-sm font-medium`;
- filtros podem usar `text-xs uppercase tracking-wider`.

## Tabelas e listas

Tabelas são apropriadas para chamados, clientes e relatórios.

Listas/cards são apropriados para:

- visitas da semana;
- próximos atendimentos;
- timeline;
- histórico de alterações.

Cada item clicável deve ter hover discreto:

- `hover:bg-surface-alt`
- ou `hover:border-primary/40`.

## Estados vazios e loading

- Usar `Skeleton` para carregamento de conteúdo.
- Usar `EmptyState` quando não houver registros.
- Empty states devem explicar o próximo passo possível, não apenas dizer “sem dados”.

## Motion

Motion deve ser discreta:

- transições de cor e hover;
- duração curta;
- sem sequências animadas de entrada.

O CSS global já respeita `prefers-reduced-motion`.

## Padrão de tom da interface

Idioma: português do Brasil.

Tom:

- direto;
- operacional;
- claro;
- sem floreio.

Exemplos:

- “Criar chamado”
- “Finalizar atendimento”
- “Data combinada”
- “Motivo da alteração de agenda”
- “Técnico não definido”

## Painel de visitas

O painel de visitas deve usar:

- calendário semanal simples;
- lista de próximas visitas;
- filtros por técnico e status;
- badges de status;
- link para detalhe do chamado.

Status da visita:

- Pendente
- Agendada
- Em atendimento
- Concluída
- Cancelada

## Checklist antes de entregar UI

- TypeScript sem erro.
- Build sem erro.
- Layout responsivo no desktop e mobile.
- Componentes alinhados ao Sigma Design System.
- Dark mode não quebrado por cores hardcoded inadequadas.
- Labels e mensagens em português.
- Estados vazios e loading tratados.
