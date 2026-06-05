# 🎨 Sigma Design System v2.0

O Sigma Atendimento utiliza um padrão visual limpo, corporativo e sutilmente estético (influência Glassmorphism/Neumorphism e cores sólidas vibrantes de alta conversão). A biblioteca foi moldada sobre o Tailwind CSS.

## Tokens 

### Cores (Colors)
* `bg-primary`/`text-primary`: **#FF6600** (Principal)
* `bg-sigma-dark` / `text-sigma-dark`: **#1E272E**
* `bg-dark-slate` / `text-dark-slate`: **#242E35**
* `bg-sigma-cyan` / `text-sigma-cyan`: **#00E5E5**
* `bg-background-light`: **#f6f6f8** (Fundo Padrão Claro)
* `bg-background-dark`: **#101622** (Fundo Padrão Escuro)
* `bg-white-alpha-10`: **rgba(255, 255, 255, 0.1)** (Bordas vítreas / Glassmorphism)
* `bg-cyan-glow`: **rgba(0, 229, 229, 0.4)**

### Tipografia (Font Family)
* `font-display`: **'Space Grotesk'**, sans-serif (Usado para Headers, Títulos, Call to Actions).
* `font-sans`: **'Inter'**, sans-serif (Usado para Parágrafos, Textos limpos, inputs, UI).

### Arrendondamentos (Border Radius)
* `rounded-default`: 4px
* `rounded-lg`: 8px
* `rounded-xl`: 12px
* `rounded-2xl`: 24px
* `rounded-cta`: 32px

### Sombras Reativas (Box Shadows)
* `shadow-premium`: 0 10px 15px -3px rgba(0, 0, 0, 0.1)
* `shadow-primary-glow`: 0 0 20px rgba(255, 102, 0, 0.2)
* `shadow-cyan-glow`: 0 0 15px rgba(0, 229, 229, 0.4)

### Espaçamento (Spacing)
* Container Max Width: `max-w-container` (1280px)
* Section Padding Y: `py-section-py` (128px)

---

## 🛠️ Componentes de UI Básicos
Todos os componentes essenciais (não vinculados à lógica de negócio) devem estar dentro de `/apps/web/src/components/ui/` e sempre extrair classes desse Design System (ex: `Button.tsx`, `Card.tsx`, `Input.tsx`, `PageContainer.tsx`).

### Exemplos Práticos:
```tsx
// Botão Primário:
<Button variant="primary">Entrar</Button>

// Card Básico com sombreamento Premium e cantos arredondados Extra Largos
<Card>
    <h2 className="font-display">Conteúdo</h2>
    <p className="font-sans">Lançamento Alpha</p>
</Card>

// Espaçador Global de Resolução:
<PageContainer>
    <Input placeholder="Qual seu nome?" />
</PageContainer>
```
