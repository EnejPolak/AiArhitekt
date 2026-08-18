# DESIGN.md — AI Architect UI source of truth

Read this before substantial UI changes.

AI Architect should feel like **professional architecture software + premium modern SaaS**, not a crypto landing page or a generic AI chatbot.

Landing may use selective visual craft. The **dashboard and renovation flows must stay calm, fast, and trustworthy**.

---

## Principles

1. Visual clarity over decoration
2. Architectural imagery gets the most space
3. Trustworthy information (sourced prices, sourced legal)
4. Minimal cognitive load; progressive disclosure
5. Predictable navigation
6. Fast perceived performance (skeletons, real job states)
7. Subtle motion; respect `prefers-reduced-motion`
8. One design language — do not mix shadcn, Carbon, and Magic UI looks

---

## Current implementation notes

- Font: **Manrope** (`--font-manrope`).
- Product chrome is **near-black**: `--background` `#0D0D0F`.
- Product accent (canonical): teal `--primary` `#00C9B1` with `--primary-foreground` `#04110F`.
- Marketing landing may still use a brighter teal `#00E6CC` on legal/cookie CTAs. Do not mix `#007AFF` into product UI.
- Tokens live in `app/globals.css` `:root` as **full CSS colors** (not HSL channel tuples). Tailwind maps `theme.extend.colors` to `var(--*)`.
- Shared primitives (`Button`, app chrome) use semantic classes (`bg-primary`, `bg-background`). Older marketing/legal screens still have raw hex; migrate when those files are touched.

---

## Color tokens

Use CSS variables + Tailwind semantic names (`bg-background`, `text-foreground`, `bg-primary`). Do **not** wrap as `hsl(var(--background))` — values are already complete colors.

| Token | Role | Canonical (dark product) |
| --- | --- | --- |
| `--background` | Page / app chrome | `#0D0D0F` |
| `--foreground` | Primary text | `#E8E8EA` |
| `--heading` | Headings | `#FFFFFF` |
| `--surface` | App surface | `#0D0D0F` |
| `--surface-muted` | Recessed surface | `#141416` |
| `--card` / `--card-foreground` | Cards | `rgba(255,255,255,0.03)` / `#E8E8EA` |
| `--primary` / `--primary-foreground` | CTA / focus | `#00C9B1` / `#04110F` |
| `--secondary` / `--secondary-foreground` | Secondary fill | `rgba(255,255,255,0.06)` / `#E8E8EA` |
| `--muted` / `--muted-foreground` | Quiet fill / secondary text | `rgba(255,255,255,0.06)` / `rgba(255,255,255,0.60)` |
| `--accent` / `--accent-foreground` | Same family as primary | `#00C9B1` / `#04110F` |
| `--border` | Hairline | `rgba(255,255,255,0.08)` |
| `--input` | Input border | `rgba(255,255,255,0.14)` |
| `--ring` | Focus ring | `rgba(0,201,177,0.60)` |
| `--success` | Positive | `#3D9A6A` |
| `--warning` | Caution | `#D4A017` |
| `--destructive` | Errors | `#E5484D` |
| `--radius` | Default radius | `12px` |

Landing radial wash (`#1b1b1b` → `#000`) is allowed on marketing `html` only. App workspace: `bg-background` (`#0D0D0F`), no giant gradients.

**Do not:** random accent per page, glowing borders, particles, huge gradients in `/app`, or iOS blue `#007AFF`.

---

## Typography

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Display / H1 | 28–40px (clamp) | 700–800 | -0.02em |
| H2 | 22–28px | 650–700 | -0.01em |
| Body | 15–16px | 400–500 | 0 |
| Label | 13–14px | 500 | 0.02em |
| Caption | 12px | 400 | 0 |

Line height: headings 1.1–1.2; body 1.6. Color: headings `#fff`; body `#c9c9c9` / muted 70%.

---

## Spacing, width, radius, shadow

