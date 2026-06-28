#!/usr/bin/env python3
"""
UNALIGNED Board (Supabase) access, anon key with operator lane enforced in query.

Read and update the `cards` table through the Supabase REST API (PostgREST) over HTTPS using
the anon key. The profile lanes are enforced in the app, not in the database (RLS is off), so
this tool reproduces the operator (shared) lane in its queries: it sees all active leads and
excludes dead leads by default. It never narrows to Robert's restricted lane.

Read + update only. No insert, no delete: lead creation and dedupe stay with the scraper/importer.

Env (skill credentials):
  SUPABASE_URL        e.g. https://abcd1234.supabase.co
  SUPABASE_ANON_KEY   anon public key (Project Settings > API)

Optional tuning (only if `sample` shows different names than the defaults):
  BOARD_STAGE_COLUMN  defaults to "stage"
  BOARD_DEAD_STAGES   comma list, defaults to "dead leads,dead-leads,dead_leads"

The Postgres wire protocol (port 5432) is blocked in this sandbox. We use the REST API over
HTTPS, which the proxy allows.
"""
import os
import sys
import json
import argparse
import requests

TABLE_DEFAULT = "cards"
PROTECTED_FIELDS = {"id"}
STAGE_COLUMN = os.environ.get("BOARD_STAGE_COLUMN", "list_id")
DEAD_STAGES = [s.strip() for s in os.environ.get("BOARD_DEAD_STAGES", "dead-leads,trash").split(",") if s.strip()]


def cfg():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    missing = [n for n, v in [("SUPABASE_URL", url), ("SUPABASE_ANON_KEY", anon)] if not v]
    if missing:
        sys.exit("Missing credential(s): " + ", ".join(missing))
    return url, anon


def headers(anon, write=False):
    h = {"apikey": anon, "Authorization": f"Bearer {anon}", "Accept": "application/json"}
    if write:
        h["Content-Type"] = "application/json"
        h["Prefer"] = "return=representation"
    return h


def normalize_id(raw):
    s = str(raw).strip()
    if s.lower().startswith("c_"):
        s = s[2:]
    if not s.isdigit():
        sys.exit(f"Card id must be an integer (board prepends c_ for display only). Got: {raw}")
    return s


def dead_filter(stage_col):
    quoted = ",".join('"' + s + '"' for s in DEAD_STAGES)
    return (stage_col, f"not.in.({quoted})")


