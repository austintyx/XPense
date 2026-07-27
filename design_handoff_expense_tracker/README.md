# Handoff: Automated Expense Tracker (mobile app)

## Overview
A mobile app that logs spending automatically by parsing bank SMS alerts and emailed receipts, then lets the user
confirm/correct categories, see where money went, and stay on a savings goal. Four tabs — **Home**, **Summary**,
**Activity** (recent transactions), **Settings** — plus two pushed screens: **Quick sort** (categorise a queue of
unrecognised transactions) and **Circle** (friends / accountability, a later-phase feature shown in full).

Locale: Singapore, currency SGD (`S$`), amounts always 2dp with thousands separators.
Copy tone: warm, encouraging, never nagging.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that demonstrate the intended look,
layout, copy, and interaction behaviour. They are **not production code to lift directly**. The task is to
**recreate these designs in the target codebase's environment** (React Native, SwiftUI, Flutter, Jetpack Compose,
React web, etc.) using that codebase's established components, navigation, theming, and state patterns. If no
codebase exists yet, pick the framework most appropriate for the product (for a real shipping mobile app: React
Native/Expo or native SwiftUI + Kotlin) and implement the designs there.

`Spendly.dc.html` is a single-file streaming prototype: the markup is a template, and the logic lives in a
`class Component` block near the bottom of the file (search for `class Component extends DCLogic`). All data,
state, handlers, and computed styles are in that class — it is the best reference for behaviour.

## Fidelity
**High fidelity.** Colors, typography, spacing, radii, motion durations and copy are final-intent and specified
exactly below. Recreate pixel-faithfully, but substitute the codebase's existing primitives (button, list row,
sheet, toggle) where they already exist rather than rebuilding them.

Exception: option cards `1b`, `1c`, `1d`, `1e` inside the prototype are **exploration variants**, not the spec.
Only option **`1a`** — the interactive prototype inside the iPhone frame — is the design to build. The variants are
included for context on directions considered.

---

## Design Tokens

### Color
| Token | Value | Use |
|---|---|---|
| `canvas` | `#F6F4EF` | app background |
| `surface` | `#FFFFFF` | cards, list groups, sheets over canvas |
| `surface-sheet` | `#FBFAF7` | bottom sheet background |
| `ink` | `#1B1A17` | primary text, dark cards, primary button |
| `ink-70` | `rgba(27,26,23,.70)` | calendar cell text |
| `ink-55` | `rgba(27,26,23,.55)` | secondary text |
| `ink-50 / 48 / 45` | `rgba(27,26,23,.50 / .48 / .45)` | tertiary text |
| `ink-42` | `rgba(27,26,23,.42)` | mono eyebrow labels |
| `ink-38` | `rgba(27,26,23,.38)` | inactive tab icon |
| `ink-16` | `rgba(27,26,23,.16)` | toggle track (off), sheet grabber |
| `ink-14` | `rgba(27,26,23,.14)` | input + pill borders |
| `hairline` | `rgba(27,26,23,.06–.08)` | row dividers, tab bar top border |
| `track` | `rgba(27,26,23,.07)` | progress bar troughs |
| `on-dark` | `#F6F4EF` | text on `ink` surfaces |
| `on-dark-60/50/40` | `rgba(246,244,239,.6/.5/.4)` | secondary text on dark |
| `success` | `oklch(0.60 0.09 158)` ≈ `#4E8A6B` | budget bar, savings, positive |
| `success-text` | `oklch(0.48 0.08 158)` ≈ `#3D6E54` | links/inline actions |
| `success-ring` | `oklch(0.80 0.12 158)` ≈ `#8FD4AC` | goal ring on dark |
| `success-tint` | `oklch(0.88–0.94 0.035–0.05 158)` | avatar bg, friends card bg |
| `warn-bg` | `oklch(0.95 0.045 78)` ≈ `#F8EFDC` | "needs a category" card + row |
| `warn-border` | `oklch(0.88 0.06 78)` ≈ `#E5D3AE` | its border |
| `warn-solid` | `oklch(0.80 0.13 72)` ≈ `#DEA84F` | count badge, dashed dot |
| `warn-text` | `oklch(0.55 0.12 62)` ≈ `#96662A` | "Tap to categorise" |
| `over` | `oklch(0.62 0.14 40)` | budget bar when >90% used |

