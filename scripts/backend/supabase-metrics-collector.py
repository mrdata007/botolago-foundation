#!/usr/bin/env python3
"""Bounded Supabase Metrics API collector for the Phase 6 staging workload."""

from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aiohttp

try:
    from fantasy_harness_tls import create_verified_ssl_context
except ModuleNotFoundError:
    from scripts.backend.fantasy_harness_tls import create_verified_ssl_context


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def parse_prometheus(body: str) -> list[dict[str, Any]]:
    metrics: list[dict[str, Any]] = []
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            series, value = line.rsplit(None, 1)
            numeric_value = float(value)
        except (ValueError, TypeError):
            continue
        metrics.append({"series": series, "value": numeric_value})
    return metrics


async def collect() -> dict[str, Any]:
    environment = require_env("BOTOLAGO_LOAD_ENVIRONMENT")
    if "staging" not in environment.lower():
        raise SystemExit("metrics collection requires an explicit staging environment")

    project_ref = require_env("BOTOLAGO_STAGING_PROJECT_REF")
    base_url = require_env("BOTOLAGO_STAGING_SUPABASE_URL").rstrip("/")
    if base_url != f"https://{project_ref}.supabase.co":
        raise SystemExit("staging project reference and URL do not match")

    secret_key = require_env("BOTOLAGO_STAGING_SECRET_KEY")
    if not secret_key.startswith("sb_secret_"):
        raise SystemExit("Metrics API requires a staging Secret API key")

    interval_seconds = int(os.getenv("BOTOLAGO_METRICS_INTERVAL_SECONDS", "60"))
    duration_seconds = int(os.getenv("BOTOLAGO_METRICS_DURATION_SECONDS", "900"))
    if interval_seconds != 60:
        raise SystemExit("Supabase Metrics API collection requires the documented 60-second cadence")
    if duration_seconds not in range(300, 901):
        raise SystemExit("metrics duration must remain between 5 and 15 minutes")

    output_path = Path(
        os.getenv("BOTOLAGO_METRICS_OUTPUT", "/tmp/botolago-fantasy-metrics.ndjson")
    )
    if not output_path.is_absolute():
        raise SystemExit("BOTOLAGO_METRICS_OUTPUT must be an absolute path")

    endpoint = f"{base_url}/customer/v1/privileged/metrics"
    timeout = aiohttp.ClientTimeout(total=15, connect=5)
    started_at = datetime.now(UTC)
    scrape_count = 0
    scrape_errors = 0
    observed_series: set[str] = set()
    output_flags = os.O_CREAT | os.O_TRUNC | os.O_WRONLY
    output_flags |= getattr(os, "O_CLOEXEC", 0)
    output_flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(output_path, output_flags, 0o600)
    os.fchmod(descriptor, 0o600)
    connector = aiohttp.TCPConnector(ssl=create_verified_ssl_context())

    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            async with aiohttp.ClientSession(
                timeout=timeout,
                auth=aiohttp.BasicAuth("service_role", secret_key),
                connector=connector,
            ) as session:
                monotonic_start = time.monotonic()
                while time.monotonic() - monotonic_start <= duration_seconds:
                    sampled_at = datetime.now(UTC).isoformat()
                    try:
                        async with session.get(endpoint) as response:
                            body = await response.text()
                            if response.status != 200:
                                raise RuntimeError(f"metrics_http_{response.status}")
                            metrics = parse_prometheus(body)
                            observed_series.update(item["series"].split("{")[0] for item in metrics)
                            record = {
                                "sampledAt": sampled_at,
                                "metrics": metrics,
                            }
                            scrape_count += 1
                    except (aiohttp.ClientError, asyncio.TimeoutError, RuntimeError) as error:
                        record = {
                            "sampledAt": sampled_at,
                            "error": str(error),
                        }
                        scrape_errors += 1
                    output.write(json.dumps(record, separators=(",", ":")) + "\n")
                    output.flush()
                    elapsed = time.monotonic() - monotonic_start
                    next_sample = (scrape_count + scrape_errors) * interval_seconds
                    if elapsed < duration_seconds:
                        await asyncio.sleep(max(0.0, next_sample - elapsed))
    finally:
        secret_key = ""

    return {
        "startedAt": started_at.isoformat(),
        "completedAt": datetime.now(UTC).isoformat(),
        "intervalSeconds": interval_seconds,
        "durationSeconds": duration_seconds,
        "scrapes": scrape_count,
        "scrapeErrors": scrape_errors,
        "seriesNames": len(observed_series),
        "artifact": str(output_path),
    }


if __name__ == "__main__":
    print(json.dumps(asyncio.run(collect()), indent=2, sort_keys=True))
