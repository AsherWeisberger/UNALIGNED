# UNALIGNED Repo Map

This folder has a few generations of the project in it. Here is the simple version.

## What is live now

- `index.html`
  - the current GitHub Pages entrypoint
  - this is the new ALIGNED design
  - it now pulls real leads into the aligned inbox

GitHub Pages publishes from the `AI-DESIGN` branch through the Deploy Pages workflow (`.github/workflows/deploy-pages.yml`), which compiles the JSX and swaps in production React at deploy time. Push to `AI-DESIGN` and the live site rebuilds automatically. Edit the `.jsx` sources directly, never compiled output.

## What the older app is

- archived/older board files
  - useful only as historical reference, not the live surface

## Canonical files to use

- Live site UI
  - `index.html`
- Canonical scraper
  - `scraper_v5.py`
- Previous stable scraper
  - `scraper_v4.py`
- Canonical daily pipeline
  - `daily_pipeline.py`
- Canonical daily Gmail reply sync
  - `scripts/active/daily_gmail_sync.py`

## Folders that matter

- `code/assets/`
  - docs and branding used by the older app
- `docs/`
  - reference docs and PDFs
- `invoices/`
  - invoice HTML/PDF files
- `functions/`
  - Firebase functions
- `auth/`
  - local auth tokens and client secrets
- `data/`
  - backups and exported lead data
- `archive/`
  - old experiments and moved clutter that should not sit in the root
- `scripts/tools/`
  - utility scripts that are useful but not part of the live app/runtime
- `scripts/experiments/`
  - alternate pipeline experiments not currently treated as canonical

## Current source-of-truth rule

- For the live site UI: use `index.html`
- For older pipeline / board logic references: check Git history or `archive/`

## Known duplicates

Some files exist in more than one place on purpose or because the repo evolved over time.

- Identical duplicates:
  - `deploy.sh` and `code/deploy.sh`
  - `firebase.json` and `code/firebase.json`
  - `assets/docs/EMAIL.rtf` and `code/assets/docs/EMAIL.rtf`
  - `assets/docs/Unaligned_Partnership_2026.pdf` and `code/assets/docs/Unaligned_Partnership_2026.pdf`
  - `Unaligned_Partnership_Packages.pdf`, `docs/Unaligned_Partnership_Packages.pdf`, and `code/assets/Unaligned_Partnership_Packages.pdf`
  - `unaligned_logo.png` and `code/assets/unaligned_logo.png`
- Intentional non-identical versions:
  - `daily_pipeline.py` and `code/scripts/daily_pipeline.py`
  - `scripts/active/daily_gmail_sync.py` and `code/scripts/daily_gmail_sync.py`
  - `scraper_v4.py` and `code/scripts/scraper_v4.py` (`code/scripts/scraper_v4.py` is a retired stub)

## Recent folder cleanup

To make the top level less cluttered:

- moved `indexx.html` to `archive/experimental/`
- moved `scripts_unique/` to `archive/experimental/`
- moved `generate_training_pdf.py` to `scripts/tools/`
- promoted `scraper_v5.py` back to the root as the main scraper
- moved extra reference PDFs into `docs/training/` and `docs/reference/`

## What is intentionally not cleaned up yet

The old tracked dependency folders and throwaway migration scripts have now been removed from Git. Reinstall dependencies from `functions/package-lock.json` when needed instead of committing `node_modules`.
