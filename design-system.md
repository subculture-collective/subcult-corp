# SUBCORP — Design System

> Dracula x Catppuccin Mocha hybrid. Dark, atmospheric, technical.
> All UI development must follow this specification.

---

## Color Tokens

All colors are defined in `src/app/globals.css` via `@theme inline`. Use Tailwind classes referencing these tokens — never hardcode hex values.

### Background Scale

| Token   | Hex       | Usage                          |
| ------- | --------- | ------------------------------ |
| `void`  | `#11111b` | Page background, deepest layer |
| `soot`  | `#181825` | Sidebar / nav background       |
| `ash`   | `#1e1e2e` | Elevated surfaces              |
| `smoke` | `#313244` | Borders, dividers              |
| `fog`   | `#45475a` | Scrollbar thumbs, muted UI     |
| `mist`  | `#585b70` | Hover states on muted elements |

### Text Scale

| Token   | Hex       | Usage                      |
| ------- | --------- | -------------------------- |
| `dust`  | `#6c7086` | Disabled text, placeholder |
| `stone` | `#7f849c` | Tertiary text              |
| `bone`  | `#bac2de` | Secondary text             |
| `chalk` | `#cdd6f4` | Primary body text          |
| `glow`  | `#f5e0dc` | Highlighted/featured text  |

### Accent Colors

| Name                 | Primary   | Dim       | Deep      | Usage                         |
| -------------------- | --------- | --------- | --------- | ----------------------------- |
| **Static** (green)   | `#50fa7b` | `#a6e3a1` | `#40c463` | Active/online states, success |
| **Scan** (purple)    | `#cba6f7` | `#bd93f9` | `#9d7cd8` | Primary accent, links         |
| **Signal** (pink)    | `#ff79c6` | `#f5c2e7` | `#eb6aae` | CTA, important actions        |
| **Flicker** (orange) | `#ffb86c` | `#fab387` | `#e89b5a` | Warnings, warm accents        |

### Supporting Colors

Cyan (`#8be9fd`), Yellow (`#f1fa8c`), Red (`#ff5555`), Blue (`#89b4fa`), Lavender (`#b4befe`), Teal (`#94e2d5`).

Use via Tailwind: `text-cyan`, `bg-red`, `border-lavender`, etc.

---

## Typography

### Font Stack

| Token            | Family            | Usage                         |
| ---------------- | ----------------- | ----------------------------- |
| `--font-sans`    | Geist Sans        | UI text (default body font)   |
| `--font-mono`    | Geist Mono        | Code, data values, timestamps |
| `--font-display` | Oswald            | Large headlines, hero text    |
| `--font-body`    | Libre Baskerville | Long-form prose (rarely used) |

Fonts are loaded via `next/font/local` in root `layout.tsx`. Never import fonts in individual pages.

### Text Styles

| Style             | Classes                                                     | When to use                    |
| ----------------- | ----------------------------------------------------------- | ------------------------------ |
| **Page title**    | `text-2xl font-bold tracking-tight`                         | H1 on content pages            |
| **Hero title**    | `text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight` | Landing page only              |
| **Section label** | `text-[10px] uppercase tracking-[0.2em] text-zinc-600`      | Eyebrow above sections         |
| **Body**          | `text-sm text-zinc-400 leading-relaxed`                     | Paragraph text                 |
| **Caption**       | `text-xs text-zinc-500`                                     | Metadata, timestamps           |
| **Micro**         | `text-[11px] text-zinc-500`                                 | Agent descriptions, fine print |

---

## Spacing & Layout

### Content Width

Use a single canonical max-width per page type:

| Page type                    | Max width | Tailwind class                                       |
| ---------------------------- | --------- | ---------------------------------------------------- |
| Content pages (learn, about) | 896px     | `max-w-4xl`                                          |
| Landing page sections        | 896px     | `max-w-4xl` (default), `max-w-5xl` (agent grid only) |
| Dashboard (stage)            | 1152px    | `max-w-6xl`                                          |
| Narrow focus (live, sanctum) | 768px     | `max-w-3xl`                                          |

### Section Spacing

| Context           | Padding       | Class       |
| ----------------- | ------------- | ----------- |
| Landing sections  | 64px vertical | `py-16`     |
| Content page main | 40px vertical | `py-10`     |
| Compact sections  | 48px vertical | `py-12`     |
| Dashboard         | 24px vertical | `space-y-6` |

### Section Dividers

Always `border-t border-zinc-800`. No other divider styles.

---

## Components

### Card

The canonical card pattern:

```
rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-lg
```

| Variant     | Additional classes                        | Usage                                    |
| ----------- | ----------------------------------------- | ---------------------------------------- |
| Interactive | `hover:border-zinc-700 transition-colors` | Clickable cards, links                   |
| Static      | (none)                                    | Display-only panels (verdict, pros/cons) |
| Compact     | `rounded-lg px-3 py-1.5`                  | Chips, tags, filter pills                |

### Button

| Variant         | Classes                                                                                                                                                                                              | Usage                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Primary**     | `rounded-lg bg-zinc-100 px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-white transition-colors shadow-lg shadow-zinc-100/10`                                                                 | Main CTA (1 per page max) |
| **Ghost**       | `rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60 hover:text-white transition-colors`                                                              | Secondary actions         |
| **Pill toggle** | `px-3 py-1.5 text-xs rounded-lg border transition-colors` active: `border-zinc-600 text-zinc-200 bg-zinc-800/60` inactive: `border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700` | Filters, view toggles     |

### Links

