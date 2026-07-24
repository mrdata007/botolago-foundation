#!/usr/bin/env python3
"""Distributed staging-only Auth session provisioner for the Phase 6 gate."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import signal
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import aiohttp

try:
    from fantasy_harness_tls import create_verified_ssl_context
except ModuleNotFoundError:
    from scripts.backend.fantasy_harness_tls import create_verified_ssl_context


REDACTED = "[REDACTED]"
SENSITIVE_RESPONSE_KEYS = {
    "access_token",
    "apikey",
    "api_key",
    "authorization",
    "password",
    "refresh_token",
}
SECRET_PATTERNS = (
    re.compile(r"\b(?:sb_(?:publishable|secret)|sbp)_[A-Za-z0-9_-]+\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]+", re.IGNORECASE),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
    re.compile(r"\b[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\b"),
)

_DIAGNOSTICS_PATH: Path | None = None
_RUNNER_ID: int | None = None
_CURRENT_USER_INDEX = -1
_SESSIONS_PROVISIONED = 0
_FINAL_DIAGNOSTIC_WRITTEN = False


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def decode_claims(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise SystemExit("Auth returned a malformed access token")
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SystemExit("Auth returned a malformed access token") from error
    if not isinstance(claims, dict):
        raise SystemExit("Auth returned invalid token claims")
    return claims


def require_private_file(path: Path) -> None:
    if not path.is_absolute() or not path.is_file():
        raise SystemExit(f"credential file must be an existing absolute file: {path}")
    if path.stat().st_mode & 0o077:
        raise SystemExit(f"credential file must use owner-only permissions: {path}")


def write_private_json(path: Path, value: Any) -> None:
    if not path.is_absolute():
        raise SystemExit("output path must be absolute")
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        json.dump(value, output, separators=(",", ":"))
        output.write("\n")


def sanitize_text(value: str, limit: int = 1000) -> str:
    sanitized = " ".join(value.split())
    for pattern in SECRET_PATTERNS:
        sanitized = pattern.sub(REDACTED, sanitized)
    return sanitized[:limit]


def sanitize_response(value: Any, depth: int = 0) -> Any:
    if depth >= 5:
        return "[TRUNCATED]"
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in list(value.items())[:50]:
            safe_key = sanitize_text(str(key), 100)
            normalized_key = safe_key.lower()
            if normalized_key in SENSITIVE_RESPONSE_KEYS or any(
                marker in normalized_key
                for marker in ("password", "token", "authorization", "api_key", "apikey")
            ):
                sanitized[safe_key] = REDACTED
            else:
                sanitized[safe_key] = sanitize_response(item, depth + 1)
        return sanitized
    if isinstance(value, list):
        return [sanitize_response(item, depth + 1) for item in value[:20]]
    if isinstance(value, str):
        return sanitize_text(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return sanitize_text(str(value))


def create_private_diagnostics_file(path: Path) -> None:
    if not path.is_absolute() or not path.parent.is_dir():
        raise SystemExit("diagnostics path must be absolute with an existing parent")
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags, 0o600)
    os.fchmod(descriptor, 0o600)
    os.close(descriptor)


def configure_diagnostics_path(path: Path) -> None:
    global _DIAGNOSTICS_PATH
    create_private_diagnostics_file(path)
    _DIAGNOSTICS_PATH = path


def append_private_diagnostic(path: Path, value: dict[str, Any], *, force_sync: bool = False) -> None:
    flags = os.O_WRONLY | os.O_APPEND
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    with os.fdopen(descriptor, "a", encoding="utf-8") as output:
        output.write(json.dumps(value, separators=(",", ":"), sort_keys=True))
        output.write("\n")
        output.flush()
        if force_sync:
            os.fsync(output.fileno())


def best_effort_append_diagnostic(value: dict[str, Any], *, force_sync: bool = False) -> None:
    path = _DIAGNOSTICS_PATH
    if path is None:
        return
    try:
        append_private_diagnostic(path, sanitize_response(value), force_sync=force_sync)
    except Exception:
        # Last-chance diagnostics must never mask the original failure path.
        return


def auth_error_code(payload: Any, status: int | None) -> str:
    if isinstance(payload, dict):
        for key in ("code", "error_code", "error"):
            candidate = payload.get(key)
            if isinstance(candidate, str) and candidate:
                return sanitize_text(candidate, 100)
    return f"http_{status}" if status is not None else "request_failed"


def record_auth_failure(
    diagnostics_path: Path,
    *,
    runner_id: int,
    user_index: int,
    http_status: int | None,
    payload: Any,
    request_duration_ms: float,
    fallback_code: str | None = None,
) -> None:
    diagnostic = {
        "event": "authentication_failure",
        "httpStatus": http_status,
        "requestDurationMs": round(max(0.0, request_duration_ms), 3),
        "responseBody": sanitize_response(payload),
        "runnerId": runner_id,
        "supabaseErrorCode": fallback_code or auth_error_code(payload, http_status),
        "userIndex": user_index,
    }
    append_private_diagnostic(diagnostics_path, diagnostic, force_sync=True)
    print(
        "[session-provisioning-diagnostic] "
        + json.dumps(diagnostic, separators=(",", ":"), sort_keys=True),
        file=sys.stderr,
        flush=True,
    )


def response_classification(payload: Any, status: int | None) -> str:
    if status == 401:
        return "unauthorized"
    if status == 429:
        return "rate_limited"
    if status is None:
        return "no_response"
    if isinstance(payload, dict) and auth_error_code(payload, status) != f"http_{status}":
        return "supabase_error"
    if 200 <= status < 300:
        return "success"
    if 400 <= status < 500:
        return "client_error"
    if status >= 500:
        return "server_error"
    return "unexpected_status"


def record_lifecycle(
    *,
    event_name: str,
    runner_id: int | None,
    user_index: int,
    force_sync: bool = False,
    **fields: Any,
) -> None:
    best_effort_append_diagnostic(
        {
            "event": event_name,
            "runnerId": runner_id,
            "timestamp": int(time.time()),
            "userIndex": user_index,
            **fields,
        },
        force_sync=force_sync,
    )


def record_exception_diagnostic(
    *,
    runner_id: int | None,
    user_index: int,
    error: BaseException,
    http_status: int | None = None,
    payload: Any = None,
    request_duration_ms: float = 0.0,
) -> None:
    record_lifecycle(
        event_name="authentication_exception",
        runner_id=runner_id,
        user_index=user_index,
        exceptionClass=type(error).__name__,
        httpStatus=http_status,
        requestDurationMs=round(max(0.0, request_duration_ms), 3),
        responseBody=sanitize_response(payload),
        responseClassification=response_classification(payload, http_status),
        sanitizedMessage=sanitize_text(str(error), 300),
        supabaseErrorCode=auth_error_code(payload, http_status),
        force_sync=True,
    )


def record_final_diagnostic(
    *,
    status: str,
    exit_kind: str,
    exit_code: int,
    reason: str,
) -> None:
    global _FINAL_DIAGNOSTIC_WRITTEN
    if _FINAL_DIAGNOSTIC_WRITTEN:
        return
    _FINAL_DIAGNOSTIC_WRITTEN = True
    best_effort_append_diagnostic(
        {
            "event": "session_provisioning_exit",
            "exitCode": exit_code,
            "exitKind": exit_kind,
            "reason": sanitize_text(reason, 300),
            "runnerId": _RUNNER_ID,
            "sessionsProvisioned": _SESSIONS_PROVISIONED,
            "status": status,
            "timestamp": int(time.time()),
            "userIndex": _CURRENT_USER_INDEX,
        },
        force_sync=True,
    )


def install_signal_handlers() -> None:
    def handle_signal(signum: int, _: Any) -> None:
        record_final_diagnostic(
            status="failure",
            exit_kind="signal",
            exit_code=128 + signum,
            reason=signal.Signals(signum).name,
        )
        raise SystemExit(128 + signum)

    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, handle_signal)


def validate_capacity_mode(capacity_mode: str, expected_users: int) -> None:
    if capacity_mode == "full_gate" and expected_users != 500:
        raise SystemExit("full gate requires exactly 500 users per runner")
    if capacity_mode == "full_session_diagnostic" and expected_users != 500:
        raise SystemExit("full session diagnostic requires exactly 500 users per runner")
    if capacity_mode == "setup_rehearsal" and expected_users not in range(25, 51):
        raise SystemExit("setup rehearsal requires 25 to 50 users per runner")
    if capacity_mode == "session_provisioning_rehearsal" and expected_users != 1:
        raise SystemExit("session provisioning rehearsal requires one user per runner")
    if capacity_mode not in {
        "full_gate",
        "full_session_diagnostic",
        "setup_rehearsal",
        "session_provisioning_rehearsal",
    }:
        raise SystemExit("unsupported capacity mode")


async def provision() -> dict[str, Any]:
    global _CURRENT_USER_INDEX, _RUNNER_ID, _SESSIONS_PROVISIONED
    if "staging" not in require_env("BOTOLAGO_LOAD_ENVIRONMENT").lower():
        raise SystemExit("session provisioning requires an explicit staging environment")
    base_url = require_env("BOTOLAGO_STAGING_SUPABASE_URL").rstrip("/")
    publishable_key = require_env("BOTOLAGO_STAGING_PUBLISHABLE_KEY")
    if not publishable_key.startswith("sb_publishable_"):
        raise SystemExit("session provisioning requires a publishable key")

    credentials_path = Path(require_env("BOTOLAGO_LOAD_CREDENTIAL_CACHE"))
    output_path = Path(require_env("BOTOLAGO_LOAD_SESSION_CACHE"))
    diagnostics_path = Path(require_env("BOTOLAGO_SESSION_DIAGNOSTICS_PATH"))
    require_private_file(credentials_path)
    configure_diagnostics_path(diagnostics_path)
    try:
        runner_id = int(require_env("BOTOLAGO_RUNNER_ID"))
    except ValueError as error:
        raise SystemExit("runner ID must be an integer") from error
    _RUNNER_ID = runner_id
    if runner_id not in range(5):
        raise SystemExit("runner ID must be between 0 and 4")
    record_lifecycle(
        event_name="session_provisioning_start",
        runner_id=runner_id,
        user_index=-1,
        expectedUsers=int(os.getenv("BOTOLAGO_EXPECTED_SESSION_USERS", "500")),
        mode=os.getenv("BOTOLAGO_CAPACITY_MODE", "full_gate"),
    )
    rate = float(os.getenv("BOTOLAGO_AUTH_RATE_PER_SECOND", "0.4"))
    if rate <= 0 or rate > 0.4:
        raise SystemExit("Auth provisioning rate must remain at or below 0.4 requests/second")

    capacity_mode = os.getenv("BOTOLAGO_CAPACITY_MODE", "full_gate")
    expected_users = int(os.getenv("BOTOLAGO_EXPECTED_SESSION_USERS", "500"))
    validate_capacity_mode(capacity_mode, expected_users)

    records = json.loads(credentials_path.read_text())
    if not isinstance(records, list) or len(records) != expected_users:
        raise SystemExit(
            f"each runner requires exactly {expected_users} credential records"
        )

    timeout = aiohttp.ClientTimeout(total=20, connect=5)
    sessions: list[dict[str, Any]] = []
    subjects: set[str] = set()
    session_ids: set[str] = set()
    access_token_fingerprints: set[str] = set()
    refresh_token_fingerprints: set[str] = set()
    started = time.monotonic()
    connector = aiohttp.TCPConnector(ssl=create_verified_ssl_context())
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as client:
        for index, record in enumerate(records):
            _CURRENT_USER_INDEX = index
            target = started + index / rate
            await asyncio.sleep(max(0.0, target - time.monotonic()))
            if not isinstance(record, dict):
                raise SystemExit("credential records must be objects")
            number = record.get("number")
            email = record.get("email")
            password = record.get("password")
            expected_user_id = record.get("user_id")
            if (
                not isinstance(number, int)
                or not isinstance(email, str)
                or not isinstance(password, str)
                or not isinstance(expected_user_id, str)
            ):
                raise SystemExit(
                    "credential records require number, email, password, and user_id"
                )
            request_started = time.perf_counter()
            try:
                record_lifecycle(
                    event_name="auth_request_start",
                    runner_id=runner_id,
                    user_index=index,
                    credentialNumber=number,
                )
                async with client.post(
                    f"{base_url}/auth/v1/token?grant_type=password",
                    headers={"apikey": publishable_key, "Content-Type": "application/json"},
                    json={"email": email, "password": password},
                ) as response:
                    response_text = await response.text()
                    request_duration_ms = (time.perf_counter() - request_started) * 1000
                    try:
                        payload = json.loads(response_text) if response_text else None
                    except json.JSONDecodeError:
                        payload = response_text
                    record_lifecycle(
                        event_name="auth_response_received",
                        runner_id=runner_id,
                        user_index=index,
                        httpStatus=response.status,
                        requestDurationMs=round(max(0.0, request_duration_ms), 3),
                        responseClassification=response_classification(payload, response.status),
                        supabaseErrorCode=auth_error_code(payload, response.status),
                    )
                    if not 200 <= response.status < 300 or not isinstance(payload, dict):
                        record_auth_failure(
                            diagnostics_path,
                            runner_id=runner_id,
                            user_index=index,
                            http_status=response.status,
                            payload=payload,
                            request_duration_ms=request_duration_ms,
                        )
                        raise SystemExit(
                            f"Auth session provisioning failed with HTTP {response.status}"
                        )
            except (aiohttp.ClientError, asyncio.TimeoutError) as error:
                request_duration_ms = (time.perf_counter() - request_started) * 1000
                record_exception_diagnostic(
                    runner_id=runner_id,
                    user_index=index,
                    error=error,
                    request_duration_ms=request_duration_ms,
                )
                record_auth_failure(
                    diagnostics_path,
                    runner_id=runner_id,
                    user_index=index,
                    http_status=None,
                    payload={"error": type(error).__name__},
                    request_duration_ms=request_duration_ms,
                    fallback_code="network_error",
                )
                raise SystemExit("Auth session provisioning request failed") from error

            try:
                token = payload.get("access_token")
                refresh_token = payload.get("refresh_token")
                if not isinstance(token, str) or not isinstance(refresh_token, str):
                    raise SystemExit("Auth response omitted independent session material")
                claims = decode_claims(token)
                subject = claims.get("sub")
                session_id = claims.get("session_id")
                if claims.get("role") != "authenticated":
                    raise SystemExit("Auth session did not receive the authenticated role")
                try:
                    uuid.UUID(str(subject))
                    uuid.UUID(str(session_id))
                    uuid.UUID(expected_user_id)
                except (TypeError, ValueError) as error:
                    raise SystemExit("Auth session identity is not a UUID") from error
                if str(subject) != expected_user_id:
                    raise SystemExit("Auth session subject does not match its assigned user")
                access_fingerprint = hashlib.sha256(token.encode("utf-8")).hexdigest()
                refresh_fingerprint = hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
                if (
                    str(subject) in subjects
                    or str(session_id) in session_ids
                    or access_fingerprint in access_token_fingerprints
                    or refresh_fingerprint in refresh_token_fingerprints
                ):
                    raise SystemExit("Auth returned duplicate session material")
                subjects.add(str(subject))
                session_ids.add(str(session_id))
                access_token_fingerprints.add(access_fingerprint)
                refresh_token_fingerprints.add(refresh_fingerprint)
                sessions.append({"number": number, "access_token": token})
                _SESSIONS_PROVISIONED = len(sessions)
                payload["refresh_token"] = ""
                refresh_token = ""
            except SystemExit:
                record_exception_diagnostic(
                    runner_id=runner_id,
                    user_index=index,
                    error=SystemExit("invalid_auth_response"),
                    http_status=response.status,
                    payload=payload,
                    request_duration_ms=request_duration_ms,
                )
                record_auth_failure(
                    diagnostics_path,
                    runner_id=runner_id,
                    user_index=index,
                    http_status=response.status,
                    payload=payload,
                    request_duration_ms=request_duration_ms,
                    fallback_code="invalid_auth_response",
                )
                raise

    now = int(time.time())
    remaining_seconds = [
        int(decode_claims(item["access_token"]).get("exp", 0)) - now
        for item in sessions
    ]
    if any(value < 20 * 60 for value in remaining_seconds):
        raise SystemExit("one or more sessions have less than 20 minutes remaining")
    if not all(
        len(values) == expected_users
        for values in (
            subjects,
            session_ids,
            access_token_fingerprints,
            refresh_token_fingerprints,
        )
    ):
        raise SystemExit(
            f"runner did not provision {expected_users} independent sessions"
        )

    write_private_json(output_path, sessions)
    credentials_path.unlink()
    for record in records:
        if isinstance(record, dict):
            record["password"] = ""
    records.clear()
    return {
        "runnerId": runner_id,
        "sessions": len(sessions),
        "uniqueSubjects": len(subjects),
        "uniqueSessionIds": len(session_ids),
        "minimumValidityMinutes": min(remaining_seconds) // 60,
        "ratePerSecond": rate,
        "subjectFingerprints": sorted(
            hashlib.sha256(value.encode("utf-8")).hexdigest() for value in subjects
        ),
        "sessionFingerprints": sorted(
            hashlib.sha256(value.encode("utf-8")).hexdigest() for value in session_ids
        ),
        "accessTokenFingerprints": sorted(access_token_fingerprints),
        "refreshTokenFingerprints": sorted(refresh_token_fingerprints),
    }


async def revoke() -> dict[str, Any]:
    base_url = require_env("BOTOLAGO_STAGING_SUPABASE_URL").rstrip("/")
    publishable_key = require_env("BOTOLAGO_STAGING_PUBLISHABLE_KEY")
    cache_path = Path(require_env("BOTOLAGO_LOAD_SESSION_CACHE"))
    require_private_file(cache_path)
    records = json.loads(cache_path.read_text())
    if not isinstance(records, list):
        raise SystemExit("session cache must be an array")
    semaphore = asyncio.Semaphore(10)
    failures = 0

    connector = aiohttp.TCPConnector(ssl=create_verified_ssl_context())
    async with aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=20, connect=5),
        connector=connector,
    ) as client:

        async def revoke_one(record: dict[str, Any]) -> None:
            nonlocal failures
            token = record.get("access_token")
            if not isinstance(token, str):
                failures += 1
                return
            async with semaphore:
                try:
                    async with client.post(
                        f"{base_url}/auth/v1/logout?scope=global",
                        headers={"apikey": publishable_key, "Authorization": f"Bearer {token}"},
                    ) as response:
                        if response.status not in (200, 204, 401):
                            failures += 1
                except (aiohttp.ClientError, asyncio.TimeoutError):
                    failures += 1
            record["access_token"] = ""

        await asyncio.gather(*(revoke_one(record) for record in records if isinstance(record, dict)))

    cache_path.unlink()
    records.clear()
    return {"revoked": failures == 0, "failures": failures}


if __name__ == "__main__":
    install_signal_handlers()
    exit_code = 0
    try:
        operation = os.getenv("BOTOLAGO_SESSION_OPERATION", "provision")
        if operation == "provision":
            result = asyncio.run(provision())
            record_final_diagnostic(
                status="success",
                exit_kind="normal",
                exit_code=0,
                reason="completed",
            )
        elif operation == "revoke":
            result = asyncio.run(revoke())
        else:
            raise SystemExit("BOTOLAGO_SESSION_OPERATION must be provision or revoke")
        print(json.dumps(result, sort_keys=True))
    except SystemExit as error:
        code = error.code if isinstance(error.code, int) else 1
        exit_code = code
        record_final_diagnostic(
            status="failure",
            exit_kind="system_exit",
            exit_code=code,
            reason=str(error) or type(error).__name__,
        )
        raise
    except asyncio.TimeoutError as error:
        exit_code = 124
        record_final_diagnostic(
            status="failure",
            exit_kind="timeout",
            exit_code=124,
            reason=type(error).__name__,
        )
        raise SystemExit(124) from error
    except BaseException as error:
        exit_code = 1
        record_final_diagnostic(
            status="failure",
            exit_kind="unhandled_exception",
            exit_code=1,
            reason=type(error).__name__,
        )
        raise
    finally:
        if not _FINAL_DIAGNOSTIC_WRITTEN and os.getenv("BOTOLAGO_SESSION_OPERATION", "provision") == "provision":
            record_final_diagnostic(
                status="failure" if exit_code else "success",
                exit_kind="finally",
                exit_code=exit_code,
                reason="last_chance",
            )
