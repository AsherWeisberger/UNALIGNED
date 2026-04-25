# UNALIGNED Polish Pass v2 — Direct from User

The user reviewed v1 (saved as `index-redesign.html`) live with real Firebase data. Direct quotes:

> "I want a light mode. I also want my site to run smoothly. smooth animations, smooth drag and drop, and I want you to really understand that im trying to have flow here to get things done start to finish, to know when someone emailed us, my favorite view right now is the Companies view, I would love to fix the email thread section. make it more pro. more easy, less heavy feeling. I wish to have something alot like notion."

> "also, I dont need the all pipeline and network button. its pointless. I dont need the compact button. we can also just have a Companies, board tab, and table tab. make them 3 buttons side by side."

## Source file
Work on `/home/user/workspace/UNALIGNED/index-redesign.html` (this is v1 of the redesign — complete file, ~9,400 lines). Modify in place. Do NOT touch `index.html` (the original).

## Reference screenshots
In `/home/user/workspace/UNALIGNED/_redesign_refs/`:
- `01_kanban_board_main.jpg` through `07_ai_inbox_panel.jpg` — these are CURRENT REDESIGN (v1) screenshots
- The `01_kanban_board.jpg` (no suffix) and similar without `_main` are the ORIGINAL pre-redesign

## What MUST be done (priorities ranked)

### 1. Header simplification (HARD REQUIREMENT)
Currently the top nav has: All / Pipeline / Network / Companies / Inbox / Compact / Table / [···] / Docs / Date / icon buttons / avatar.

User wants ONLY THREE nav tabs, side-by-side, segmented-control style:
- **Board**
- **Companies**
- **Table**

Delete: Pipeline, Network, All, Compact, Date, Docs (move Docs to a small icon button if needed). Keep: Inbox icon button, Avatar.

Find the header HTML and remove these elements entirely. Also update any JS that wires up `data-view="pipeline"` / `network` / `compact` view-switching — they can stay in the JS but the buttons disappear from the DOM.

The 3 tabs should look like a Linear-style segmented control: rounded container, active tab has subtle filled background. Reference Linear's view switcher.

### 2. Light mode (HARD REQUIREMENT)
The original CSS already has `body.light-mode` overrides. The redesign needs a proper polished light mode equivalent to Notion's:
- `--bg: #ffffff`
- `--bg2: #fafafa`
- `--surface: #ffffff`
- `--surface2: #f7f7f7`
- `--border: #ebebea`
- `--border2: #d9d9d8`
- `--text: #37352f` (Notion text color)
- `--muted: #787774`
- `--accent: #5e6ad2` (same indigo)

Add a sun/moon toggle in the header (or wire up the existing one if there is one). Make sure ALL components — modal, panels, cards, table, companies view — look great in BOTH modes. Test by toggling.

### 3. Companies view polish (USER'S FAVORITE VIEW)
This is the user's favorite view. Make it shine, Notion database split-view style:

**Left rail (300px, was 200px):**
- Search bar at top
- Pipeline stage dropdown
- Stats: "192 companies · 228 campaigns" in muted text
- Remove the "NEEDS REPLY (119)" alarm header — replace with a subtle filter chip or just remove
- Company list:
  - Each row: 36px tall, hover state (subtle bg fill)
  - Selected state: filled bg + left accent border
  - Name on left (truncate with proper ellipsis), count badge on right (subtle pill)
  - Green dot becomes a small status dot, only shown when there's recent activity (e.g. unread)
  - Long names: full text on hover via title attribute

**Center pane (flex):**
- When no company selected: empty state with a Notion-style illustration or just clean "Select a company to begin" with subtle icon. Center vertically.
- When company selected: company name (large), aggregated stats (last contact, total campaigns, deal stages breakdown), then a list of contacts/campaigns under that company. Each contact row should be clickable to open the card modal.

**Right pane (when campaign selected):**
- Same as a card modal essentially, but inline. Same email thread / draft compose components.

### 4. Email thread redesign (Notion-style)
Current rendering has Inter font and parsed URLs but still feels heavy. Make it Notion-mail / Superhuman level clean:

- **Email "card" container**: subtle 1px border, no shadow, 12px radius
- **Sender block**: sender avatar (32px), name (Inter 600, 14px), timestamp (mono, 11px, muted, right-aligned), recipient line ("to Robert Scoble, Sam Levin") in 12px muted Inter
- **Body**: 14px Inter, 1.65 line-height, 16px paragraph spacing
- **Quoted text** (`>` prefix lines): collapsed by default behind a small `···` button. Click to expand. When expanded, render with a subtle left-border in muted color.
- **Multiple emails in thread**: only the latest expanded by default. Older emails collapse to a clickable single-line preview: avatar + "Robert Scoble · Apr 18 · I think we should..."
- **Spacing between emails**: 16px gap, no heavy dividers
- **The whole thread should feel like reading a clean Notion doc, not a CRM panel**

### 5. Smooth animations
The site needs to FEEL smooth. Add these CSS transitions globally:
- All `:hover` states: `transition: background 120ms ease, border-color 120ms ease, color 120ms ease`
- Modal entrance: scale from 0.96 + fade in over 180ms, ease-out cubic-bezier
- Side panels (Inbox, Companies detail): translate-X from 100% to 0 over 200ms, ease-out
- Drag and drop: when a card is being dragged, give it a subtle scale(1.02) + shadow lift + 4deg rotation. The drop zone column should highlight with a subtle indigo bg fill. Use `transition: transform 80ms ease, box-shadow 80ms ease` on cards.
- Tab switch: subtle 100ms cross-fade between board/companies/table views
- All button presses: `:active { transform: scale(0.97); transition: transform 50ms; }`

Add `will-change` hints on frequently animated elements (cards being dragged, modal containers).

### 6. Bug fixes from v1
- **`$NaN` in table view** for Bharat Jaju's deal value. Find the deal-value rendering JS — likely `Number(x).toLocaleString()` where x is undefined. Wrap in `Number.isFinite(...) ? formatted : '—'`.
- **Robert's Review Queue tutorial modal** is un-dismissable. Find the modal — likely an onboarding flow keyed by localStorage. Add `Escape` key listener and overlay-click-to-close. If user has dismissed once, set localStorage flag so it doesn't reopen on every click.
- **Card modal width**: cap at `max-width: 920px; width: calc(100vw - 80px); margin: 40px auto;` so it's centered, not full-viewport.
- **Delete button**: move out of primary action row in card modal. Put it in a `···` overflow menu with a confirm step ("Are you sure?"). Save stays as the primary button.

### 7. Cleanup remaining v1 gaps
- **Remove NEEDS REPLY alarm bars** from every column on the board. Replace with a subtle inline badge on cards that need reply (small `↩` icon in the card metadata row).
- **Shrink the column counts** (28, 13, 50, 31). They should be Inter 13px, muted, in parens next to the stage name. NOT giant glitchy display font.
- **Simplify column header icons** (?, ↑, ↗, X). The `?` (info), `↑` (sort), `↗` (collapse), `X` (close column) buttons should hide by default and only appear on column-header hover.
- **Drop DEAL VALUE column from table view** (it's always $0). Also drop SOURCE column (always GMAIL). Stage pills shorten to just "NEW" instead of "NEW — NO REPLY".
- **Move revenue stat block** ($268.48 / 7.3M / 1.2M) out of header. Put it in a subtle bottom-right floating status pill alongside "Synced". One pill, not two.
- **Drop the orange/yellow icon buttons** (the matrix mode / halloween mode / brain icons in the header) — move them into a settings modal accessible from the avatar dropdown.

## Deliverables
1. Modified `/home/user/workspace/UNALIGNED/index-redesign.html` — same file, polished
2. Make sure `body.light-mode` toggle still works (light-mode toggle button visible in header)
3. Test by deploying locally and screenshotting at minimum:
   - Board view (dark)
   - Board view (light)
   - Companies view with a company selected (dark)
   - Email thread in card modal (dark)

## Constraints (same as v1)
- DO NOT change JavaScript logic
- DO NOT change DOM IDs
- All Firestore / Supabase / Gmail integration must keep working
- Mobile responsive must keep working

## Note on the agent files
The user mentioned they have AGENTS.md / IDENTITY.md / SOUL.md / TOOLS.md / HEARTBEAT.md / USER.md in the repo root from their OpenClaw/Hermes agent system. These are NOT UI files — leave them alone. Only modify `index-redesign.html`.
