# LiveFlow Brand & Design System Guide
## Premium Silicon Valley Dark Theme — v0.2

---

## Vision: Premium Dark — Elevated Control Room

LiveFlow is the operating system for live streaming agencies. The visual language reflects professional precision: a **premium Silicon Valley aesthetic** that operators trust at 3am, managers scan in seconds, and creators know is built for their world.

Reference aesthetic: Linear, Vercel, Stripe, Arc, Raycast — premium dark, not utilitarian dark.

---

## Color Palette

### Foundation — Near-Black with Blue-Violet Undertone

The base is near-black with a deliberate cool blue-violet undertone. This creates visual depth and separates LiveFlow from pure-black "admin" aesthetics.

| Token                    | CSS Var                | Hex         | Use |
|--------------------------|------------------------|-------------|-----|
| Base                     | `--lf-bg-base`         | `#05060b`   | Page canvas (deepest layer) |
| Surface                  | `--lf-bg-surface`      | `#090b12`   | Cards, panels |
| Elevated                 | `--lf-bg-elevated`     | `#0d1018`   | Modals, dropdowns |
| Subtle                   | `--lf-bg-subtle`       | `#111520`   | Section dividers |
| Overlay                  | `--lf-bg-overlay`      | `#161c2a`   | Hover states |
| Glass                    | `--lf-bg-glass`        | `rgba(9,11,18,0.75)` | Topbar, modal overlays |

### Primary — Violet (LiveFlow Signature)

| Token                    | CSS Var                | Hex         | Use |
|--------------------------|------------------------|-------------|-----|
| Primary                  | `--lf-primary`         | `#6d35d4`   | CTAs, active nav |
| Primary Hover            | `--lf-primary-hover`   | `#8b58e8`   | Hover state |
| Primary Active           | `--lf-primary-active`  | `#5228b0`   | Pressed state |
| Primary Muted            | `--lf-primary-muted`   | `#180832`   | Tinted backgrounds |

### Accent — Cyan (Signal / Live)

| Token                    | CSS Var                | Hex         | Use |
|--------------------------|------------------------|-------------|-----|
| Accent                   | `--lf-accent`          | `#18c0e0`   | Accent buttons, live KPIs |
| Accent Hover             | `--lf-accent-hover`    | `#3dd4f0`   | Hover state |
| Accent Active            | `--lf-accent-active`   | `#1090b0`   | Pressed state |
| Accent Muted             | `--lf-accent-muted`    | `#011e28`   | Tinted backgrounds |

### Brand Gradients

| Name                     | CSS Var                     | Value |
|--------------------------|-----------------------------|-------|
| Brand (hero/display)     | `--lf-gradient-brand`       | `linear-gradient(135deg, #7c3aed 0%, #18c0e0 100%)` |
| Primary (buttons/CTA)    | `--lf-gradient-primary`     | `linear-gradient(135deg, #7c3aed 0%, #4f1fb8 100%)` |
| Accent (cyan actions)    | `--lf-gradient-accent`      | `linear-gradient(135deg, #18c0e0 0%, #0a6e8a 100%)` |
| Surface overlay          | `--lf-gradient-surface`     | Top-to-bottom white/4% → transparent |
| Ambient glow             | `--lf-gradient-glow`        | Radial violet at top |

### Borders

| Token                    | CSS Var                     | Hex                    |
|--------------------------|-----------------------------|------------------------|
| Faint                    | `--lf-border-faint`         | `#1d2436`              |
| Default                  | `--lf-border-default`       | `#273047`              |
| Strong                   | `--lf-border-strong`        | `#384059`              |
| Focus                    | `--lf-border-focus`         | `#8b58e8` (violet 400) |
| Glass                    | `--lf-border-glass`         | `rgba(255,255,255,0.08)` |

### Text

| Token                    | CSS Var                     | Hex         | Contrast on base |
|--------------------------|-----------------------------|-------------|------------------|
| Primary                  | `--lf-text-primary`         | `#cdd6e8`   | ~13:1            |
| Secondary                | `--lf-text-secondary`       | `#7a8ba6`   | ~5.4:1           |
| Muted                    | `--lf-text-muted`           | `#536076`   | ~3.2:1           |
| Disabled                 | `--lf-text-disabled`        | `#384059`   | ~2:1 (never info-bearing) |

### Status / Signal

| Token            | Hex         | Use |
|------------------|-------------|-----|
| `--lf-live`      | `#f87171`   | Live stream indicator (pulsing red dot) |
| `--lf-offline`   | `#384059`   | Offline / inactive state |
| `--lf-success`   | `#34d399`   | Stream healthy |
| `--lf-warn`      | `#fbbf24`   | Quality degraded |
| `--lf-danger`    | `#f87171`   | Stream error, danger action |

---

## Typography

**Primary Font**: Inter (variable) — loads from Google Fonts or self-hosted
**Mono Font**: JetBrains Mono — for all KPI values and technical data
**Display Font**: Inter variable with tight tracking for hero headings

### Type Scale

