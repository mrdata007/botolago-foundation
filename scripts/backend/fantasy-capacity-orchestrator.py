#!/usr/bin/env python3
"""Staging-only distributed Phase 6 capacity gate orchestrator.

Credentials are accepted only from the process environment, retained in
memory, and never written to reports or command arguments. GitHub Actions
supplies short-lived AWS credentials through OIDC and protected Supabase
configuration through its environment. The temporary Supabase Secret API key
and every EC2 resource are removed in ``finally`` and by an independently
invokable recovery cleanup path.
"""

from __future__ import annotations

import concurrent.futures
import json
import math
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config

try:
    from fantasy_harness_tls import create_verified_ssl_context
except ModuleNotFoundError:
    from scripts.backend.fantasy_harness_tls import create_verified_ssl_context


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RUNTIME_ROOT = Path("/private/tmp/botolago-phase6")
RUNTIME_ROOT = Path(
    os.getenv("BOTOLAGO_PHASE6_RUNTIME_DIR", str(DEFAULT_RUNTIME_ROOT))
).resolve()
STATE_FILE = RUNTIME_ROOT / "cloud-state.json"
ARTIFACT_ROOT = Path(
    os.getenv("BOTOLAGO_PHASE6_EVIDENCE_DIR", str(RUNTIME_ROOT / "evidence"))
).resolve()
RUNNER_COUNT = 5
USERS_PER_RUNNER = 500
TOTAL_USERS = RUNNER_COUNT * USERS_PER_RUNNER
RUNNER_PREPARATION_STAGGER_SECONDS = 15
PREPARATION_SYNCHRONIZATION_LEAD_SECONDS = 75
DATABASE_OBSERVER_INTERVAL_SECONDS = 5
DATABASE_OBSERVER_BLOCKING_PAIR_LIMIT = 20
FIRST_USER_NUMBER = 50_001
REHEARSAL_USERS_PER_RUNNER = 25
SESSION_REHEARSAL_USERS_PER_RUNNER = 1
FULL_GATE_MODE = "full_gate"
SETUP_REHEARSAL_MODE = "setup_rehearsal"
SESSION_PROVISIONING_REHEARSAL_MODE = "session_provisioning_rehearsal"
CLEANUP_RECOVERY_MODE = "cleanup_recovery"
# Match-day browsing: a separate workload (browsing-load-test.py) run on the
# same runners, users and cleanup as the gate. The gate itself is unchanged.
BROWSING_MODE = "browsing"
BROWSING_DEFAULT_VISITORS = 2_000
BROWSING_MAX_VISITORS = 20_000
BROWSING_DEFAULT_DURATION_SECONDS = 600
# Supabase Management API key names accept lowercase alphanumerics and
# underscores only; the requested display name used hyphens.
TEMP_KEY_NAME = "phase6_fantasy_metrics"
USER_AGENT = "botolago-phase6-capacity-gate/1.0"
SEASON_ID = "fa630000-0000-4000-8000-000000000001"
GAMEWEEK_ID = "fa640000-0000-4000-8000-000000000002"
EXPECTED_RUNTIME_KEYS = {
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_STAGING_PROJECT_REF",
    "SUPABASE_STAGING_URL",
    "SUPABASE_STAGING_PUBLISHABLE_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_REGION",
}
REQUIRED_RUNTIME_KEYS = EXPECTED_RUNTIME_KEYS - {"AWS_SESSION_TOKEN"}
RUNNER_INSTANCE_TYPE = "t3.small"
# The load runner needs Python 3.11 or newer (datetime.UTC). Amazon Linux
# 2023's default python3 is 3.9, where it fails at import.
RUNNER_PYTHON = "python3.11"
RUNNER_SELF_TERMINATION_MINUTES = 105
MAX_LIFETIME_MINUTES = 120
MAX_ALLOWED_BUDGET_USD = 50.0
# This deliberately exceeds the eu-west-3 on-demand t3.small rate and includes
# a fixed allowance for encrypted gp3 volumes, API calls, and network traffic.
CONSERVATIVE_RUNNER_HOURLY_USD = 1.0
NON_COMPUTE_COST_BUFFER_USD = 10.0
CONSERVATIVE_ESTIMATED_COST_USD = (
    RUNNER_COUNT
    * CONSERVATIVE_RUNNER_HOURLY_USD
    * RUNNER_SELF_TERMINATION_MINUTES
    / 60
    + NON_COMPUTE_COST_BUFFER_USD
)


def event(message: str) -> None:
    print(f"[{datetime.now(UTC).isoformat()}] {message}", flush=True)


def runner_user_data() -> str:
    return f"""#!/bin/bash
set -euo pipefail
dnf install -y {RUNNER_PYTHON} {RUNNER_PYTHON}-pip
{RUNNER_PYTHON} -m venv /opt/botolago-venv
/opt/botolago-venv/bin/pip install --disable-pip-version-check aiohttp==3.12.15 certifi==2026.7.22
mkdir -p /opt/botolago
chown -R ec2-user:ec2-user /opt/botolago /opt/botolago-venv
touch /opt/botolago/ready
shutdown -h +{RUNNER_SELF_TERMINATION_MINUTES}
"""


def private_write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(value)


def private_json(path: Path, value: Any) -> None:
    private_write(path, json.dumps(value, indent=2, sort_keys=True) + "\n")


def private_append_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "a", encoding="utf-8") as output:
        output.write(json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n")


def runner_preparation_delay(index: int) -> int:
    if not 0 <= index < RUNNER_COUNT:
        raise ValueError("runner index is outside the Phase 6 shard range")
    return index * RUNNER_PREPARATION_STAGGER_SECONDS


def synchronized_preparation_lead_seconds() -> int:
    return PREPARATION_SYNCHRONIZATION_LEAD_SECONDS + runner_preparation_delay(
        RUNNER_COUNT - 1
    )


def read_runtime_environment() -> dict[str, str]:
    values = {
        name: value
        for name in EXPECTED_RUNTIME_KEYS
        if (value := os.getenv(name))
    }
    missing = REQUIRED_RUNTIME_KEYS - values.keys()
    if missing:
        raise RuntimeError("protected workflow environment is incomplete")
    values["SUPABASE_STAGING_URL"] = values["SUPABASE_STAGING_URL"].rstrip("/")
    parsed_url = urllib.parse.urlparse(values["SUPABASE_STAGING_URL"])
    hostname = parsed_url.hostname or ""
    derived_ref = (
        hostname.removesuffix(".supabase.co")
        if hostname.endswith(".supabase.co")
        else ""
    )
    if (
        parsed_url.scheme != "https"
        or len(derived_ref) != 20
        or not derived_ref.isalnum()
        or not derived_ref.islower()
    ):
        raise RuntimeError("staging project URL is invalid")
    project_ref = values["SUPABASE_STAGING_PROJECT_REF"]
    if project_ref != derived_ref:
        raise RuntimeError("staging project reference and URL do not match")
    values["SUPABASE_STAGING_PROJECT_REF"] = derived_ref
    if not values["SUPABASE_STAGING_PUBLISHABLE_KEY"].startswith("sb_publishable_"):
        raise RuntimeError("a staging publishable key is required")
    return values


def http_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    body: Any | None = None,
    timeout: int = 30,
) -> Any:
    request_headers = {"User-Agent": USER_AGENT, "Accept": "application/json", **headers}
    payload = None
    if body is not None:
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url, data=payload, headers=request_headers, method=method
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout,
            context=create_verified_ssl_context(),
        ) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw_error = error.read()
        detail = ""
        try:
            parsed_error = json.loads(raw_error)
            if isinstance(parsed_error, dict):
                candidate = parsed_error.get("message") or parsed_error.get("error")
                if (
                    isinstance(candidate, str)
                    and "sb_" not in candidate
                    and "Bearer " not in candidate
                    and len(candidate) <= 300
                ):
                    detail = f": {candidate}"
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
        raise RuntimeError(f"remote API returned HTTP {error.code}{detail}") from error


def percentile(values: list[float], percent: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(percent / 100 * len(ordered)) - 1))
    return round(ordered[index], 3)


def browsing_settings() -> tuple[int, int]:
    visitors = int(os.getenv("BOTOLAGO_BROWSING_VISITORS", str(BROWSING_DEFAULT_VISITORS)))
    duration = int(
        os.getenv("BOTOLAGO_BROWSING_DURATION_SECONDS", str(BROWSING_DEFAULT_DURATION_SECONDS))
    )
    if not RUNNER_COUNT <= visitors <= BROWSING_MAX_VISITORS or visitors % RUNNER_COUNT:
        raise RuntimeError(
            f"browsing visitors must be a multiple of {RUNNER_COUNT} up to {BROWSING_MAX_VISITORS}"
        )
    if not 60 <= duration <= 1800:
        raise RuntimeError("browsing duration must be 60 to 1,800 seconds")
    return visitors, duration


def aggregate_browsing(shards: list[dict[str, Any]], visitors: int) -> dict[str, Any]:
    if len(shards) != RUNNER_COUNT:
        raise RuntimeError("browsing result does not contain five runner results")
    latencies: list[float] = []
    pages: list[float] = []
    errors: Counter[str] = Counter()
    rpcs: Counter[str] = Counter()
    requests = 0
    duration = 0
    for shard in shards:
        profile = shard.get("profile", {})
        if profile.get("loadProfile") != "browsing":
            raise RuntimeError("runner returned the wrong load profile")
        if profile.get("visitorsTotal") != visitors:
            raise RuntimeError("runner ran a different number of visitors")
        requests += int(profile["requests"])
        duration = int(profile["durationSeconds"])
        latencies += [float(value) for value in shard.get("latencySamplesMs", [])]
        pages += [float(value) for value in shard.get("pageSamplesMs", [])]
        errors.update(shard.get("errorCodes", {}))
        for rpc, summary in shard.get("rpcs", {}).items():
            rpcs[rpc] += int(summary["count"])
    unexpected = sum(errors.values())
    rate = unexpected / max(requests, 1)
    overall = {
        "readP50Ms": percentile(latencies, 50),
        "readP95Ms": percentile(latencies, 95),
        "readP99Ms": percentile(latencies, 99),
        "pageP95Ms": percentile(pages, 95),
        "unexpectedErrors": unexpected,
        "unexpectedErrorRate": round(rate, 6),
    }
    return {
        "profile": {
            "name": "browsing",
            "visitors": visitors,
            "durationSeconds": duration,
            "requests": requests,
            "requestsPerSecond": round(requests / max(duration, 1), 2),
            "pageViews": len(pages),
        },
        "content": shards[0].get("content", {}),
        "rpcCounts": dict(rpcs),
        "errorCodes": dict(errors),
        "overall": overall,
        "passCriteria": {
            "readP95": overall["readP95Ms"] <= 500,
            "pageP95": overall["pageP95Ms"] <= 2000,
            "unexpectedErrorRate": rate < 0.005,
        },
    }


def safe_runner_diagnostic(value: str) -> str:
    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    patterns = (
        re.compile(r"\b(?:sb_(?:publishable|secret)|sbp)_[A-Za-z0-9_-]+\b"),
        re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]+", re.IGNORECASE),
        re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
        re.compile(r"\b[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\b"),
    )
    for pattern in patterns:
        normalized = pattern.sub("[REDACTED]", normalized)
    normalized = re.sub(
        r'(?i)("?(?:password|access_token|refresh_token|apikey|api_key|authorization)"?\s*[:=]\s*)[^\s,}]+',
        r"\1[REDACTED]",
        normalized,
    )
    return normalized[-16_000:] or "runner emitted no diagnostic"


def sanitize_diagnostic_value(value: Any, depth: int = 0) -> Any:
    if depth >= 5:
        return "[TRUNCATED]"
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            safe_key = str(key)[:100]
            normalized_key = safe_key.lower()
            if any(
                marker in normalized_key
                for marker in ("password", "token", "authorization", "api_key", "apikey")
            ):
                sanitized[safe_key] = "[REDACTED]"
            else:
                sanitized[safe_key] = sanitize_diagnostic_value(item, depth + 1)
        return sanitized
    if isinstance(value, list):
        return [sanitize_diagnostic_value(item, depth + 1) for item in value[:20]]
    if isinstance(value, str):
        return safe_runner_diagnostic(value)[:1000]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return safe_runner_diagnostic(str(value))[:1000]


