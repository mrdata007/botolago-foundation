#!/usr/bin/env python3
"""Render and validate sanitized Phase 6 GitHub Actions evidence."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any


FORBIDDEN_PATTERNS = {
    "supabase_secret_key": re.compile(rb"sb_secret_[A-Za-z0-9_-]+"),
    "supabase_management_token": re.compile(rb"sbp_[A-Za-z0-9_-]+"),
    "aws_access_key": re.compile(rb"(?:AKIA|ASIA)[A-Z0-9]{16}"),
    "authorization_header": re.compile(rb"Bearer\s+[A-Za-z0-9._~+/-]+", re.I),
    "private_key": re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "jwt": re.compile(rb"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),
}


def private_write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(
        path,
        os.O_WRONLY
        | os.O_CREAT
        | os.O_TRUNC
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(value)


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else {}


def latest_summary(root: Path, mode: str) -> dict[str, Any] | None:
    candidates = []
    for path in root.glob("*/gate-summary.json"):
        value = read_json(path)
        if value.get("mode") == mode:
            candidates.append((path.stat().st_mtime_ns, value))
    return max(candidates, default=(0, None), key=lambda item: item[0])[1]


def sanitize_failure(value: Any) -> str:
    text = " ".join(str(value or "not reported").split())[:300]
    if any(pattern.search(text.encode()) for pattern in FORBIDDEN_PATTERNS.values()):
        return "failure detail redacted"
    return text


def scan_artifacts(root: Path) -> list[dict[str, str]]:
    violations: list[dict[str, str]] = []
    if not root.is_dir():
        return violations
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        payload = path.read_bytes()
        for label, pattern in FORBIDDEN_PATTERNS.items():
            if pattern.search(payload):
                violations.append(
                    {"file": str(path.relative_to(root)), "pattern": label}
                )
    return violations


def render(args: argparse.Namespace) -> int:
    root = args.evidence_root.resolve()
    rehearsal = latest_summary(root, "setup_rehearsal")
    full = latest_summary(root, "full_gate")
    recovery_candidates = sorted(
        root.glob("*/recovery-cleanup-summary.json"),
        key=lambda path: path.stat().st_mtime_ns,
    )
    recovery = read_json(recovery_candidates[-1]) if recovery_candidates else None

    violations = scan_artifacts(root)
    sanitized = not violations
    recovery_passed = bool(recovery and recovery.get("passed"))
    gate_passed = bool(
        sanitized
        and args.oidc_outcome == "success"
        and args.capacity_exit == 0
        and args.cleanup_exit == 0
        and rehearsal
        and rehearsal.get("passed")
        and full
        and full.get("passed")
        and recovery_passed
    )

    lines = [
        "<!-- phase6-capacity-evidence:start -->",
        "## Phase 6 delegated capacity gate",
        "",
        f"Workflow run: [{args.run_label}]({args.run_url})",
        "",
        f"Verdict: **{'PASS — ready for review' if gate_passed else 'FAIL/BLOCKED — remains draft'}**",
        "",
        "- Execution: protected `staging-load-test` environment with owner approval",
        "- AWS authentication: GitHub OIDC assumed-role session; no long-lived AWS keys",
        "- Region: `eu-west-3`",
        "- Cost/lifetime guards: conservative estimate under `$50`; two-hour job limit; 105-minute runner self-termination",
        f"- Setup rehearsal: {'pass' if rehearsal and rehearsal.get('passed') else 'not passed'}",
        f"- Exact 2,500-user gate and soak: {'pass' if full and full.get('passed') else 'not passed'}",
        f"- Independent exact-zero cleanup: {'pass' if recovery_passed else 'not passed'}",
        f"- Evidence sanitizer: {'pass' if sanitized else 'failed; artifacts suppressed'}",
    ]

    if full:
        merge = full.get("mergeGate", {}).get("overall", {})
        soak = full.get("soak", {}).get("overall", {})
        metrics = full.get("metrics", {})
        integrity = full.get("integrity", {})
        lines.extend(
            [
                "",
                "Measured evidence:",
                "",
                f"- merge read p95: `{merge.get('readP95Ms', 'n/a')} ms`",
                f"- merge mutation p95/p99: `{merge.get('mutationP95Ms', 'n/a')} / {merge.get('mutationP99Ms', 'n/a')} ms`",
                f"- merge unexpected errors/rate: `{merge.get('unexpectedErrors', 'n/a')} / {merge.get('unexpectedErrorRate', 'n/a')}`",
                f"- merge lock timeouts/rate: `{merge.get('lockTimeoutErrors', 'n/a')} / {merge.get('lockTimeoutRate', 'n/a')}`",
                f"- soak mutation p95/p99: `{soak.get('mutationP95Ms', 'n/a')} / {soak.get('mutationP99Ms', 'n/a')} ms`",
                f"- max database CPU/pool: `{metrics.get('maxCpuPercent', 'n/a')}% / {metrics.get('maxPoolUtilizationPercent', 'n/a')}%`",
                f"- deadlock delta: `{metrics.get('deadlockDelta', 'n/a')}`",
                f"- integrity: `{'pass' if integrity.get('passed') else 'fail'}`",
            ]
        )
    else:
        failure = (
            rehearsal.get("failure")
            if rehearsal
            else "delegated credential or permission preflight did not complete"
        )
        lines.extend(["", f"Sanitized failure: `{sanitize_failure(failure)}`"])

    lines.extend(
        [
            "",
            "Production V2 and Legacy were not targeted. No Fantasy worker or schedule was enabled, and this workflow never merges the PR.",
            "<!-- phase6-capacity-evidence:end -->",
            "",
        ]
    )
    private_write(args.output, "\n".join(lines))

    result = {
        "artifactsSanitized": sanitized,
        "capacityExit": args.capacity_exit,
        "cleanupExit": args.cleanup_exit,
        "cleanupPassed": recovery_passed,
        "gatePassed": gate_passed,
        "oidcOutcome": args.oidc_outcome,
        "rehearsalPassed": bool(rehearsal and rehearsal.get("passed")),
        "fullGatePassed": bool(full and full.get("passed")),
        "violations": violations,
    }
    private_write(
        args.result,
        json.dumps(result, indent=2, sort_keys=True) + "\n",
    )
    return 0 if sanitized else 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--result", required=True, type=Path)
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--run-label", required=True)
    parser.add_argument("--oidc-outcome", required=True)
    parser.add_argument("--capacity-exit", required=True, type=int)
    parser.add_argument("--cleanup-exit", required=True, type=int)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(render(parse_args()))