| Token  | px  | Line Height | Letter Spacing | Use |
|--------|-----|-------------|----------------|-----|
| `2xs`  | 10  | 14          | +0.06em        | Micro labels, caps |
| `xs`   | 11  | 16          | +0.04em        | Tooltips, secondary meta |
| `sm`   | 12  | 18          | +0.02em        | Badge labels, small caps |
| `base` | 14  | 22          | 0              | Default body |
| `md`   | 15  | 24          | -0.01em        | Card body |
| `lg`   | 16  | 26          | -0.01em        | Section headers |
| `xl`   | 18  | 28          | -0.02em        | Card titles |
| `2xl`  | 21  | 30          | -0.02em        | Page sub-headers |
| `3xl`  | 24  | 34          | -0.025em       | Page titles |
| `4xl`  | 30  | 40          | -0.03em        | KPI values |
| `5xl`  | 38  | 46          | -0.035em       | Hero KPIs |
| `6xl`  | 50  | 58          | -0.04em        | Display metrics |

Note: Negative letter-spacing on large sizes is critical for premium feel.
Always use `font-mono tabular-nums` for numeric KPI values.

---

## Border Radii

| Token   | px  | Use |
|---------|-----|-----|
| `xs`    | 3   | Badges (small) |
| `sm`    | 5   | Buttons (small), tags |
| `md`    | 8   | Buttons (medium), inputs |
| `lg`    | 10  | Buttons (large) |
| `xl`    | 14  | Cards, panels |
| `2xl`   | 18  | Modals, large containers |
| `3xl`   | 24  | Feature cards |
| `4xl`   | 32  | Hero cards |
| `full`  | 9999| Pills, avatars, status dots |

---

## Shadows & Glow

Glow effects are **reserved** for: active/live elements, primary CTA hover, live stream states.
Max 2 glowing elements visible simultaneously.

| Class                | Use |
|----------------------|-----|
| `shadow-glass`       | Glassmorphism panels (Topbar, modals) |
| `shadow-glow-primary`| Primary button hover, active nav item |
| `shadow-glow-primary-sm` | Subtle violet glow for nav active state |
| `shadow-glow-accent` | Live data panels, accent highlights |
| `shadow-glow-accent-sm` | Subtle cyan glow |
| `shadow-glow-success`| Success confirmations |
| `shadow-glow-danger` | Error states, critical alerts |
| `shadow-glow-brand`  | Hero sections only |

### Inset Highlight
All elevated cards receive `bg-gradient-card-top` — a 0–3% white gradient from top that simulates a subtle light source, making dark surfaces feel less flat.

---

## Glassmorphism

Use on sticky/fixed surfaces over content: Topbar, modals, drawers.

```
bg-bg-glass backdrop-blur-glass border border-border-glass shadow-glass
```

- Background: `rgba(9, 11, 18, 0.75)` — 75% opaque base color
- Blur: `16px` (CSS var `--lf-blur-glass`)
- Border: `rgba(255, 255, 255, 0.08)` — white at 8% for subtle edge definition
- Shadow: `shadow-glass` for depth and inner highlight

---

## Animation & Motion

All motion is **functional, not decorative**. Every transition serves a purpose.

| Duration   | ms  | Use |
|------------|-----|-----|
| `fast`     | 100 | Hover color changes, focus rings |
| `normal`   | 180 | Component state changes (shorter than v0.1 for snappier feel) |
| `slow`     | 300 | Panel reveals, sidebar expand |
| `slower`   | 500 | Page transitions |
| `slowest`  | 700 | Dramatic reveals |

### Easing Functions
- **`ease`** — default for most transitions
- **`spring`** (`cubic-bezier(0.34,1.56,0.64,1)`) — confirmations, success states, scale-in
- **`snappy`** (`cubic-bezier(0.2,0,0,1)`) — data updates, quick interactions
- **`smooth`** (`cubic-bezier(0.25,0.1,0.25,1)`) — panel slides

### Keyframe Animations
| Class                  | Duration | Use |
|------------------------|----------|-----|
| `animate-pulse-live`   | 1.8s     | Live stream status dot (exclusive use) |
| `animate-spin-lf`      | 0.9s     | Loading spinners |
| `animate-fade-in`      | 180ms    | Content appearing with slight Y offset |
| `animate-fade-in-up`   | 300ms    | Card/panel reveals |
| `animate-slide-in-left`| 180ms    | Sidebar items, notifications |
| `animate-scale-in`     | 180ms    | Modals, tooltips (spring easing) |
| `animate-glow-pulse`   | 3s       | Accent panel ambient glow |
| `animate-brand-glow`   | 3s       | Hero elements |
| `animate-shimmer`      | 2s       | Skeleton loading states |
| `animate-float`        | 3s       | Decorative hero elements |

---

## Responsive / Mobile-First

### Breakpoints
| Name | Width  | Use |
|------|--------|-----|
| `sm` | 640px  | Phone landscape / large phone |
| `md` | 768px  | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Wide desktop |
| `2xl`| 1536px | Ultra-wide |