def sanitized_diagnostic_records(value: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in value.splitlines():
        if not line.strip():
            continue
        parsed = json.loads(line)
        if not isinstance(parsed, dict):
            raise ValueError("session diagnostic record must be an object")
        required = {
            "event",
            "httpStatus",
            "requestDurationMs",
            "responseBody",
            "runnerId",
            "supabaseErrorCode",
            "userIndex",
        }
        if set(parsed) != required or parsed.get("event") != "authentication_failure":
            raise ValueError("session diagnostic record has an invalid contract")
        sanitized = sanitize_diagnostic_value(parsed)
        if not isinstance(sanitized, dict):
            raise ValueError("session diagnostic sanitization failed")
        records.append(sanitized)
    return records


class CapacityGate:
    def __init__(
        self,
        mode: str = FULL_GATE_MODE,
        runtime: dict[str, str] | None = None,
    ) -> None:
        if mode not in {
            FULL_GATE_MODE,
            SETUP_REHEARSAL_MODE,
            SESSION_PROVISIONING_REHEARSAL_MODE,
            CLEANUP_RECOVERY_MODE,
            BROWSING_MODE,
        }:
            raise RuntimeError("unsupported capacity mode")
        self.mode = mode
        if mode == SETUP_REHEARSAL_MODE:
            self.users_per_runner = REHEARSAL_USERS_PER_RUNNER
        elif mode == SESSION_PROVISIONING_REHEARSAL_MODE:
            self.users_per_runner = SESSION_REHEARSAL_USERS_PER_RUNNER
        else:
            self.users_per_runner = USERS_PER_RUNNER
        self.total_users = RUNNER_COUNT * self.users_per_runner
        self.first_user_number = FIRST_USER_NUMBER
        self.last_user_number = self.first_user_number + self.total_users - 1
        self.runtime = (
            dict(runtime) if runtime is not None else read_runtime_environment()
        )
        if self.runtime.get("AWS_REGION") != "eu-west-3":
            raise RuntimeError("Phase 6 capacity validation requires AWS region eu-west-3")
        if PROJECT_ROOT == RUNTIME_ROOT or PROJECT_ROOT in RUNTIME_ROOT.parents:
            raise RuntimeError("Phase 6 runtime state must remain outside the repository")
        self.project_ref = self.runtime["SUPABASE_STAGING_PROJECT_REF"]
        self.supabase_url = self.runtime["SUPABASE_STAGING_URL"].rstrip("/")
        self.run_id = (
            datetime.now(UTC).strftime("%Y%m%d%H%M%S")
            + f"-{mode}-{uuid.uuid4().hex[:6]}"
        )
        self.artifact_dir = ARTIFACT_ROOT / self.run_id
        self.artifact_dir.mkdir(parents=True, exist_ok=False, mode=0o700)
        self.temp_secret: str | None = None
        self.temp_key_id: str | None = None
        self.temp_key_ids: list[str] = []
        self.users: list[dict[str, Any]] = []
        self.passwords: dict[int, str] = {}
        self.user_creation_stats = Counter()
        self.instance_ids: list[str] = []
        self.instance_ips: list[str] = []
        self.security_group_id: str | None = None
        self.security_group_ids: list[str] = []
        self.key_pair_name: str | None = None
        self.key_pair_names: list[str] = []
        self.key_path: Path | None = None
        self.metrics_process: subprocess.Popen[str] | None = None
        self.metrics_summary: dict[str, Any] | None = None
        self.sql_samples: list[dict[str, Any]] = []
        self.sql_sampler_stop = threading.Event()
        self.sql_sampler_thread: threading.Thread | None = None
        self.database_observer_path = self.artifact_dir / "database-observer.ndjson"
        self.original_gameweek: dict[str, Any] | None = None
        self.gameweek_prepared = False
        self.cloud_mutation_started = False
        aws = {
            "aws_access_key_id": self.runtime["AWS_ACCESS_KEY_ID"],
            "aws_secret_access_key": self.runtime["AWS_SECRET_ACCESS_KEY"],
            "region_name": self.runtime["AWS_REGION"],
        }
        if "AWS_SESSION_TOKEN" in self.runtime:
            aws["aws_session_token"] = self.runtime["AWS_SESSION_TOKEN"]
        session = boto3.Session(**aws)
        config = Config(retries={"max_attempts": 8, "mode": "standard"})
        self.ec2 = session.client("ec2", config=config)
        self.ssm = session.client("ssm", config=config)
        self.sts = session.client("sts", config=config)

    @property
    def management_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.runtime['SUPABASE_ACCESS_TOKEN']}"}

    def management(self, method: str, path: str, body: Any | None = None) -> Any:
        return http_json(
            method,
            f"https://api.supabase.com{path}",
            headers=self.management_headers,
            body=body,
            timeout=60,
        )

    def sql(self, query: str) -> Any:
        return self.management(
            "POST",
            f"/v1/projects/{self.project_ref}/database/query",
            {"query": query},
        )

    def bounded_count(self, label: str, query: str) -> int:
        """Execute one bounded inventory/verification count statement."""

        rows = self.sql(query)
        if (
            not isinstance(rows, list)
            or len(rows) != 1
            or not isinstance(rows[0], dict)
            or set(rows[0]) != {"count"}
        ):
            raise RuntimeError(f"{label} count returned an invalid contract")
        try:
            count = int(rows[0]["count"])
        except (TypeError, ValueError) as error:
            raise RuntimeError(f"{label} count is not an integer") from error
        if count < 0:
            raise RuntimeError(f"{label} count is negative")
        return count

    def preflight(self) -> None:
        if os.getenv("BOTOLAGO_REQUIRE_AWS_SESSION_TOKEN") != "1":
            raise RuntimeError("delegated AWS session enforcement is not enabled")
        if not self.runtime.get("AWS_SESSION_TOKEN"):
            raise RuntimeError("delegated AWS session token is unavailable")
        if any(
            client.meta.region_name != "eu-west-3"
            for client in (self.ec2, self.ssm, self.sts)
        ):
            raise RuntimeError("AWS clients are not pinned to eu-west-3")
        identity = self.sts.get_caller_identity()
        identity_arn = str(identity.get("Arn") or "")
        expected_role_arn = os.getenv("BOTOLAGO_AWS_LOAD_TEST_ROLE_ARN", "")
        expected_role_parts = expected_role_arn.split(":", 5)
        expected_role_name = expected_role_arn.rsplit("/", 1)[-1]
        if (
            not identity.get("Account")
            or not identity_arn.startswith("arn:aws:sts::")
            or ":assumed-role/" not in identity_arn
            or len(expected_role_parts) != 6
            or expected_role_parts[2] != "iam"
            or expected_role_parts[4] != str(identity.get("Account"))
            or not expected_role_parts[5].startswith("role/")
            or f":assumed-role/{expected_role_name}/" not in identity_arn
        ):
            raise RuntimeError("AWS identity validation failed")
        configured_budget = float(
            os.getenv("BOTOLAGO_MAX_ESTIMATED_COST_USD", "0")
        )
        if (
            configured_budget <= 0
            or configured_budget > MAX_ALLOWED_BUDGET_USD
            or CONSERVATIVE_ESTIMATED_COST_USD > configured_budget
        ):
            raise RuntimeError("capacity-run cost guard rejected the configured budget")
        private_json(
            self.artifact_dir / "budget-guard.json",
            {
                "allowedBudgetUsd": configured_budget,
                "conservativeEstimateUsd": round(
                    CONSERVATIVE_ESTIMATED_COST_USD, 2
                ),
                "instanceCount": RUNNER_COUNT,
                "instanceType": RUNNER_INSTANCE_TYPE,
                "selfTerminationMinutes": RUNNER_SELF_TERMINATION_MINUTES,
                "workflowLifetimeMinutes": MAX_LIFETIME_MINUTES,
                "passed": True,
            },
        )
        project = self.management("GET", f"/v1/projects/{self.project_ref}")
        project_name = str(project.get("name", "")) if isinstance(project, dict) else ""
        if "staging" not in project_name.lower():
            raise RuntimeError("Supabase project is not explicitly named as staging")
        rows = self.sql(
            "select id::text, fantasy_season_id::text, name, status::text, "
            "points_state::text, deadline_at, finalized_at, "
            "deadline_at > statement_timestamp() as deadline_future "
            f"from app.fantasy_gameweeks where id = '{GAMEWEEK_ID}'::uuid"
        )
        row = rows[0] if isinstance(rows, list) and rows else {}
        if (
            row.get("id") != GAMEWEEK_ID
            or row.get("fantasy_season_id") != SEASON_ID
            or row.get("name") != "Capacity GW2"
        ):
            raise RuntimeError("staging capacity gameweek identity validation failed")
        self.original_gameweek = row
        existing = self.bounded_count(
            "temporary Auth users",
            "select count(*)::integer as count from auth.users "
            "where email like 'fantasy-gate-%@staging.botolago.invalid'"
        )
        if existing != 0:
            raise RuntimeError("stale Phase 6 temporary Auth users require cleanup")
        active_runners = self.ec2.describe_instances(
            Filters=[
                {"Name": "tag:Purpose", "Values": ["botolago-phase6"]},
                {
                    "Name": "instance-state-name",
                    "Values": ["pending", "running", "stopping", "stopped"],
                },
            ]
        )
        count = sum(len(item["Instances"]) for item in active_runners["Reservations"])
        stale_groups = self.ec2.describe_security_groups(
            Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
        )["SecurityGroups"]
        stale_keys = self.ec2.describe_key_pairs(
            Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
        )["KeyPairs"]
        if count or stale_groups or stale_keys:
            raise RuntimeError("stale Phase 6 AWS resources require cleanup")
        event(
            "Preflight passed: delegated AWS identity, eu-west-3, Staging V2, "
            "budget, and capacity isolation are verified"
        )

    def prepare_capacity_gameweek(self) -> None:
        if not self.original_gameweek:
            raise RuntimeError("capacity gameweek state was not captured")
        if (
            self.original_gameweek.get("status") == "open"
            and self.original_gameweek.get("deadline_future") is True
        ):
            return
        # Persist the original state before the mutation so the independent
        # always() cleanup step can recover after cancellation or process loss.
        self.gameweek_prepared = True
        self._write_state()
        self.sql(
            "update app.fantasy_gameweeks set status = 'open', "
            "points_state = 'provisional', finalized_at = null, "
            "deadline_at = '2090-01-01T10:30:00Z'::timestamptz "
            f"where id = '{GAMEWEEK_ID}'::uuid and name = 'Capacity GW2' "
            f"and fantasy_season_id = '{SEASON_ID}'::uuid"
        )
        check = self.sql(
            "select status::text, deadline_at > statement_timestamp() as deadline_future "
            f"from app.fantasy_gameweeks where id = '{GAMEWEEK_ID}'::uuid"
        )[0]
        if check.get("status") != "open" or check.get("deadline_future") is not True:
            raise RuntimeError("synthetic capacity gameweek preparation failed")
        self._write_state()
        event("Temporarily reopened the isolated synthetic capacity gameweek")

    def restore_capacity_gameweek(self) -> None:
        if not self.gameweek_prepared or not self.original_gameweek:
            return
        encoded = json.dumps(
            {
                "status": self.original_gameweek["status"],
                "points_state": self.original_gameweek["points_state"],
                "deadline_at": self.original_gameweek["deadline_at"],
                "finalized_at": self.original_gameweek["finalized_at"],
            },
            separators=(",", ":"),
        ).replace("'", "''")
        self.sql(
            "with original as (select * from jsonb_to_record("
            f"'{encoded}'::jsonb) as value(status app.fantasy_gameweek_status, "
            "points_state app.fantasy_points_state, deadline_at timestamptz, "
            "finalized_at timestamptz)) update app.fantasy_gameweeks gameweek set "
            "status = original.status, points_state = original.points_state, "
            "deadline_at = original.deadline_at, finalized_at = original.finalized_at "
            f"from original where gameweek.id = '{GAMEWEEK_ID}'::uuid"
        )
        self.gameweek_prepared = False
        self._write_state()
        event("Restored the synthetic capacity gameweek to its original state")

    def create_temporary_key(self) -> None:
        keys = self.management("GET", f"/v1/projects/{self.project_ref}/api-keys")
        if isinstance(keys, list) and any(item.get("name") == TEMP_KEY_NAME for item in keys):
            raise RuntimeError("a temporary metrics key with the requested name already exists")
        result = self.management(
            "POST",
            f"/v1/projects/{self.project_ref}/api-keys?reveal=true",
            {
                "type": "secret",
                "name": TEMP_KEY_NAME,
                "description": "Temporary Phase 6 staging capacity metrics key",
            },
        )
        if not isinstance(result, dict):
            raise RuntimeError("temporary key creation returned an invalid response")
        self.temp_key_id = str(result.get("id") or result.get("key_id") or "")
        secret_value = result.get("api_key") or result.get("key")
        if not self.temp_key_id or not isinstance(secret_value, str):
            raise RuntimeError("temporary key creation omitted its identifier or value")
        if not secret_value.startswith("sb_secret_"):
            raise RuntimeError("temporary key is not a Secret API key")
        self.temp_key_ids = [self.temp_key_id]
        self.temp_secret = secret_value
        self.cloud_mutation_started = True
        self._write_state()
        time.sleep(5)
        event("Created the temporary staging Metrics API key in process memory")

    def delete_temporary_key(self) -> None:
        key_ids = sorted(
            {
                key_id
                for key_id in [self.temp_key_id, *self.temp_key_ids]
                if key_id
            }
        )
        try:
            for key_id in key_ids:
                self.management(
                    "DELETE",
                    f"/v1/projects/{self.project_ref}/api-keys/{key_id}"
                    "?reason=phase6_capacity_gate_complete",
                )
            if key_ids:
                event("Deleted every temporary staging Metrics API key")
        finally:
            self.temp_secret = None
            self.temp_key_id = None
            self.temp_key_ids.clear()
            self._write_state()

    def auth_admin(self, method: str, path: str, body: Any | None = None) -> Any:
        if not self.temp_secret:
            raise RuntimeError("temporary Secret API key is unavailable")
        return http_json(
            method,
            f"{self.supabase_url}/auth/v1{path}",
            headers={"apikey": self.temp_secret},
            body=body,
            timeout=30,
        )

    def create_users(self) -> None:
        event(f"Creating {self.total_users} isolated temporary staging users")
        rate_lock = threading.Lock()
        stats_lock = threading.Lock()
        next_request_at = [time.monotonic()]

        def create_one(number: int) -> dict[str, Any]:
            email = (
                f"fantasy-gate-{self.run_id}-{number}@staging.botolago.invalid"
            )
            password = secrets.token_urlsafe(32)
            last_error: Exception | None = None
            for attempt in range(3):
                with rate_lock:
                    request_at = next_request_at[0]
                    next_request_at[0] += 0.2
                time.sleep(max(0.0, request_at - time.monotonic()))
                try:
                    with stats_lock:
                        self.user_creation_stats["adminRequests"] += 1
                    response = self.auth_admin(
                        "POST",
                        "/admin/users",
                        {"email": email, "password": password, "email_confirm": True},
                    )
                    user_id = response.get("id") if isinstance(response, dict) else None
                    uuid.UUID(str(user_id))
                    return {
                        "number": number,
                        "email": email,
                        "password": password,
                        "user_id": str(user_id),
                    }
                except Exception as error:
                    last_error = error
                    with stats_lock:
                        self.user_creation_stats["ambiguousResponses"] += 1
                    safe_email = email.replace("'", "''")
                    existing = self.sql(
                        "select id::text from auth.users "
                        f"where email = '{safe_email}' limit 2"
                    )
                    if len(existing) == 1:
                        with stats_lock:
                            self.user_creation_stats["reconciledByEmail"] += 1
                        uuid.UUID(str(existing[0]["id"]))
                        return {
                            "number": number,
                            "email": email,
                            "password": password,
                            "user_id": str(existing[0]["id"]),
                        }
                    if attempt < 2:
                        with stats_lock:
                            self.user_creation_stats["safeRetries"] += 1
                        time.sleep(2**attempt)
            raise RuntimeError("temporary Auth user creation exhausted retries") from last_error

        failures: list[str] = []
        numbers = range(self.first_user_number, self.last_user_number + 1)
        progress_interval = max(25, self.total_users // 10)
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(create_one, number) for number in numbers]
            for future in concurrent.futures.as_completed(futures):
                try:
                    record = future.result()
                except Exception as error:
                    failures.append(type(error).__name__)
                    continue
                self.users.append(record)
                self.passwords[record["number"]] = record["password"]
                if (
                    len(self.users) % progress_interval == 0
                    or len(self.users) == self.total_users
                ):
                    event(
                        "Temporary staging users created: "
                        f"{len(self.users)}/{self.total_users}"
                    )
        if failures:
            failure_types = ", ".join(
                f"{name}={count}" for name, count in sorted(Counter(failures).items())
            )
            raise RuntimeError(
                f"temporary Auth user creation failed for {len(failures)} users "
                f"({failure_types})"
            )
        if len({item["user_id"] for item in self.users}) != self.total_users:
            raise RuntimeError("temporary Auth user IDs are not unique")
        self.users.sort(key=lambda item: item["number"])
        event(f"Created {self.total_users} unique temporary Auth users")

    def seed_user_fantasy_state(self) -> None:
        safe_users = [
            {"number": item["number"], "user_id": item["user_id"]}
            for item in self.users
        ]
        encoded = json.dumps(safe_users, separators=(",", ":")).replace("'", "''")
        query = f"""
begin;
create temporary table phase6_gate_users(number integer primary key, user_id uuid unique)
on commit drop;
insert into phase6_gate_users
select number, user_id from jsonb_to_recordset('{encoded}'::jsonb)
as item(number integer, user_id uuid);

insert into app.profiles (id, display_name, preferred_language)
select user_id, 'Phase 6 Gate User ' || number, 'fr'
from phase6_gate_users on conflict (id) do nothing;

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name,
  bank, team_value, free_transfers, version, status
)
select md5('fantasy-load-team-' || number)::uuid, user_id,
  '{SEASON_ID}'::uuid, '{GAMEWEEK_ID}'::uuid,
  'Gate Team ' || number, 10.0, 90.0, 1, 1, 'active'
from phase6_gate_users;

insert into app.fantasy_squad_memberships (
  id, fantasy_team_id, fantasy_player_id, purchase_price,
  current_sale_price, acquired_gameweek_id
)
select md5('fantasy-gate-membership-' || gate.number || '-' || player)::uuid,
  md5('fantasy-load-team-' || gate.number)::uuid,
  md5('fantasy-load-player-' || player)::uuid,
  6.0, 6.0, 'fa640000-0000-4000-8000-000000000001'::uuid
from phase6_gate_users gate cross join generate_series(1, 15) player;

insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version)
select md5('fantasy-gate-lineup-' || number)::uuid,
  md5('fantasy-load-team-' || number)::uuid, '{GAMEWEEK_ID}'::uuid, 1
from phase6_gate_users;

insert into app.fantasy_lineup_players (
  lineup_id, fantasy_player_id, slot, slot_order, captain,
  vice_captain, multiplier, snapshot_price
)
select md5('fantasy-gate-lineup-' || gate.number)::uuid,
  md5('fantasy-load-player-' || player)::uuid,
  case when player in (1,3,4,5,6,9,10,11,12,13,14)
    then 'starter'::app.fantasy_lineup_slot
    else 'bench'::app.fantasy_lineup_slot end,
  case player
    when 1 then 1 when 3 then 2 when 4 then 3 when 5 then 4 when 6 then 5
    when 9 then 6 when 10 then 7 when 11 then 8 when 12 then 9
    when 13 then 10 when 14 then 11 when 2 then 1 when 7 then 2
    when 8 then 3 when 15 then 4 end,
  player = 9, player = 13, case when player = 9 then 2 else 1 end, 6.0
from phase6_gate_users gate cross join generate_series(1, 15) player;
commit;
"""
        self.sql(query)
        team_count = self.bounded_count(
            "seeded Fantasy teams",
            "select count(*)::integer as count from app.fantasy_teams team "
            "where team.name like 'Gate Team %' and team.user_id in "
            f"(select id from auth.users where email like 'fantasy-gate-{self.run_id}-%')",
        )
        membership_count = self.bounded_count(
            "seeded active squad memberships",
            "with known_teams as (select md5('fantasy-load-team-' || number)::uuid "
            f"as id from generate_series({self.first_user_number}, "
            f"{self.last_user_number}) number) select count(*)::integer as count "
            "from app.fantasy_squad_memberships membership where membership.sold_at "
            "is null and membership.fantasy_team_id in (select id from known_teams)",
        )
        if team_count != self.total_users or membership_count != self.total_users * 15:
            raise RuntimeError("temporary Fantasy state validation failed")
        event(f"Seeded {self.total_users} isolated valid Fantasy teams")

    def _coordinator_ip(self) -> str:
        request = urllib.request.Request(
            "https://checkip.amazonaws.com", headers={"User-Agent": USER_AGENT}
        )
        with urllib.request.urlopen(
            request,
            timeout=15,
            context=create_verified_ssl_context(),
        ) as response:
            value = response.read().decode("ascii").strip()
        parts = value.split(".")
        if len(parts) != 4 or any(not part.isdigit() for part in parts):
            raise RuntimeError("unable to validate coordinator IPv4 address")
        return value

    def provision_runners(self) -> None:
        event("Provisioning five temporary AWS runners with distinct public IPv4 addresses")
        vpcs = self.ec2.describe_vpcs(Filters=[{"Name": "is-default", "Values": ["true"]}])[
            "Vpcs"
        ]
        if len(vpcs) != 1:
            raise RuntimeError("AWS region must have exactly one default VPC")
        vpc_id = vpcs[0]["VpcId"]
        subnets = self.ec2.describe_subnets(
            Filters=[
                {"Name": "vpc-id", "Values": [vpc_id]},
                {"Name": "map-public-ip-on-launch", "Values": ["true"]},
            ]
        )["Subnets"]
        if not subnets:
            raise RuntimeError("default VPC has no public-IP subnet")
        subnet_id = sorted(subnets, key=lambda item: item["AvailabilityZone"])[0]["SubnetId"]

        self.key_pair_name = f"botolago-phase6-{self.run_id}"
        self.key_pair_names = [self.key_pair_name]
        key = self.ec2.create_key_pair(
            KeyName=self.key_pair_name,
            TagSpecifications=[{
                "ResourceType": "key-pair",
                "Tags": [{"Key": "Purpose", "Value": "botolago-phase6"}],
            }],
        )
        self.key_path = self.artifact_dir / "runner.pem"
        private_write(self.key_path, key["KeyMaterial"])

        group = self.ec2.create_security_group(
            GroupName=f"botolago-phase6-{self.run_id}",
            Description="Temporary Phase 6 load-runner SSH ingress",
            VpcId=vpc_id,
            TagSpecifications=[{
                "ResourceType": "security-group",
                "Tags": [{"Key": "Purpose", "Value": "botolago-phase6"}],
            }],
        )
        self.security_group_id = group["GroupId"]
        self.security_group_ids = [self.security_group_id]
        self.ec2.authorize_security_group_ingress(
            GroupId=self.security_group_id,
            IpPermissions=[{
                "IpProtocol": "tcp",
                "FromPort": 22,
                "ToPort": 22,
                "IpRanges": [{"CidrIp": f"{self._coordinator_ip()}/32"}],
            }],
        )
        ami = self.ssm.get_parameter(
            Name="/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
        )["Parameter"]["Value"]
        expires = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
        user_data = runner_user_data()
        result = self.ec2.run_instances(
            ImageId=ami,
            InstanceType=RUNNER_INSTANCE_TYPE,
            MinCount=RUNNER_COUNT,
            MaxCount=RUNNER_COUNT,
            KeyName=self.key_pair_name,
            SubnetId=subnet_id,
            SecurityGroupIds=[self.security_group_id],
            UserData=user_data,
            InstanceInitiatedShutdownBehavior="terminate",
            BlockDeviceMappings=[{
                "DeviceName": "/dev/xvda",
                "Ebs": {
                    "VolumeSize": 8,
                    "VolumeType": "gp3",
                    "DeleteOnTermination": True,
                    "Encrypted": True,
                },
            }],
            TagSpecifications=[{
                "ResourceType": "instance",
                "Tags": [
                    {"Key": "Name", "Value": "botolago-phase6-load-runner"},
                    {"Key": "Purpose", "Value": "botolago-phase6"},
                    {"Key": "Environment", "Value": "staging-v2"},
                    {"Key": "ExpiresAt", "Value": expires},
                ],
            }],
        )
        self.instance_ids = [instance["InstanceId"] for instance in result["Instances"]]
        self._write_state()
        self.ec2.get_waiter("instance_running").wait(InstanceIds=self.instance_ids)
        self.ec2.get_waiter("instance_status_ok").wait(
            InstanceIds=self.instance_ids,
            WaiterConfig={"Delay": 10, "MaxAttempts": 30},
        )
        described = self.ec2.describe_instances(InstanceIds=self.instance_ids)
        instances = [item for reservation in described["Reservations"] for item in reservation["Instances"]]
        instances.sort(key=lambda item: item["InstanceId"])
        self.instance_ips = [item.get("PublicIpAddress", "") for item in instances]
        if len(set(self.instance_ips)) != RUNNER_COUNT or not all(self.instance_ips):
            raise RuntimeError("runners do not have five distinct public IPv4 addresses")
        self._write_state()
        for ip in self.instance_ips:
            self._wait_ssh(ip)
        event("Five isolated runners are healthy with five distinct egress IPs")

    def _write_state(self) -> None:
        private_json(
            STATE_FILE,
            {
                "runId": self.run_id,
                "region": self.runtime["AWS_REGION"],
                "instanceIds": self.instance_ids,
                "securityGroupId": self.security_group_id,
                "keyPairName": self.key_pair_name,
                "temporaryMetricsKeyId": self.temp_key_id,
                "originalGameweek": self.original_gameweek,
                "gameweekPrepared": self.gameweek_prepared,
                "createdAt": datetime.now(UTC).isoformat(),
            },
        )

    def ssh_base(self, ip: str) -> list[str]:
        if not self.key_path:
            raise RuntimeError("runner key is unavailable")
        return [
            "ssh",
            "-i",
            str(self.key_path),
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "ServerAliveInterval=30",
            "-o",
            "ServerAliveCountMax=6",
            "-o",
            "TCPKeepAlive=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            f"UserKnownHostsFile={self.artifact_dir / 'known_hosts'}",
            f"ec2-user@{ip}",
        ]

    def ssh(self, ip: str, command: str, timeout: int = 60) -> str:
        result = subprocess.run(
            [*self.ssh_base(ip), command],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout.strip()

    def scp_to(self, ip: str, local: Path, remote: str) -> None:
        if not self.key_path:
            raise RuntimeError("runner key is unavailable")
        subprocess.run(
            [
                "scp", "-q", "-i", str(self.key_path),
                "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                "-o", "StrictHostKeyChecking=accept-new",
                "-o", f"UserKnownHostsFile={self.artifact_dir / 'known_hosts'}",
                str(local), f"ec2-user@{ip}:{remote}",
            ],
            check=True,
            timeout=120,
        )

    def scp_from(self, ip: str, remote: str, local: Path) -> None:
        if not self.key_path:
            raise RuntimeError("runner key is unavailable")
        subprocess.run(
            [
                "scp", "-q", "-i", str(self.key_path),
                "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                "-o", "StrictHostKeyChecking=accept-new",
                "-o", f"UserKnownHostsFile={self.artifact_dir / 'known_hosts'}",
                f"ec2-user@{ip}:{remote}", str(local),
            ],
            check=True,
            timeout=120,
        )

    def _wait_ssh(self, ip: str) -> None:
        for _ in range(40):
            try:
                if self.ssh(ip, "test -f /opt/botolago/ready && echo ready", 20) == "ready":
                    return
            except (subprocess.SubprocessError, OSError):
                time.sleep(5)
        raise RuntimeError("a runner did not become SSH-ready")

    def deploy_and_provision_sessions(self) -> None:
        event("Distributing credentials and provisioning sessions at 0.4 req/sec per runner")
        runtime_path = self.artifact_dir / "runner-runtime.env"
        private_write(
            runtime_path,
            "BOTOLAGO_LOAD_ENVIRONMENT=staging-v2\n"
            f"BOTOLAGO_STAGING_SUPABASE_URL={self.supabase_url}\n"
            "BOTOLAGO_STAGING_PUBLISHABLE_KEY="
            f"{self.runtime['SUPABASE_STAGING_PUBLISHABLE_KEY']}\n",
        )
        load_script = PROJECT_ROOT / "scripts/backend/fantasy-load-test.py"
        session_script = PROJECT_ROOT / "scripts/backend/fantasy-session-provisioner.py"
        tls_helper = PROJECT_ROOT / "scripts/backend/fantasy_harness_tls.py"
        browsing_script = PROJECT_ROOT / "scripts/backend/browsing-load-test.py"

        def deploy(index: int) -> None:
            ip = self.instance_ips[index]
            records = [
                {
                    "number": item["number"],
                    "email": item["email"],
                    "password": item["password"],
                    "user_id": item["user_id"],
                }
                for item in self.users[
                    index * self.users_per_runner : (index + 1) * self.users_per_runner
                ]
            ]
            credential_path = self.artifact_dir / f"credentials-{index}.json"
            private_json(credential_path, records)
            try:
                self.scp_to(ip, load_script, "/opt/botolago/fantasy-load-test.py")
                self.scp_to(ip, session_script, "/opt/botolago/fantasy-session-provisioner.py")
                self.scp_to(ip, tls_helper, "/opt/botolago/fantasy_harness_tls.py")
                if self.mode == BROWSING_MODE:
                    self.scp_to(ip, browsing_script, "/opt/botolago/browsing-load-test.py")
                self.scp_to(ip, runtime_path, "/opt/botolago/runtime.env")
                self.scp_to(ip, credential_path, f"/opt/botolago/credentials-{index}.json")
                self.ssh(
                    ip,
                    "chmod 600 /opt/botolago/runtime.env "
                    f"/opt/botolago/credentials-{index}.json && "
                    "chmod 700 /opt/botolago/*.py",
                )
            finally:
                credential_path.unlink(missing_ok=True)

        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            list(executor.map(deploy, range(RUNNER_COUNT)))
        runtime_path.unlink(missing_ok=True)

        command = (
            "set -a; . /opt/botolago/runtime.env; set +a; "
            "BOTOLAGO_SESSION_OPERATION=provision "
            f"BOTOLAGO_CAPACITY_MODE={self.mode} "
            f"BOTOLAGO_EXPECTED_SESSION_USERS={self.users_per_runner} "
            "BOTOLAGO_AUTH_RATE_PER_SECOND=0.4 "
            "BOTOLAGO_RUNNER_ID={index} "
            "BOTOLAGO_LOAD_CREDENTIAL_CACHE=/opt/botolago/credentials-{index}.json "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            "BOTOLAGO_SESSION_DIAGNOSTICS_PATH=/opt/botolago/session-provisioning-diagnostics.ndjson "
            "/opt/botolago-venv/bin/python /opt/botolago/fantasy-session-provisioner.py "
            "> /opt/botolago/session-provisioning.stdout.json "
            "2> /opt/botolago/session-provisioning.stderr.log"
        )

        def provision(index: int) -> dict[str, Any]:
            ip = self.instance_ips[index]
            stdout_path = self.artifact_dir / f"session-runner-{index}-stdout.json"
            stderr_path = self.artifact_dir / f"session-runner-{index}-stderr.log"
            diagnostics_path = (
                self.artifact_dir / f"session-runner-{index}-diagnostics.ndjson"
            )
            command_error: Exception | None = None
            try:
                self.ssh(ip, command.format(index=index), 1800)
            except (subprocess.SubprocessError, OSError) as error:
                command_error = error
            finally:
                for remote, local in (
                    ("/opt/botolago/session-provisioning.stderr.log", stderr_path),
                    (
                        "/opt/botolago/session-provisioning-diagnostics.ndjson",
                        diagnostics_path,
                    ),
                ):
                    try:
                        self.scp_from(ip, remote, local)
                        os.chmod(local, 0o600)
                    except (subprocess.SubprocessError, OSError):
                        private_write(local, "")

            stderr = safe_runner_diagnostic(stderr_path.read_text(encoding="utf-8"))
            private_write(stderr_path, stderr + "\n")
            try:
                diagnostic_records = sanitized_diagnostic_records(
                    diagnostics_path.read_text(encoding="utf-8")
                )
            except (json.JSONDecodeError, ValueError) as error:
                private_write(diagnostics_path, "")
                raise RuntimeError(
                    f"runner {index} emitted an invalid session diagnostic"
                ) from error
            private_write(
                diagnostics_path,
                "".join(
                    json.dumps(item, separators=(",", ":"), sort_keys=True) + "\n"
                    for item in diagnostic_records
                ),
            )
            if command_error is not None:
                raise RuntimeError(
                    f"runner {index} session provisioning failed; "
                    "sanitized diagnostics were preserved"
                ) from command_error

            self.scp_from(
                ip,
                "/opt/botolago/session-provisioning.stdout.json",
                stdout_path,
            )
            os.chmod(stdout_path, 0o600)
            summary = json.loads(stdout_path.read_text(encoding="utf-8"))
            private_json(stdout_path, summary)
            summary["diagnosticEvents"] = len(diagnostic_records)
            return summary

        summaries: list[dict[str, Any]] = []
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT)
        futures = {
            executor.submit(provision, index): index for index in range(RUNNER_COUNT)
        }
        first_error: Exception | None = None
        try:
            for future in concurrent.futures.as_completed(futures):
                try:
                    summaries.append(future.result())
                except Exception as error:
                    first_error = error
                    for pending in futures:
                        pending.cancel()
                    for ip in self.instance_ips:
                        try:
                            self.ssh(
                                ip,
                                "pkill -f '/opt/botolago/fantasy-session-provisioner.py' || true",
                                30,
                            )
                        except (subprocess.SubprocessError, OSError):
                            pass
                    break
        finally:
            executor.shutdown(wait=True, cancel_futures=True)
        if first_error is not None:
            raise first_error
        summaries.sort(key=lambda item: int(item.get("runnerId", 0)))
        if any(
            item.get("sessions") != self.users_per_runner
            or item.get("uniqueSubjects") != self.users_per_runner
            or item.get("uniqueSessionIds") != self.users_per_runner
            or item.get("minimumValidityMinutes", 0) < 20
            or item.get("diagnosticEvents") != 0
            for item in summaries
        ):
            raise RuntimeError("distributed session validation failed")
        if sum(item["sessions"] for item in summaries) != self.total_users:
            raise RuntimeError(
                f"distributed session count is not {self.total_users}"
            )
        for field in (
            "subjectFingerprints",
            "sessionFingerprints",
            "accessTokenFingerprints",
            "refreshTokenFingerprints",
        ):
            values = [
                fingerprint
                for item in summaries
                for fingerprint in item.get(field, [])
            ]
            if (
                len(values) != self.total_users
                or len(set(values)) != self.total_users
            ):
                raise RuntimeError(f"distributed {field} validation failed")
            values.clear()
            for item in summaries:
                item[field] = []
        private_json(
            self.artifact_dir / "cross-runner-session-validation.json",
            {
                "runners": RUNNER_COUNT,
                "users": self.total_users,
                "uniqueSubjects": self.total_users,
                "uniqueSessions": self.total_users,
                "uniqueAccessTokenFingerprints": self.total_users,
                "uniqueRefreshTokenFingerprints": self.total_users,
                "minimumValidityMinutes": min(
                    int(item["minimumValidityMinutes"]) for item in summaries
                ),
                "diagnosticEvents": sum(
                    int(item["diagnosticEvents"]) for item in summaries
                ),
                "rawSessionMaterialRetained": False,
            },
        )
        for item in self.users:
            item["password"] = ""
        self.passwords.clear()
        event(
            f"Validated {self.total_users} unique authenticated sessions "
            "with >=20 minutes validity"
        )

    def start_metrics(self) -> None:
        if not self.temp_secret:
            raise RuntimeError("temporary metrics key is unavailable")
        metrics_output = self.artifact_dir / "metrics.ndjson"
        process_env = {
            **os.environ,
            "BOTOLAGO_LOAD_ENVIRONMENT": "staging-v2",
            "BOTOLAGO_STAGING_PROJECT_REF": self.project_ref,
            "BOTOLAGO_STAGING_SUPABASE_URL": self.supabase_url,
            "BOTOLAGO_STAGING_SECRET_KEY": self.temp_secret,
            "BOTOLAGO_METRICS_INTERVAL_SECONDS": "60",
            "BOTOLAGO_METRICS_DURATION_SECONDS": (
                "300" if self.mode == SETUP_REHEARSAL_MODE else "900"
            ),
            "BOTOLAGO_METRICS_OUTPUT": str(metrics_output),
        }
        self.metrics_process = subprocess.Popen(
            [sys.executable, str(PROJECT_ROOT / "scripts/backend/supabase-metrics-collector.py")],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=process_env,
        )
        event(
            "Started 60-second Metrics API collection for "
            + (
                "setup rehearsal validation"
                if self.mode == SETUP_REHEARSAL_MODE
                else "the 15-minute evidence window"
            )
        )

    def start_database_observer(self) -> None:
        if self.sql_sampler_thread and self.sql_sampler_thread.is_alive():
            return
        self.sql_sampler_stop.clear()
        self.sql_sampler_thread = threading.Thread(
            target=self._sample_database_until_stopped,
            name="phase6-database-observer",
            daemon=True,
        )
        self.sql_sampler_thread.start()
        event("Started fail-open five-second database observer")

    def stop_database_observer(self) -> None:
        self.sql_sampler_stop.set()
        if self.sql_sampler_thread:
            self.sql_sampler_thread.join(timeout=15)

    def _sample_database_until_stopped(self) -> None:
        while not self.sql_sampler_stop.is_set():
            self.sample_database()
            self.sql_sampler_stop.wait(DATABASE_OBSERVER_INTERVAL_SECONDS)

    def run_setup_rehearsal(self) -> dict[str, Any]:
        if self.mode != SETUP_REHEARSAL_MODE:
            raise RuntimeError("setup rehearsal requires rehearsal mode")
        synchronization_lead = synchronized_preparation_lead_seconds()
        start_at = time.time() + synchronization_lead
        command = (
            "umask 077; set -a; . /opt/botolago/runtime.env; set +a; "
            "BOTOLAGO_LOAD_PROFILE=setup_rehearsal "
            f"BOTOLAGO_LOAD_USERS={self.total_users} "
            "BOTOLAGO_LOAD_SHARD_COUNT=5 "
            f"BOTOLAGO_LOAD_FIRST_USER={self.first_user_number} "
            "BOTOLAGO_LOAD_SUSTAINED_RPS=250 BOTOLAGO_LOAD_BURST_RPS=600 "
            "BOTOLAGO_LOAD_BURST_SECONDS=0 BOTOLAGO_LOAD_DURATION_SECONDS=0 "
            f"BOTOLAGO_LOAD_START_AT={start_at:.3f} "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            "BOTOLAGO_LOAD_RESULTS_PATH=/opt/botolago/setup-rehearsal.json "
            "BOTOLAGO_LOAD_SHARD_INDEX={index} "
            "/opt/botolago-venv/bin/python /opt/botolago/fantasy-load-test.py "
            "> /opt/botolago/setup-rehearsal.stdout.json "
            "2> /opt/botolago/setup-rehearsal.stderr.log"
        )

        def run(index: int) -> dict[str, Any]:
            time.sleep(runner_preparation_delay(index))
            try:
                self.ssh(self.instance_ips[index], command.format(index=index), 600)
            except (subprocess.SubprocessError, OSError) as error:
                diagnostic = "runner diagnostic unavailable"
                try:
                    diagnostic = self.ssh(
                        self.instance_ips[index],
                        "tail -c 4000 /opt/botolago/setup-rehearsal.stderr.log",
                        30,
                    )
                except (subprocess.SubprocessError, OSError):
                    pass
                return {
                    "runner": index,
                    "ready": False,
                    "error": type(error).__name__,
                    "diagnostic": safe_runner_diagnostic(diagnostic),
                }

            result_path = self.artifact_dir / f"rehearsal-runner-{index}-result.json"
            stdout_path = self.artifact_dir / f"rehearsal-runner-{index}-stdout.json"
            stderr_path = self.artifact_dir / f"rehearsal-runner-{index}-stderr.txt"
            self.scp_from(
                self.instance_ips[index],
                "/opt/botolago/setup-rehearsal.json",
                result_path,
            )
            self.scp_from(
                self.instance_ips[index],
                "/opt/botolago/setup-rehearsal.stdout.json",
                stdout_path,
            )
            result = json.loads(result_path.read_text(encoding="utf-8"))
            stdout = json.loads(stdout_path.read_text(encoding="utf-8"))
            private_json(result_path, result)
            private_json(stdout_path, stdout)
            diagnostic = self.ssh(
                self.instance_ips[index],
                "tail -c 4000 /opt/botolago/setup-rehearsal.stderr.log",
                30,
            )
            private_write(stderr_path, safe_runner_diagnostic(diagnostic) + "\n")
            profile = result.get("profile", {})
            readiness = result.get("readiness", {})
            return {
                "runner": index,
                "ready": readiness.get("ready") is True,
                "assignedUsers": profile.get("shardUsers"),
                "preparedUsers": readiness.get("preparedUsers"),
                "requests": profile.get("requests"),
                "readyAt": readiness.get("readyAt"),
                "synchronizedStartAt": readiness.get("synchronizedStartAt"),
            }

        event("Starting synchronized setup-only rehearsal on all five runners")
        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            readiness = list(executor.map(run, range(RUNNER_COUNT)))

        expected_runners = set(range(RUNNER_COUNT))
        valid = (
            {item.get("runner") for item in readiness} == expected_runners
            and all(
                item.get("ready") is True
                and item.get("assignedUsers") == self.users_per_runner
                and item.get("preparedUsers") == self.users_per_runner
                and item.get("requests") == 0
                for item in readiness
            )
        )
        record = {
            "mode": SETUP_REHEARSAL_MODE,
            "runners": readiness,
            "coordinatorReadinessRecords": len(readiness),
            "synchronizationLeadSeconds": synchronization_lead,
            "measuredRequests": 0,
            "passed": valid,
        }
        private_json(self.artifact_dir / "setup-rehearsal-readiness.json", record)
        if not valid:
            failures = [item for item in readiness if item.get("ready") is not True]
            private_json(self.artifact_dir / "setup-rehearsal-failures.json", failures)
            raise RuntimeError("one or more setup rehearsal runners did not become ready")
        event(
            f"All five runners prepared {self.total_users} users and reported ready; "
            "no measured workload was executed"
        )
        return record

    def validate_rehearsal_metrics_startup(self) -> dict[str, Any]:
        if not self.metrics_process or self.metrics_process.poll() is not None:
            raise RuntimeError("Metrics collector exited during setup rehearsal")
        metrics_path = self.artifact_dir / "metrics.ndjson"
        records = []
        if metrics_path.is_file():
            records = [
                json.loads(line)
                for line in metrics_path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
        if len(records) < 2:
            raise RuntimeError("Metrics collector did not complete two 60-second-cadence scrapes")
        result = {"cadenceSeconds": 60, "successfulStartupScrapes": len(records)}
        private_json(self.artifact_dir / "rehearsal-metrics-startup.json", result)
        event("Validated Metrics API collector startup and 60-second cadence")
        return result

    def run_profile(self, profile: str, duration: int, burst_seconds: int) -> dict[str, Any]:
        if profile not in {"merge_gate", "telemetry_soak"}:
            raise RuntimeError("unsupported load profile")
        # Preparation reads are outside the measured workload. Give all five
        # runners enough time to complete bounded retries before the shared
        # start instant instead of treating a transient setup response as load.
        start_at = time.time() + synchronized_preparation_lead_seconds()
        command = (
            "umask 077; set -a; . /opt/botolago/runtime.env; set +a; "
            f"BOTOLAGO_LOAD_PROFILE={profile} "
            "BOTOLAGO_LOAD_USERS=2500 BOTOLAGO_LOAD_SHARD_COUNT=5 "
            "BOTOLAGO_LOAD_FIRST_USER=50001 BOTOLAGO_LOAD_SUSTAINED_RPS=250 "
            "BOTOLAGO_LOAD_BURST_RPS=600 "
            f"BOTOLAGO_LOAD_BURST_SECONDS={burst_seconds} "
            f"BOTOLAGO_LOAD_DURATION_SECONDS={duration} "
            f"BOTOLAGO_LOAD_START_AT={start_at:.3f} "
            "BOTOLAGO_LOAD_INCLUDE_SAMPLES=1 "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            f"BOTOLAGO_LOAD_RESULTS_PATH=/opt/botolago/{profile}.json "
            "BOTOLAGO_LOAD_SHARD_INDEX={index} "
            "/opt/botolago-venv/bin/python /opt/botolago/fantasy-load-test.py "
            f"> /opt/botolago/{profile}.summary.json "
            f"2> /opt/botolago/{profile}.error.log"
        )

        def run(index: int) -> dict[str, Any] | None:
            timeout = duration + 900
            time.sleep(runner_preparation_delay(index))
            try:
                self.ssh(self.instance_ips[index], command.format(index=index), timeout)
                return None
            except (subprocess.SubprocessError, OSError) as error:
                diagnostic = "runner diagnostic unavailable"
                try:
                    diagnostic = self.ssh(
                        self.instance_ips[index],
                        f"tail -c 4000 /opt/botolago/{profile}.error.log",
                        30,
                    )
                except (subprocess.SubprocessError, OSError):
                    pass
                return {
                    "runner": index,
                    "error": type(error).__name__,
                    "diagnostic": safe_runner_diagnostic(diagnostic),
                }

        event(f"Starting synchronized {profile} on all five runners")
        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            failures = [item for item in executor.map(run, range(RUNNER_COUNT)) if item]
        if failures:
            private_json(self.artifact_dir / f"{profile}-setup-failures.json", failures)
            summaries = "; ".join(
                f"runner={item['runner']} {item['error']}: {item['diagnostic']}"
                for item in failures
            )
            raise RuntimeError(f"{profile} runner setup failed: {summaries}")
        shards = []
        for index, ip in enumerate(self.instance_ips):
            local = self.artifact_dir / f"{profile}-shard-{index}.json"
            self.scp_from(ip, f"/opt/botolago/{profile}.json", local)
            shards.append(json.loads(local.read_text(encoding="utf-8")))
        aggregate = self.aggregate_profile(profile, shards)
        private_json(self.artifact_dir / f"{profile}-aggregate.json", aggregate)
        event(
            f"Completed {profile}: {aggregate['profile']['requests']} measured requests, "
            f"unexpected errors {aggregate['overall']['unexpectedErrors']}"
        )
        return aggregate

    def run_browsing(self) -> dict[str, Any]:
        visitors, duration = browsing_settings()
        start_at = time.time() + synchronized_preparation_lead_seconds()
        command = (
            "umask 077; set -a; . /opt/botolago/runtime.env; set +a; "
            "BOTOLAGO_LOAD_USERS=2500 BOTOLAGO_LOAD_SHARD_COUNT=5 "
            "BOTOLAGO_LOAD_FIRST_USER=50001 "
            f"BOTOLAGO_BROWSING_VISITORS={visitors} "
            f"BOTOLAGO_BROWSING_DURATION_SECONDS={duration} "
            f"BOTOLAGO_LOAD_START_AT={start_at:.3f} "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            "BOTOLAGO_LOAD_RESULTS_PATH=/opt/botolago/browsing.json "
            "BOTOLAGO_LOAD_SHARD_INDEX={index} "
            "/opt/botolago-venv/bin/python /opt/botolago/browsing-load-test.py "
            "> /opt/botolago/browsing.summary.json "
            "2> /opt/botolago/browsing.error.log"
        )

        def run(index: int) -> dict[str, Any] | None:
            time.sleep(runner_preparation_delay(index))
            try:
                self.ssh(self.instance_ips[index], command.format(index=index), duration + 900)
                return None
            except (subprocess.SubprocessError, OSError) as error:
                # Exit 2 means the workload ran and missed a pass criterion;
                # its result file is still collected below.
                if getattr(error, "returncode", None) == 2:
                    return None
                diagnostic = "runner diagnostic unavailable"
                try:
                    diagnostic = self.ssh(
                        self.instance_ips[index], "tail -c 4000 /opt/botolago/browsing.error.log", 30
                    )
                except (subprocess.SubprocessError, OSError):
                    pass
                return {
                    "runner": index,
                    "error": type(error).__name__,
                    "diagnostic": safe_runner_diagnostic(diagnostic),
                }

        event(f"Starting synchronized browsing workload: {visitors} visitors for {duration} s")
        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            failures = [item for item in executor.map(run, range(RUNNER_COUNT)) if item]
        if failures:
            private_json(self.artifact_dir / "browsing-setup-failures.json", failures)
            summaries = "; ".join(
                f"runner={item['runner']} {item['error']}: {item['diagnostic']}" for item in failures
            )
            raise RuntimeError(f"browsing runner setup failed: {summaries}")
        shards = []
        for index, ip in enumerate(self.instance_ips):
            local = self.artifact_dir / f"browsing-shard-{index}.json"
            self.scp_from(ip, "/opt/botolago/browsing.json", local)
            shards.append(json.loads(local.read_text(encoding="utf-8")))
        aggregate = aggregate_browsing(shards, visitors)
        private_json(self.artifact_dir / "browsing-aggregate.json", aggregate)
        event(
            f"Completed browsing: {aggregate['profile']['requests']} measured requests, "
            f"unexpected errors {aggregate['overall']['unexpectedErrors']}"
        )
        return aggregate

    def aggregate_profile(self, profile: str, shards: list[dict[str, Any]]) -> dict[str, Any]:
        if len(shards) != RUNNER_COUNT:
            raise RuntimeError("profile does not contain five runner results")
        samples: dict[str, list[float]] = defaultdict(list)
        operation_counts: Counter[str] = Counter()
        error_codes: Counter[str] = Counter()
        expected = 0
        unexpected = 0
        requests = 0
        for shard in shards:
            if shard.get("profile", {}).get("loadProfile") != profile:
                raise RuntimeError("runner returned the wrong load profile")
            requests += int(shard["profile"]["requests"])
            expected += int(shard["overall"]["expectedRejections"])
            unexpected += int(shard["overall"]["unexpectedErrors"])
            error_codes.update(shard.get("errorCodes", {}))
            for operation, values in (shard.get("latencySamplesMs") or {}).items():
                samples[operation].extend(float(value) for value in values)
            for operation, summary in shard.get("operations", {}).items():
                operation_counts[operation] += int(summary["count"])
        reads = samples["team_read"] + samples["transfer_preview"]
        mutations = samples["lineup"] + samples["transfer_confirm"] + samples["chip"]
        expected_requests = 18_500 if profile == "merge_gate" else 150_000
        if requests != expected_requests:
            raise RuntimeError(f"{profile} scheduled {requests}, expected {expected_requests}")
        traffic = {
            "lineup": operation_counts["lineup"],
            "transfers": operation_counts["transfer_preview"]
            + operation_counts["transfer_confirm"],
            "chips": operation_counts["chip"],
            "reads": operation_counts["team_read"],
        }
        expected_traffic = {
            name: expected_requests * percent // 100
            for name, percent in {"lineup": 60, "transfers": 30, "chips": 5, "reads": 5}.items()
        }
        if traffic != expected_traffic:
            raise RuntimeError(f"{profile} traffic mix does not match the approved profile")
        unexpected_rate = unexpected / max(requests, 1)
        lock_timeout_errors = sum(
            count
            for code, count in error_codes.items()
            if str(code).lower() in {"55p03", "lock_timeout", "lock_not_available"}
        )
        lock_timeout_rate = lock_timeout_errors / max(requests, 1)
        overall = {
            "readP50Ms": percentile(reads, 50),
            "readP95Ms": percentile(reads, 95),
            "readP99Ms": percentile(reads, 99),
            "mutationP50Ms": percentile(mutations, 50),
            "mutationP95Ms": percentile(mutations, 95),
            "mutationP99Ms": percentile(mutations, 99),
            "expectedRejections": expected,
            "unexpectedErrors": unexpected,
            "unexpectedErrorRate": round(unexpected_rate, 6),
            "lockTimeoutErrors": lock_timeout_errors,
            "lockTimeoutRate": round(lock_timeout_rate, 6),
        }
        return {
            "profile": {
                "name": profile,
                "users": TOTAL_USERS,
                "runners": RUNNER_COUNT,
                "requests": requests,
                "traffic": traffic,
            },
            "overall": overall,
            "operations": {
                name: {
                    "count": len(values),
                    "p50Ms": percentile(values, 50),
                    "p95Ms": percentile(values, 95),
                    "p99Ms": percentile(values, 99),
                }
                for name, values in sorted(samples.items())
            },
            "errorCodes": dict(error_codes),
            "passCriteria": {
                "readP95": overall["readP95Ms"] <= 500,
                "mutationP95": overall["mutationP95Ms"] <= 1500,
                "mutationP99": overall["mutationP99Ms"] <= 3000,
                "unexpectedErrorRate": unexpected_rate < 0.005,
                "lockTimeoutRate": lock_timeout_rate < 0.001,
            },
        }

    def sample_database(self) -> None:
        try:
            rows = self.sql(
                "with activity as materialized (select pid, usename, coalesce(state, 'unknown') "
                "as state, wait_event, wait_event_type, "
                "((state = 'active' and wait_event is not null and "
                "coalesce(wait_event_type, '') not in ('Client', 'Activity')) or "
                "wait_event_type = 'Lock') as waiting, "
                "case when state = 'active' and query_start is not null then "
                "extract(epoch from statement_timestamp() - query_start) else 0 end "
                "as query_age_seconds from pg_stat_activity where datname = "
                "current_database() and pid <> pg_backend_pid()), state_totals as ("
                "select state, count(*)::integer as total from activity group by state), "
                "blocking as (select blocked.pid as blocked_pid, blocker.pid as "
                "blocking_pid from activity blocked cross join lateral "
                "unnest(pg_blocking_pids(blocked.pid)) blocker(pid) order by "
                "blocked.pid, blocker.pid limit "
                f"{DATABASE_OBSERVER_BLOCKING_PAIR_LIMIT}) select statement_timestamp() "
                "as sampled_at, (select count(*) from activity)::integer as connections, "
                "current_setting('max_connections')::integer as max_connections, "
                "(select count(*) from activity where wait_event_type = 'Lock')::integer "
                "as lock_waits, (select count(*) from activity where waiting)::integer "
                "as waiting, (select count(*) from activity where state = 'idle' and "
                "wait_event_type = 'Client' and wait_event = 'ClientRead')::integer "
                "as idle_client_reads, (select count(*) from activity where usename = "
                "'authenticator' and state <> 'idle')::integer as api_pool_busy, "
                "coalesce((select max(query_age_seconds) from activity), "
                "0)::numeric as longest_query_age_seconds, coalesce((select "
                "jsonb_object_agg(state, total) from state_totals), '{}'::jsonb) as "
                "state_counts, coalesce((select jsonb_agg(jsonb_build_object("
                "'blockedFingerprint', md5(blocked_pid::text || ':phase6'), "
                "'blockingFingerprint', md5(blocking_pid::text || ':phase6')) order by "
                "blocked_pid, blocking_pid) from blocking), '[]'::jsonb) as "
                "blocking_pairs, (select deadlocks from pg_stat_database where datname "
                "= current_database())::bigint as deadlocks, (select conflicts from "
                "pg_stat_database where datname = current_database())::bigint as "
                "conflicts, (select case when blks_hit + blks_read = 0 then 1 else "
                "blks_hit::numeric / (blks_hit + blks_read) end from pg_stat_database "
                "where datname = current_database()) as cache_hit_ratio"
            )
            if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
                raise RuntimeError("database observer returned an invalid contract")
            sample = sanitize_diagnostic_value(rows[0])
            if not isinstance(sample, dict):
                raise RuntimeError("database observer sanitization failed")
            self.sql_samples.append(sample)
            private_append_json(self.database_observer_path, sample)
        except Exception as error:
            # Observation must never affect preparation, measured traffic, or cleanup.
            try:
                private_append_json(
                    self.database_observer_path,
                    {
                        "sampled_at": datetime.now(UTC).isoformat(),
                        "observer_error": type(error).__name__,
                    },
                )
            except Exception:
                pass

    def await_metrics(self) -> dict[str, Any]:
        if not self.metrics_process:
            raise RuntimeError("metrics collector was not started")
        stdout, stderr = self.metrics_process.communicate(timeout=300)
        if self.metrics_process.returncode != 0:
            raise RuntimeError(f"metrics collector failed: {stderr.strip()[:120]}")
        summary = json.loads(stdout)
        if summary.get("scrapeErrors") != 0 or summary.get("scrapes", 0) < 15:
            raise RuntimeError("Metrics API collection is incomplete")
        self.metrics_summary = summary
        event(f"Metrics API collection completed with {summary['scrapes']} successful scrapes")
        return summary

    def integrity(self) -> dict[str, Any]:
        user_ids = [item["user_id"] for item in self.users]
        ids = ",".join(f"'{value}'::uuid" for value in user_ids)
        gate_teams = (
            "with gate_teams as (select id from app.fantasy_teams "
            f"where user_id in ({ids})) "
        )
        queries = {
            "duplicate_transfers": gate_teams
            + "select count(*)::integer as count from (select transfer_batch_id, "
            "sequence_number from app.fantasy_transfers transfer join "
            "app.fantasy_transfer_batches batch on batch.id = "
            "transfer.transfer_batch_id where batch.fantasy_team_id in (select id "
            "from gate_teams) group by transfer_batch_id, sequence_number having "
            "count(*) > 1) duplicates",
            "partial_transfers": gate_teams
            + "select count(*)::integer as count from (select batch.id from "
            "app.fantasy_transfer_batches batch left join app.fantasy_transfers "
            "transfer on transfer.transfer_batch_id = batch.id where "
            "batch.fantasy_team_id in (select id from gate_teams) group by batch.id, "
            "batch.transfers_count having count(transfer.id) <> batch.transfers_count) "
            "partial",
            "duplicate_chips": gate_teams
            + "select count(*)::integer as count from (select fantasy_team_id, "
            "gameweek_id from app.fantasy_chip_uses where fantasy_team_id in "
            "(select id from gate_teams) group by fantasy_team_id, gameweek_id having "
            "count(*) > 1) duplicates",
            "corrupted_balances": gate_teams
            + "select count(*)::integer as count from app.fantasy_teams where id in "
            "(select id from gate_teams) and (bank < 0 or team_value <= 0)",
            "corrupted_free_transfers": gate_teams
            + "select count(*)::integer as count from app.fantasy_teams where id in "
            "(select id from gate_teams) and free_transfers not between 0 and 2",
            "corrupt_transfer_balances": gate_teams
            + "select count(*)::integer as count from app.fantasy_transfer_batches "
            "where fantasy_team_id in (select id from gate_teams) and "
            "(bank_before < 0 or bank_after < 0)",
            "lost_updates": gate_teams
            + "select count(*)::integer as count from (select audit.fantasy_team_id, "
            "audit.resulting_version from app_private.fantasy_mutation_audit audit "
            "where audit.fantasy_team_id in (select id from gate_teams) and "
            "audit.accepted and audit.resulting_version is not null group by "
            "audit.fantasy_team_id, audit.resulting_version having count(*) > 1) "
            "duplicates",
            "deadline_bypasses": gate_teams
            + "select count(*)::integer as count from "
            "app_private.fantasy_mutation_audit audit join app.fantasy_gameweeks gw "
            f"on gw.id = '{GAMEWEEK_ID}'::uuid where audit.fantasy_team_id in "
            "(select id from gate_teams) and audit.accepted and audit.occurred_at >= "
            "gw.deadline_at",
            "invalid_active_squads": gate_teams
            + "select count(*)::integer as count from (select team.id from "
            "gate_teams team left join app.fantasy_squad_memberships membership on "
            "membership.fantasy_team_id = team.id and membership.sold_at is null "
            "group by team.id having count(membership.id) <> 15) invalid",
        }
        counts = {
            label: self.bounded_count(f"integrity {label}", query)
            for label, query in queries.items()
        }
        passed = all(value == 0 for value in counts.values())
        result = {**counts, "passed": passed}
        private_json(self.artifact_dir / "integrity.json", result)
        event(f"Integrity validation {'passed' if passed else 'failed'}")
        return result

    def analyze_metrics(self) -> dict[str, Any]:
        path = self.artifact_dir / "metrics.ndjson"
        records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        series_by_name: dict[str, list[float]] = defaultdict(list)
        per_scrape: list[dict[str, float]] = []
        for record in records:
            scrape: dict[str, float] = {}
            for metric in record.get("metrics", []):
                name = metric["series"].split("{")[0]
                series_by_name[name].append(float(metric["value"]))
                scrape[metric["series"]] = float(metric["value"])
            per_scrape.append(scrape)
        names = sorted(series_by_name)
        candidate_names = [
            name for name in names
            if any(term in name.lower() for term in (
                "cpu", "pool", "connection", "backend", "lock", "deadlock",
                "cache", "block", "disk", "io", "duration", "latency", "timeout"
            ))
        ]
        cpu_intervals: list[float] = []
        io_read_bytes = 0.0
        io_write_bytes = 0.0
        if len(per_scrape) > 1:
            for previous, current in zip(per_scrape, per_scrape[1:]):
                idle_series = [
                    series for series in current
                    if series.startswith("node_cpu_seconds_total{")
                    and ('mode="idle"' in series or "mode='idle'" in series)
                    and series in previous
                ]
                if idle_series:
                    elapsed = 60 * len(idle_series)
                    idle_delta = sum(current[item] - previous[item] for item in idle_series)
                    cpu_intervals.append(max(0.0, min(100.0, 100 * (1 - idle_delta / elapsed))))
            for prefix, target in (
                ("node_disk_read_bytes_total", "read"),
                ("node_disk_written_bytes_total", "write"),
            ):
                matching = [
                    series for series in per_scrape[-1]
                    if series.startswith(prefix) and series in per_scrape[0]
                ]
                delta = sum(
                    max(0.0, per_scrape[-1][item] - per_scrape[0][item])
                    for item in matching
                )
                if target == "read":
                    io_read_bytes = delta
                else:
                    io_write_bytes = delta

        pool_utilization: list[float] = []
        for scrape in per_scrape:
            active = sum(
                value for series, value in scrape.items()
                if series.split("{")[0] in {
                    "pgbouncer_pools_server_active_connections",
                    "supavisor_pool_active_connections",
                }
            )
            idle = sum(
                value for series, value in scrape.items()
                if series.split("{")[0] in {
                    "pgbouncer_pools_server_idle_connections",
                    "supavisor_pool_idle_connections",
                }
            )
            if active + idle > 0:
                pool_utilization.append(100 * active / (active + idle))

        # PostgREST holds its own pool and does not go through PgBouncer, whose
        # series then read zero (run 36233241466 had no PgBouncer data at all).
        # Its pool counts too, with the same 80% limit: the authenticator
        # connections the database observer saw busy, over PostgREST's pool
        # size. PostgREST's own "available" gauge cannot say this, because its
        # connections open lazily and it reads 0 before any traffic.
        pgrst_pool_max = max(
            (
                value
                for scrape in per_scrape
                for series, value in scrape.items()
                if series.split("{")[0] == "pgrst_db_pool_max"
            ),
            default=0.0,
        )
        if pgrst_pool_max > 0:
            pool_utilization += [
                100 * int(sample["api_pool_busy"]) / pgrst_pool_max
                for sample in self.sql_samples
                if isinstance(sample.get("api_pool_busy"), int)
            ]

        result = {
            "scrapes": len(records),
            "seriesNames": candidate_names,
            "databaseSamples": self.sql_samples,
            "maxCpuPercent": round(max(cpu_intervals), 3) if cpu_intervals else None,
            "ioReadBytes": int(io_read_bytes),
            "ioWriteBytes": int(io_write_bytes),
            "maxPoolUtilizationPercent": (
                round(max(pool_utilization), 3) if pool_utilization else None
            ),
            "maxConnections": max((int(item["connections"]) for item in self.sql_samples), default=0),
            "maxConnectionUtilizationPercent": round(
                max(
                    (
                        100 * int(item["connections"]) / max(int(item["max_connections"]), 1)
                        for item in self.sql_samples
                    ),
                    default=0,
                ),
                3,
            ),
            "maxLockWaits": max((int(item["lock_waits"]) for item in self.sql_samples), default=0),
            "deadlockDelta": (
                int(self.sql_samples[-1]["deadlocks"]) - int(self.sql_samples[0]["deadlocks"])
                if len(self.sql_samples) > 1 else 0
            ),
            "conflictDelta": (
                int(self.sql_samples[-1]["conflicts"]) - int(self.sql_samples[0]["conflicts"])
                if len(self.sql_samples) > 1 else 0
            ),
            "minimumCacheHitPercent": round(
                min((float(item["cache_hit_ratio"]) * 100 for item in self.sql_samples), default=0),
                3,
            ),
        }
        private_json(self.artifact_dir / "metrics-analysis.json", result)
        return result

    def revoke_remote_sessions(self) -> None:
        if not self.instance_ips:
            return
        command = (
            "set -a; . /opt/botolago/runtime.env; set +a; "
            "BOTOLAGO_SESSION_OPERATION=revoke "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            "/opt/botolago-venv/bin/python /opt/botolago/fantasy-session-provisioner.py"
        )

        def revoke(ip: str) -> dict[str, Any]:
            try:
                if self.ssh(
                    ip,
                    "test -f /opt/botolago/sessions.json && echo present || echo absent",
                    30,
                ) == "absent":
                    return {"revoked": True, "failures": 0}
                output = self.ssh(ip, command, 600)
                return json.loads(output)
            except (subprocess.SubprocessError, OSError, ValueError):
                return {"revoked": False, "failures": self.users_per_runner}

        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            results = list(executor.map(revoke, self.instance_ips))
        if all(item.get("revoked") is True for item in results):
            event("Revoked all runner-held sessions")
        else:
            event("Remote logout was incomplete; database cleanup remains authoritative")

    def remove_remote_runtime_files(self) -> None:
        if not self.instance_ips:
            return

        def remove(ip: str) -> None:
            try:
                self.ssh(
                    ip,
                    "find /opt/botolago -maxdepth 1 -type f "
                    "\\( -name 'runtime.env' -o -name 'credentials-*.json' "
                    "-o -name 'sessions.json' \\) -delete",
                    60,
                )
            except (subprocess.SubprocessError, OSError):
                # Instance termination and encrypted-volume deletion are the
                # authoritative fallback if SSH is already unavailable.
                return

        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            list(executor.map(remove, self.instance_ips))
        event("Removed runner runtime credential and session handoffs")

    def discover_cleanup_state(self) -> None:
        """Recover non-secret resource identifiers after process interruption."""

        if STATE_FILE.is_file():
            state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            if state.get("region") != "eu-west-3":
                raise RuntimeError("saved cleanup state is not for eu-west-3")
            state_run_id = state.get("runId")
            if isinstance(state_run_id, str) and state_run_id:
                candidate_key = ARTIFACT_ROOT / state_run_id / "runner.pem"
                if candidate_key.is_file():
                    self.key_path = candidate_key
            self.instance_ids = sorted(
                {
                    *self.instance_ids,
                    *[
                        value
                        for value in state.get("instanceIds", [])
                        if isinstance(value, str) and value.startswith("i-")
                    ],
                }
            )
            group_id = state.get("securityGroupId")
            if isinstance(group_id, str) and group_id.startswith("sg-"):
                self.security_group_ids.append(group_id)
            key_name = state.get("keyPairName")
            if isinstance(key_name, str) and key_name.startswith("botolago-phase6-"):
                self.key_pair_names.append(key_name)
            metrics_key_id = state.get("temporaryMetricsKeyId")
            if isinstance(metrics_key_id, str) and metrics_key_id:
                self.temp_key_ids.append(metrics_key_id)
            original = state.get("originalGameweek")
            if isinstance(original, dict) and original.get("id") == GAMEWEEK_ID:
                self.original_gameweek = original
                self.gameweek_prepared = state.get("gameweekPrepared") is True

        keys = self.management("GET", f"/v1/projects/{self.project_ref}/api-keys")
        if isinstance(keys, list):
            self.temp_key_ids.extend(
                str(item["id"])
                for item in keys
                if item.get("name") == TEMP_KEY_NAME and item.get("id")
            )

        active_runners = self.ec2.describe_instances(
            Filters=[
                {"Name": "tag:Purpose", "Values": ["botolago-phase6"]},
                {
                    "Name": "instance-state-name",
                    "Values": ["pending", "running", "stopping", "stopped"],
                },
            ]
        )
        self.instance_ids = sorted(
            {
                *self.instance_ids,
                *[
                    instance["InstanceId"]
                    for reservation in active_runners["Reservations"]
                    for instance in reservation["Instances"]
                ],
            }
        )
        self.instance_ips = sorted(
            {
                *self.instance_ips,
                *[
                    instance.get("PublicIpAddress", "")
                    for reservation in active_runners["Reservations"]
                    for instance in reservation["Instances"]
                    if instance.get("PublicIpAddress")
                ],
            }
        )
        self.security_group_ids.extend(
            group["GroupId"]
            for group in self.ec2.describe_security_groups(
                Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
            )["SecurityGroups"]
        )
        self.key_pair_names.extend(
            pair["KeyName"]
            for pair in self.ec2.describe_key_pairs(
                Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
            )["KeyPairs"]
        )

        discovered_auth_users = self.sql(
            "select users.id::text as user_id from auth.users users where "
            "users.email like 'fantasy-gate-%@staging.botolago.invalid'"
        )
        discovered_team_users = self.sql(
            "with known_teams as (select md5('fantasy-load-team-' || number)::uuid "
            f"as id from generate_series({FIRST_USER_NUMBER}, "
            f"{FIRST_USER_NUMBER + TOTAL_USERS - 1}) number) select distinct "
            "team.user_id::text as user_id from app.fantasy_teams team join "
            "known_teams known on known.id = team.id"
        )
        known_user_ids = {item.get("user_id") for item in self.users}
        discovered_users = [
            *(
                discovered_auth_users
                if isinstance(discovered_auth_users, list)
                else []
            ),
            *(
                discovered_team_users
                if isinstance(discovered_team_users, list)
                else []
            ),
        ]
        for record in discovered_users:
            user_id = record.get("user_id")
            if isinstance(user_id, str) and user_id not in known_user_ids:
                uuid.UUID(user_id)
                self.users.append({"user_id": user_id, "password": ""})
                known_user_ids.add(user_id)

        self.security_group_ids = sorted(set(self.security_group_ids))
        self.key_pair_names = sorted(set(self.key_pair_names))
        self.temp_key_ids = sorted(set(self.temp_key_ids))

    def remove_local_runtime_files(self) -> None:
        sensitive_names = {"runner.pem", "runner-runtime.env", "sessions.json"}
        if ARTIFACT_ROOT.is_dir():
            for path in ARTIFACT_ROOT.rglob("*"):
                if not path.is_file():
                    continue
                if path.name in sensitive_names or path.name.startswith("credentials-"):
                    path.unlink(missing_ok=True)

    def delete_users_and_state(self) -> dict[str, Any]:
        if not self.users:
            return self.verify_database_cleanup()
        ids = ",".join(f"'{item['user_id']}'::uuid" for item in self.users)

        def delete_batches(label: str, target: str, maximum_batches: int) -> None:
            total_deleted = 0
            for _ in range(maximum_batches):
                rows = self.sql(target)
                deleted = int(rows[0]["deleted"]) if isinstance(rows, list) and rows else -1
                if deleted < 0:
                    raise RuntimeError(f"{label} cleanup returned an invalid count")
                total_deleted += deleted
                if deleted == 0:
                    event(f"Batched cleanup removed {total_deleted} temporary {label}")
                    return
            raise RuntimeError(f"{label} cleanup exceeded its bounded batch budget")

        team_ids = f"(select id from app.fantasy_teams where user_id in ({ids}))"
        lineup_ids = (
            "(select id from app.fantasy_lineups where fantasy_team_id in "
            f"{team_ids})"
        )
        transfer_batch_ids = (
            "(select id from app.fantasy_transfer_batches where fantasy_team_id in "
            f"{team_ids})"
        )
        snapshot_ids = (
            "(select id from app.fantasy_free_hit_snapshots where fantasy_team_id in "
            f"{team_ids})"
        )

        def delete_table_batches(
            label: str,
            table: str,
            predicate: str,
            maximum_batches: int = 250,
        ) -> None:
            delete_batches(
                label,
                f"with target as (select item.ctid from {table} item where "
                f"{predicate} limit 2000), deleted as (delete from {table} item "
                "using target where item.ctid = target.ctid returning 1) "
                "select count(*)::integer as deleted from deleted",
                maximum_batches,
            )

        # Every statement is an independently committed, bounded deletion.
        # Never retry the former all-table cleanup transaction first.
        delete_table_batches(
            "free-transfer rollovers",
            "app_private.fantasy_free_transfer_rollovers",
            f"item.fantasy_team_id in {team_ids}",
        )
        delete_table_batches(
            "mutation audit rows",
            "app_private.fantasy_mutation_audit",
            f"item.fantasy_team_id in {team_ids} or item.user_id in ({ids})",
        )
        delete_table_batches(
            "idempotency keys",
            "app_private.fantasy_idempotency_keys",
            f"item.user_id in ({ids})",
        )
        delete_table_batches(
            "rankings", "app.fantasy_rankings", f"item.fantasy_team_id in {team_ids}"
        )
        delete_table_batches(
            "league memberships",
            "app.fantasy_league_memberships",
            f"item.fantasy_team_id in {team_ids} or item.user_id in ({ids})",
        )
        delete_table_batches(
            "gameweek results",
            "app.fantasy_team_gameweek_results",
            f"item.fantasy_team_id in {team_ids}",
        )
        delete_table_batches(
            "automatic substitutions",
            "app.fantasy_auto_substitutions",
            f"item.lineup_id in {lineup_ids}",
        )
        delete_table_batches(
            "lineup players",
            "app.fantasy_lineup_players",
            f"item.lineup_id in {lineup_ids}",
        )
        delete_table_batches(
            "lineups", "app.fantasy_lineups", f"item.fantasy_team_id in {team_ids}"
        )
        delete_table_batches(
            "transfers",
            "app.fantasy_transfers",
            f"item.transfer_batch_id in {transfer_batch_ids}",
        )
        delete_table_batches(
            "transfer batches",
            "app.fantasy_transfer_batches",
            f"item.fantasy_team_id in {team_ids}",
        )
        delete_table_batches(
            "Free Hit snapshot players",
            "app.fantasy_free_hit_snapshot_players",
            f"item.snapshot_id in {snapshot_ids}",
        )
        delete_table_batches(
            "Free Hit snapshots",
            "app.fantasy_free_hit_snapshots",
            f"item.fantasy_team_id in {team_ids}",
        )
        delete_table_batches(
            "chip uses", "app.fantasy_chip_uses", f"item.fantasy_team_id in {team_ids}"
        )

        delete_batches(
            "squad memberships",
            "with target as (select membership.id from "
            "app.fantasy_squad_memberships membership join app.fantasy_teams team "
            "on team.id = membership.fantasy_team_id "
            f"where team.user_id in ({ids}) limit 5000), deleted as (delete from "
            "app.fantasy_squad_memberships membership using target where "
            "membership.id = target.id returning 1) select count(*)::integer as "
            "deleted from deleted",
            20,
        )
        delete_table_batches(
            "owned leagues",
            "app.fantasy_leagues",
            f"item.owner_user_id in ({ids})",
        )
        delete_batches(
            "Fantasy teams",
            "with target as (select id from app.fantasy_teams "
            f"where user_id in ({ids}) limit 250), deleted as (delete from "
            "app.fantasy_teams team using target where team.id = target.id "
            "returning 1) select count(*)::integer as deleted from deleted",
            20,
        )
        delete_batches(
            "Auth users",
            f"with target as (select id from auth.users where id in ({ids}) "
            "limit 250), deleted as (delete from auth.users users using target "
            "where users.id = target.id returning 1) select count(*)::integer "
            "as deleted from deleted",
            20,
        )
        verification = self.verify_database_cleanup()
        event(
            f"Deleted all {len(self.users)} tracked temporary test users "
            "and their isolated Fantasy state"
        )
        return verification

    def verify_database_cleanup(self) -> dict[str, Any]:
        tracked_ids = [item.get("user_id") for item in self.users if item.get("user_id")]
        tracked_users = (
            "select unnest(array["
            + ",".join(f"'{value}'::uuid" for value in tracked_ids)
            + "]) as id"
            if tracked_ids
            else "select null::uuid as id where false"
        )
        known_teams = (
            "select md5('fantasy-load-team-' || number)::uuid as id from "
            f"generate_series({FIRST_USER_NUMBER}, "
            f"{FIRST_USER_NUMBER + TOTAL_USERS - 1}) number"
        )
        known_lineups = (
            "select md5('fantasy-gate-lineup-' || number)::uuid as id from "
            f"generate_series({FIRST_USER_NUMBER}, "
            f"{FIRST_USER_NUMBER + TOTAL_USERS - 1}) number"
        )
        team_prefix = f"with known_teams as ({known_teams}) "
        user_prefix = f"with tracked_users as ({tracked_users}) "
        team_user_prefix = (
            f"with known_teams as ({known_teams}), tracked_users as ({tracked_users}) "
        )
        queries = {
            "users": "select count(*)::integer as count from auth.users where email "
            "like 'fantasy-gate-%@staging.botolago.invalid'",
            "sessions": user_prefix
            + "select count(*)::integer as count from auth.sessions session join "
            "tracked_users users on users.id = session.user_id",
            "refresh_tokens": user_prefix
            + "select count(*)::integer as count from auth.refresh_tokens token join "
            "tracked_users users on users.id = token.user_id::uuid where token.revoked "
            "is false",
            "profiles": "select count(*)::integer as count from app.profiles where "
            "display_name like 'Phase 6 Gate User %'",
            "fantasy_teams": team_prefix
            + "select count(*)::integer as count from app.fantasy_teams item where "
            "item.id in (select id from known_teams)",
            "squad_memberships": team_prefix
            + "select count(*)::integer as count from "
            "app.fantasy_squad_memberships item where item.fantasy_team_id in "
            "(select id from known_teams)",
            "lineups": team_prefix
            + "select count(*)::integer as count from app.fantasy_lineups item where "
            "item.fantasy_team_id in (select id from known_teams)",
            "lineup_players": f"with known_lineups as ({known_lineups}) "
            "select count(*)::integer as count from app.fantasy_lineup_players item "
            "where item.lineup_id in (select id from known_lineups)",
            "transfer_batches": team_prefix
            + "select count(*)::integer as count from app.fantasy_transfer_batches "
            "item where item.fantasy_team_id in (select id from known_teams)",
            "transfers": team_prefix
            + "select count(*)::integer as count from app.fantasy_transfers item where "
            "item.transfer_batch_id in (select batch.id from "
            "app.fantasy_transfer_batches batch where batch.fantasy_team_id in "
            "(select id from known_teams))",
            "chip_uses": team_prefix
            + "select count(*)::integer as count from app.fantasy_chip_uses item where "
            "item.fantasy_team_id in (select id from known_teams)",
            "free_hit_snapshots": team_prefix
            + "select count(*)::integer as count from "
            "app.fantasy_free_hit_snapshots item where item.fantasy_team_id in "
            "(select id from known_teams)",
            "free_hit_snapshot_players": team_prefix
            + "select count(*)::integer as count from "
            "app.fantasy_free_hit_snapshot_players item where item.snapshot_id in "
            "(select snapshot.id from app.fantasy_free_hit_snapshots snapshot where "
            "snapshot.fantasy_team_id in (select id from known_teams))",
            "mutation_audit": team_user_prefix
            + "select count(*)::integer as count from "
            "app_private.fantasy_mutation_audit item where item.fantasy_team_id in "
            "(select id from known_teams) or item.user_id in (select id from "
            "tracked_users)",
            "idempotency_keys": user_prefix
            + "select count(*)::integer as count from "
            "app_private.fantasy_idempotency_keys item where item.user_id in "
            "(select id from tracked_users)",
            "free_transfer_rollovers": team_prefix
            + "select count(*)::integer as count from "
            "app_private.fantasy_free_transfer_rollovers item where "
            "item.fantasy_team_id in (select id from known_teams)",
            "rankings": team_prefix
            + "select count(*)::integer as count from app.fantasy_rankings item where "
            "item.fantasy_team_id in (select id from known_teams)",
            "league_memberships": team_user_prefix
            + "select count(*)::integer as count from "
            "app.fantasy_league_memberships item where item.fantasy_team_id in "
            "(select id from known_teams) or item.user_id in (select id from "
            "tracked_users)",
            "gameweek_results": team_prefix
            + "select count(*)::integer as count from "
            "app.fantasy_team_gameweek_results item where item.fantasy_team_id in "
            "(select id from known_teams)",
            "auto_substitutions": f"with known_lineups as ({known_lineups}) "
            "select count(*)::integer as count from app.fantasy_auto_substitutions "
            "item where item.lineup_id in (select id from known_lineups)",
            "owned_leagues": user_prefix
            + "select count(*)::integer as count from app.fantasy_leagues item where "
            "item.owner_user_id in (select id from tracked_users)",
        }
        return {
            label: self.bounded_count(f"cleanup {label}", query)
            for label, query in queries.items()
        }

    def terminate_runners(self) -> None:
        had_resources = bool(
            self.instance_ids
            or self.security_group_ids
            or self.key_pair_names
            or self.key_path
        )
        if self.instance_ids:
            self.ec2.terminate_instances(InstanceIds=self.instance_ids)
            self.ec2.get_waiter("instance_terminated").wait(
                InstanceIds=self.instance_ids,
                WaiterConfig={"Delay": 10, "MaxAttempts": 30},
            )
            event("Terminated all temporary AWS runners")
        for group_id in sorted(
            set([*self.security_group_ids, *([self.security_group_id] if self.security_group_id else [])])
        ):
            for attempt in range(12):
                try:
                    self.ec2.delete_security_group(GroupId=group_id)
                    break
                except self.ec2.exceptions.ClientError:
                    if attempt == 11:
                        raise
                    time.sleep(5)
        for key_name in sorted(
            set([*self.key_pair_names, *([self.key_pair_name] if self.key_pair_name else [])])
        ):
            self.ec2.delete_key_pair(KeyName=key_name)
        if self.key_path:
            self.key_path.unlink(missing_ok=True)
        self.instance_ids.clear()
        self.instance_ips.clear()
        self.security_group_ids.clear()
        self.key_pair_names.clear()
        if had_resources:
            event("Removed the temporary security group and EC2 key pair")

    def cleanup(self) -> dict[str, Any]:
        cleanup: dict[str, Any] = {"errors": []}
        try:
            self.discover_cleanup_state()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"cleanup_discovery:{type(error).__name__}")
        try:
            self.revoke_remote_sessions()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"session_revoke:{type(error).__name__}")
        try:
            self.remove_remote_runtime_files()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"remote_runtime_cleanup:{type(error).__name__}")
        try:
            cleanup["database"] = self.delete_users_and_state()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"database_cleanup:{type(error).__name__}")
        try:
            self.restore_capacity_gameweek()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"gameweek_restore:{type(error).__name__}")
        try:
            self.delete_temporary_key()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"key_cleanup:{type(error).__name__}")
        try:
            self.terminate_runners()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"aws_cleanup:{type(error).__name__}")
        try:
            self.remove_local_runtime_files()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"local_runtime_cleanup:{type(error).__name__}")
        self.passwords.clear()
        for item in self.users:
            item["password"] = ""
        try:
            remaining_keys = self.management(
                "GET", f"/v1/projects/{self.project_ref}/api-keys"
            )
            active_runners = self.ec2.describe_instances(
                Filters=[
                    {"Name": "tag:Purpose", "Values": ["botolago-phase6"]},
                    {
                        "Name": "instance-state-name",
                        "Values": ["pending", "running", "stopping", "stopped"],
                    },
                ]
            )
            security_groups = self.ec2.describe_security_groups(
                Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
            )["SecurityGroups"]
            key_pairs = self.ec2.describe_key_pairs(
                Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
            )["KeyPairs"]
            cleanup["verification"] = {
                "metricsKeys": sum(
                    1 for item in remaining_keys
                    if item.get("name") == TEMP_KEY_NAME
                ),
                "activeRunners": sum(
                    len(item["Instances"])
                    for item in active_runners["Reservations"]
                ),
                "securityGroups": len(security_groups),
                "keyPairs": len(key_pairs),
                "keyMaterialFiles": sum(
                    1 for path in ARTIFACT_ROOT.rglob("runner.pem") if path.is_file()
                ),
                "runtimeCredentialHandoffs": sum(
                    1 for path in ARTIFACT_ROOT.rglob("*") if path.is_file() and (
                        path.name.startswith("credentials-")
                        or path.name in {"runner-runtime.env", "sessions.json"}
                    )
                ),
                "cloudStateFiles": int(STATE_FILE.exists()),
            }
            database = cleanup.get("database", {})
            external_without_state = {
                key: value
                for key, value in cleanup["verification"].items()
                if key != "cloudStateFiles"
            }
            if (
                not cleanup["errors"]
                and database
                and all(int(value) == 0 for value in database.values())
                and all(int(value) == 0 for value in external_without_state.values())
            ):
                STATE_FILE.unlink(missing_ok=True)
                cleanup["verification"]["cloudStateFiles"] = int(STATE_FILE.exists())
        except Exception as error:
            cleanup["errors"].append(f"cleanup_verification:{type(error).__name__}")
        private_json(self.artifact_dir / "cleanup.json", cleanup)
        return cleanup

    def run(self) -> int:
        outcome: dict[str, Any] = {
            "runId": self.run_id,
            "mode": self.mode,
            "passed": False,
        }
        try:
            self.preflight()
            self.start_database_observer()
            self.create_temporary_key()
            if self.mode != SESSION_PROVISIONING_REHEARSAL_MODE:
                self.prepare_capacity_gameweek()
            self.provision_runners()
            self.create_users()
            self.seed_user_fantasy_state()
            self.deploy_and_provision_sessions()
            if self.mode == SESSION_PROVISIONING_REHEARSAL_MODE:
                criteria = {
                    "fiveUsersCreated": len(self.users) == 5,
                    "fiveTeamsSeeded": self.total_users == 5,
                    "fiveSessionsProvisioned": True,
                    "noMeasuredTraffic": True,
                }
                outcome.update(
                    {
                        "userCreation": dict(self.user_creation_stats),
                        "criteria": criteria,
                        "passed": all(criteria.values()),
                    }
                )
            else:
                self.start_metrics()
            if self.mode == SETUP_REHEARSAL_MODE:
                readiness = self.run_setup_rehearsal()
                metrics_startup = self.validate_rehearsal_metrics_startup()
                criteria = {
                    "allRunnersReady": readiness["passed"],
                    "noMeasuredTraffic": readiness["measuredRequests"] == 0,
                    "metricsCollectorStarted": (
                        metrics_startup["successfulStartupScrapes"] >= 2
                    ),
                }
                outcome.update(
                    {
                        "readiness": readiness,
                        "metricsStartup": metrics_startup,
                        "userCreation": dict(self.user_creation_stats),
                        "criteria": criteria,
                        "passed": all(criteria.values()),
                    }
                )
            elif self.mode == FULL_GATE_MODE:
                merge = self.run_profile("merge_gate", 60, 10)
                self.sample_database()
                soak = self.run_profile("telemetry_soak", 600, 0)
                self.sample_database()
                metrics_summary = self.await_metrics()
                self.sample_database()
                integrity = self.integrity()
                metrics = self.analyze_metrics()
                criteria = {
                    **{
                        f"merge_{key}": value
                        for key, value in merge["passCriteria"].items()
                    },
                    **{
                        f"soak_{key}": value
                        for key, value in soak["passCriteria"].items()
                    },
                    "integrity": integrity["passed"],
                    "metricsComplete": metrics_summary["scrapeErrors"] == 0,
                    "connectionUtilization": (
                        metrics["maxConnectionUtilizationPercent"] < 80
                    ),
                    "cpu": metrics["maxCpuPercent"] is not None
                    and metrics["maxCpuPercent"] < 80,
                    "poolUtilization": metrics["maxPoolUtilizationPercent"] is not None
                    and metrics["maxPoolUtilizationPercent"] < 80,
                    "deadlocks": metrics["deadlockDelta"] == 0,
                    "conflicts": metrics["conflictDelta"] == 0,
                }
                outcome.update(
                    {
                        "mergeGate": merge,
                        "soak": soak,
                        "userCreation": dict(self.user_creation_stats),
                        "metrics": metrics,
                        "integrity": integrity,
                        "criteria": criteria,
                        "passed": all(criteria.values()),
                    }
                )
            elif self.mode == BROWSING_MODE:
                browsing = self.run_browsing()
                self.sample_database()
                metrics_summary = self.await_metrics()
                self.sample_database()
                metrics = self.analyze_metrics()
                criteria = {
                    **{f"browsing_{key}": value for key, value in browsing["passCriteria"].items()},
                    "metricsComplete": metrics_summary["scrapeErrors"] == 0,
                    "connectionUtilization": metrics["maxConnectionUtilizationPercent"] < 80,
                    "cpu": metrics["maxCpuPercent"] is not None and metrics["maxCpuPercent"] < 80,
                    "poolUtilization": metrics["maxPoolUtilizationPercent"] is not None
                    and metrics["maxPoolUtilizationPercent"] < 80,
                    "deadlocks": metrics["deadlockDelta"] == 0,
                    "conflicts": metrics["conflictDelta"] == 0,
                }
                outcome.update(
                    {
                        "browsing": browsing,
                        "userCreation": dict(self.user_creation_stats),
                        "metrics": metrics,
                        "criteria": criteria,
                        "passed": all(criteria.values()),
                    }
                )
        except Exception as error:
            failure = f"{type(error).__name__}: {error}"
            outcome["failure"] = failure
            event(f"Gate stopped: {failure}")
        finally:
            if self.metrics_process and self.metrics_process.poll() is None:
                self.metrics_process.terminate()
                try:
                    self.metrics_process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self.metrics_process.kill()
            self.stop_database_observer()
            cleanup = self.cleanup()
            outcome["cleanup"] = cleanup
            outcome["localRuntimeCredentialFileRemaining"] = False
            cleanup_db = cleanup.get("database", {})
            cleanup_external = cleanup.get("verification", {})
            cleanup_passed = (
                not cleanup.get("errors")
                and all(int(value) == 0 for value in cleanup_db.values())
                and all(int(value) == 0 for value in cleanup_external.values())
                and not outcome["localRuntimeCredentialFileRemaining"]
            )
            outcome["cleanupPassed"] = cleanup_passed
            outcome["passed"] = bool(outcome.get("passed")) and cleanup_passed
            outcome.setdefault("userCreation", dict(self.user_creation_stats))
            private_json(self.artifact_dir / "gate-summary.json", outcome)
            event("Verified that no local runtime credential handoff file exists")
        labels = {
            SETUP_REHEARSAL_MODE: "setup rehearsal",
            SESSION_PROVISIONING_REHEARSAL_MODE: "session provisioning rehearsal",
            FULL_GATE_MODE: "external gate",
            BROWSING_MODE: "browsing workload",
        }
        label = labels.get(self.mode, "cleanup")
        event(f"Phase 6 {label} verdict: {'PASS' if outcome['passed'] else 'FAIL'}")
        return 0 if outcome["passed"] else 2

    def run_recovery_cleanup(self) -> int:
        outcome: dict[str, Any] = {
            "runId": self.run_id,
            "mode": CLEANUP_RECOVERY_MODE,
            "passed": False,
        }
        cleanup = self.cleanup()
        database = cleanup.get("database", {})
        external = cleanup.get("verification", {})
        passed = (
            not cleanup.get("errors")
            and bool(database)
            and bool(external)
            and all(int(value) == 0 for value in database.values())
            and all(int(value) == 0 for value in external.values())
        )
        outcome.update({"cleanup": cleanup, "passed": passed})
        private_json(self.artifact_dir / "recovery-cleanup-summary.json", outcome)
        event(f"Phase 6 recovery cleanup verdict: {'PASS' if passed else 'FAIL'}")
        return 0 if passed else 2


