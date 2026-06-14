#!/usr/bin/env python3
"""
Pull Stripe invoice state into a local JSON snapshot for the Flow v4 invoice UI.

Expected setup:
- Put STRIPE_SECRET_KEY in ~/.config/google-credentials/unaligned-scraper.env
- Optionally add local_invoice_file or local_invoice_id metadata to Stripe invoices
  for exact matching back to local invoice files.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
OUT_FILE = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/assets/stripe_invoices.json")
STRIPE_API = "https://api.stripe.com/v1/invoices"


def load_env() -> None:
    if not ENV_FILE.exists():
      return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def money(value: int | None) -> float | None:
    if value is None:
        return None
    return round(value / 100.0, 2)


def compact_key(value: str | None) -> str:
    return "".join(ch.lower() for ch in str(value or "") if ch.isalnum())


def request_json(secret: str, starting_after: str | None = None) -> dict:
    params = {"limit": 100}
    if starting_after:
        params["starting_after"] = starting_after
    req = Request(
        STRIPE_API + "?" + urlencode(params),
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def normalize_invoice(row: dict) -> dict:
    metadata = row.get("metadata") or {}
    customer_name = row.get("customer_name") or metadata.get("company") or metadata.get("customer_name") or ""
    description = row.get("description") or ""
    local_invoice_file = metadata.get("local_invoice_file") or ""
    local_invoice_id = metadata.get("local_invoice_id") or ""
    keys = {
        compact_key(customer_name),
        compact_key(description),
        compact_key(local_invoice_file),
        compact_key(local_invoice_id),
        compact_key(row.get("number")),
    }
    return {
        "id": row.get("id") or "",
        "number": row.get("number") or "",
        "status": row.get("status") or "",
        "customer_name": customer_name,
        "customer_email": row.get("customer_email") or "",
        "description": description,
        "currency": (row.get("currency") or "usd").upper(),
        "amount_due": money(row.get("amount_due")),
        "amount_paid": money(row.get("amount_paid")),
        "amount_remaining": money(row.get("amount_remaining")),
        "created": row.get("created"),
        "due_date": row.get("due_date"),
        "paid": bool(row.get("paid")),
        "hosted_invoice_url": row.get("hosted_invoice_url") or "",
        "invoice_pdf": row.get("invoice_pdf") or "",
        "local_invoice_file": local_invoice_file,
        "local_invoice_id": local_invoice_id,
        "match_keys": sorted(key for key in keys if key),
        "metadata": metadata,
    }


def main() -> int:
    load_env()
    secret = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not secret:
        print(f"Stripe sync skipped: STRIPE_SECRET_KEY is missing from {ENV_FILE}", file=sys.stderr)
        return 0

    rows = []
    starting_after = None
    while True:
        payload = request_json(secret, starting_after=starting_after)
        data = payload.get("data") or []
        rows.extend(normalize_invoice(item) for item in data)
        if not payload.get("has_more") or not data:
            break
        starting_after = data[-1].get("id")

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps({
        "fetched_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "count": len(rows),
        "invoices": rows,
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Synced {len(rows)} Stripe invoices into {OUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
