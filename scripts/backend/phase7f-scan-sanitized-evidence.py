#!/usr/bin/env python3
"""Silently scan Gate 1 evidence without ever printing matched content."""

from __future__ import annotations

import re
import sys
from pathlib import Path


RULES = {
    "SUPABASE_KEY": re.compile(
        rb"(?:sbp|sb_secret|sb_publishable)_[A-Za-z0-9._-]+"
    ),
    "JWT": re.compile(rb"\beyJ[A-Za-z0-9._-]{20,}\b"),
    "AUTH_HEADER": re.compile(rb"(?i)authorization\s*:\s*(?:bearer\s+)?\S+"),
    "SESSION_SECRET_FIELD": re.compile(
        rb"(?i)(?:access_token|refresh_token|token_hash|hashed_token|password)"
    ),
}
SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def scan(root: Path) -> list[tuple[str, str, int]]:
    if not root.is_dir():
        raise RuntimeError("EVIDENCE_DIRECTORY_MISSING")
    files = sorted(path for path in root.rglob("*") if path.is_file())
    if not files:
        raise RuntimeError("EVIDENCE_FILES_MISSING")
    findings: list[tuple[str, str, int]] = []
    for path in files:
        data = path.read_bytes()
        name = SAFE_NAME.sub("_", str(path.relative_to(root)))[:160]
        for rule_id, pattern in RULES.items():
            count = len(pattern.findall(data))
            if count:
                findings.append((name, rule_id, count))
    return findings


def main() -> int:
    if len(sys.argv) != 2:
        print("EVIDENCE_SCAN_USAGE_ERROR", file=sys.stderr)
        return 2
    try:
        findings = scan(Path(sys.argv[1]))
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if findings:
        for filename, rule_id, count in findings:
            print(f"FAIL file={filename} rule={rule_id} count={count}")
        return 1
    print("PASS rule=ALL count=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
