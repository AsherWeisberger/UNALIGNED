# UNALIGNED Architecture and Security (2026-06-25)

## The system you are running (fully local, owned)
- Local orchestrator daemon on the Mac manages the loop. Nothing runs from any external agent platform.
- Local 32B on MLX (Qwen3 32B 4-bit on the 48GB M4 Max) handles the 90 percent: triage, classification, board reads and writes, routine drafts. Serve via mlx_lm.server, OpenAI-compatible, port 8080. Raise the GPU memory ceiling: sudo sysctl iogpu.wired_limit_mb=40960. Prefer MLX over Ollama for speed on Apple Silicon.
- Claude (your own API key, your strongest general model, not a code-tuned one) handles the 10 percent: final client drafts, gray-area scam calls, negotiation replies on real-money deals, briefs. Low volume, pennies per call.
- Supabase is the data layer (cards board plus pricing_tiers and team_users). Your project, your DB.
- Claude Code builds and maintains the stack (the builder), and can also serve as the 10 percent brain. No OpenAI anywhere in this system: your local LLM runs the 90 percent, Claude runs the 10 percent, Claude Code builds it.

## The 90/10 gate (cost control)
Local handles volume. Escalate to Claude only for: final client-facing drafts, gray-area scam, negotiation on real-money deals, brief generation. Keep the gate honest and Claude spend stays tiny.

## Migration note (cut the cord)
The old operational layer ran on the Mac's local LLM, and the GitHub Pages dashboard redirected to the Mac because a public page cannot call the local LLM (CORS). That tied everything to the Mac being on. The fix is this build: the dashboard reads Supabase directly, the brain is local 32B plus Claude, so the Funnel exposure can come down and the Mac is no longer a single point of failure.

## Security findings and fixes (2026-06-25)
- The Supabase anon key is hardcoded in the public GitHub repo (flow-v4/data.jsx). That is acceptable ONLY with RLS on. Enable RLS on `cards`: allow anon select, update, insert; deny hard delete (your "delete" is a soft move to the trash lane, so blocking hard delete breaks nothing and keeps all data for the agents). pricing_tiers and team_users have RLS on with anon read policies added so the agents and dashboard can read them.
- Invoice PDFs and stripe_invoices.json were committed in the public repo (flow-v4/assets/invoices, stripe_invoices.json). Client names and amounts are public. Remove them and purge from git history. RLS does not help static files in git.
- The Mac OS dashboard was Funnel-exposed and answered with no auth. Take the Funnel down once the dashboard reads Supabase directly, or put it behind a login.
- The anon key can read and update `cards` and read `pricing_tiers`/`team_users`. It cannot insert or hard-delete. Keep it that way. The service_role key (admin) is only for the SQL editor and price/migration changes, never shipped to the client or the agents.

## Pricing changes are SQL, not agent writes
The rate card lives in pricing_tiers, read-only to the anon key by design. Price changes run as SQL in the Supabase editor (admin role), so the public client can never rewrite prices. The discount floor is NOT stored in the table (it would leak via the public anon key); it lives in the Deal Desk prompt, private.
