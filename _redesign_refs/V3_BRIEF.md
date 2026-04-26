# UNALIGNED v3 — Final Polish

User has reviewed v2 live with real Firebase data. v2 shipped most of the polish but has 3 specific gaps. Fix ONLY these.

## Source file
Modify in place: `/home/user/workspace/UNALIGNED/index-redesign.html` (currently 9,669 lines, ~554KB)

## Gap 1: Light mode is broken (HIGHEST PRIORITY)
The `:root` and `body.light-mode` token sets exist, but component-level styles don't override properly. In light mode:
- Card name text appears in indigo/teal accent colors (it should be the dark text token in light mode)
- Borders are too dark
- The whole UI looks like a desaturated dark mode, not a clean white Notion-style canvas

### Action
Audit every CSS rule in the file and find places where colors are hardcoded (e.g., `color: #f0f2ff`, `background: #111422`, `border-color: rgba(255,255,255,0.07)`) instead of using `var(--text)` / `var(--surface)` / `var(--border)` tokens.

Replace hardcoded colors with token references. Especially focus on:
- `.card`, `.card-name`, `.card-company`, `.card-title` — text colors
- `.list-header`, `.list` — backgrounds
- Pills (stage pills, deal-type pills) — they need light-mode color variants
- Modal content text colors
- Companies view rows (left rail company names)
- Email thread sender card text

Then add `body.light-mode` overrides where tokens aren't enough (e.g., card hover bg, pill bgs, button hover states).

Test: deploy locally, log in past the login screen mentally (you can't actually since no Firebase), but inspect the CSS by toggling `body.light-mode` class with browser dev tools or by hardcoding `<body class="light-mode">` temporarily in the HTML.

The end state: light mode should look like Notion. White backgrounds (#ffffff body, #fafafa columns), dark gray text (#37352f Notion text), subtle borders (#ebebea), indigo accent (#5e6ad2) for active states only.

## Gap 2: Kill the NEEDS REPLY alarm bars
On the board view, every column has a red ⚡ NEEDS REPLY 4/5/23/19 banner row at the top of the cards container. These need to GO.

### Action
Find the JS/HTML that renders the "NEEDS REPLY N" row inside each column. It might be a div with class `.needs-reply-banner` or similar, rendered per column based on a count.

1. Hide it entirely with CSS: `.needs-reply-banner, .needs-reply-bar, [class*="needs-reply"][class*="header"], [class*="needs-reply"][class*="bar"] { display: none !important; }` — but this is a sledgehammer.
2. Better: find the specific JS that creates these banners and either remove them, or only render if user has toggled "show urgency banners" in settings.

ALSO: in the Companies view left rail, there's a "⚡ NEEDS REPLY (119)" header above the company list. Hide that too with the same approach.

DO keep the per-card needs-reply indicator (small `↩` glyph or red dot) so the user still knows which individual cards need attention. Just kill the column-level and rail-level banner.

## Gap 3: Small leftovers
1. **Date button still in header** — find it in the header HTML and remove. It's labeled "↑↓ Date" or similar — a sort toggle.
2. **Delete button still red and prominent on the company detail pane** in Companies view. Move it into a `···` overflow menu (mirror the pattern used in the card modal). If implementing a full overflow menu is too complex, at minimum: change the Delete button to icon-only, make it muted gray (not red), and require a confirm.
3. **Two sparkle draft buttons** ("✨ Draft & Send" + "✨ Generate Draft") in the card modal still both there. Collapse into ONE primary button: `Send draft` with a chevron `▾` next to it that opens a small dropdown with: "Generate then send" / "Generate only (don't send)". Default action when clicking the main button = whatever is most common (probably Generate then send if no draft exists, else Send the existing draft).

## Constraints
- DO NOT change DOM IDs that JS targets
- DO NOT change Firestore reads/writes
- Preserve all v1+v2 wins (don't accidentally re-introduce the old buttons or styles)

## Test
Add `<body class="light-mode">` temporarily, deploy locally with `python3 -m http.server 8765`, and screenshot `http://localhost:8765/index-redesign.html` to verify the login screen looks clean in light mode. Then revert to default.

## Done criteria
- Light mode looks like Notion (white bg, dark text, subtle borders, indigo accents only on active/selected states)
- No red NEEDS REPLY banners anywhere on the board view
- No NEEDS REPLY alarm in the Companies sidebar
- Date button gone from header
- Delete on company pane is in overflow / muted
- Single primary "Send draft" button + dropdown for variants