**Category colors** — one hue each, identical lightness/chroma (`oklch(0.72 0.10 H)`):
Food `H=45`, Groceries `H=145`, Entertainment `H=15`, Transport `H=235`, Subscriptions `H=300`.
Variants used: chips/selected `oklch(0.62 0.11 H)`, subcategory bars `oklch(0.80 0.08 H)`.
Calendar heatmap: `oklch(0.95−0.30k, 0.02+0.07k, 158)` where `k` = day amount ÷ max day amount; empty days
`rgba(27,26,23,.035)`; text flips to white above `k > 0.62`.

### Typography
Three families (Google Fonts):
- **DM Sans** — all UI text. Weights 400 / 500. Sizes: 10, 10.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 17.
- **Instrument Serif** — display numbers and screen titles. 400 only (italic for one pull-quote in variant 1b).
  Sizes: 18, 20, 21, 22, 25, 26, 27, 30, 32, 38, 40, 52. Letter-spacing `-0.02em` on the largest amounts.
- **JetBrains Mono** — eyebrow labels, dates, percentages, calendar numerals. 400. Sizes 10–11.5,
  `letter-spacing: .06em`, `text-transform: uppercase` for eyebrows.

### Spacing / shape / elevation
- Screen horizontal padding **22px**; top padding **58px** (clears the status bar); bottom padding **96px** (clears tab bar).
- Vertical rhythm: 6 / 8 / 10 / 14 / 18 / 22 / 26px.
- Radii: chips & pills **9–12**, list groups & mid cards **18–20**, hero cards **24**, quick-sort card **26**,
  bottom sheet **28 (top only)**, avatars/dots fully round.
- Shadows: cards `0 1px 2px rgba(27,26,23,.05)`; hero card adds `0 8px 24px -14px rgba(27,26,23,.18)`;
  quick-sort top card `0 2px 4px rgba(27,26,23,.06), 0 18px 40px -24px rgba(27,26,23,.4)`.
- Motion: screen enter `riseIn` 350ms ease (opacity 0→1, translateY 10px→0); card/badge enter `popIn` 250–300ms
  `cubic-bezier(.22,1,.36,1)` (opacity + scale .94→1); sheet `sheetUp` 300ms same easing (translateY 100%→0);
  scrim `fadeIn` 200ms; progress bar width 450ms `cubic-bezier(.22,1,.36,1)`; toggle knob 220ms same;
  chips/pills `all .18s`; donut segment opacity `.2s`.

---

## Screens / Views

### Global chrome
**Tab bar** — absolutely positioned, full width, height **84px** with **22px** bottom padding (home indicator),
`background: rgba(246,244,239,.88)`, `backdrop-filter: blur(18px)`, top border `1px rgba(27,26,23,.08)`, `z-index 40`.
Four equal flex items, each a 22×22 stroked icon (`stroke-width 1.6`, `currentColor`) above a 10px DM Sans label,
4px gap. Active `#1B1A17`, inactive `rgba(27,26,23,.38)`, `transition: color .2s`.
Labels/icons: **Home** (house outline), **Summary** (circle with filled quadrant), **Activity** (3 horizontal
lines, third shorter), **Settings** (circle with filled center dot).

**Toast** — absolutely positioned `left/right: 22px; bottom: 104px`, `z-index 95`, `#1B1A17` bg, `#F6F4EF` text,
radius 14, padding 13×16, 13.5px DM Sans, centered, `popIn`, auto-dismiss after **2200ms** (a new toast resets the timer).

---

### 1. Home
**Purpose:** answer "am I okay this month?" in one glance, and surface anything that needs the user's attention.

Layout, top to bottom (22px side padding):
1. **Greeting row** — left: mono eyebrow `SUNDAY, 26 JULY` (11px, .42 ink, 9px below), then Instrument Serif 27/1.15
   `Good evening,` / `{firstName}` on two lines. Right: 44px circular avatar, bg `oklch(0.88 0.05 158)`,
   initials 15px DM Sans 500 in `oklch(0.42 0.07 158)`. 26px below.
