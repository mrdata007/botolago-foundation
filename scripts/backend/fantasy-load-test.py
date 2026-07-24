#!/usr/bin/env python3
"""Authenticated Phase 6 staging capacity workload.

The runner contains no credentials. It refuses non-staging URLs and requires
all values through environment variables. Authentication setup and cleanup are
documented in FANTASY_DOMAIN_RUNBOOK.md.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import math
import os
import random
import re
import statistics
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aiohttp

try:
    from fantasy_harness_tls import create_verified_ssl_context
except ModuleNotFoundError:
    from scripts.backend.fantasy_harness_tls import create_verified_ssl_context

SEASON_ID = "fa630000-0000-4000-8000-000000000001"
GAMEWEEK_ID = "fa640000-0000-4000-8000-000000000002"
EXPECTED_ERRORS = {
    "fantasy_gameweek_locked",
    "version_conflict",
    "chip_already_used",
    "chip_conflict",
    "idempotency_conflict",
}
PREPARATION_CONCURRENCY = 10
PREPARATION_RETRY_BASE_SECONDS = 0.5
NON_JSON_SNIPPET_BYTES = 200
RESPONSE_REDACTION_PATTERNS = (
    re.compile(r"\b(?:sb_(?:publishable|secret)|sbp)_[A-Za-z0-9_-]+\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]+", re.IGNORECASE),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
    re.compile(r"\b[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\b"),
)


def preparation_retry_delay(attempt: int) -> float:
    """Return full jitter for the existing zero-based preparation backoff."""

    if attempt < 0:
        raise ValueError("preparation retry attempt must be non-negative")
    return random.uniform(0.0, PREPARATION_RETRY_BASE_SECONDS * (2**attempt))


def deterministic_uuid(value: str) -> str:
    return str(uuid.UUID(hashlib.md5(value.encode("utf-8"), usedforsecurity=False).hexdigest()))


@dataclass
class UserState:
    number: int
    token: str
    team_id: str
    version: int
    selection: list[dict[str, Any]]
    transferred_in: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


@dataclass
class Observation:
    operation: str
    latency_ms: float
    status: int
    error_code: str | None
    expected_rejection: bool
    content_type: str | None = None
    body_length: int | None = None
    response_snippet: str | None = None


@dataclass(frozen=True)
class ResponseDiagnostic:
    operation: str
    status: int
    content_type: str
    body_length: int
    sanitized_snippet: str


def sanitize_response_snippet(value: str, limit_bytes: int = NON_JSON_SNIPPET_BYTES) -> str:
    """Return a bounded response excerpt using the harness credential patterns."""

    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    for pattern in RESPONSE_REDACTION_PATTERNS:
        normalized = pattern.sub("[REDACTED]", normalized)
    normalized = re.sub(
        r'(?i)("?(?:password|access_token|refresh_token|apikey|api_key|authorization)"?'
        r"\s*[:=]\s*)[^\s,}]+",
        r"\1[REDACTED]",
        normalized,
    )
    if not normalized:
        return "[EMPTY]"
    return normalized.encode("utf-8")[:limit_bytes].decode(
        "utf-8", errors="ignore"
    )


class FantasyLoadRunner:
    def __init__(self) -> None:
        self.base_url = require_env("BOTOLAGO_STAGING_SUPABASE_URL").rstrip("/")
        self.api_key = require_env("BOTOLAGO_STAGING_PUBLISHABLE_KEY")
        self.session_cache_path = Path(require_env("BOTOLAGO_LOAD_SESSION_CACHE"))
        if "staging" not in os.getenv("BOTOLAGO_LOAD_ENVIRONMENT", "").lower():
            raise SystemExit("BOTOLAGO_LOAD_ENVIRONMENT must explicitly contain 'staging'")
        self.load_profile = os.getenv("BOTOLAGO_LOAD_PROFILE", "merge_gate")
        self.total_users = int(os.getenv("BOTOLAGO_LOAD_USERS", "2500"))
        self.global_sustained_rps = int(os.getenv("BOTOLAGO_LOAD_SUSTAINED_RPS", "250"))
        self.global_burst_rps = int(os.getenv("BOTOLAGO_LOAD_BURST_RPS", "600"))
        self.shard_count = int(os.getenv("BOTOLAGO_LOAD_SHARD_COUNT", "1"))
        self.shard_index = int(os.getenv("BOTOLAGO_LOAD_SHARD_INDEX", "0"))
        self.first_user = int(os.getenv("BOTOLAGO_LOAD_FIRST_USER", "1"))
        self.burst_seconds = int(os.getenv("BOTOLAGO_LOAD_BURST_SECONDS", "10"))
        self.total_seconds = int(os.getenv("BOTOLAGO_LOAD_DURATION_SECONDS", "60"))
        self.start_at = float(os.getenv("BOTOLAGO_LOAD_START_AT", "0"))
        default_results_path = f"/tmp/botolago-fantasy-{self.load_profile}-results.json"
        self.results_path = Path(
            os.getenv("BOTOLAGO_LOAD_RESULTS_PATH", default_results_path)
        )
        if not self.results_path.is_absolute():
            raise SystemExit("BOTOLAGO_LOAD_RESULTS_PATH must be an absolute path")
        if self.load_profile == "setup_rehearsal":
            if (
                self.shard_count != 5
                or self.total_users not in range(125, 251)
                or self.total_users % self.shard_count
                or self.total_users // self.shard_count not in range(25, 51)
            ):
                raise SystemExit(
                    "setup rehearsal requires five shards with 25 to 50 users each"
                )
        elif (
            self.total_users != 2500
            or self.global_sustained_rps != 250
            or self.global_burst_rps != 600
        ):
            raise SystemExit("approved merge-gate load dimensions may not be weakened")
        if self.shard_count < 1 or not 0 <= self.shard_index < self.shard_count:
            raise SystemExit("load shard index/count are invalid")
        if self.total_users % self.shard_count or (
            self.load_profile != "setup_rehearsal"
            and (
                self.global_sustained_rps % self.shard_count
                or self.global_burst_rps % self.shard_count
            )
        ):
            raise SystemExit("approved load dimensions must divide evenly across shards")
        self.users = self.total_users // self.shard_count
        self.sustained_rps = self.global_sustained_rps // self.shard_count
        self.burst_rps = self.global_burst_rps // self.shard_count
        if self.first_user < 1:
            raise SystemExit("BOTOLAGO_LOAD_FIRST_USER must be positive")
        self.user_start = self.first_user + self.shard_index * self.users
        if self.load_profile == "setup_rehearsal":
            if self.burst_seconds != 0 or self.total_seconds != 0:
                raise SystemExit("setup_rehearsal must not execute measured traffic")
        elif self.load_profile == "merge_gate":
            if self.burst_seconds != 10 or self.total_seconds != 60:
                raise SystemExit("merge_gate requires a 10-second burst and 60-second duration")
        elif self.load_profile == "telemetry_soak":
            if self.burst_seconds != 0 or self.total_seconds not in range(300, 601):
                raise SystemExit(
                    "telemetry_soak requires no burst and a 5-to-10-minute duration"
                )
        else:
            raise SystemExit(
                "BOTOLAGO_LOAD_PROFILE must be setup_rehearsal, merge_gate, or telemetry_soak"
            )
        self.observations: list[Observation] = []
        self.response_diagnostics: list[ResponseDiagnostic] = []
        self.states: list[UserState] = []
        self.session_tokens = load_session_tokens(
            self.session_cache_path,
            self.users,
            self.total_seconds,
            self.user_start,
        )

    async def run(self) -> dict[str, Any]:
        timeout = aiohttp.ClientTimeout(total=15, connect=5)
        connector = aiohttp.TCPConnector(
            limit=1200,
            limit_per_host=1200,
            ttl_dns_cache=300,
            ssl=create_verified_ssl_context(),
        )
        try:
            async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
                await self.prepare_users(session)
                if self.start_at:
                    delay = self.start_at - time.time()
                    if delay <= 0:
                        raise SystemExit("BOTOLAGO_LOAD_START_AT elapsed before preparation completed")
                    await asyncio.sleep(delay)
                if self.load_profile == "setup_rehearsal":
                    result = {
                        "profile": {
                            "loadProfile": self.load_profile,
                            "users": self.total_users,
                            "shardCount": self.shard_count,
                            "shardIndex": self.shard_index,
                            "shardUsers": self.users,
                            "firstUser": self.first_user,
                            "shardFirstUser": self.user_start,
                            "sessionSource": "preprovisioned_independent_auth_sessions",
                            "requests": 0,
                        },
                        "readiness": {
                            "ready": True,
                            "preparedUsers": len(self.states),
                            "readyAt": time.time(),
                            "synchronizedStartAt": self.start_at,
                        },
                    }
                    write_private_json(self.results_path, result)
                    return result
                requests: list[asyncio.Task[None]] = []
                started = time.perf_counter()
                request_number = 0
                while True:
                    elapsed = time.perf_counter() - started
                    if elapsed >= self.total_seconds:
                        break
                    rps = self.burst_rps if elapsed < self.burst_seconds else self.sustained_rps
                    second = int(elapsed)
                    target_total = (
                        min(second + 1, self.burst_seconds) * self.burst_rps
                        + max(second + 1 - self.burst_seconds, 0) * self.sustained_rps
                    )
                    while request_number < target_total:
                        state = self.states[request_number % self.users]
                        operation = self.pick_operation(request_number)
                        requests.append(
                            asyncio.create_task(self.execute_serial(session, state, operation))
                        )
                        request_number += 1
                    await asyncio.sleep(max(0.001, second + 1 - (time.perf_counter() - started)))
                await asyncio.gather(*requests)
            result = self.summarize(time.perf_counter() - started)
            write_private_json(self.results_path, result)
            return result
        except Exception:
            if self.response_diagnostics:
                write_private_json(
                    self.results_path,
                    {
                        "profile": {
                            "loadProfile": self.load_profile,
                            "users": self.total_users,
                            "shardCount": self.shard_count,
                            "shardIndex": self.shard_index,
                            "requests": len(self.observations),
                        },
                        "failure": "non_json_response",
                        "nonJsonResponses": self.summarize_non_json_responses(),
                    },
                )
            raise
        finally:
            for state in self.states:
                state.token = ""
            self.states.clear()
            self.session_tokens.clear()

    async def prepare_users(self, session: aiohttp.ClientSession) -> None:
        semaphore = asyncio.Semaphore(PREPARATION_CONCURRENCY)

        async def prepare(number: int) -> UserState:
            async with semaphore:
                token = self.session_tokens[number]
                team: dict[str, Any] | None = None
                last_error: LoadRequestError | None = None
                for attempt in range(3):
                    try:
                        team = await self.rpc(
                            session,
                            token,
                            "get_my_fantasy_team",
                            {"p_season_id": SEASON_ID},
                            record=False,
                        )
                        break
                    except LoadRequestError as error:
                        last_error = error
                        if attempt < 2:
                            await asyncio.sleep(preparation_retry_delay(attempt))
                if team is None:
                    code = safe_error_code(last_error.code if last_error else None)
                    status = last_error.status if last_error else 0
                    raise RuntimeError(
                        f"setup RPC failed for assigned user {number}: "
                        f"status={status} code={code}"
                    ) from last_error
                selection = [
                    {
                        "fantasy_player_id": item["fantasyPlayerId"],
                        "slot": item["slot"],
                        "slot_order": item["slotOrder"],
                        "captain": item["captain"],
                        "vice_captain": item["viceCaptain"],
                    }
                    for item in team["lineup"]
                ]
                return UserState(number, token, team["id"], int(team["version"]), selection)

        prepared = await asyncio.gather(
            *(prepare(number) for number in range(self.user_start, self.user_start + self.users))
        )
        self.states = list(prepared)

    def pick_operation(self, request_number: int) -> str:
        bucket = request_number % 100
        if bucket < 60:
            return "lineup"
        if bucket < 75:
            return "transfer_preview"
        if bucket < 90:
            return "transfer_confirm"
        if bucket < 95:
            return "chip"
        return "team_read"

    async def execute_serial(
        self, session: aiohttp.ClientSession, state: UserState, operation: str
    ) -> None:
        async with state.lock:
            await self.execute_operation(session, state, operation)

    async def execute_operation(
        self, session: aiohttp.ClientSession, state: UserState, operation: str
    ) -> None:
        try:
            if operation == "lineup":
                rotate_captain(state.selection)
                response = await self.rpc(
                    session,
                    state.token,
                    "save_fantasy_lineup",
                    {
                        "p_team_id": state.team_id,
                        "p_gameweek_id": GAMEWEEK_ID,
                        "p_selection": state.selection,
                        "p_expected_version": state.version,
                        "p_idempotency_key": str(uuid.uuid4()),
                    },
                    operation,
                )
                state.version = int(response["version"])
            elif operation in {"transfer_preview", "transfer_confirm"}:
                player_out = deterministic_uuid(
                    "fantasy-load-player-60" if state.transferred_in else "fantasy-load-player-15"
                )
                player_in = deterministic_uuid(
                    "fantasy-load-player-15" if state.transferred_in else "fantasy-load-player-60"
                )
                payload = {
                    "p_team_id": state.team_id,
                    "p_gameweek_id": GAMEWEEK_ID,
                    "p_transfers": [{"player_out_id": player_out, "player_in_id": player_in}],
                    "p_expected_version": state.version,
                    "p_chip_type": None,
                }
                if operation == "transfer_preview":
                    await self.rpc(session, state.token, "preview_fantasy_transfers", payload, operation)
                else:
                    payload["p_idempotency_key"] = str(uuid.uuid4())
                    response = await self.rpc(
                        session, state.token, "confirm_fantasy_transfers", payload, operation
                    )
                    state.version = int(response["team"]["version"])
                    replace_player(state.selection, player_out, player_in)
                    state.transferred_in = not state.transferred_in
            elif operation == "chip":
                response = await self.rpc(
                    session,
                    state.token,
                    "activate_fantasy_chip",
                    {
                        "p_team_id": state.team_id,
                        "p_gameweek_id": GAMEWEEK_ID,
                        "p_chip_type": "bench_boost",
                        "p_expected_version": state.version,
                        "p_idempotency_key": str(uuid.uuid4()),
                    },
                    operation,
                )
                state.version = int(response["teamVersion"])
            else:
                await self.rpc(
                    session,
                    state.token,
                    "get_my_fantasy_team",
                    {"p_season_id": SEASON_ID},
                    "team_read",
                )
        except LoadRequestError:
            return

    async def rpc(
        self,
        session: aiohttp.ClientSession,
        token: str,
        function: str,
        body: dict[str, Any],
        operation: str | None = None,
        record: bool = True,
    ) -> Any:
        return await self.request(
            session,
            "POST",
            f"/rest/v1/rpc/{function}",
            token,
            body,
            operation=operation or function,
            record=record,
        )

    async def request(
        self,
        session: aiohttp.ClientSession,
        method: str,
        path: str,
        token: str | None,
        body: dict[str, Any],
        operation: str = "setup",
        record: bool = True,
    ) -> Any:
        headers = {"apikey": self.api_key, "Content-Type": "application/json"}
        if path.startswith("/rest/v1/"):
            headers["Accept-Profile"] = "api"
            headers["Content-Profile"] = "api"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        started = time.perf_counter()
        try:
            async with session.request(method, f"{self.base_url}{path}", headers=headers, json=body) as response:
                status = response.status
                content_type = sanitize_response_snippet(
                    response.headers.get("Content-Type", ""),
                    NON_JSON_SNIPPET_BYTES,
                )
                raw_body = await response.read()
                body_length = len(raw_body)
                response_text = raw_body.decode(
                    response.charset or "utf-8",
                    errors="replace",
                )
                latency = (time.perf_counter() - started) * 1000
                try:
                    payload = json.loads(response_text)
                except json.JSONDecodeError as error:
                    diagnostic = ResponseDiagnostic(
                        operation=operation,
                        status=status,
                        content_type=content_type,
                        body_length=body_length,
                        sanitized_snippet=sanitize_response_snippet(response_text),
                    )
                    self.response_diagnostics.append(diagnostic)
                    if record:
                        self.observations.append(
                            Observation(
                                operation,
                                latency,
                                status,
                                "non_json_response",
                                False,
                                content_type,
                                body_length,
                                diagnostic.sanitized_snippet,
                            )
                        )
                    raise LoadRequestError(
                        status,
                        "non_json_response",
                        diagnostic,
                    ) from error
                code = payload.get("message") if isinstance(payload, dict) and status >= 400 else None
                expected = code in EXPECTED_ERRORS
                if record:
                    self.observations.append(Observation(operation, latency, status, code, expected))
                if status >= 400:
                    raise LoadRequestError(status, code or "unknown_error")
                return payload
        except (aiohttp.ClientError, asyncio.TimeoutError) as error:
            latency = (time.perf_counter() - started) * 1000
            if record:
                self.observations.append(
                    Observation(operation, latency, 0, type(error).__name__, False)
                )
            raise LoadRequestError(0, type(error).__name__) from error

    def summarize_non_json_responses(self) -> dict[str, Any]:
        return {
            "count": len(self.response_diagnostics),
            "statusCounts": dict(
                Counter(str(item.status) for item in self.response_diagnostics)
            ),
            "observations": [
                {
                    "operation": item.operation,
                    "status": item.status,
                    "contentType": item.content_type,
                    "bodyLength": item.body_length,
                    "sanitizedSnippet": item.sanitized_snippet,
                }
                for item in self.response_diagnostics
            ],
        }

    def summarize(self, elapsed_seconds: float) -> dict[str, Any]:
        by_operation: dict[str, list[Observation]] = defaultdict(list)
        for observation in self.observations:
            by_operation[observation.operation].append(observation)
        unexpected = [
            item
            for item in self.observations
            if (
                item.status == 0
                or item.status >= 400
                or item.error_code == "non_json_response"
            )
            and not item.expected_rejection
        ]
        expected = [item for item in self.observations if item.expected_rejection]
        reads = by_operation.get("team_read", []) + by_operation.get("transfer_preview", [])
        mutations = (
            by_operation.get("lineup", [])
            + by_operation.get("transfer_confirm", [])
            + by_operation.get("chip", [])
        )
        return {
            "profile": {
                "loadProfile": self.load_profile,
                "users": self.total_users,
                "shardCount": self.shard_count,
                "shardIndex": self.shard_index,
                "shardUsers": self.users,
                "firstUser": self.first_user,
                "shardFirstUser": self.user_start,
                "sessionSource": "preprovisioned_independent_auth_sessions",
                "sustainedRps": self.global_sustained_rps,
                "burstRps": self.global_burst_rps,
                "shardSustainedRps": self.sustained_rps,
                "shardBurstRps": self.burst_rps,
                "burstSeconds": self.burst_seconds,
                "durationSeconds": self.total_seconds,
                "actualElapsedSeconds": round(elapsed_seconds, 3),
                "requests": len(self.observations),
            },
            "overall": {
                "readP95Ms": percentile(reads, 95),
                "mutationP95Ms": percentile(mutations, 95),
                "mutationP99Ms": percentile(mutations, 99),
                "unexpectedErrorRate": round(len(unexpected) / max(len(self.observations), 1), 6),
                "expectedRejections": len(expected),
                "unexpectedErrors": len(unexpected),
            },
            "operations": {
                operation: summarize_observations(observations)
                for operation, observations in sorted(by_operation.items())
            },
            "latencySamplesMs": {
                operation: [round(item.latency_ms, 3) for item in observations]
                for operation, observations in sorted(by_operation.items())
            }
            if os.getenv("BOTOLAGO_LOAD_INCLUDE_SAMPLES") == "1"
            else None,
            "errorCodes": dict(Counter(item.error_code for item in self.observations if item.error_code)),
            "nonJsonResponses": self.summarize_non_json_responses(),
            "passCriteria": {
                "readP95": percentile(reads, 95) <= 500,
                "mutationP95": percentile(mutations, 95) <= 1500,
                "mutationP99": percentile(mutations, 99) <= 3000,
                "unexpectedErrorRate": len(unexpected) / max(len(self.observations), 1) < 0.005,
            },
        }


class LoadRequestError(RuntimeError):
    def __init__(
        self,
        status: int,
        code: str,
        diagnostic: ResponseDiagnostic | None = None,
    ) -> None:
        self.status = status
        self.code = code
        self.diagnostic = diagnostic
        super().__init__(f"request failed: {status} {code}")


def safe_error_code(code: str | None) -> str:
    if not code or len(code) > 80:
        return "unknown_setup_error"
    if not all(character.isalnum() or character in "._-" for character in code):
        return "unknown_setup_error"
    return code


def rotate_captain(selection: list[dict[str, Any]]) -> None:
    starters = [item for item in selection if item["slot"] == "starter"]
    captain = next(item for item in starters if item["captain"])
    vice = next(item for item in starters if item["vice_captain"])
    captain["captain"] = False
    captain["vice_captain"] = True
    vice["vice_captain"] = False
    vice["captain"] = True


def replace_player(selection: list[dict[str, Any]], player_out: str, player_in: str) -> None:
    target = next(item for item in selection if item["fantasy_player_id"] == player_out)
    target["fantasy_player_id"] = player_in


def percentile(observations: list[Observation], value: int) -> float:
    if not observations:
        return 0.0
    ordered = sorted(item.latency_ms for item in observations)
    index = min(len(ordered) - 1, max(0, math.ceil(value / 100 * len(ordered)) - 1))
    return round(ordered[index], 3)


def summarize_observations(observations: list[Observation]) -> dict[str, Any]:
    latencies = [item.latency_ms for item in observations]
    return {
        "count": len(observations),
        "p50Ms": percentile(observations, 50),
        "p95Ms": percentile(observations, 95),
        "p99Ms": percentile(observations, 99),
        "meanMs": round(statistics.fmean(latencies), 3) if latencies else 0.0,
        "unexpectedErrors": sum(
            1
            for item in observations
            if (
                item.status == 0
                or item.status >= 400
                or item.error_code == "non_json_response"
            )
            and not item.expected_rejection
        ),
        "expectedRejections": sum(1 for item in observations if item.expected_rejection),
    }


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def write_private_json(path: Path, value: dict[str, Any]) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags, 0o600)
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output, indent=2, sort_keys=True)
            output.write("\n")
    except OSError as error:
        raise SystemExit(f"unable to write owner-only result artifact: {path}") from error


def load_session_tokens(
    path: Path,
    expected_users: int,
    workload_seconds: int,
    first_user: int = 1,
) -> dict[int, str]:
    if not path.is_absolute() or not path.is_file():
        raise SystemExit("BOTOLAGO_LOAD_SESSION_CACHE must be an existing absolute file")
    if path.stat().st_mode & 0o077:
        raise SystemExit("BOTOLAGO_LOAD_SESSION_CACHE must use owner-only permissions (0600)")

    try:
        records = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit("BOTOLAGO_LOAD_SESSION_CACHE is not valid JSON") from error
    if not isinstance(records, list) or len(records) != expected_users:
        raise SystemExit(f"session cache must contain exactly {expected_users} records")

    tokens: dict[int, str] = {}
    subjects: set[str] = set()
    minimum_expiry = int(time.time()) + workload_seconds + 300
    expected_numbers = set(range(first_user, first_user + expected_users))
    for record in records:
        if not isinstance(record, dict):
            raise SystemExit("each session cache record must be an object")
        number = record.get("number")
        token = record.get("access_token")
        if not isinstance(number, int) or not isinstance(token, str):
            raise SystemExit("session cache records require number and access_token")
        if number in tokens or number not in expected_numbers:
            raise SystemExit("session cache user numbers must match the assigned shard")

        claims = decode_jwt_claims(token)
        subject = claims.get("sub")
        role = claims.get("role")
        expiry = claims.get("exp")
        try:
            uuid.UUID(str(subject))
        except (ValueError, TypeError) as error:
            raise SystemExit("session cache contains an invalid user subject") from error
        if subject in subjects or role != "authenticated":
            raise SystemExit("sessions must be unique authenticated-user tokens")
        if not isinstance(expiry, int) or expiry < minimum_expiry:
            raise SystemExit("all access tokens must remain valid through the workload window")
        subjects.add(subject)
        tokens[number] = token

    if set(tokens) != set(range(first_user, first_user + expected_users)):
        raise SystemExit("session cache user numbers must match the assigned shard")
    return tokens


def decode_jwt_claims(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise SystemExit("session cache contains a malformed access token")
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SystemExit("session cache contains a malformed access token") from error
    if not isinstance(claims, dict):
        raise SystemExit("session cache contains invalid token claims")
    return claims


if __name__ == "__main__":
    print(json.dumps(asyncio.run(FantasyLoadRunner().run()), indent=2, sort_keys=True))
