#!/usr/bin/env python3
"""Bounded public standings benchmark for the guarded Fantasy staging seed."""

from __future__ import annotations

import asyncio
import json
import math
import os
import time

import aiohttp

try:
    from fantasy_harness_tls import create_verified_ssl_context
except ModuleNotFoundError:
    from scripts.backend.fantasy_harness_tls import create_verified_ssl_context


LEAGUE_ID = "fa900000-0000-4000-8000-000000000001"


def percentile(values: list[float], percentile_value: float) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * percentile_value) - 1)
    return round(ordered[index], 2)


async def benchmark(
    session: aiohttp.ClientSession,
    url: str,
    key: str,
    payload: dict[str, object],
    request_count: int = 200,
) -> dict[str, object]:
    semaphore = asyncio.Semaphore(25)

    async def request() -> tuple[int, float]:
        async with semaphore:
            started = time.perf_counter()
            async with session.post(
                f"{url}/rest/v1/rpc/fantasy_league_standings",
                headers={
                    "apikey": key,
                    "Content-Type": "application/json",
                    "Accept-Profile": "api",
                    "Content-Profile": "api",
                },
                json=payload,
            ) as response:
                await response.read()
                return response.status, (time.perf_counter() - started) * 1000

    results = await asyncio.gather(*(request() for _ in range(request_count)))
    successful = [latency for status, latency in results if status == 200]
    return {
        "requests": len(results),
        "successful": len(successful),
        "statuses": {
            str(status): sum(1 for item_status, _ in results if item_status == status)
            for status in sorted({item_status for item_status, _ in results})
        },
        "p50Ms": percentile(successful, 0.5) if successful else None,
        "p95Ms": percentile(successful, 0.95) if successful else None,
        "p99Ms": percentile(successful, 0.99) if successful else None,
    }


async def main() -> dict[str, object]:
    url = os.environ["BOTOLAGO_STAGING_SUPABASE_URL"].rstrip("/")
    key = os.environ["BOTOLAGO_STAGING_PUBLISHABLE_KEY"]
    if "staging" not in os.environ.get("BOTOLAGO_LOAD_ENVIRONMENT", "").lower():
        raise RuntimeError("fantasy_standings_benchmark_requires_staging")
    timeout = aiohttp.ClientTimeout(total=20)
    connector = aiohttp.TCPConnector(
        limit=50,
        ssl=create_verified_ssl_context(),
    )
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        await benchmark(
            session,
            url,
            key,
            {
                "p_league_id": LEAGUE_ID,
                "p_gameweek_id": None,
                "p_after_rank": None,
                "p_after_team_id": None,
                "p_limit": 100,
            },
            request_count=200,
        )
        first = await benchmark(
            session,
            url,
            key,
            {
                "p_league_id": LEAGUE_ID,
                "p_gameweek_id": None,
                "p_after_rank": None,
                "p_after_team_id": None,
                "p_limit": 100,
            },
        )
        later = await benchmark(
            session,
            url,
            key,
            {
                "p_league_id": LEAGUE_ID,
                "p_gameweek_id": None,
                "p_after_rank": 5001,
                "p_after_team_id": "89c04dcd-9b59-509f-48e8-48feb828c4ba",
                "p_limit": 100,
            },
        )
    return {"firstPage": first, "laterPage": later}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(main()), indent=2, sort_keys=True))
