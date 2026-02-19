# Plan: Stage Dashboard Responsiveness

## Audit Summary

**Overall: Fair.** The structural layout is good — sidebar flips between desktop rail and mobile scroll bar, main content uses `flex-col md:flex-row`, landing/learn pages are properly responsive. But the interior views have real problems: overflowing tab bars, a table that forces horizontal scroll, toolbar buttons that pile up, and touch targets that are consistently too small (~28-30px vs the 44px minimum).

---

## Critical Issues

| # | Issue | File | Line |
|---|---|---|---|
| C1 | CostTracker table `min-w-[480px]` forces horizontal scroll on phones | `CostTracker.tsx` | 284 |
| C2 | ContentPipeline skeleton hardcoded `grid-cols-4` (should match actual grid) | `ContentPipeline.tsx` | 193 |
| C3 | AgentDesigner 6-tab filter bar `w-fit` with no overflow handling | `AgentDesigner.tsx` | 569 |
| C4 | EventLogFeed inner `FeedTabs` bar has no `overflow-x-auto` | `EventLogFeed.tsx` | 520 |
| C5 | 3D Office fullscreen button `text-[10px] px-1.5 py-0.5` — ~18px touch target | `Office3DScene.tsx` | 346 |
| C6 | TranscriptViewer toolbar accumulates 6+ buttons at `text-[10px]` in one row | `TranscriptViewer.tsx` | 295 |

## What Already Works

- Sidebar dual layout (`hidden md:flex` rail + `md:hidden` sticky scroll bar)
- Main layout `flex-col md:flex-row` with `md:ml-36` offset
- StageHeader stats grid `grid-cols-2 sm:grid-cols-4`
- ContentPipeline Kanban `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- FileBrowser split-pane `grid-cols-1 lg:grid-cols-2`
- TranscriptViewer text: `overflow-x-hidden break-words`
- Landing page and Learn page — fully responsive
- AskTheRoom — full-width collapsible, works on touch

---

## Implementation Plan

### Batch 1 — Quick Wins (skeleton, overflow, tab bars)

**1.1 — ContentPipeline skeleton: match actual grid breakpoints**

`ContentPipeline.tsx:193` — Change `grid grid-cols-4` to `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

**1.2 — AgentDesigner tab bar: add horizontal scroll**

`AgentDesigner.tsx:569` — Add `overflow-x-auto` to the tab container div. Optionally add `scrollbar-none` for cleaner mobile look.

**1.3 — EventLogFeed FeedTabs: add horizontal scroll**

`EventLogFeed.tsx:520` — Add `overflow-x-auto` to the inner `FeedTabs` container div so the pill bar scrolls when it exceeds viewport width.

**1.4 — Office3DScene controls hint: hide on mobile**

`Office3DScene.tsx:405` — Add `hidden sm:block` to the "Drag to rotate" hint. Touch users get OrbitControls defaults (pinch-zoom, one-finger orbit) which work without instruction.

---

### Batch 2 — CostTracker Table Mobile Treatment

**Problem:** `min-w-[480px]` table with 6 columns forces scroll on phones.

**Solution:** Below `sm:`, switch from table to stacked cards. Each row becomes a card showing Model, Cost, Tokens, etc. vertically.

```
┌─────────────────────────────┐
│  Desktop (sm:+)             │
│  ┌─────────────────────────┐│
│  │ Model │ Cost │ Tkn │ ...││
│  │ gpt-4 │ $0.12│ 4.2k│   ││
│  └─────────────────────────┘│
│                             │
│  Mobile (<sm:)              │
│  ┌─────────────────────────┐│
│  │ gpt-4o                  ││
│  │ Cost: $0.12 · Tkn: 4.2k││
│  │ Calls: 18 · Avg: $0.007││
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ claude-sonnet            ││
│  │ ...                     ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

**Changes:**
- `CostTracker.tsx` — render `<table>` inside `hidden sm:block`, render card list inside `sm:hidden`
- Remove `min-w-[480px]` from the table (it's only shown on sm:+ now anyway)

---

### Batch 3 — TranscriptViewer Toolbar Collapse

**Problem:** Up to 6 buttons (Replay, Play/Stop/Resume, Download/Generate/Regenerate MP3, Print, Close) in a single `flex gap-2` row. On mobile this overflows.

**Solution:** Group secondary actions behind an overflow menu on mobile.

```
Desktop:  [Replay] [Play All] [Download MP3] [Generate MP3] [Print] [×]
Mobile:   [Play All] [Download MP3] [···] [×]
                                      └── Replay, Print, Generate
