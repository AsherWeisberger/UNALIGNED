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

## What is intentionally not cleaned up yet

There are older tracked files and deleted dependencies from previous versions of the project. Those were left in place on purpose so nothing important gets removed by accident.