**Spacing scale (4px):** 4, 8, 12, 16, 24, 32, 48, 64, 96. No one-off `17px` / `23px`.

**Page widths:** marketing container max `1400px` (existing Tailwind `container.2xl`). App: full viewport, sidebar + workspace.

**Content width:** forms ~420px; reading legal ~720px; render stage: remaining viewport.

**Radius:** `--radius: 12px`. Cards 12–16px. Full pills only for chips, not giant cards.

**Shadows:** one elevation: `0 24px 80px rgba(0,0,0,0.35)` for dialogs. No stacked neon shadows in product UI.

**Borders:** 1px `var(--border)`.

---

## Icons

Lucide only. Size 16 or 20 in UI chrome; 24 for empty states. Stroke default. Icons support labels; do not replace critical text.

---

## Components (shadcn-first)

Primary primitives: Button, Input, Textarea, Select, Dialog/Sheet, Tabs, Card, Badge, Progress, Skeleton, Toast, Form, Table, Dropdown, Tooltip.

Origin UI / Magic UI / React Bits: **copy one pattern at a time**, restyle to these tokens. Never a second theme.

### Buttons

- Primary: solid primary, height 44–48px, radius 12px, font-semibold.
- Secondary: transparent + border.
- Ghost: no border.
- Destructive: destructive token.
- Focus: 2px ring, offset 2px.
- Disabled: opacity 50%, no pointer.

### Forms

Height 48px inputs. Labels above fields. Errors under field, not only toast. Legal/permit forms: one question per step when possible.

### Cards

Quiet surface + border. Image first for renders/products. Price always with currency and source URL if known.

### Modals / sheets

Desktop: dialog centered. Mobile: drawer / bottom sheet. Escape + focus trap required (Radix via shadcn).

---

## Motion

Library: Motion (`framer-motion` already installed).

Use for: dialog enter, sheet, result reveal, before/after, progress between AI states.

Durations: 150ms micro, 250ms panel, 400ms result reveal. Easing: `ease-out`. Avoid bouncy springs.

**AI processing sequence (product):** Upload → Analyzing → Detecting rooms → Understanding structure → Preparing concept → Generating result.

Honor:

```css
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

---

## Loading, empty, error, success

Every critical flow: **loading / empty / success / error / retry**. Never an endless spinner.

- Loading: skeleton matching layout; optional short status text.
- Empty: one sentence + one action.
- Error: what failed + retry. No raw stack traces.
- Success: quiet confirmation, not confetti.

---

## Images and renders

Renders are first-class. Prefer large stage, dark surround, no heavy chrome overlay. Before/after: slider or toggle, not auto-playing glow.

Optimize with `next/image` where URLs allow. Generated data-URLs: document size limits.

---

## Responsive

- Desktop: multi-panel allowed (sidebar + conversation + preview).
- Tablet/mobile: drawers, tabs, bottom sheets. Do not shrink the desktop layout.

Breakpoints: default Tailwind (`sm` 640, `md` 768, `lg` 1024, `xl` 1280).

---

## Accessibility

Semantic HTML, keyboard, visible focus, labelled controls, contrast on muted text (avoid 40% white on black for body), `aria-busy` on AI states, accessible dialogs, reduced motion.

---

## Landing vs app

| | Landing | App (`/app`) |
| --- | --- | --- |
| Motion | Selective hero / how-it-works | Status and result only |
| Effects | One hero visual | None decorative |
| Density | Marketing sections | Conversation + tools |

---

## Hierarchy for architectural content

1. Image / plan / render  
2. Decision (style, budget, pick)  
3. Facts (price, URL, jurisdiction)  
4. Explanation (AI prose)  
5. Debug JSON (api-debug only)

---

## References (do not install as a visual system)

Google Labs DESIGN.md structure, Primer token *shape*, Radix Themes states, Carbon density for complex forms, USWDS for legal form UX. Adapt to **this** file’s tokens only.