2. **Budget card** — white, radius 24, padding `22 22 20`, card shadow + hero shadow.
   - **Segmented control**: `rgba(27,26,23,.05)` track, radius 11, 3px padding; three equal segments
     *Today / Week / Month*, 13px DM Sans, active = white pill, radius 9, weight 500, shadow `0 1px 3px rgba(27,26,23,.10)`.
   - Mono eyebrow = `SPENT TODAY | SPENT THIS WEEK | SPENT THIS MONTH`.
   - Amount: Instrument Serif **52px**, `-0.02em`, with `of S$X daily|weekly|monthly` at 13px `.45 ink` on the baseline.
   - Progress bar: height 9, radius 5, trough `rgba(27,26,23,.07)`, fill `success` (→ `over` above 90%), 18px above / 12px below.
   - Footer row: `{n}% of budget used` (`.55 ink`) ↔ `S$X left` (`success-text`, weight 500).
   - Data: Today S$42.80 / S$80 · Week S$318.40 / S$560 · Month S$1,486.20 / S$2,400.
   - **Single source of truth:** the month figure is the sum of category totals — the same number the Summary
     donut shows. Manually added or newly categorised amounts must flow into both.
3. **Needs-a-category card** (only when uncategorised count > 0) — `warn-bg`, 1px `warn-border`, radius 20,
   padding 16×18, flex row gap 14: 34px `warn-solid` circle with the white count numeral; title
   **"Need a category"** (14px/500), sub "Quick sort them — one card at a time." (12.5px `.52 ink`); chevron `›`.
   **Tap → opens the Quick sort screen.**
4. **Savings goal card** — `#1B1A17`, radius 24, padding 22, row gap 20. Left: 88px SVG ring, r=37, stroke-width 9,
   trough `rgba(246,244,239,.15)`, fill `success-ring`, round caps, rotated −90°, `stroke-dasharray` = `pct × 232.5`;
   centered `62%` in Instrument Serif 21. Right: mono eyebrow `SAVINGS GOAL`, Instrument Serif 20 `Japan, next April`,
   13px `S$1,850 of S$3,000 · on track` at `on-dark-60`.
5. **"Where it went"** — mono eyebrow, then 4 rows (top categories), each: 10px category dot, name 14px ↔ amount
   14px `.6 ink`, and below a 5px bar (radius 3, trough `.06`) scaled against the largest category.

### 2. Summary
**Purpose:** breakdown by category and by time.

- Title `Summary` (Instrument Serif 30).
- Row of period pills *Week / Month / Year* (padding 7×14, radius 9; active = `#1B1A17` on `#F6F4EF` text,
  inactive = white with `ink-14` border), a spacer, then a right-aligned toggle button that reads
  **"Calendar view"** / **"Chart view"**.

**Chart view**
- White card radius 24, padding `24 22`. Centered **196×196 donut**: annulus, inner r **56**, outer r **88**,
  center (98,98), starting at −90°, each segment `frac × 2π` minus a **0.035 rad** gap. Tapping a segment
  selects/deselects that category; unselected segments drop to **opacity .28** (`transition .2s`).
- Donut center (non-interactive): mono eyebrow `JULY TOTAL | THIS WEEK | THIS YEAR` + Instrument Serif 32 total.
- Below: one white row-card per category (radius 18, padding 14×16, 8px gap): dot 11px, name 14.5,
  mono percent `.42 ink`, amount 14.5 right-aligned in a 74px column, chevron `⌄` that rotates 180° when expanded.
  Expanded: 12px top divider, then subcategory rows indented 26px — name 13px `.62 ink`, an 84px 4px bar
  scaled to the largest sub in that category, amount right-aligned in 64px. `fadeIn .25s`.

**Calendar view**
- White card radius 24, padding `20 18`. Header: `July 2026` (Instrument Serif 18) ↔ mono caption
  `darker = more spent`.
