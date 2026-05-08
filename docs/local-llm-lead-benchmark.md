# Local LLM Lead Benchmark

This benchmark tests installed Ollama models against the same structured extraction prompt/schema used by `scripts/active/scraper_v4.py`.

- Cases: 13 total (5 real leads, 8 rejects)
- Scoring favors precision, recall, direct evidence quotes, correct intent, required fields, and speed.
- A false positive is penalized heavily because junk on the board is worse than a slower run.

## Results

| Rank | Model | Score | Precision | Recall | Evidence | Intent | False + | False - | Seconds |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `qwen3-coder:30b` | 98.0 | 1.0 | 1.0 | 1.0 | 0.8 | 0 | 0 | 12.27 |

## Notes

### `qwen3-coder:30b`
- Returned IDs: `lead_collaboration_clear, lead_demo_request, lead_intro_partner, lead_podcast_guest, lead_sponsor_budget`
- Missing expected IDs: `none`
- False positives: `none`
