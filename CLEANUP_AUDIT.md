# Cleanup Audit

This is the current "what matters / what duplicates / what looks legacy" pass for the repo.

## Important now

- `index.html`
  - current ALIGNED GitHub Pages app
- `aligned.html`
  - compatibility redirect into `index.html`
- `code/index.html`
  - older board app and the best reference for legacy data logic
- `scraper_v5.py`
  - canonical scraper
- `scraper_v4.py`
  - previous stable scraper kept for fallback/reference
- `daily_pipeline.py`
  - canonical pipeline runner
- `scripts/active/daily_gmail_sync.py`
  - canonical reply sync

## Verified identical duplicates

- `deploy.sh`
- `code/deploy.sh`

- `firebase.json`
- `code/firebase.json`

- `assets/docs/EMAIL.rtf`
- `code/assets/docs/EMAIL.rtf`

- `assets/docs/Unaligned_Partnership_2026.pdf`
- `code/assets/docs/Unaligned_Partnership_2026.pdf`

- `Unaligned_Partnership_Packages.pdf`
- `docs/Unaligned_Partnership_Packages.pdf`
- `code/assets/Unaligned_Partnership_Packages.pdf`

- `unaligned_logo.png`
- `code/assets/unaligned_logo.png`

## Verified same-name but not the same role

- `scraper_v4.py`
  - real scraper
- `code/scripts/scraper_v4.py`
  - retired stub that tells you to run the root scraper

- `daily_pipeline.py`
  - current root version
- `code/scripts/daily_pipeline.py`
  - older / alternate copy

- `scripts/active/daily_gmail_sync.py`
  - current active version
- `code/scripts/daily_gmail_sync.py`
  - older / alternate copy

- `index.html`
  - current live page
- `code/index.html`
  - older all-in-one app

## Likely legacy / experimental

- `indexx.html`
  - moved to `archive/experimental/indexx.html`
- `scripts_unique/`
  - moved to `archive/experimental/scripts_unique/`
- many root-level old helper scripts that are already deleted from git status
  - probably migration / backfill history rather than current runtime

## Root cleanup moves

- `generate_training_pdf.py`
  - moved to `scripts/tools/generate_training_pdf.py`
- `scraper_v5.py`
  - promoted back to the repo root as the canonical scraper
- `UNALIGNED_Board_Training_Guide.pdf`
  - moved to `docs/training/UNALIGNED_Board_Training_Guide.pdf`
- `Unaligned_Partnership_2026_v7.pdf`
  - moved to `docs/reference/Unaligned_Partnership_2026_v7.pdf`

## Safe cleanup already done

- removed stray `.DS_Store` files
- added a top-level `.gitignore` for local auth, caches, logs, and dependency noise
- added a clearer top-level repo map in `README.md`

## Intentionally preserved

I did not mass-delete older tracked files or all duplicate copies yet.
That would be a larger archival cleanup, and it is safer to do that as a separate pass once you are comfortable with the canonical map above.