| Context     | Classes                                               |
| ----------- | ----------------------------------------------------- |
| Inline text | `text-zinc-400 hover:text-zinc-200 transition-colors` |
| Nav         | `text-zinc-500 hover:text-zinc-300 transition-colors` |
| External    | Add `target='_blank' rel='noopener noreferrer'`       |

**Convergence rule**: Hover target is always **2 steps lighter** on the zinc scale. `zinc-600 -> zinc-400`, `zinc-500 -> zinc-300`, `zinc-400 -> zinc-200`.

### Badge / Category Label

```
inline-block rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500
```

---

## Shadows

| Token           | Value                                | Usage            |
| --------------- | ------------------------------------ | ---------------- |
| `shadow-lg`     | Tailwind default                     | Cards            |
| `shadow-glow`   | `0 0 20px rgba(255, 121, 198, 0.3)`  | Signal/pink glow |
| `shadow-scan`   | `0 0 30px rgba(203, 166, 247, 0.25)` | Purple glow      |
| `shadow-static` | `0 0 15px rgba(80, 250, 123, 0.25)`  | Green glow       |
| `shadow-hard`   | `4px 4px 0 rgba(17, 17, 27, 0.9)`    | Brutalist effect |

---

## Animation

### Allowed Animations

| Name               | Duration | Easing      | Usage                  |
| ------------------ | -------- | ----------- | ---------------------- |
| `fadeIn`           | 300ms    | ease-out    | Component entrance     |
| `slide-in`         | 250ms    | ease-out    | List item entrance     |
| `skeleton-pulse`   | 2s       | ease-in-out | Loading skeleton       |
| `blink`            | 800ms    | step-end    | Cursor blink           |
| CSS `animate-ping` | —        | —           | Status indicators only |

### Rules

- `prefers-reduced-motion: reduce` is respected globally (already in `globals.css`)
- Continuous animation (`animate-ping`, `animate-spin`) only for loading/status indicators — never decorative
- All entrance animations use `ease-out`. Exit animations use `ease-in`
- Max animation duration: 300ms for UI transitions

---

## Accessibility

### Contrast

Dark-on-dark requires careful contrast. Minimum ratios:

| Element                              | Minimum          | Current status                      |
| ------------------------------------ | ---------------- | ----------------------------------- |
| Body text (`zinc-400` on `#11111b`)  | 4.5:1            | ~7.5:1 (pass)                       |
| Muted text (`zinc-500` on `#11111b`) | 4.5:1            | ~5.3:1 (pass)                       |
| Labels (`zinc-600` on `#11111b`)     | 3:1 (large text) | ~3.4:1 (pass — large text only)     |
| Micro text (`text-[10px]`)           | N/A              | Decorative labels only — acceptable |

### Focus & Keyboard

- All interactive elements must be keyboard-navigable
- Use `transition-colors` on hover states (already standard)
- External links: always include `aria-label` when icon-only

---

## Page Structure

### Standard Content Page

```
<div class="min-h-screen bg-[#11111b] text-zinc-100">
  <header class="border-b border-zinc-800">
    <div class="max-w-4xl mx-auto px-4 py-4">...</div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-10">
    {children}
  </main>
  <footer class="border-t border-zinc-800 py-6">
    <p class="text-center text-[10px] text-zinc-700">
      SUBCORP · multi-agent command center
    </p>
  </footer>
</div>
```

### Footer

Use a minimal footer consistently. Full social links only on landing page. All other pages use:

```
<footer class="border-t border-zinc-800 py-6">
  <p class="text-center text-[10px] text-zinc-700">
    SUBCORP · multi-agent command center
  </p>
</footer>
```

---

## Responsive

### Breakpoints (Tailwind defaults)

| Prefix | Width | Significance |
| ------ | ----- | ------------ |
| `sm:`  | 640px | Tablet portrait — grids expand (2→4 col), tab bars settle |
| `md:`  | 768px | Sidebar flips from top scroll bar to fixed left rail |
| `lg:`  | 1024px | Expanded grids (4-col Kanban, split panes) |

### Touch Targets

- Minimum **44px** tap area on mobile (WCAG / Apple HIG)
- Pattern: `py-2 sm:py-1` on buttons — mobile gets larger padding, desktop stays compact
- Interactive rows: minimum `py-2.5` on mobile

### Responsive Patterns

| Situation | Pattern |
| --------- | ------- |
| Tab bars | Always wrap in `overflow-x-auto scrollbar-none` container; add `shrink-0` to buttons |
| Tables with 4+ columns | `hidden sm:block` table + `sm:hidden` card list |
| Toolbars with 4+ actions | Hide secondary actions on mobile; show via `sm:hidden` overflow menu (three-dot) |
| Button labels | Icon-only on mobile (`<span className='hidden sm:inline'>Label</span>`) when space is tight |
| Fixed-height scrollable areas | Cap at `75vh` on mobile to leave room for browser chrome |
| Sidebar | `hidden md:flex` desktop rail + `md:hidden` sticky top bar; gradient mask on mobile edges |
| Grids | Mobile-first: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` |

### Test Widths

- **320px** — iPhone SE (smallest common)
- **375px** — iPhone 12/13/14
- **414px** — iPhone Plus / Android large
- **768px** — iPad portrait (sidebar flip)
- **1024px** — iPad landscape / small laptop
- **1440px** — Desktop (primary target)

---

## File Reference

| File                           | Purpose                               |
| ------------------------------ | ------------------------------------- |
| `src/app/globals.css`          | All color tokens, shadows, animations |
| `src/app/layout.tsx`           | Font loading, root metadata           |
| `src/app/learn/components.tsx` | Shared learn section components       |
| `design-system.md`             | This file — source of truth           |
