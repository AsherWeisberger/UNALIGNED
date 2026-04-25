# UNALIGNED Redesign Brief — Linear-style Reset

## Goal
Strip the UI down to a Linear/Notion minimal aesthetic. The product (a Gmail-scraping AI lead Kanban) works well; the UI is bulky and cluttered.

User quote: "I'm just not a fan of how it looks in the UI; it just feels really bulky and cluttered."

## Direction (locked in by user)
- **Full Linear-style reset.** No half-measures.
- Drop ALL decorative typography (Bebas Neue, Syne) from app chrome. Logo becomes a clean Inter wordmark. The current "UNALIGNED" word lockup uses a heavy display face — replace with a tight Inter wordmark, slightly tracked out.
- **Single accent color.** Use a single blue (Linear uses #5E6AD2; pick something close: `#5e6ad2` works, or use neutral indigo `#6366f1`). Drop the cyan/teal gradients entirely.
- **No glow effects, no gradients on buttons.** Solid colors only. Subtle borders + shadows like Linear.
- **4px-grid spacing scale.** Spacing tokens: 4, 8, 12, 16, 20, 24, 32, 48.
- **Smaller radii.** 6px for inputs/buttons, 8px for cards, 12px for modals. Drop the 18px ones.
- **Stage colors stay** but desaturate them. Currently: amber, purple, teal, orange. Make them muted versions, not vibrant.

## Top problems to fix (ranked by user pain)

### 1. Header (worst offender)
Current: 10+ elements at equal weight, partially off-screen, multiple stylized fonts, two competing brand looks (UNALIGNED logo at huge size + "Synced" pill + "$268.48 / 7.3M / 1.2M" stat block + 9 view-toggle buttons + Companies/Inbox/Compact/Table/Docs/avatar).

Redesign:
- **Single row, ~52px tall.**
- **Left**: Small "UNALIGNED" wordmark in Inter 600, 13px, letter-spacing 0.08em. NOT a giant logo.
- **Center-left**: Centered ⌘K-style search input (250px wide, subtle border, mono placeholder "Search leads, companies, threads…")
- **Center-right**: Segmented control with the view modes — Board / Companies / Table / Inbox. Just 4 options. Move "Pipeline / Network / Compact / Docs" to a "··· More" overflow menu or into settings.
- **Right**: Avatar (AW) only. No revenue stats up here.
- **Bottom-right floating status pill**: Single small pill that combines sync state + API cost + total leads. One unobtrusive element, not three.

### 2. Column headers
Current: Massive 50px+ glitchy distorted numbers ("28", "13", "50") that dominate the board. Below them, the column name in tiny all-caps. The visual hierarchy is inverted.

Redesign:
- Column header: stage name in Inter 600, 12px, all-caps, letter-spacing 0.1em, color = stage color (desaturated).
- Card count next to name as `(28)` in Inter 400, 12px, muted color. NOT 50px display font.
- Remove the colored bar at the top of each column. Use a 2px left-border on the column header text in stage color instead.
- **Remove the "NEEDS REPLY 23" alarm bars entirely.** Replace with a tiny inline indicator on cards that need reply (a small dot or "↩" glyph in the card header). Don't shout the count at the column level.

### 3. Cards
Current: Heavy padding, large company name + INTERVIEW badge + 3-line AI summary + Reply button + ENGAGED arrow button. Too much per card.

Redesign:
- ~80px tall max. Three lines:
  - Line 1: Name (Inter 500, 13px) + GMAIL/source + date (mono, 11px, muted, far right)
  - Line 2: Company (Inter 400, 12px, muted)
  - Line 3: Tiny pill for deal type (INTERVIEW/COLLAB) at 10px + needs-reply dot if applicable
- AI summary: hidden by default, revealed on hover or in modal. NOT always visible.
- Reply / Stage-advance buttons: hidden by default, appear on hover at the right edge of the card.
- Single solid background, 1px subtle border. No left-border accent. No glow on hot cards (use a small red dot in the header instead).

### 4. Card modal
Current: Full-viewport modal. Left rail with Contact section where 4 of 5 fields show "Not provided" (wasted space). Email thread takes the right side. Draft compose at the bottom right with two confusing sparkle buttons ("Draft & Send" + "Generate Draft").

Redesign:
- **Modal width: 920px max** (not full viewport). Centered. White-ish surface with proper border.
- **Header**: Subject line (Inter 600, 18px) + small stage pill + name·company subtitle. Action icons (bookmark, needs-reply, save, delete) move into a `···` overflow menu — except Save which stays as a primary button. Delete must require confirmation; not a sibling of Save.
- **Left rail (240px)**: Contact info — but COLLAPSE EMPTY FIELDS. If LinkedIn/Phone/Website/Location are "Not provided", don't render them. Just show what we have. Below contact, the Lead Intel WHO/WHAT/WHY block stays (it's useful) but with tighter spacing.
- **Center**: Email thread, rendered properly:
  - Parse `<https://url>` brackets and turn them into hyperlinks
  - Convert ` * ` bullets into actual bullet lists
  - Use Inter for body text, NOT mono
  - Each email collapses by default to a 2-line preview if there are 2+ emails in thread; clicking expands
