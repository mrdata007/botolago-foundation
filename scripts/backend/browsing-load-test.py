#!/usr/bin/env python3
"""Match-day browsing workload for BotolaGO Staging V2.

A separate workload from the Fantasy deadline gate (fantasy-load-test.py),
which it does not change. It models many people reading shared data at once:
home, a live match page that re-reads every 30 seconds, news, fixtures, the
league table and the Fantasy rankings. Each page makes the Supabase calls the
web app makes for it today (docs/operations/BROWSING_LOAD_TEST.md lists them
and where in src/ they come from), so the result measures today's app, not an
idealised one.

Visitors are closed-loop: open a page, stay, open the next one. 30% of them
are signed in and send their own session token, as the app does for every
read once someone is signed in; the rest send only the publishable key.

The runner holds no credentials of its own. Everything comes from the
environment, and it refuses anything that is not Staging V2 or a local stack.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import math
import os
import random
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

import aiohttp

HERE = Path(__file__).resolve().parent
PRODUCTION_REF = "tkewgajrljbwgwedqsxn"
LEGACY_REF = "kxpaudvntwxpahyjtxbk"
REQUEST_TIMEOUT_SECONDS = 10.0  # the web app's AbortSignal.timeout on /rest/v1
LIVE_POLL_SECONDS = 30.0  # match page and live strip while a match is live
HUB_POLL_SECONDS = 60.0  # Fantasy availability, signed-in visitors
MEAN_THINK_SECONDS = 40.0
MEAN_LIVE_DWELL_SECONDS = 180.0
RAMP_SECONDS = 60.0
SIGNED_IN_PERCENT = 30
MIN_CONTENT = {"liveMatches": 1, "fixtures": 50, "articles": 100}
PASS_READ_P95_MS = 500.0
PASS_PAGE_P95_MS = 2000.0
PASS_UNEXPECTED_ERROR_RATE = 0.005

# Share of page views. The live match page is weighted as the match-day peak.
PAGE_WEIGHTS = {
    "home": 30,
    "match_live": 25,
    "news_article": 20,
    "matches_day": 10,
    "standings": 5,
    "fantasy_rankings": 5,
    "news_list": 5,
}


def load_sibling(name: str, filename: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    if spec is None or spec.loader is None:
        raise SystemExit(f"{filename} must sit next to this script")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def assert_staging_url(url: str) -> None:
    if PRODUCTION_REF in url or LEGACY_REF in url:
        raise SystemExit("the browsing workload never targets Production V2 or Legacy")
    if not (url.startswith("https://") and url.endswith(".supabase.co")) and not url.startswith(
        ("http://127.0.0.1", "http://localhost")
    ):
        raise SystemExit("BOTOLAGO_STAGING_SUPABASE_URL must be a Supabase project URL or a local stack")


def items_of(payload: Any) -> list[Any]:
    """The list inside an RPC answer, whichever envelope it uses."""

    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("items", "matches", "fixtures", "seasons", "articles"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


@dataclass
class Content:
    season_id: str
    competition_id: str
    live_fixture_ids: list[str]
    fixture_ids: list[str]
    match_day: str
    article_ids: dict[str, list[str]]
    fantasy_season_id: str | None
    fantasy_gameweek_id: str | None

    def coverage(self) -> dict[str, int]:
        return {
            "liveMatches": len(self.live_fixture_ids),
            "fixtures": len(self.fixture_ids),
            "articles": sum(len(ids) for ids in self.article_ids.values()),
        }


Call = tuple[str, dict[str, Any]]


def page_calls(page: str, content: Content, rng: random.Random, language: str) -> list[list[Call]]:
    """The calls one page view makes today, as groups sent together.

    Groups run one after another; the calls inside a group run at once, as
    the app's server render and then its browser queries do.
    """

    c = content
    season = {"p_season_id": c.season_id}
    fixtures_page = {"p_competition_id": c.competition_id, "p_season_id": c.season_id, "p_limit": 100}
    if page == "home":
        return [
            [
                ("football_home_matches", {"p_language": language}),
                ("football_team_catalog", {"p_language": language}),
                ("football_season_catalog", {"p_language": language}),
                ("news_feed", {"p_language": "fr", "p_limit": 20}),
                ("news_feed", {"p_language": "ar", "p_limit": 20}),
                ("news_home_modules", {"p_language": language}),
            ],
            [("football_competition_fixtures", fixtures_page), ("football_standings", season)],
            [
                ("fantasy_hub", {"p_language": language}),
                ("football_live_matches", {"p_language": language}),
                ("predictions_round", {"p_language": language}),
            ]
            + (
                [
                    ("fantasy_player_season_stats", {"p_season_id": c.fantasy_season_id}),
                    ("fantasy_player_pool", {"p_season_id": c.fantasy_season_id, "p_limit": 100}),
                ]
                if c.fantasy_season_id
                else []
            ),
        ]
    if page == "match_live":
        return [match_page_group(rng.choice(c.live_fixture_ids), language) + [
            ("news_feed", {"p_language": language, "p_limit": 20})
        ]]
    if page == "news_article":
        article = rng.choice(c.article_ids.get(language) or c.article_ids["fr"])
        return [
            [("news_article_detail", {"p_language": language, "p_identifier": article})],
            [
                ("news_related_articles", {"p_article_edition_id": article}),
                ("news_team_filters", {"p_language": language}),
            ],
        ]
    if page == "matches_day":
        return [
            [
                ("football_season_catalog", {"p_language": language}),
                ("football_matches_by_date", {"p_date": c.match_day, "p_language": language}),
                ("football_live_matches", {"p_language": language}),
            ]
        ]
    if page == "standings":
        return [
            [("football_season_catalog", {"p_language": language})],
            [("football_competition_fixtures", fixtures_page), ("football_standings", season)],
        ]
    if page == "fantasy_rankings":
        groups: list[list[Call]] = [[("fantasy_hub", {"p_language": language})]]
        if c.fantasy_season_id:
            # The rankings page reads the board 100 rows at a time, one page
            # after another, up to 20 pages (fantasy-runtime.ts overallBoard).
            groups += [
                [("fantasy_overall_standings", {"p_season_id": c.fantasy_season_id, "p_limit": 100})]
                for _ in range(20)
            ]
        return groups
    if page == "news_list":
        return [
            [
                ("news_home_modules", {"p_language": language}),
                ("news_team_filters", {"p_language": language}),
                ("news_feed", {"p_language": language, "p_limit": 20}),
            ]
        ]
    raise ValueError(page)


def match_page_group(fixture_id: str, language: str) -> list[Call]:
    body = {"p_fixture_id": fixture_id, "p_language": language}
    return [
        ("football_match_detail", body),
        ("football_head_to_head", body),
        ("football_match_timeline", body),
        ("football_match_statistics", body),
        ("football_match_lineups", body),
        ("football_match_pressure", body),
        ("football_match_absences", body),
    ]


@dataclass
class Observation:
    rpc: str
    signed_in: bool
    latency_ms: float
    status: int
    error: str | None


@dataclass
class Recorder:
    measuring: bool = False
    observations: list[Observation] = field(default_factory=list)
    page_views: list[tuple[str, float, bool]] = field(default_factory=list)

    def request(self, observation: Observation) -> None:
        if self.measuring:
            self.observations.append(observation)

    def page(self, page: str, latency_ms: float, ok: bool) -> None:
        if self.measuring:
            self.page_views.append((page, latency_ms, ok))


class BrowsingRunner:
    def __init__(self) -> None:
        self.base_url = require_env("BOTOLAGO_STAGING_SUPABASE_URL").rstrip("/")
        assert_staging_url(self.base_url)
        if "staging" not in os.getenv("BOTOLAGO_LOAD_ENVIRONMENT", "").lower():
            raise SystemExit("BOTOLAGO_LOAD_ENVIRONMENT must explicitly contain 'staging'")
        self.api_key = require_env("BOTOLAGO_STAGING_PUBLISHABLE_KEY")
        self.visitors_total = int(require_env("BOTOLAGO_BROWSING_VISITORS"))
        self.duration = int(require_env("BOTOLAGO_BROWSING_DURATION_SECONDS"))
        self.shard_count = int(os.getenv("BOTOLAGO_LOAD_SHARD_COUNT", "1"))
        self.shard_index = int(os.getenv("BOTOLAGO_LOAD_SHARD_INDEX", "0"))
        self.start_at = float(os.getenv("BOTOLAGO_LOAD_START_AT", "0"))
        self.results_path = Path(require_env("BOTOLAGO_LOAD_RESULTS_PATH"))
        if self.visitors_total < self.shard_count or self.visitors_total % self.shard_count:
            raise SystemExit("visitors must divide evenly across shards")
        if not 60 <= self.duration <= 1800:
            raise SystemExit("browsing duration must be 60 to 1,800 seconds")
        self.visitors = self.visitors_total // self.shard_count
        self.tokens = self.load_tokens()
        self.recorder = Recorder()
        self.rng = random.Random(1_000 + self.shard_index)

    def load_tokens(self) -> list[str]:
        path = os.getenv("BOTOLAGO_LOAD_SESSION_CACHE")
        if not path:
            return []
        gate = load_sibling("fantasy_load_test", "fantasy-load-test.py")
        users = int(require_env("BOTOLAGO_LOAD_USERS")) // self.shard_count
        first = int(require_env("BOTOLAGO_LOAD_FIRST_USER")) + self.shard_index * users
        tokens = gate.load_session_tokens(
            Path(path), users, self.duration + int(RAMP_SECONDS), first_user=first
        )
        return [tokens[number] for number in sorted(tokens)]

    async def call(
        self, session: aiohttp.ClientSession, rpc: str, body: dict[str, Any], token: str | None
    ) -> tuple[bool, Any]:
        headers = {
            "apikey": self.api_key,
            "Content-Profile": "api",
            "Content-Type": "application/json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        started = time.perf_counter()
        status, error, payload = 0, None, None
        try:
            async with session.post(
                f"{self.base_url}/rest/v1/rpc/{rpc}", json=body, headers=headers
            ) as response:
                status = response.status
                text = await response.text()
                if status >= 400:
                    error = f"http_{status}"
                    try:
                        code = json.loads(text).get("message") or json.loads(text).get("code")
                        if isinstance(code, str) and len(code) <= 80:
                            error = code
                    except (ValueError, AttributeError):
                        pass
                else:
                    payload = json.loads(text) if text else None
        except (asyncio.TimeoutError, TimeoutError):
            error = "TimeoutError"
        except aiohttp.ClientError as exc:
            error = type(exc).__name__
        latency = (time.perf_counter() - started) * 1000
        self.recorder.request(Observation(rpc, token is not None, latency, status, error))
        return error is None, payload

    async def discover(self, session: aiohttp.ClientSession) -> Content:
        async def read(rpc: str, body: dict[str, Any]) -> Any:
            ok, payload = await self.call(session, rpc, body, None)
            if not ok:
                raise SystemExit(f"content discovery failed at {rpc}")
            return payload

        seasons = items_of(await read("football_season_catalog", {"p_language": "fr"}))
        season = next(
            (item for item in seasons if isinstance(item, dict) and item.get("competition")), None
        )
        if season is None:
            raise SystemExit("content_missing: no football season")
        season_id = str(season["id"])
        competition_id = str(season["competition"]["id"])
        live = [str(item["id"]) for item in items_of(await read("football_live_matches", {})) if "id" in item]
        fixtures: list[str] = []
        kickoffs: list[str] = []
        body: dict[str, Any] = {"p_competition_id": competition_id, "p_season_id": season_id, "p_limit": 100}
        for _ in range(10):
            answer = await read("football_competition_fixtures", body)
            page = items_of(answer)
            fixtures += [str(item["id"]) for item in page if "id" in item]
            kickoffs += [str(item["kickoffAt"]) for item in page if item.get("kickoffAt")]
            cursor = answer.get("nextCursor") if isinstance(answer, dict) else None
            if not cursor:
                break
            body = {**body, "p_after_kickoff": cursor.get("kickoffAt"), "p_after_id": cursor.get("id")}
        today = datetime.now(ZoneInfo("Africa/Casablanca")).date().isoformat()
        match_day = today if any(k.startswith(today) for k in kickoffs) else (kickoffs[-1][:10] if kickoffs else today)
        articles: dict[str, list[str]] = {}
        for language in ("fr", "ar"):
            ids: list[str] = []
            body = {"p_language": language, "p_limit": 50}
            for _ in range(6):
                answer = await read("news_feed", body)
                ids += [str(item["id"]) for item in items_of(answer) if "id" in item]
                cursor = answer.get("nextCursor") if isinstance(answer, dict) else None
                if not cursor:
                    break
                body = {**body, "p_after_published_at": cursor.get("publishedAt"), "p_after_id": cursor.get("id")}
            articles[language] = ids
        hub = await read("fantasy_hub", {"p_language": "fr"})
        fantasy_season = (hub or {}).get("season") or {}
        fantasy_gameweek = (hub or {}).get("gameweek") or {}
        content = Content(
            season_id=season_id,
            competition_id=competition_id,
            live_fixture_ids=live,
            fixture_ids=fixtures,
            match_day=match_day,
            article_ids=articles,
            fantasy_season_id=fantasy_season.get("id"),
            fantasy_gameweek_id=fantasy_gameweek.get("id"),
        )
        short = {k: v for k, v in content.coverage().items() if v < MIN_CONTENT[k]}
        if short:
            # A browsing result on empty tables says nothing about match day.
            raise SystemExit(f"content_missing: {json.dumps(short)}; run browsing-staging-seed.sql")
        return content

    async def visitor(
        self,
        session: aiohttp.ClientSession,
        content: Content,
        number: int,
        stop_at: float,
    ) -> None:
        rng = random.Random(self.shard_index * 1_000_003 + number)
        signed_in = rng.randrange(100) < SIGNED_IN_PERCENT and bool(self.tokens)
        token = self.tokens[number % len(self.tokens)] if signed_in else None
        language = "ar" if rng.randrange(100) < 30 else "fr"
        await asyncio.sleep(rng.uniform(0, RAMP_SECONDS))
        next_strip = time.monotonic() + rng.uniform(0, LIVE_POLL_SECONDS)
        next_hub = time.monotonic() + rng.uniform(0, HUB_POLL_SECONDS)
        pages = list(PAGE_WEIGHTS)
        weights = [PAGE_WEIGHTS[page] for page in pages]

        async def poll_background() -> None:
            # Every page shows the live strip; signed-in pages poll the hub.
            nonlocal next_strip, next_hub
            now = time.monotonic()
            if now >= next_strip:
                next_strip = now + LIVE_POLL_SECONDS
                await self.call(session, "football_live_matches", {"p_language": language}, token)
            if token and now >= next_hub:
                next_hub = now + HUB_POLL_SECONDS
                await self.call(session, "fantasy_hub", {"p_language": language}, token)

        async def wait(seconds: float) -> None:
            end = min(stop_at, time.monotonic() + seconds)
            while time.monotonic() < end:
                await asyncio.sleep(min(5.0, max(0.0, end - time.monotonic())))
                await poll_background()

        while time.monotonic() < stop_at:
            page = rng.choices(pages, weights)[0]
            started = time.perf_counter()
            ok = True
            for group in page_calls(page, content, rng, language):
                results = await asyncio.gather(
                    *(self.call(session, rpc, body, token) for rpc, body in group)
                )
                ok = ok and all(result[0] for result in results)
            self.recorder.page(page, (time.perf_counter() - started) * 1000, ok)
            if page == "match_live":
                fixture = rng.choice(content.live_fixture_ids)
                dwell_end = time.monotonic() + rng.expovariate(1 / MEAN_LIVE_DWELL_SECONDS)
                while time.monotonic() < min(dwell_end, stop_at):
                    await wait(LIVE_POLL_SECONDS)
                    if time.monotonic() >= stop_at:
                        break
                    await asyncio.gather(
                        *(self.call(session, rpc, body, token) for rpc, body in match_page_group(fixture, language))
                    )
            else:
                await wait(rng.expovariate(1 / MEAN_THINK_SECONDS))

    async def run(self) -> dict[str, Any]:
        timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SECONDS)
        connector = aiohttp.TCPConnector(limit=4000, limit_per_host=4000, ttl_dns_cache=300)
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            content = await self.discover(session)
            if self.start_at:
                await asyncio.sleep(max(0.0, self.start_at - time.time()))
            begin = time.monotonic()
            stop_at = begin + RAMP_SECONDS + self.duration

            async def measure() -> None:
                await asyncio.sleep(RAMP_SECONDS)
                self.recorder.measuring = True

            await asyncio.gather(
                measure(),
                *(self.visitor(session, content, number, stop_at) for number in range(self.visitors)),
            )
            self.recorder.measuring = False
        return self.summarize(content)

    def summarize(self, content: Content) -> dict[str, Any]:
        observations = self.recorder.observations
        by_rpc: dict[str, list[Observation]] = defaultdict(list)
        for item in observations:
            by_rpc[item.rpc].append(item)
        errors = Counter(item.error for item in observations if item.error)
        unexpected = sum(errors.values())
        latencies = sorted(item.latency_ms for item in observations)
        pages = sorted(latency for _, latency, _ in self.recorder.page_views)
        read_p95 = quantile(latencies, 0.95)
        page_p95 = quantile(pages, 0.95)
        rate = unexpected / max(len(observations), 1)
        return {
            "profile": {
                "loadProfile": "browsing",
                "visitors": self.visitors,
                "visitorsTotal": self.visitors_total,
                "shardIndex": self.shard_index,
                "signedInPercent": SIGNED_IN_PERCENT,
                "durationSeconds": self.duration,
                "requests": len(observations),
                "requestsPerSecond": round(len(observations) / self.duration, 2),
                "pageViews": len(pages),
            },
            "content": content.coverage(),
            "rpcs": {
                rpc: {
                    "count": len(items),
                    "signedIn": sum(1 for item in items if item.signed_in),
                    "p50Ms": quantile(sorted(i.latency_ms for i in items), 0.50),
                    "p95Ms": quantile(sorted(i.latency_ms for i in items), 0.95),
                }
                for rpc, items in sorted(by_rpc.items())
            },
            "pages": {
                page: {"count": count}
                for page, count in Counter(page for page, _, _ in self.recorder.page_views).items()
            },
            "errorCodes": dict(errors),
            "overall": {
                "readP50Ms": quantile(latencies, 0.50),
                "readP95Ms": read_p95,
                "readP99Ms": quantile(latencies, 0.99),
                "pageP95Ms": page_p95,
                "unexpectedErrors": unexpected,
                "unexpectedErrorRate": round(rate, 6),
            },
            "latencySamplesMs": [round(value, 3) for value in latencies],
            "pageSamplesMs": [round(value, 3) for value in pages],
            "passCriteria": {
                "readP95": read_p95 <= PASS_READ_P95_MS,
                "pageP95": page_p95 <= PASS_PAGE_P95_MS,
                "unexpectedErrorRate": rate < PASS_UNEXPECTED_ERROR_RATE,
            },
        }


def quantile(ordered: list[float], q: float) -> float:
    if not ordered:
        return 0.0
    index = min(len(ordered) - 1, max(0, math.ceil(q * len(ordered)) - 1))
    return round(ordered[index], 3)


def main() -> int:
    runner = BrowsingRunner()
    result = asyncio.run(runner.run())
    runner.results_path.write_text(json.dumps(result), encoding="utf-8")
    summary = {key: value for key, value in result.items() if not key.endswith("SamplesMs")}
    summary["finishedAt"] = datetime.now(UTC).isoformat()
    print(json.dumps(summary, indent=2))
    return 0 if all(result["passCriteria"].values()) else 2


if __name__ == "__main__":
    raise SystemExit(main())