# ---- Importable helpers (used by orchestrator.py and agents.py) ----
def get_cards(filters=None, limit=50, select=None, order=None, table=TABLE_DEFAULT, operator_lane=True):
    """Read cards. filters: dict of column -> PostgREST clause, e.g. {'list_id':'eq.new'}.
    operator_lane=True excludes dead-leads/trash by default."""
    url, anon = cfg()
    params = []
    if operator_lane:
        params.append(dead_filter(STAGE_COLUMN))
    if select:
        params.append(("select", select))
    for k, v in (filters or {}).items():
        params.append((k, v))
    if order:
        params.append(("order", order))
    params.append(("limit", str(limit)))
    r = requests.get(f"{url}/rest/v1/{table}", headers=headers(anon), params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def get_ops_health():
    """Read the singleton ops_health row (id=1), or None if missing/not migrated."""
    url, anon = cfg()
    try:
        r = requests.get(f"{url}/rest/v1/ops_health", headers=headers(anon),
                         params={"id": "eq.1", "limit": "1"}, timeout=30)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None
    except Exception:
        return None


def upsert_ops_health(fields):
    """Patch the ops_health row (id=1). Best effort: returns None if the table is
    not migrated yet, so heartbeats never break a run."""
    url, anon = cfg()
    try:
        r = requests.patch(f"{url}/rest/v1/ops_health", headers=headers(anon, write=True),
                          params={"id": "eq.1"}, data=json.dumps(fields), timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def get_pricing():
    """Read the live rate card from pricing_tiers (the authoritative source).
    Returns the rows ordered by sort_order so Deal Desk quotes live numbers, never memorized ones."""
    url, anon = cfg()
    params = [("order", "sort_order.asc"), ("limit", "100")]
    r = requests.get(f"{url}/rest/v1/pricing_tiers", headers=headers(anon), params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def update_card(card_id, fields, table=TABLE_DEFAULT):
    """Patch workflow fields on one card. Refuses to write protected fields."""
    url, anon = cfg()
    cid = normalize_id(card_id)
    bad = PROTECTED_FIELDS.intersection(fields.keys())
    if bad:
        raise ValueError("Refusing to write protected field(s): " + ", ".join(sorted(bad)))
    r = requests.patch(f"{url}/rest/v1/{table}", headers=headers(anon, write=True),
                       params={"id": f"eq.{cid}"}, data=json.dumps(fields), timeout=30)
    r.raise_for_status()
    return r.json()


def sample(args):
    url, anon = cfg()
    r = requests.get(f"{url}/rest/v1/{args.table}", headers=headers(anon),
                     params={"limit": str(args.limit)}, timeout=30)
    r.raise_for_status()
    rows = r.json()
    print(json.dumps(rows, indent=2))
    if rows:
        print("\nColumns: " + ", ".join(rows[0].keys()), file=sys.stderr)
    else:
        print("\nNo rows returned (table empty or anon role has no read grant).", file=sys.stderr)


def get(args):
    url, anon = cfg()
    stage_col = args.stage_column or STAGE_COLUMN
    params = []
    if not args.all:
        params.append(dead_filter(stage_col))
    for f in args.filter or []:
        if "=" not in f:
            sys.exit(f"Bad --filter '{f}'. Use column=op.value, e.g. stage=eq.engaged")
        col, val = f.split("=", 1)
        params.append((col, val))
    if args.select:
        params.append(("select", args.select))
    if args.order:
        params.append(("order", args.order))
    params.append(("limit", str(args.limit)))
    r = requests.get(f"{url}/rest/v1/{args.table}", headers=headers(anon), params=params, timeout=30)
    if r.status_code >= 400:
        sys.exit(f"Query failed ({r.status_code}): {r.text}\nIf this is a column error, run `sample` and set BOARD_STAGE_COLUMN to the real stage column.")
    print(json.dumps(r.json(), indent=2))


def update(args):
    url, anon = cfg()
    cid = normalize_id(args.id)
    try:
        payload = json.loads(args.set)
    except json.JSONDecodeError as e:
        sys.exit(f"--set must be valid JSON. {e}")
    if not isinstance(payload, dict) or not payload:
        sys.exit("--set must be a non-empty JSON object.")
    bad = PROTECTED_FIELDS.intersection(payload.keys())
    if bad:
        sys.exit(f"Refusing to write protected field(s): {', '.join(sorted(bad))}")
    cur = requests.get(f"{url}/rest/v1/{args.table}", headers=headers(anon),
                       params={"id": f"eq.{cid}", "limit": "1"}, timeout=30)
    cur.raise_for_status()
    rows = cur.json()
    if not rows:
        sys.exit(f"No card with id {cid}.")
    print("BEFORE: " + json.dumps({k: rows[0].get(k) for k in payload}, indent=2))
    r = requests.patch(f"{url}/rest/v1/{args.table}", headers=headers(anon, write=True),
                       params={"id": f"eq.{cid}"}, data=json.dumps(payload), timeout=30)
    if r.status_code >= 400:
        sys.exit(f"Update failed ({r.status_code}): {r.text}\nIf this is a permissions error, the anon role may not have write grant on cards.")
    updated = r.json()
    if not updated:
        sys.exit(f"Update affected no rows for card {cid}.")
    print("AFTER: " + json.dumps(updated, indent=2))


def main():
    p = argparse.ArgumentParser(description="UNALIGNED Supabase board access, anon key, operator lane (read + update only).")
    sub = p.add_subparsers(dest="cmd", required=True)

    ps = sub.add_parser("sample", help="Print a sample row to reveal the real columns.")
    ps.add_argument("--table", default=TABLE_DEFAULT)
    ps.add_argument("--limit", type=int, default=1)
    ps.set_defaults(func=sample)

    pg = sub.add_parser("get", help="Query cards. Excludes dead leads by default (operator lane).")
    pg.add_argument("--table", default=TABLE_DEFAULT)
    pg.add_argument("--filter", action="append", help="column=op.value, e.g. stage=eq.engaged")
    pg.add_argument("--select")
    pg.add_argument("--order")
    pg.add_argument("--limit", type=int, default=50)
    pg.add_argument("--all", action="store_true", help="Include every row, skip the operator lane filter.")
    pg.add_argument("--stage-column", help="Override the stage column name if it is not 'stage'.")
    pg.set_defaults(func=get)

    pu = sub.add_parser("update", help="Patch workflow fields on an existing card by id.")
    pu.add_argument("--table", default=TABLE_DEFAULT)
    pu.add_argument("--id", required=True)
    pu.add_argument("--set", required=True, help='JSON of fields to update, e.g. {"stage":"rates sent"}')
    pu.set_defaults(func=update)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
