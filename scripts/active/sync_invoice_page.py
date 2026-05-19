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


ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED")
MASTER = ROOT / "MASTER FILES"
SOURCE_ROOT = ROOT / "INVOICES"
ASSET_ROOT = MASTER / "flow-v4" / "assets" / "invoices"
VIEWS_FILE = MASTER / "flow-v4" / "views.jsx"

ALLOWED_EXTENSIONS = {".pdf", ".html", ".htm"}


@dataclass(frozen=True)
class InvoiceItem:
    id: str
    title: str
    company: str
    folder: str
    file: str
    href: str
    kind: str


def js_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def titleize_folder(name: str) -> str:
    return " ".join(part.capitalize() for part in re.split(r"[\s_-]+", name.strip()) if part)


def make_id(filename: str) -> str:
    stem = Path(filename).stem.lower()
    stem = re.sub(r"^invoice[_\s-]*", "", stem)
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return f"invoice-{stem or 'file'}"


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


def collect_bucket(source_dir: Path, asset_dir: Path, folder_label: str, href_prefix: str) -> list[InvoiceItem]:
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
        items.append(
            InvoiceItem(
                id=make_id(source.name),
                title=title,
                company=company,
                folder=folder_label,
                file=source.name,
                href=f"{href_prefix}/{quoted_file}",
                kind=source.suffix.lower().lstrip(".").upper(),
            )
        )

    return items


def build_buckets(group: str) -> list[dict[str, object]]:
    source_group = SOURCE_ROOT / group
    asset_group = ASSET_ROOT / group.lower()
    href_group = f"flow-v4/assets/invoices/{group.lower()}"
    buckets: list[dict[str, object]] = []

    root_label = "Open outstanding" if group == "OUTSTANDING" else "Done"
    root_note = (
        "Active invoices still waiting on payment."
        if group == "OUTSTANDING"
        else "Archived for reference."
    )
    root_folder = "OUTSTANDING / OPEN OUTSTANDING" if group == "OUTSTANDING" else "DONE / ARCHIVED"
    root_items = collect_bucket(source_group, asset_group, root_folder, href_group)
    if root_items:
        buckets.append({"label": root_label, "note": root_note, "items": root_items})

    if source_group.exists():
        for child in sorted(source_group.iterdir(), key=lambda p: p.name.lower()):
            if not child.is_dir() or child.name.startswith("."):
                continue
            child_slug = re.sub(r"[^a-z0-9]+", "-", child.name.lower()).strip("-")
            label = titleize_folder(child.name)
            folder_label = f"{group} / {child.name}"
            items = collect_bucket(child, asset_group / child_slug, folder_label, f"{href_group}/{child_slug}")
            if items:
                buckets.append(
                    {
                        "label": label,
                        "note": "Synced from this invoice subfolder.",
                        "items": items,
                    }
                )

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
                f"{indent}  file: {js_string(item.file)},",
                f"{indent}  href: {js_string(item.href)},",
                f"{indent}  kind: {js_string(item.kind)},",
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
