#!/usr/bin/env python3
"""
Sync the Flow v4 invoice page from the local invoice folders.

Source folders:
- /Users/asherweisberger/Desktop/UNALIGNED/INVOICES/OUTSTANDING
- /Users/asherweisberger/Desktop/UNALIGNED/INVOICES/DONE

The script mirrors PDF/HTML invoice files into flow-v4 assets and rewrites the
V4_INVOICE_GROUPS block in flow-v4/views.jsx so the invoice page reflects the
folder tree.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote
import json


ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED")
MASTER = ROOT / "MASTER FILES"
SOURCE_ROOT = ROOT / "INVOICES"
ASSET_ROOT = MASTER / "flow-v4" / "assets" / "invoices"
STRIPE_SNAPSHOT = MASTER / "flow-v4" / "assets" / "stripe_invoices.json"
VIEWS_FILE = MASTER / "flow-v4" / "views.jsx"

ALLOWED_EXTENSIONS = {".pdf", ".html", ".htm"}


@dataclass(frozen=True)
class InvoiceItem:
    id: str
    title: str
    company: str
    folder: str
    source: str
    source_dir: str
    file: str
    href: str
    kind: str
    stripe_status: str = ""
    stripe_paid: bool = False
    stripe_amount_due: float | None = None
    stripe_amount_paid: float | None = None
    stripe_currency: str = ""
    stripe_hosted_invoice_url: str = ""
    stripe_invoice_pdf: str = ""


def js_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def js_optional_string(value: str) -> str:
    return "null" if not value else js_string(value)


def js_optional_number(value: float | None) -> str:
    return "null" if value is None else str(value)


def js_bool(value: bool) -> str:
    return "true" if value else "false"


def titleize_folder(name: str) -> str:
    return " ".join(part.capitalize() for part in re.split(r"[\s_-]+", name.strip()) if part)


def make_id(filename: str) -> str:
    stem = Path(filename).stem.lower()
    stem = re.sub(r"^invoice[_\s-]*", "", stem)
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return f"invoice-{stem or 'file'}"


def compact_key(value: str | None) -> str:
    return "".join(ch.lower() for ch in str(value or "") if ch.isalnum())


def load_stripe_rows() -> list[dict]:
    if not STRIPE_SNAPSHOT.exists():
        return []
    try:
        payload = json.loads(STRIPE_SNAPSHOT.read_text(encoding="utf-8"))
    except Exception:
        return []
    rows = payload.get("invoices") if isinstance(payload, dict) else None
    return rows if isinstance(rows, list) else []


def pick_stripe_match(filename: str, invoice_id: str, stripe_rows: list[dict]) -> dict | None:
    if not stripe_rows:
        return None

    filename_key = compact_key(filename)
    invoice_key = compact_key(invoice_id)
    direct = [
        row for row in stripe_rows
        if compact_key(row.get("local_invoice_file")) == filename_key
        or compact_key(row.get("local_invoice_id")) == invoice_key
    ]
    if len(direct) == 1:
        return direct[0]
    if len(direct) > 1:
        return sorted(direct, key=lambda row: row.get("created") or 0, reverse=True)[0]
    return None


def parse_title_company(filename: str) -> tuple[str, str]:
    stem = Path(filename).stem
    stem = re.sub(r"^invoice[_\s-]*", "", stem, flags=re.IGNORECASE)
    parts = [part for part in re.split(r"[_\s]+", stem) if part]

    if parts and re.fullmatch(r"\d{6,8}", parts[-1]):
        parts = parts[:-1]

    if not parts:
        return (Path(filename).stem, "Invoice")

    title = parts[0]
    company = " ".join(parts[1:]) if len(parts) > 1 else parts[0]
    return (title, company)


def copy_invoice(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists() or source.stat().st_mtime_ns != destination.stat().st_mtime_ns:
        shutil.copy2(source, destination)


def collect_bucket(
    source_dir: Path,
    asset_dir: Path,
    folder_label: str,
    source_label: str,
    href_prefix: str,
    stripe_rows: list[dict],
    matched_stripe_ids: set[str],
) -> list[InvoiceItem]:
    items: list[InvoiceItem] = []
    if not source_dir.exists():
        return items

    for source in sorted(source_dir.iterdir(), key=lambda p: p.name.lower()):
        if not source.is_file() or source.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue

        destination = asset_dir / source.name
        copy_invoice(source, destination)
        title, company = parse_title_company(source.name)
        quoted_file = quote(source.name)
        invoice_id = make_id(source.name)
        stripe = pick_stripe_match(source.name, invoice_id, stripe_rows) or {}
        stripe_id = str(stripe.get("id") or "").strip()
        if stripe_id:
            matched_stripe_ids.add(stripe_id)
        items.append(
            InvoiceItem(
                id=invoice_id,
                title=title,
                company=company,
                folder=folder_label,
                source="Manual",
                source_dir=source_label,
                file=source.name,
                href=f"{href_prefix}/{quoted_file}",
                kind=source.suffix.lower().lstrip(".").upper(),
                stripe_status=str(stripe.get("status") or ""),
                stripe_paid=bool(stripe.get("paid")),
                stripe_amount_due=stripe.get("amount_due"),
                stripe_amount_paid=stripe.get("amount_paid"),
                stripe_currency=str(stripe.get("currency") or ""),
                stripe_hosted_invoice_url=str(stripe.get("hosted_invoice_url") or ""),
                stripe_invoice_pdf=str(stripe.get("invoice_pdf") or ""),
            )
        )

    return items


def stripe_row_group(row: dict) -> str:
    if row.get("paid"):
        return "DONE"
    status = str(row.get("status") or "").lower()
    if status in {"paid", "void", "uncollectible"}:
        return "DONE"
    return "OUTSTANDING"


def stripe_row_sort_value(row: dict) -> int:
    return int(row.get("due_date") or row.get("created") or 0)


def build_stripe_bucket(group: str, stripe_rows: list[dict], matched_stripe_ids: set[str]) -> dict[str, object] | None:
    rows = [
        row for row in stripe_rows
        if str(row.get("id") or "") not in matched_stripe_ids
        and stripe_row_group(row) == group
    ]
    if not rows:
        return None

    rows = sorted(rows, key=stripe_row_sort_value, reverse=True)
    folder_label = "STRIPE / OPEN" if group == "OUTSTANDING" else "STRIPE / CLOSED"
    note = (
        "New Stripe invoices live here. Legacy manual invoices from your folders stay in their own buckets below."
        if group == "OUTSTANDING"
        else "Closed Stripe invoices live here. Legacy manual invoices from your folders stay in their own buckets below."
    )

    items: list[InvoiceItem] = []
    for row in rows:
        stripe_id = str(row.get("id") or "").strip()
        title = str(row.get("customer_name") or row.get("number") or "Stripe invoice").strip() or "Stripe invoice"
        contact = str(row.get("customer_email") or "").strip()
        number = str(row.get("number") or "").strip()
        company = contact or number or "Stripe"
        href = str(row.get("hosted_invoice_url") or row.get("invoice_pdf") or "").strip()
        file_label = number or stripe_id or "stripe-invoice"
        items.append(
            InvoiceItem(
                id=f"stripe-{compact_key(stripe_id or file_label)}",
                title=title,
                company=company,
                folder=folder_label,
                source="Stripe",
                source_dir="STRIPE",
                file=file_label,
                href=href,
                kind="STRIPE",
                stripe_status=str(row.get("status") or ""),
                stripe_paid=bool(row.get("paid")),
                stripe_amount_due=row.get("amount_due"),
                stripe_amount_paid=row.get("amount_paid"),
                stripe_currency=str(row.get("currency") or ""),
                stripe_hosted_invoice_url=str(row.get("hosted_invoice_url") or ""),
                stripe_invoice_pdf=str(row.get("invoice_pdf") or ""),
            )
        )

    return {
        "label": "Stripe",
        "note": note,
        "items": items,
    }


def build_buckets(group: str) -> list[dict[str, object]]:
    stripe_rows = load_stripe_rows()
    source_group = SOURCE_ROOT / group
    asset_group = ASSET_ROOT / group.lower()
    href_group = f"flow-v4/assets/invoices/{group.lower()}"
    buckets: list[dict[str, object]] = []
    matched_stripe_ids: set[str] = set()

    root_label = "Open outstanding" if group == "OUTSTANDING" else "Done"
    root_note = (
        "Active invoices still waiting on payment."
        if group == "OUTSTANDING"
        else "Archived for reference."
    )
    root_folder = "OUTSTANDING / OPEN OUTSTANDING" if group == "OUTSTANDING" else "DONE / ARCHIVED"
    root_items = collect_bucket(source_group, asset_group, root_folder, group, href_group, stripe_rows, matched_stripe_ids)
    if root_items:
        buckets.append({"label": root_label, "note": root_note, "items": root_items})

    if source_group.exists():
        for child in sorted(source_group.iterdir(), key=lambda p: p.name.lower()):
            if not child.is_dir() or child.name.startswith("."):
                continue
            child_slug = re.sub(r"[^a-z0-9]+", "-", child.name.lower()).strip("-")
            label = titleize_folder(child.name)
            folder_label = f"{group} / {child.name}"
            items = collect_bucket(
                child,
                asset_group / child_slug,
                folder_label,
                f"{group}/{child.name}",
                f"{href_group}/{child_slug}",
                stripe_rows,
                matched_stripe_ids,
            )
            if items:
                buckets.append(
                    {
                        "label": label,
                        "note": "Synced from this invoice subfolder.",
                        "items": items,
                    }
                )

    stripe_bucket = build_stripe_bucket(group, stripe_rows, matched_stripe_ids)
    if stripe_bucket:
        buckets.insert(0, stripe_bucket)

    return buckets


def render_items(items: list[InvoiceItem], indent: str) -> list[str]:
    lines: list[str] = []
    for item in items:
        lines.extend(
            [
                f"{indent}{{",
                f"{indent}  id: {js_string(item.id)},",
                f"{indent}  title: {js_string(item.title)},",
                f"{indent}  company: {js_string(item.company)},",
                f"{indent}  folder: {js_string(item.folder)},",
                f"{indent}  source: {js_string(item.source)},",
                f"{indent}  sourceDir: {js_string(item.source_dir)},",
                f"{indent}  file: {js_string(item.file)},",
                f"{indent}  href: {js_string(item.href)},",
                f"{indent}  kind: {js_string(item.kind)},",
                f"{indent}  stripeStatus: {js_optional_string(item.stripe_status)},",
                f"{indent}  stripePaid: {js_bool(item.stripe_paid)},",
                f"{indent}  stripeAmountDue: {js_optional_number(item.stripe_amount_due)},",
                f"{indent}  stripeAmountPaid: {js_optional_number(item.stripe_amount_paid)},",
                f"{indent}  stripeCurrency: {js_optional_string(item.stripe_currency)},",
                f"{indent}  stripeHostedInvoiceUrl: {js_optional_string(item.stripe_hosted_invoice_url)},",
                f"{indent}  stripeInvoicePdf: {js_optional_string(item.stripe_invoice_pdf)},",
                f"{indent}}},",
            ]
        )
    return lines


def render_buckets(buckets: list[dict[str, object]], indent: str) -> list[str]:
    lines: list[str] = []
    for bucket in buckets:
        lines.extend(
            [
                f"{indent}{{",
                f"{indent}  label: {js_string(str(bucket['label']))},",
                f"{indent}  note: {js_string(str(bucket['note']))},",
                f"{indent}  items: [",
                *render_items(bucket["items"], indent + "    "),
                f"{indent}  ],",
                f"{indent}}},",
            ]
        )
    return lines


def render_invoice_groups() -> str:
    outstanding_buckets = build_buckets("OUTSTANDING")
    done_buckets = build_buckets("DONE")
    lines = [
        "const V4_INVOICE_GROUPS = [",
        "  {",
        "    id: 'outstanding',",
        "    label: 'Outstanding',",
        "    eyebrow: 'Awaiting payment or confirmation',",
        "    note: 'These are still open and should stay visible until they are paid or explicitly closed.',",
        "    tone: 'warn',",
        "    buckets: [",
        *render_buckets(outstanding_buckets, "      "),
        "    ],",
        "  },",
        "  {",
        "    id: 'done',",
        "    label: 'Done',",
        "    eyebrow: 'Completed and closed',",
        "    note: 'These invoices are finished and moved out of the active queue.',",
        "    tone: 'good',",
        "    buckets: [",
        *render_buckets(done_buckets, "      "),
        "    ],",
        "  },",
        "];",
    ]
    return "\n".join(lines)


def update_views(next_block: str) -> None:
    content = VIEWS_FILE.read_text()
    pattern = re.compile(r"const V4_INVOICE_GROUPS = \[\n.*?\n\];", re.DOTALL)
    updated, count = pattern.subn(next_block, content, count=1)
    if count != 1:
        raise RuntimeError("Could not find exactly one V4_INVOICE_GROUPS block in views.jsx")
    VIEWS_FILE.write_text(updated)


def main() -> None:
    next_block = render_invoice_groups()
    update_views(next_block)
    print(f"Synced invoice page from {SOURCE_ROOT}")
    print(f"Updated {VIEWS_FILE}")


if __name__ == "__main__":
    main()
