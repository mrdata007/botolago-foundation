#!/usr/bin/env python3
"""Distributed staging-only Auth session provisioner for the Phase 6 gate."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import aiohttp


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


async def provision() -> dict[str, Any]:
    if "staging" not in require_env("BOTOLAGO_LOAD_ENVIRONMENT").lower():
        raise SystemExit("session provisioning requires an explicit staging environment")
    base_url = require_env("BOTOLAGO_STAGING_SUPABASE_URL").rstrip("/")
    publishable_key = require_env("BOTOLAGO_STAGING_PUBLISHABLE_KEY")
    if not publishable_key.startswith("sb_publishable_"):
        raise SystemExit("session provisioning requires a publishable key")

    credentials_path = Path(require_env("BOTOLAGO_LOAD_CREDENTIAL_CACHE"))
    output_path = Path(require_env("BOTOLAGO_LOAD_SESSION_CACHE"))
    require_private_file(credentials_path)
    rate = float(os.getenv("BOTOLAGO_AUTH_RATE_PER_SECOND", "0.4"))
    if rate <= 0 or rate > 0.4:
        raise SystemExit("Auth provisioning rate must remain at or below 0.4 requests/second")

    capacity_mode = os.getenv("BOTOLAGO_CAPACITY_MODE", "full_gate")
    expected_users = int(os.getenv("BOTOLAGO_EXPECTED_SESSION_USERS", "500"))
    if capacity_mode == "full_gate" and expected_users != 500:
        raise SystemExit("full gate requires exactly 500 users per runner")
    if capacity_mode == "setup_rehearsal" and expected_users not in range(25, 51):
        raise SystemExit("setup rehearsal requires 25 to 50 users per runner")
    if capacity_mode not in {"full_gate", "setup_rehearsal"}:
        raise SystemExit("unsupported capacity mode")

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
    async with aiohttp.ClientSession(timeout=timeout) as client:
        for index, record in enumerate(records):
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
            async with client.post(
                f"{base_url}/auth/v1/token?grant_type=password",
                headers={"apikey": publishable_key, "Content-Type": "application/json"},
                json={"email": email, "password": password},
            ) as response:
                payload = await response.json(content_type=None)
                if response.status != 200 or not isinstance(payload, dict):
                    raise SystemExit(f"Auth session provisioning failed with HTTP {response.status}")
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
                payload["refresh_token"] = ""
                refresh_token = ""

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

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20, connect=5)) as client:

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
    operation = os.getenv("BOTOLAGO_SESSION_OPERATION", "provision")
    if operation == "provision":
        result = asyncio.run(provision())
    elif operation == "revoke":
        result = asyncio.run(revoke())
    else:
        raise SystemExit("BOTOLAGO_SESSION_OPERATION must be provision or revoke")
    print(json.dumps(result, sort_keys=True))
