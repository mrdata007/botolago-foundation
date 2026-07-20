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
import statistics
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aiohttp

SEASON_ID = "fa630000-0000-4000-8000-000000000001"
GAMEWEEK_ID = "fa640000-0000-4000-8000-000000000002"
EXPECTED_ERRORS = {
    "fantasy_gameweek_locked",
    "version_conflict",
    "chip_already_used",
    "chip_conflict",
    "idempotency_conflict",
}


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
    chip_activated: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


@dataclass
class Observation:
    operation: str
    latency_ms: float
    status: int
    error_code: str | None
    expected_rejection: bool


class FantasyLoadRunner:
    def __init__(self) -> None:
        self.base_url = require_env("BOTOLAGO_STAGING_SUPABASE_URL").rstrip("/")
        self.api_key = require_env("BOTOLAGO_STAGING_PUBLISHABLE_KEY")
        self.session_cache_path = Path(require_env("BOTOLAGO_LOAD_SESSION_CACHE"))
        if "staging" not in os.getenv("BOTOLAGO_LOAD_ENVIRONMENT", "").lower():
            raise SystemExit("BOTOLAGO_LOAD_ENVIRONMENT must explicitly contain 'staging'")
        self.users = int(os.getenv("BOTOLAGO_LOAD_USERS", "2500"))
        self.sustained_rps = int(os.getenv("BOTOLAGO_LOAD_SUSTAINED_RPS", "250"))
        self.burst_rps = int(os.getenv("BOTOLAGO_LOAD_BURST_RPS", "600"))
        self.burst_seconds = int(os.getenv("BOTOLAGO_LOAD_BURST_SECONDS", "10"))
        self.total_seconds = int(os.getenv("BOTOLAGO_LOAD_DURATION_SECONDS", "60"))
        self.results_path = Path(
            os.getenv("BOTOLAGO_LOAD_RESULTS_PATH", "/tmp/botolago-fantasy-load-results.json")
        )
        if self.users != 2500 or self.sustained_rps != 250 or self.burst_rps != 600:
            raise SystemExit("approved merge-gate load dimensions may not be weakened")
        self.observations: list[Observation] = []
        self.states: list[UserState] = []
        self.random = random.Random(610)
        self.session_tokens = load_session_tokens(
            self.session_cache_path,
            self.users,
            self.total_seconds,
        )

    async def run(self) -> dict[str, Any]:
        timeout = aiohttp.ClientTimeout(total=15, connect=5)
        connector = aiohttp.TCPConnector(limit=1200, limit_per_host=1200, ttl_dns_cache=300)
        try:
            async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
                await self.prepare_users(session)
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
                        operation = self.pick_operation()
                        requests.append(
                            asyncio.create_task(self.execute_serial(session, state, operation))
                        )
                        request_number += 1
                    await asyncio.sleep(max(0.001, second + 1 - (time.perf_counter() - started)))
                await asyncio.gather(*requests)
            result = self.summarize(time.perf_counter() - started)
            self.results_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
            return result
        finally:
            for state in self.states:
                state.token = ""
            self.states.clear()
            self.session_tokens.clear()

    async def prepare_users(self, session: aiohttp.ClientSession) -> None:
        semaphore = asyncio.Semaphore(50)

        async def prepare(number: int) -> UserState:
            async with semaphore:
                token = self.session_tokens[number]
                team = await self.rpc(
                    session,
                    token,
                    "get_my_fantasy_team",
                    {"p_season_id": SEASON_ID},
                    record=False,
                )
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

        prepared = await asyncio.gather(*(prepare(number) for number in range(1, self.users + 1)))
        self.states = list(prepared)

    def pick_operation(self) -> str:
        value = self.random.random()
        if value < 0.60:
            return "lineup"
        if value < 0.75:
            return "transfer_preview"
        if value < 0.90:
            return "transfer_confirm"
        if value < 0.95:
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
            elif operation == "chip" and not state.chip_activated:
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
                state.chip_activated = True
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
                payload = await response.json(content_type=None)
                latency = (time.perf_counter() - started) * 1000
                code = payload.get("message") if isinstance(payload, dict) and response.status >= 400 else None
                expected = code in EXPECTED_ERRORS
                if record:
                    self.observations.append(Observation(operation, latency, response.status, code, expected))
                if response.status >= 400:
                    raise LoadRequestError(response.status, code or "unknown_error")
                return payload
        except (aiohttp.ClientError, asyncio.TimeoutError) as error:
            latency = (time.perf_counter() - started) * 1000
            if record:
                self.observations.append(
                    Observation(operation, latency, 0, type(error).__name__, False)
                )
            raise LoadRequestError(0, type(error).__name__) from error

    def summarize(self, elapsed_seconds: float) -> dict[str, Any]:
        by_operation: dict[str, list[Observation]] = defaultdict(list)
        for observation in self.observations:
            by_operation[observation.operation].append(observation)
        unexpected = [
            item
            for item in self.observations
            if (item.status == 0 or item.status >= 500 or item.status >= 400)
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
                "users": self.users,
                "sessionSource": "preprovisioned_independent_auth_sessions",
                "sustainedRps": self.sustained_rps,
                "burstRps": self.burst_rps,
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
            "errorCodes": dict(Counter(item.error_code for item in self.observations if item.error_code)),
            "passCriteria": {
                "readP95": percentile(reads, 95) <= 500,
                "mutationP95": percentile(mutations, 95) <= 1500,
                "mutationP99": percentile(mutations, 99) <= 3000,
                "unexpectedErrorRate": len(unexpected) / max(len(self.observations), 1) < 0.005,
            },
        }


class LoadRequestError(RuntimeError):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(f"request failed: {status} {code}")


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
            if (item.status == 0 or item.status >= 400) and not item.expected_rejection
        ),
        "expectedRejections": sum(1 for item in observations if item.expected_rejection),
    }


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def load_session_tokens(path: Path, expected_users: int, workload_seconds: int) -> dict[int, str]:
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
    for record in records:
        if not isinstance(record, dict):
            raise SystemExit("each session cache record must be an object")
        number = record.get("number")
        token = record.get("access_token")
        if not isinstance(number, int) or not isinstance(token, str):
            raise SystemExit("session cache records require number and access_token")
        if number in tokens or number < 1 or number > expected_users:
            raise SystemExit("session cache user numbers must be unique and contiguous")

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

    if set(tokens) != set(range(1, expected_users + 1)):
        raise SystemExit("session cache user numbers must be unique and contiguous")
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
