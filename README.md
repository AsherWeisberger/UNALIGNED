# UNALIGNED Repo Map

This folder has a few generations of the project in it. Here is the simple version.

## What is live now

- `index.html`
  - tiny redirect page
- `aligned.html`
  - the current GitHub Pages entrypoint
  - this is the new ALIGNED design
  - it now pulls real leads into the aligned inbox

GitHub Pages is publishing from the `AI-DESIGN` branch.

## What the older app is

- `code/index.html`
  - the older all-in-one board app
  - still useful as the source for legacy logic, Supabase mappings, and scripts

## Canonical files to use

- Live site UI
  - `aligned.html`
- Live site redirect
  - `index.html`
- Legacy board logic reference
  - `code/index.html`
- Canonical scraper
  - `scraper_v4.py`
- Canonical daily pipeline
  - `daily_pipeline.py`
- Canonical daily Gmail reply sync
  - `scripts/active/daily_gmail_sync.py`

## Folders that matter

- `code/`
  - older board app and related scripts
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

## Current source-of-truth rule

- For the live site UI: use `aligned.html`
- For older pipeline / board logic references: use `code/index.html`

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

## What is intentionally not cleaned up yet

There are older tracked files and deleted dependencies from previous versions of the project. Those were left in place on purpose so nothing important gets removed by accident.