- 7-column grid, 5px gap. Weekday initials row (10px mono `.35 ink`), then 3 empty leading cells (July 2026
  starts Wednesday — compute this, don't hardcode), then 31 day cells: height 42, radius 11, centered
  11.5px mono numeral, heatmap background per the token rule. Selected day gets `outline: 2px solid #1B1A17;
  outline-offset: -2px`.
- Below: white detail card radius 20 — `{d} July` (or `{d} July — nothing spent`) ↔ day total in Instrument
  Serif 20, then that day's transactions as dot + merchant + amount rows.

### 3. Activity (recent transactions)
**Purpose:** the automatic log; fix categories, add anything missed.

- Header row: `Transactions` (Instrument Serif 30) ↔ **＋ button**, 40px circle, `#1B1A17`, `#F6F4EF` `+` glyph.
- Filter pills: **All** and **Needs a category {count}** (same pill styling as Summary).
- When the *Needs a category* filter is active and the queue isn't empty, a **Quick sort banner** appears above the
  list (warn colors, radius 18, count badge, "Clear them all in one pass", chevron) → opens Quick sort.
- Empty state (filter yields nothing): white card radius 24, padding `44 26`, centered — 52px `oklch(0.92 0.06 158)`
  circle, `All caught up` (Instrument Serif 21), body "Every transaction has a category. Your summary is accurate to
  the cent." `popIn`.
- List grouped by day (`Today`, `Yesterday`, `Thu 23 Jul`), 20px between groups. Group header: mono day label ↔
  mono group total (`.35 ink`). Group body: white, radius 20, rows separated by `1px rgba(27,26,23,.06)`.
- **Row**: padding 14×16, gap 13. Leading dot 10px — solid category color when categorised, otherwise a
  **1.5px dashed `oklch(0.70 0.13 72)` ring**. Merchant 14.5px (ellipsised); second line either
  `{Category} · {Subcategory}` (12.5px `.5 ink`) or **"Tap to categorise"** in `warn-text` weight 500.
  Right column: amount 14.5px above 10px mono source (`SMS · DBS`, `Email`, `Manual`).
  **Uncategorised rows use `warn-bg` as the row background.** Tapping any row opens the categorise sheet.

**Categorise sheet** (bottom sheet): scrim `rgba(27,26,23,.4)` (`fadeIn`, tap to dismiss), sheet `#FBFAF7`,
radius `28 28 0 0`, padding `12 22 34`, max-height 82%, 38×4 grabber. Header: merchant ↔ amount (both Instrument
Serif 22), then `{day} · read from {source}` 12px `.5 ink`. Step label (mono): **"Pick a category"** → after
choosing, **"Which kind of {category}?"**; chips wrap with 9px gap (padding 10×15, radius 12, white/`ink-14`
border; selected = filled with `oklch(0.62 0.11 H)` + white text). A `‹ Back to categories` link appears on
step 2. Choosing a subcategory writes the category, closes the sheet, and toasts `Filed under {Cat} · {Sub}`.

**Add transaction sheet** (from ＋): title `Add a transaction`; **Amount** field with a fixed `S$` prefix inside a
bordered box (radius 12, `inputmode="decimal"`); **Merchant** text field, placeholder "Where did it go?";
**Category** chips; subcategory chips fade in once a category is chosen (smaller: padding 8×13, 13px, radius 10).
Primary button `Add transaction`: radius 14, padding 15, 15px/500 — enabled `#1B1A17`/`#F6F4EF`, disabled
`rgba(27,26,23,.10)` with `.35 ink` text. **Validation: amount + merchant + category all required**; subcategory
defaults to the category's first sub. On save the transaction is prepended to *Today*, source `Manual`, filter
resets to *All*, toast `Added S$X · {merchant}`.

### 4. Quick sort (pushed full-screen over the tab bar)
**Purpose:** clear the whole uncategorised queue in one focused pass instead of row-by-row.

Full-bleed `#F6F4EF` overlay, `z-index 85`, `riseIn`. Padding `58 22 30`.
- Top row: **Done** (dismiss, 14px `.55 ink`) ↔ mono counter `{i} of {n}`.
- `Quick sort` (Instrument Serif 26) + "A few we couldn't read confidently." (13px `.5 ink`).
- **Card stack**, 290px tall container:
  - Two dummy cards behind for depth — `top:16 left/right:14, h:250, radius 24, opacity .4` and
    `top:8 left/right:7, h:262, radius 25, opacity .7`.
  - Front card: white, radius 26, padding 24, height 274, big shadow, `popIn`. Contents: mono source eyebrow,
    merchant (Instrument Serif 30), timestamp (13px `.5 ink`), amount (Instrument Serif 46, `-0.02em`), and a
    bottom-pinned 12.5px `.42 ink` **reason hint** explaining why it wasn't auto-categorised, e.g.
    Grab → "Ride or food delivery? The SMS does not say."; Shopee → "Marketplace order — no line items in the
    receipt."; Guzman y Gomez → "First time at this merchant."; fallback → "No line items in the receipt, so we
    left it to you."
- Below the stack: mono step label **"Tap a category"** → **"Which kind of {category}?"**. Chips wrap, 9px gap.
  Category chips carry a **4px left border in the category color**. Sub-chips are plain.
  Choosing a sub assigns it, advances to the next card, and toasts `{merchant} → {Cat} · {Sub}`.
- Footer links, centered, 22px gap: `‹ Categories` (only on the sub step) and `Skip for now` (pushes the item to
  the back of the queue for this session; it stays uncategorised).
- **Done state** (queue empty): white card filling the 290px area — 54px `oklch(0.90 0.07 158)` circle,
  `All sorted` / `Nothing to sort`, body "You filed N transactions. Your summary is accurate again." and a
  primary `Back to spending` button.

### 5. Settings
- Title `Settings`.
- **Profile card** — white radius 24 padding 20: 54px avatar, name (Instrument Serif 18), `Member since 2025 · SGD`
  (12.5px `.5 ink`), and an `Edit`/`Close` outline button. Expanding reveals an inline panel: mono label
  `DISPLAY NAME`, text input (radius 11, `#FBFAF7`, `ink-14` border), dark `Save` button. Saving toasts `Name updated`.
- **"WHERE TRANSACTIONS COME FROM"** group — rows of: 9px status dot (green `oklch(0.65 0.12 158)` when active,
  `rgba(27,26,23,.2)` when paused), label + meta, and a right-side action link in `success-text`.
  Seed rows: `weiling@gmail.com` / "Receipt emails · 41 found this month" / **Change**;
  `+65 9123 4567` / "Bank SMS alerts · DBS, OCBC" / **Manage**;
  `work@studio.sg` / "Paused since 3 June" / **Resume**. Last row: `+ Connect another inbox or number`.
  **Change** expands an inline panel: mono `RECEIPT INBOX`, email input, the reassurance line
  "We only read messages that look like receipts. Nothing else is stored.", and a `Save inbox` button →
  toast `Now reading receipts from {email}`.
- **"PREFERENCES"** group — four rows, each label + meta + iOS-style toggle (track 48×29, radius 15, 3px padding;
  on = `oklch(0.62 0.10 158)`; knob 23px white, `translateX(19px)` when on, 220ms):
  *Categorise automatically* — "Silently. You can always correct it." (on);
  *Sunday digest* — "One summary, no daily nagging" (on);
  *Round up to savings* — "Spare change into the Japan fund" (off);
  *Alert at 80% of budget* — "A heads-up, not an alarm" (on).
- **Circle entry card** — `oklch(0.94 0.035 158)` bg, `oklch(0.88 0.05 158)` border, radius 20: three overlapping
  32px avatars (−12px margin, 2px background-colored ring), "Spend with friends" / "Share goals, keep each other
  honest", chevron. → Friends screen.
- `Sign out`, centered, 12px `.4 ink`.

### 6. Circle (friends — later phase)
Full-screen overlay, `z-index 80`. `‹ Settings` back link; title `Circle`; privacy line: "Three friends can see your
monthly spend and goal progress. They cannot see individual transactions."
- Dark summary card (`#1B1A17`, radius 22): mono `THIS MONTH, TOGETHER`, `3 of 4` (Instrument Serif 38) + "under budget".
- Friend cards (white, radius 20, padding 16): 40px tinted avatar with initials, name 15px, goal line 12px `.5 ink`,
  and a **Nudge** button (outline pill) that becomes a disabled-looking `Sent` and toasts `Nudged {first name}`.
  Below: 7px progress bar — `success` normally, `oklch(0.68 0.14 60)` above 85% — then `S$X spent` ↔ status
  (`Under budget` / `Close to limit`).
  Seed: Marcus Lee (Emergency fund S$5,000, S$1,120, 42%), Priya Nair (New laptop S$2,400, S$2,090, 91%,
  "Close to limit"), Jun Hao (Wedding fund S$12,000, S$860, 31%).
- Dashed-border invite card: "Invite someone" / "They see totals and goals. Never merchants."

---

## Interactions & Behavior
- Tab switch is instant; the entering screen plays `riseIn` (350ms).
- Home period segmented control swaps amount/budget/eyebrow; the progress bar animates its width (450ms).
- Home "Need a category" card and the Activity quick-sort banner both open **Quick sort**.
- Donut segment tap = select/deselect a category; selection is **shared** with the category list below
  (tapping a list row expands it *and* highlights its slice, and vice versa) — one `openCat` value drives both.
- Calendar day tap updates the detail card below.
- Any transaction row tap opens the categorise sheet (works for already-categorised rows too — it re-files them).
- Sheets dismiss by tapping the scrim; there is no explicit close button.
- Quick sort *Skip* is session-only: skipped items stay uncategorised and reappear next time the flow is opened.
- Toasts: 2200ms, single slot, new toast resets the timer.
- No loading or error states are designed. If the real app fetches, use a skeleton in the card shapes above;
  the empty state pattern is shown on the Activity tab and Quick sort done state.
- Accessibility: keep tap targets ≥44px (rows are 52–56px, chips 38–40px tall — **raise chips to 44px min height**
  in production), and don't rely on category color alone — every colored dot is paired with a text label.

## State Management
Single screen-level store (the prototype keeps it all in one component):

| State | Type | Purpose |
|---|---|---|
| `tab` | `'home' \| 'summary' \| 'tx' \| 'settings'` | active tab |
| `screen` | `'main' \| 'quicksort' \| 'friends'` | pushed full-screen overlay |
| `period` | `'today' \| 'week' \| 'month'` | Home amount scope |
| `sumPeriod` | `'week' \| 'month' \| 'year'` | Summary scope |
| `sumView` | `'chart' \| 'calendar'` | Summary view |
| `openCat` | `catId \| null` | highlighted/expanded category |
| `selectedDay` | `number` | calendar selection |
| `txFilter` | `'all' \| 'needs'` | Activity filter |
| `txs` | `Transaction[]` | the log (see shape below) |
| `sheet` | `'cat' \| 'add' \| null` + `sheetTx`, `catStep`, `pickedCat` | bottom sheet |
| `draft` | `{amount, merchant, cat, sub}` | manual add form |
| `qsSkipped`, `qsPicked`, `qsSorted` | `id[]`, `catId\|null`, `number` | quick-sort session |
| `name`, `email` (+ `*Draft`, `editing*`) | strings/bools | settings edits |
| `prefs` | `{auto, digest, roundup, alerts}` | toggles |
| `nudged` | `Record<name, boolean>` | friends nudge |
| `toast` | `string \| null` | transient message |

`Transaction`: `{ id, day, merchant, amount, cat: catId|null, sub: string|null, source, manual?: boolean }`.
`Category`: `{ id, name, hue, total, subs: [name, amount][] }` —
Food (Lunch, Dinner, Coffee, Takeaway), Groceries (Supermarket, Wet market, Convenience),
Entertainment (Dining out, Movies, Events), Transport (Ride-hail, MRT & Bus, Parking),
Subscriptions (Streaming, Software, Gym).

Derived, not stored: uncategorised list, quick-sort queue (`uncategorised − skipped`), grouped/filtered
transactions, category totals and percentages, donut geometry, budget percentage.

**Real-world data needs (not in the prototype):** ingestion of parsed SMS/email receipts, a
merchant→category classifier with a confidence threshold (below it, the item lands unclassified and shows a
reason string — see the Quick sort hints), user corrections persisted as merchant rules, budget + goal records,
and, for the Circle feature, a shared-metrics service that exposes **only** totals and goal progress.

## Assets
None. No images, no icon library, no third-party fonts beyond the three Google families above. All icons are
inline SVG strokes drawn from primitives (rect, circle, path). If the target codebase already has an icon set,
use its house/pie/list/gear equivalents at 22px, 1.6px stroke.

## Files
| File | What it is |
|---|---|
| `Spendly.dc.html` | The design. Option **`1a`** (inside the iPhone frame) is the spec; `1b`–`1e` are exploration variants. Open in a browser. |
| `ios-frame.jsx` | The iPhone bezel/status-bar wrapper used only to present option `1a`. **Not part of the app** — do not port it. |