- **Bottom (sticky)**: Draft compose. ONE primary action: "Send draft" (with a chevron dropdown for "Generate then send" / "Generate only" / etc). The current two sparkle buttons collapse into a single button + menu.
- The "↩ Robert / ↩ Sam" tabs become a clean two-button toggle: `Drafting as: [Robert ▼]` — a single dropdown, since they're really a sender selector.

### 5. Email body rendering
The agent's report flagged: `NVIDIA OpenShell<https://build.nvidia.com/openshell>` showing as raw text, ` * ` characters as bullets. This is markdown-ish/plain-text being rendered without a parser.

Redesign:
- Detect `<https?://[^>]+>` patterns and turn into `<a>` tags
- Detect `^ \* ` patterns and convert to `<ul><li>`
- Use Inter 14px / 1.6 line-height for email body
- Quoted reply blocks (lines starting with `>`) get a subtle left border + muted color and collapse by default

### 6. Side panels (AI Inbox, Docs)
Current Inbox: 132 items in a 420px panel, no grouping, repetitive recommendation text.

Redesign:
- Header: title only, no exclamation count. Show count subtle: "Inbox · 132".
- Group by recommendation type ("Follow up on rates", "Respond to counter") — collapsible groups with a count.
- Each item: 2 lines. Name + company on top, reasoning + stage pill on bottom. Drop the random emojis (📧, 💛, 🤝).
- Docs panel: same minimal treatment. Drop the redundant "click to download" text (just make rows clickable + show download icon on hover).

### 7. Table view
The audit said "light gray background" but the screenshot shows it's actually consistent dark. Trust the screenshot.

Redesign:
- Drop the DEAL VALUE column (always $0 — useless). User can re-add via column picker if they want.
- Drop the SOURCE column (always GMAIL — useless when not varied). Show as a subtle icon instead.
- Stage pills shorter — replace "NEW — NO REPLY" with just "NEW" + a small ↩ indicator if no reply.
- Consistent 36px row height. No multi-line cells.
- Sticky header row on scroll.

### 8. Login screen
Currently the FLOW logo with gradient + "// enter your password to continue" mono caption. Three avatar circles + password input + Enter button.

Redesign:
- Replace "FLOW" with "UNALIGNED" wordmark in Inter (matching the new app brand)
- Drop the cyan/green gradient from the wordmark — solid color
- Drop "// enter your password to continue" — replace with simple "Sign in to continue"
- Avatars stay. Selected avatar gets accent ring (not gradient).
- Single primary button "Continue" instead of "Enter" with gradient.

## Constraints
- **DO NOT change any JavaScript logic.** All Firestore reads/writes, Gmail scraping calls, draft generation calls, view-switching state, etc must remain identical.
- **DO NOT change DOM IDs** that JS targets. CSS classes can be renamed only if you update class references in the JS too — but it's safer to keep classes and just restyle them.
- **Light mode must work.** Match the dark mode redesign with proper light tokens.
- **Mobile must still work.** The mobile media queries from the original CSS must be preserved/rewritten to match the new layout.

## File deliverable
- Create `index-redesign.html` as a sibling of `index.html` in the project root.
- It should be a complete, working file (not a diff). Copy everything from `index.html`, then:
  - Replace the `<style>` block with the redesigned CSS
  - Make the minimal HTML structure changes needed (e.g., remove "Pipeline/Network/Compact/Docs" buttons from header, simplify column headers, etc.)
  - Preserve ALL `<script>` content unchanged
- Test locally by serving with `python -m http.server` and screenshotting the redesign vs the original.

## Reference screenshots
See sibling files in this folder:
- 01_kanban_board.jpg — main board (hardest to fix)
- 02_card_detail_modal.jpg — card modal
- 03_companies_view.jpg — companies view
- 04_table_view.jpg — table view
- 05_ai_inbox_panel.jpg — AI inbox panel
- 06_docs_panel.jpg — docs panel
- 07_date_header_view.jpg — extended header
- 08_email_thread_card_modal.jpg — email thread rendering

## Inspiration
- Linear (linear.app) — column treatment, modal style, side panel
- Superhuman — email thread density, keyboard hints, single accent
- Notion — empty state restraint, toned-down chrome
