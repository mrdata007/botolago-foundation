#!/usr/bin/env python3
"""Refuse to start a staging write while another staging writer is running.

AGENTS.md: one writer at a time, per database. The Fantasy load test, the
staging database update, the Phase 6 staging cleanup and the session
diagnostic share the `phase6-staging-load-test` concurrency group, so GitHub
queues them behind each other. The other workflows that write to BotolaGO
Staging V2 (the Phase 6.5 functional acceptance and the Fantasy authenticated
E2E) cannot join that group: a pull-request or nightly run in it would
replace, and so cancel, a pending load test. They run this guard before they
write, and so do the load test and the database update, which covers both
directions.

Reads GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_TOKEN
(`actions: read`). Exits 1 naming the running writer, 0 when there is none.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


# Workflows that write to BotolaGO Staging V2, and when a run of theirs is
# really writing (None: whenever it runs).
STAGING_WRITERS: dict[str, dict[str, str] | None] = {
    "fantasy-load-test.yml": None,
    "staging-database-update.yml": None,
    "phase6-staging-cleanup.yml": None,
    "phase6-session-diagnostic-reproduction.yml": None,
    # Its only job runs for this branch; other pull requests skip it.
    "phase65-functional-acceptance.yml": {"head_branch": "qa/phase6-functional-acceptance"},
    # Staging unless an owner dispatch picks production; the run list does not
    # say which, so every run counts.
    "fantasy-authenticated-e2e.yml": None,
}


class GuardError(RuntimeError):
    pass


def running_writers(runs: list[dict[str, Any]], own_run_id: str) -> list[dict[str, Any]]:
    writers = []
    for run in runs:
        if str(run.get("id")) == own_run_id or run.get("status") != "in_progress":
            continue
        workflow = str(run.get("path", "")).rsplit("/", 1)[-1]
        if workflow not in STAGING_WRITERS:
            continue
        condition = STAGING_WRITERS[workflow]
        if condition and any(run.get(key) != value for key, value in condition.items()):
            continue
        writers.append(run)
    return writers


def fetch_in_progress_runs() -> list[dict[str, Any]]:
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not repository or not token:
        raise GuardError("GITHUB_REPOSITORY and GITHUB_TOKEN are required")
    request = urllib.request.Request(
        f"{api}/repos/{repository}/actions/runs?status=in_progress&per_page=100",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "BotolaGO-staging-writer-guard/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        raise GuardError(f"cannot list running workflows: {type(error).__name__}") from error
    runs = body.get("workflow_runs") if isinstance(body, dict) else None
    if not isinstance(runs, list):
        raise GuardError("the workflow run list has an unexpected shape")
    return runs


def main() -> int:
    try:
        writers = running_writers(fetch_in_progress_runs(), os.environ.get("GITHUB_RUN_ID", ""))
    except GuardError as error:
        print(f"Staging writer guard failed closed: {error}", file=sys.stderr)
        return 1
    if writers:
        for run in writers:
            print(
                f"Another staging writer is running: {run.get('name')} "
                f"({run.get('html_url')}). Wait for it to finish, then run this again.",
                file=sys.stderr,
            )
        return 1
    print("No other staging writer is running.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