```

**Changes:**
- `TranscriptViewer.tsx` — wrap Replay + Print in a `hidden sm:flex` container
- Add a `sm:hidden` overflow button (three dots) that toggles a dropdown with Replay + Print
- Keep the primary audio action (Play/Generate/Download) and Close always visible
- Increase button touch targets on mobile: `py-1 → sm:py-1 py-2`

---

### Batch 4 — Touch Targets (Pervasive)

**Problem:** Nearly all interactive elements use `text-[10px] px-2 py-1` yielding ~28-30px height. WCAG and Apple HIG recommend 44px minimum.

**Strategy:** Don't redesign — just increase vertical padding on mobile via responsive classes. Desktop keeps the compact look.

**Pattern:**
```
Before: className='px-2 py-1 text-[10px]'
After:  className='px-2 py-2 sm:py-1 text-[10px]'
```

**Files to update:**

| File | Elements |
|---|---|
| `StageSidebar.tsx` | Mobile nav buttons (`px-2.5 py-1.5` → `py-2.5 sm:py-1.5`) |
| `StageHeader.tsx` | Navigation buttons, stat cards |
| `EventLogFeed.tsx` | `FeedTabs` buttons, filter row |
| `TranscriptViewer.tsx` | Per-turn speak buttons, toolbar buttons |
| `AgentDesigner.tsx` | Tab buttons, vote/action buttons |
| `Office3DScene.tsx` | Fullscreen button (`px-1.5 py-0.5` → `px-3 py-2 sm:px-1.5 sm:py-0.5`) |
| `QuestionsView.tsx` | Card action buttons |
| `AskTheRoom.tsx` | Submit button |

---

### Batch 5 — Sidebar Polish

**5.1 — Scroll active item into view**

`StageSidebar.tsx` — When the mobile scroll bar mounts, `scrollIntoView({ inline: 'center' })` on the active view button. Currently if you're on "archaeology" (last item) and reload, the active pill is off-screen with no visual hint.

**5.2 — Fade affordance on edges**

Add gradient masks on left/right edges of the mobile nav scroll container to signal more items exist. CSS: `mask-image: linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)`.

---

### Batch 6 — Design System Documentation

Add a `## Responsive` section to `design-system.md`:

```markdown
## Responsive

### Breakpoints (Tailwind defaults)
- `sm:` 640px — tablet portrait
- `md:` 768px — sidebar switches from top bar to rail
- `lg:` 1024px — expanded grids (4-col Kanban, split panes)

### Touch Targets
- Minimum 44px tap area on mobile (use `py-2 sm:py-1` pattern)
- Interactive rows: minimum `py-2.5` on mobile

### Patterns
- Tab bars: always wrap in `overflow-x-auto` container
- Tables with 4+ columns: card layout below `sm:`
- Toolbars with 4+ actions: overflow menu below `sm:`
- Fixed-height scrollable areas: cap at `75vh` on mobile
```

---

## File Summary

| File | Batch | Change |
|---|---|---|
| `ContentPipeline.tsx` | 1 | Fix skeleton grid breakpoints |
| `AgentDesigner.tsx` | 1, 4 | Add tab overflow scroll + touch targets |
| `EventLogFeed.tsx` | 1, 4 | Add FeedTabs overflow scroll + touch targets |
| `Office3DScene.tsx` | 1, 4 | Hide desktop hint on mobile + enlarge fullscreen button |
| `CostTracker.tsx` | 2 | Card-based mobile layout for model table |
| `TranscriptViewer.tsx` | 3, 4 | Toolbar overflow menu + touch targets |
| `StageSidebar.tsx` | 4, 5 | Touch targets + scroll-into-view + fade affordance |
| `StageHeader.tsx` | 4 | Touch targets |
| `QuestionsView.tsx` | 4 | Touch targets |
| `AskTheRoom.tsx` | 4 | Touch targets |
| `design-system.md` | 6 | Document responsive patterns |

## Verification

Test at these widths (Chrome DevTools device toolbar):
- **320px** — iPhone SE, smallest common phone
- **375px** — iPhone 12/13/14
- **414px** — iPhone Plus / Android large
- **768px** — iPad portrait (sidebar flip point)
- **1024px** — iPad landscape / small laptop
- **1440px** — desktop (current primary target)

Per-batch checklist:
- [ ] No horizontal page-level scroll at any width
- [ ] All tab bars scroll or wrap without clipping
- [ ] Tables readable without horizontal scroll on mobile
- [ ] All buttons/links have >= 44px tap area on mobile
- [ ] Active sidebar item visible on load
- [ ] Toolbar buttons accessible (no overflow clipping)
