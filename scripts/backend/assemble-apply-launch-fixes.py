#!/usr/bin/env python3
"""Assemble scripts/backend/apply-20260924-launch-fixes.sql.

The owner-run production script for the 2026-09-24 launch fixes is generated,
never hand-edited: it is the head template, then every migration of the batch
embedded twice byte for byte (once to run, once as the history row's
statements[1], as the migration promoter records one), then the tail template.
`scripts/backend/apply-launch-fixes-script.test.ts` re-assembles it and fails
when the committed script drifts from its sources.

Usage: python3 scripts/backend/assemble-apply-launch-fixes.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
BATCH = [
    "20260924200000_fantasy_postponement_and_enrolment",
    "20260924200100_fantasy_lifecycle_tick",
    "20260924200200_ops_health_and_alerts",
    "20260924200300_timezone_validation_without_catalogue_scan",
    "20260924200400_news_related_articles_set_based",
    "20260924200500_football_live_refresh_cadence",
    "20260924200600_news_truthful_modified_dates",
]


def assemble() -> str:
    head = (ROOT / "scripts/backend/templates/apply-launch-fixes.head.sql").read_text()
    tail = (ROOT / "scripts/backend/templates/apply-launch-fixes.tail.sql").read_text()
    versions = [name.split("_", 1)[0] for name in BATCH]
    parts = [head.replace("@@BATCH_VERSIONS@@", ",".join(versions))]
    for name in BATCH:
        version, label = name.split("_", 1)
        body = (ROOT / f"supabase/migrations/{name}.sql").read_text()
        tag = f"$bg_{version}_file$"
        if tag in body:
            raise SystemExit(f"{name} contains its own dollar-quote tag")
        parts.append(
            "-- ---------------------------------------------------------------------------\n"
            f"-- Migration {name}, exactly as in the repository\n"
            "-- ---------------------------------------------------------------------------\n"
        )
        parts.append(body)
        parts.append(
            "\ninsert into supabase_migrations.schema_migrations (version, name, statements)\n"
            f"values (\n  '{version}',\n  '{label}',\n  array[{tag}{body}{tag}]\n);\n\n"
        )
    parts.append(tail)
    return "".join(parts)


if __name__ == "__main__":
    out = ROOT / "scripts/backend/apply-20260924-launch-fixes.sql"
    out.write_text(assemble())
    print(f"wrote {out.relative_to(ROOT)} ({len(BATCH)} migrations)")