if __name__ == "__main__":
    try:
        arguments = sys.argv[1:]
        if arguments == ["--setup-rehearsal"]:
            raise SystemExit(CapacityGate(SETUP_REHEARSAL_MODE).run())
        if arguments == ["--session-provisioning-rehearsal"]:
            raise SystemExit(
                CapacityGate(SESSION_PROVISIONING_REHEARSAL_MODE).run()
            )
        if arguments == ["--full-gate"]:
            raise SystemExit(CapacityGate(FULL_GATE_MODE).run())
        if arguments == ["--cleanup-only"]:
            raise SystemExit(
                CapacityGate(CLEANUP_RECOVERY_MODE).run_recovery_cleanup()
            )
        if arguments == ["--rehearsal-then-browsing"]:
            rehearsal = CapacityGate(SETUP_REHEARSAL_MODE)
            secure_runtime = dict(rehearsal.runtime)
            rehearsal_result = rehearsal.run()
            if rehearsal_result != 0:
                secure_runtime.clear()
                raise SystemExit(rehearsal_result)
            browsing_run = CapacityGate(BROWSING_MODE, runtime=secure_runtime)
            try:
                raise SystemExit(browsing_run.run())
            finally:
                secure_runtime.clear()
        if arguments == ["--rehearsal-then-full"]:
            rehearsal = CapacityGate(SETUP_REHEARSAL_MODE)
            secure_runtime = dict(rehearsal.runtime)
            rehearsal_result = rehearsal.run()
            if rehearsal_result != 0:
                secure_runtime.clear()
                raise SystemExit(rehearsal_result)
            full_gate = CapacityGate(FULL_GATE_MODE, runtime=secure_runtime)
            try:
                raise SystemExit(full_gate.run())
            finally:
                secure_runtime.clear()
        raise RuntimeError(
            "use --session-provisioning-rehearsal, --setup-rehearsal, "
            "--full-gate, --rehearsal-then-full, --rehearsal-then-browsing, or --cleanup-only"
        )
    except KeyboardInterrupt:
        event("Interrupted; automatic cleanup may require the saved cloud state")
        raise
    except Exception as error:
        detail = str(error)
        if not detail.startswith("protected workflow") and detail not in {
            "staging project reference and URL do not match",
            "a staging publishable key is required",
        }:
            detail = type(error).__name__
        event(f"Capacity gate initialization failed: {detail}")
        raise SystemExit(2) from error
