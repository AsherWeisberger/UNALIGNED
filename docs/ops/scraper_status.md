# Scraper Cross-Reference Analysis
Generated: 2026-05-20 12:48 UTC

## Files Analyzed
| File | Type | Lines | Status |
|------|------|-------|--------|
| `scraper_v4.py` | Python | 693 | Primary logic |
| `scraper_v4.json` | JSON | 40 | Key-value config |
| `scraper.md` | Markdown | 63 | Memo |

## Cross-Reference Findings

### Configuration Consistency
- **Main config keys**: ✅ Consistent between `.py` and `.json`
- **Default values**: ✅ All match expected defaults
- **Missing keys**: None

### Critical Checks
- **Model name verification**: ✅ Verified against `qwen3.6-27b` port 8000
- **Chunk size**: 8
- **Gmail credentials**: Located in `~/.config/google-credentials/`
- **Log file**: `~/.config/google-credentials/scraper_v4.log`

### Status
Files are ready to use. Cross-referencing complete. No conflicts detected.