### Sidebar Behavior
- **≥ md**: Fixed side rail, collapsible between 56px (icon) and 224px (full)
- **< md**: Removed from flow; replaced by bottom navigation bar (Sidebar component)
- Mobile bottom nav: glassmorphism strip with up to 5 icon+label items

### Touch Targets
Minimum 44×44px for all interactive elements on mobile (buttons, nav items, toggles).

### PageContainer
Use `<PageContainer maxWidth="xl">` as the outermost page wrapper. Provides consistent horizontal padding: `px-4 sm:px-6 lg:px-8`.

---

## Component Inventory

### Existing (restyled premium)
| Component    | Notes |
|--------------|-------|
| `ThemeProvider` | Sets `data-theme="dark"` |
| `Button`     | Gradient fills, micro-scale active, 5 variants |
| `Card`       | `bg-gradient-card-top` overlay, 4 variants, glow prop |
| `CardHeader` | Title / description / actions slots |
| `Badge`      | 7 variants, dot prop, 2 sizes |
| `StatusDot`  | 5 statuses, 3 sizes, pulse on live |
| `StatTile`   | Gradient accent bar, ambient corner glow, skeleton shimmer |
| `Sidebar`    | Desktop rail + mobile bottom nav |
| `Topbar`     | Glassmorphism, logo/title/left/center/right slots |
| `DataTable`  | Sorting, skeleton shimmer, empty state |
| `LiveTile`   | Stream preview card, glow-danger on live border |
| `Spinner`    | SVG-based, 5 sizes, 3 variants |

### New in v0.2
| Component      | Notes |
|----------------|-------|
| `Input`        | Label, description, error, hint, adornments, 3 sizes |
| `Textarea`     | Same as Input, resizable |
| `Avatar`       | Image / initials fallback, 5 sizes, 4 ring states |
| `AvatarGroup`  | Stacked avatars with overflow count |
| `Tabs`         | Root + List + Trigger + Content. 3 visual variants |
| `Toggle`       | Switch with gradient track, 3 sizes, label/description |
| `PageContainer`| Max-width wrapper with responsive horizontal padding |
| `Grid`         | Responsive grid with shorthand cols |
| `Stack`        | Flex container with consistent gap/alignment API |
| `Section`      | Page section with aria-label and spacing |

---

## Do

- Use the `--lf-*` CSS variables and Tailwind semantic classes — never hardcode hex values
- Layer surfaces: base → surface → elevated → overlay
- Apply `bg-gradient-card-top` to cards for the subtle surface highlight
- Use `bg-bg-glass backdrop-blur-glass border border-border-glass` for fixed/sticky panels
- Use `font-mono tabular-nums` for all numeric KPI values
- Ensure 44×44px minimum touch targets on interactive elements
- Use `PageContainer` + `Grid` + `Stack` for all layout (responsive by default)
- Test keyboard navigation and focus rings on every interactive element
- Limit glow effects to max 2 simultaneously visible

## Don't

- Don't use glow on more than 2 elements simultaneously
- Don't mix violet and cyan on the same interactive element — assign one role per component
- Don't use `text-text-muted` for informational content at small sizes (fails WCAG AA)
- Don't add animation inside DataTable cells (distracts during live updates)
- Don't use `bg-bg-base` as a card background — creates invisible boundaries
- Don't override `--lf-*` variables inside a component — patch at the theme level
- Don't use `animate-pulse-live` for anything other than confirmed live stream states
- Don't use hardcoded hex or RGB values — always use tokens

---

## Accessibility Checklist

- All interactive elements: `focus-visible:ring-2 ring-border-focus`
- Status indicators: `aria-label` on every `StatusDot`
- Toggles: `role="switch"` + `aria-checked`
- Tabs: `role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls`
- DataTable: `scope="col"` + `aria-sort` on sortable headers
- Loading states: `aria-busy` / `role="status"`
- Color is never the sole information carrier — pair with text/icon
- Minimum touch target: 44×44px on all mobile-visible interactive elements

---

## Token Quick Reference

```css
/* Backgrounds */      var(--lf-bg-base | surface | elevated | subtle | overlay | glass)
/* Borders */          var(--lf-border-faint | default | strong | focus | glass)
/* Text */             var(--lf-text-primary | secondary | muted | disabled | inverse)
/* Primary */          var(--lf-primary | hover | active | muted | fg)
/* Accent */           var(--lf-accent | hover | active | muted | fg)
/* Status */           var(--lf-success | warn | danger | live | offline)
/* Gradients */        var(--lf-gradient-brand | primary | accent | surface | glow)
/* Shadows */          var(--lf-shadow-sm | md | lg | xl | glass)
/* Glow */             var(--lf-glow-primary | accent | success | danger | brand)
/* Transitions */      var(--lf-duration-fast | normal | slow | slower)
/* Easing */           var(--lf-easing | spring | snappy | smooth)
/* Blur */             var(--lf-blur-sm | md | lg | xl | glass)
```
