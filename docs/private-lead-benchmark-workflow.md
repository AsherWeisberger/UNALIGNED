# Private Lead Benchmark Workflow

This repo includes a local-only benchmark path for testing lead extraction models on real UNALIGNED inbox data without committing private email bodies.

## Files

- `scripts/active/build_private_lead_goldset.py` builds `.private/lead-benchmark/goldset.jsonl` from Supabase cards and Gmail likely-rejects.
- `scripts/active/benchmark_lead_models.py` can run models against either the public synthetic set or the private gold set.
- `.private/` is gitignored and must stay local.

## Build Private Set

Run with scraper secrets loaded:

```bash
set -a
. "$HOME/.config/google-credentials/unaligned-scraper.env"
set +a
python3 scripts/active/build_private_lead_goldset.py --positive-limit 50 --negative-limit 75 --after 2026/04/01
```

Outputs:

- `.private/lead-benchmark/goldset.jsonl`
- `.private/lead-benchmark/review.md`

## Run Private Benchmark

```bash
python3 scripts/active/benchmark_lead_models.py \
  --models qwen3-coder:30b \
  --cases-file .private/lead-benchmark/goldset.jsonl \
  --batch-size 8 \
  --report-path .private/lead-benchmark/private-benchmark.md \
  --json-path .private/lead-benchmark/private-benchmark.json
```

## Label Quality

The first private set is weak-labeled:

- Existing board cards are treated as positives.
- Gmail messages matching obvious junk queries are treated as negatives.

This is useful for a first pass, but it is not a true gold set until someone reviews `.private/lead-benchmark/review.md` and corrects labels. Board cards without direct evidence may be relationships, stale cards, or incomplete imports rather than real extraction positives.

## Current First-Pass Signal

On the initial 125-case weak-labeled private set, `qwen3-coder:30b` had perfect precision and zero false positives, but lower recall against board-positive labels. All misses came from weak board-positive labels, and the missed positives had no stored evidence quote. That suggests the next improvement should be label review plus stronger evidence storage, not blindly relaxing the model.
