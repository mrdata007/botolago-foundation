#!/usr/bin/env python3
"""Bring BotolaGO Staging V2's database level with the repository's migrations.

STAGING ONLY. The Fantasy load test (.github/workflows/fantasy-load-test.yml)
measures the database code production runs, so staging has to carry the same
migrations first. On 2026-09-25 staging was 45 migrations behind production.

Staging's history was recorded partly under apply-time versions (the
2026-09-21 parity run) and holds a few staging-only news-engine migrations the
repository never kept. A repository migration therefore counts as recorded on
staging when its name is in staging's history, whatever the version.

Actions (the only argument):
  plan      read only: which repository migrations staging lacks, and whether
            the Fantasy capacity seed is loaded
  rehearse  the pending migrations in one transaction that is rolled back;
            when that fails, rolled-back prefixes find the first failing one.
            Postgres cannot use an enum value in the transaction that adds
            it, so the rehearsal stops after the first migration that adds
            one; apply checks the rest one migration at a time
  apply     each pending migration in its own transaction together with its
            history row, in order; stops at the first failure
  seed      the deterministic Fantasy capacity seed
            (scripts/backend/fantasy-staging-seed.sql), only once nothing is
            pending and the disk has SEED_MIN_FREE_DISK_GB free
  seed-browsing
            the deterministic match-day content for the browsing workload
            (scripts/backend/browsing-staging-seed.sql: a synthetic season of
            240 fixtures, 8 of them in play, and 2,000 stories in French and
            Arabic), only once nothing is pending. Run it shortly before a
            browsing run: its match times are anchored on its first run
  check     read only: fails unless nothing is pending, the seed is loaded
            and, when BOTOLAGO_EXPECTED_STAGING_COMPUTE is set (e.g. Large),
            staging runs on that compute size (the load test's precondition)

Target: the Supabase Management API for SUPABASE_STAGING_PROJECT_REF with
SUPABASE_ACCESS_TOKEN (GitHub environment staging-load-test). For a local
rehearsal, BOTOLAGO_STAGING_DATABASE_URL on 127.0.0.1 runs the same SQL through
psql instead.
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Protocol


STAGING_REF = "srdrflfrfpwixsllveid"
STAGING_NAME = "BotolaGO Staging V2"
PRODUCTION_REF = "tkewgajrljbwgwedqsxn"
LEGACY_REF = "kxpaudvntwxpahyjtxbk"
MANAGEMENT_API = "https://api.supabase.com"
REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
SEED_FILE = REPO_ROOT / "scripts" / "backend" / "fantasy-staging-seed.sql"
BROWSING_SEED_FILE = REPO_ROOT / "scripts" / "backend" / "browsing-staging-seed.sql"
# What browsing-staging-seed.sql leaves behind: its season's fixtures and its
# stories' editions, by the fixed ids and slugs it uses.
BROWSING_SEED_SEASON_ID = "c91f49ad-62a0-4e2c-884c-f83799e67021"
BROWSING_SEED_PROFILE = {"fixtures": 240, "articleEditions": 4_000}
BROWSING_SEED_PROFILE_QUERY = (
    "select (select count(*) from app.fixtures where season_id = "
    f"'{BROWSING_SEED_SEASON_ID}'::uuid)::integer as \"fixtures\", "
    "(select count(*) from app.article_editions where slug like "
    "'capacity-browsing-article-%')::integer as \"articleEditions\""
)
# About 35 MB of rows and their WAL; a margin, not a measurement of need.
BROWSING_SEED_MIN_FREE_DISK_GB = 1
MIGRATION_PATTERN = re.compile(r"^(?P<version>[0-9]{14})_(?P<name>[a-z0-9_]+)\.sql$")
ENUM_VALUE_ADDED = re.compile(r"(?is)\balter\s+type\s+\S+\s+add\s+value\b")

# Repository migrations production has deliberately not applied yet. Staging
# mirrors production, so the load test measures what production runs. Remove
# an entry once production applies it.
DEFERRED = {
    "20260925090500_fantasy_league_page_skip_empty.sql": (
        "production applies it only after Fantasy GW1 is locked and scored"
    ),
}

# What scripts/backend/fantasy-staging-seed.sql leaves behind on staging.
SEED_PROFILE = {
    "teams": 50_000,
    "activeSquadMemberships": 750_000,
    "currentLineups": 50_000,
    "lineupPlayers": 750_000,
    "largeLeagueMembers": 10_000,
    "additionalLeagues": 1_000,
    "finalResults": 50_000,
    "provisionalResults": 50_000,
}
SEED_PROFILE_QUERY = """select
  (select count(*) from app.fantasy_teams)::integer as "teams",
  (select count(*) from app.fantasy_squad_memberships where sold_at is null)::integer as "activeSquadMemberships",
  (select count(*) from app.fantasy_lineups where gameweek_id = 'fa640000-0000-4000-8000-000000000002')::integer as "currentLineups",
  (select count(*) from app.fantasy_lineup_players)::integer as "lineupPlayers",
  (select count(*) from app.fantasy_league_memberships where league_id = 'fa900000-0000-4000-8000-000000000001')::integer as "largeLeagueMembers",
  (select count(*) from app.fantasy_leagues where name like 'Mixed Capacity League %')::integer as "additionalLeagues",
  (select count(*) from app.fantasy_team_gameweek_results where state = 'final')::integer as "finalResults",
  (select count(*) from app.fantasy_team_gameweek_results where state = 'provisional')::integer as "provisionalResults"
"""
# On 2026-09-26 the seed filled Staging V2's disk: Postgres could not restart
# until Supabase grew the disk, which used the day's four disk changes. On a
# local database the seed writes about 1.3 GB of write-ahead log and grows the
# database by about 0.6 GB, so refuse to start with less than twice that free.
SEED_MIN_FREE_DISK_GB = 5
SEED_WAIT_SECONDS = 20 * 60
SEED_ATTEMPTS = 3

SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization\s*:\s*bearer\s+)[^\s\"']+"),
    re.compile(r"\b(?:sbp|sb_secret|sb_publishable)_[A-Za-z0-9._-]+\b"),
    re.compile(r"\beyJ[A-Za-z0-9._-]+\b"),
    re.compile(r"postgres(?:ql)?://[^\s\"']+"),
)


class UpdateError(RuntimeError):
    """Stable, sanitized failure."""


@dataclass(frozen=True)
class Migration:
    filename: str
    version: str
    name: str
    sql: str


def sanitize(value: object) -> str:
    text = " ".join(str(value).split())
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(
            lambda match: f"{match.group(1)}[REDACTED]" if match.lastindex else "[REDACTED]",
            text,
        )
    return text[:500]


class Target(Protocol):
    label: str

    def rows(self, sql: str) -> list[dict[str, Any]]: ...

    def execute(self, sql: str, timeout: int) -> list[dict[str, Any]]: ...

    def compute(self) -> str: ...

    def free_disk_gb(self) -> float | None: ...


class ManagementTarget:
    """Staging through the Supabase Management API's SQL endpoint."""

    def __init__(self, token: str, project_ref: str) -> None:
        if project_ref in {PRODUCTION_REF, LEGACY_REF}:
            raise UpdateError("refusing a production or legacy project reference")
        if project_ref != STAGING_REF:
            raise UpdateError("the project reference is not BotolaGO Staging V2")
        self._token = token
        self._project_ref = project_ref
        self.label = f"Supabase project {project_ref}"
        project = self._request("GET", f"/v1/projects/{project_ref}", None, 60)
        name = str(project.get("name", "")) if isinstance(project, dict) else ""
        if name != STAGING_NAME:
            raise UpdateError("the project is not named BotolaGO Staging V2")

    def _request(self, method: str, path: str, payload: Any, timeout: int) -> Any:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{MANAGEMENT_API}{path}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
                "User-Agent": "BotolaGO-staging-database-update/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as error:
            detail = ""
            try:
                parsed = json.loads(error.read())
                if isinstance(parsed, dict):
                    detail = str(parsed.get("message") or parsed.get("error") or "")
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
            raise UpdateError(f"HTTP {error.code}: {sanitize(detail)}") from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise UpdateError(f"network error: {sanitize(error)}") from error
        if not raw:
            return []
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise UpdateError("the Management API returned a non-JSON response") from error

    def _query(self, sql: str, read_only: bool, timeout: int) -> list[dict[str, Any]]:
        response = self._request(
            "POST",
            f"/v1/projects/{self._project_ref}/database/query",
            {"query": sql, "read_only": read_only},
            timeout,
        )
        if isinstance(response, list):
            return response
        if isinstance(response, dict):
            rows = response.get("result", response.get("data", []))
            if isinstance(rows, list):
                return rows
        raise UpdateError("the Management API returned an unexpected query shape")

    def rows(self, sql: str) -> list[dict[str, Any]]:
        return self._query(sql, True, 60)

    def execute(self, sql: str, timeout: int) -> list[dict[str, Any]]:
        return self._query(sql, False, timeout)

    def compute(self) -> str:
        """The compute size (e.g. ci_large), or "unknown".

        The billing add-on names it. When that cannot be read, the connection
        limit Supabase sets for each size identifies it instead.
        """

        try:
            addons = self._request(
                "GET", f"/v1/projects/{self._project_ref}/billing/addons", None, 60
            )
        except UpdateError:
            addons = None
        selected = addons.get("selected_addons", []) if isinstance(addons, dict) else []
        for addon in selected if isinstance(selected, list) else []:
            if isinstance(addon, dict) and addon.get("type") == "compute_instance":
                variant = addon.get("variant")
                if isinstance(variant, dict) and variant.get("id"):
                    return str(variant["id"])
        return compute_from_connections(self)

    def free_disk_gb(self) -> float | None:
        """Free space on the database disk, from Supabase's disk metrics."""

        try:
            util = self._request(
                "GET", f"/v1/projects/{self._project_ref}/config/disk/util", None, 60
            )
        except UpdateError:
            return None
        for key in ("fs_avail_bytes", "avail_bytes", "available_bytes"):
            available = find_number(util, key)
            if available is not None:
                return available / 1024**3
        return None


class LocalTarget:
    """A local database on this machine, for rehearsing this script."""

    def __init__(self, url: str) -> None:
        host = urllib.parse.urlparse(url).hostname
        if host not in {"127.0.0.1", "localhost"}:
            raise UpdateError("BOTOLAGO_STAGING_DATABASE_URL must point at 127.0.0.1")
        self._url = url
        self.label = "local database"

    def _psql(self, sql: str, extra: list[str], timeout: int) -> str:
        result = subprocess.run(
            ["psql", self._url, "-X", "-q", "-v", "ON_ERROR_STOP=1", *extra, "-f", "-"],
            input=sql,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            errors = [line for line in result.stderr.splitlines() if "ERROR" in line]
            raise UpdateError(sanitize(errors[0] if errors else result.stderr))
        return result.stdout

    def rows(self, sql: str) -> list[dict[str, Any]]:
        wrapped = f"select coalesce(json_agg(r), '[]'::json) from ({sql}) r;"
        return json.loads(self._psql(wrapped, ["-A", "-t"], 60) or "[]")

    def execute(self, sql: str, timeout: int) -> list[dict[str, Any]]:
        self._psql(sql, [], timeout)
        return []

    def compute(self) -> str:
        return "local"

    def free_disk_gb(self) -> float | None:
        return shutil.disk_usage("/").free / 1024**3


# max_connections Supabase configures for each compute size.
COMPUTE_BY_MAX_CONNECTIONS = {
    60: "ci_micro",
    90: "ci_small",
    120: "ci_medium",
    160: "ci_large",
    240: "ci_xlarge",
    380: "ci_2xlarge",
    480: "ci_4xlarge",
}


def find_number(value: Any, key: str) -> float | None:
    """The first numeric ``key`` anywhere in a JSON document."""

    if isinstance(value, dict):
        found = value.get(key)
        if isinstance(found, (int, float)) and not isinstance(found, bool):
            return float(found)
        children = list(value.values())
    elif isinstance(value, list):
        children = value
    else:
        return None
    for child in children:
        found = find_number(child, key)
        if found is not None:
            return found
    return None


def compute_from_connections(target: Target) -> str:
    try:
        rows = target.rows(
            "select current_setting('max_connections')::integer as max_connections"
        )
        return COMPUTE_BY_MAX_CONNECTIONS.get(int(rows[0]["max_connections"]), "unknown")
    except (UpdateError, KeyError, IndexError, TypeError, ValueError):
        return "unknown"


def compute_matches(actual: str, expected: str) -> bool:
    """ci_large matches Large, ci_xlarge matches XL, ci_2xlarge matches 2XL."""

    def normal(value: str) -> str:
        value = value.strip().lower().replace(" ", "")
        value = value.removeprefix("ci_").replace("xlarge", "xl")
        return value

    return normal(actual) == normal(expected)


def load_migrations(directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    migrations = []
    for path in sorted(directory.glob("*.sql")):
        match = MIGRATION_PATTERN.fullmatch(path.name)
        if match is None:
            raise UpdateError(f"invalid migration filename: {path.name}")
        migrations.append(
            Migration(path.name, match["version"], match["name"], path.read_text("utf-8"))
        )
    versions = [migration.version for migration in migrations]
    if len(versions) != len(set(versions)):
        raise UpdateError("repository migration versions are not unique")
    names = [migration.name for migration in migrations]
    if len(names) != len(set(names)):
        raise UpdateError("repository migration names are not unique")
    for migration in migrations:
        if re.search(r"(?im)^\s*(begin|commit|rollback|start\s+transaction)\s*;", migration.sql):
            raise UpdateError(f"{migration.filename} controls its own transaction")
    return migrations


def read_history(target: Target) -> list[dict[str, str]]:
    return [
        {"version": str(row["version"]), "name": str(row.get("name") or "")}
        for row in target.rows(
            "select version, name from supabase_migrations.schema_migrations order by version"
        )
    ]


def pending_migrations(
    migrations: list[Migration], history: list[dict[str, str]]
) -> list[Migration]:
    recorded_names = {row["name"] for row in history}
    recorded_versions = {row["version"]: row["name"] for row in history}
    pending = []
    for migration in migrations:
        if migration.name in recorded_names or migration.filename in DEFERRED:
            continue
        if migration.version in recorded_versions:
            raise UpdateError(
                f"{migration.filename}: staging records version {migration.version} "
                f"under another name ({recorded_versions[migration.version]})"
            )
        pending.append(migration)
    return pending


def history_row_sql(migration: Migration) -> str:
    encoded = base64.b64encode(migration.sql.encode("utf-8")).decode("ascii")
    return (
        "insert into supabase_migrations.schema_migrations (version, name, statements) "
        f"values ('{migration.version}', '{migration.name}', "
        f"array[convert_from(decode('{encoded}', 'base64'), 'UTF8')]);"
    )


def rehearsal_sql(migrations: list[Migration]) -> str:
    parts = ["begin;", "set local lock_timeout = '10s';"]
    for migration in migrations:
        parts.append(f"-- {migration.filename}\n{migration.sql}\n;")
    parts.append("rollback;")
    return "\n".join(parts)


def apply_sql(migration: Migration) -> str:
    return "\n".join(
        [
            "begin;",
            "set local lock_timeout = '10s';",
            "set local statement_timeout = '300s';",
            f"-- {migration.filename}\n{migration.sql}\n;",
            history_row_sql(migration),
            "commit;",
        ]
    )


def rehearsable(pending: list[Migration]) -> list[Migration]:
    """The pending prefix one transaction can hold.

    A value added to an enum cannot be used in the transaction that added it
    ("unsafe use of new value"), so a rehearsal of the whole chain would fail
    on the first migration after one that adds a value.
    """

    prefix = []
    for migration in pending:
        prefix.append(migration)
        if ENUM_VALUE_ADDED.search(migration.sql):
            break
    return prefix


def first_failing(
    migrations: list[Migration],
    attempt: Callable[[list[Migration]], str | None],
    error: str,
) -> tuple[Migration, str]:
    """Smallest failing prefix, by rolled-back rehearsals of prefixes.

    The whole list is known to fail with ``error``.
    """

    low, high = 1, len(migrations)
    while low < high:
        middle = (low + high) // 2
        failure = attempt(migrations[:middle])
        if failure is None:
            low = middle + 1
        else:
            high, error = middle, failure
    return migrations[low - 1], error


def seed_profile(target: Target) -> dict[str, int]:
    rows = target.rows(SEED_PROFILE_QUERY)
    if len(rows) != 1:
        raise UpdateError("the seed profile query returned no row")
    return {key: int(rows[0][key]) for key in SEED_PROFILE}


def seed_loaded(profile: dict[str, int]) -> bool:
    return all(profile[key] >= minimum for key, minimum in SEED_PROFILE.items())


def seed_running(target: Target) -> bool:
    rows = target.rows(
        "select count(*)::integer as count from pg_stat_activity "
        "where state = 'active' and pid <> pg_backend_pid() "
        "and query like '%fantasy-load-%'"
    )
    return bool(rows) and int(rows[0]["count"]) > 0


def assert_fantasy_tick_off(target: Target) -> None:
    """The Fantasy tick writes Fantasy and fixture tables on its own (AGENTS.md)."""

    rows = target.rows(
        "select coalesce((select lifecycle_tick_enabled from "
        "app_private.fantasy_automation_settings), false) as enabled"
    )
    if rows and rows[0].get("enabled") is True:
        raise UpdateError(
            "the Fantasy lifecycle tick is switched on on staging; pause it first "
            "(select app_private.fantasy_automation_configure(false);)"
        )


def rounded(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


def assert_room_for_seed(target: Target) -> float:
    free = target.free_disk_gb()
    if free is None:
        raise UpdateError(
            "staging's free disk space could not be read, so the seed cannot be "
            f"shown to fit; it needs {SEED_MIN_FREE_DISK_GB} GB free"
        )
    if free < SEED_MIN_FREE_DISK_GB:
        raise UpdateError(
            f"staging has {free:.1f} GB of disk free and the seed needs "
            f"{SEED_MIN_FREE_DISK_GB} GB; make the disk bigger first (Supabase → "
            "BotolaGO Staging V2 → Settings → Compute and Disk)"
        )
    return free


def run_plan(target: Target, migrations: list[Migration]) -> dict[str, Any]:
    history = read_history(target)
    pending = pending_migrations(migrations, history)
    repository_names = {migration.name for migration in migrations}
    staging_only = sorted({row["name"] for row in history} - repository_names)
    report: dict[str, Any] = {
        "target": target.label,
        "recorded": len(history),
        "pending": [migration.filename for migration in pending],
        "deferred": DEFERRED,
        "stagingOnly": staging_only,
        "compute": target.compute(),
        "freeDiskGb": rounded(target.free_disk_gb()),
    }
    if not pending:
        report["seed"] = seed_profile(target)
        report["seedLoaded"] = seed_loaded(report["seed"])
    return report


def run_rehearse(target: Target, migrations: list[Migration]) -> dict[str, Any]:
    pending = pending_migrations(migrations, read_history(target))
    if not pending:
        return {"target": target.label, "pending": [], "rehearsal": "nothing to rehearse"}
    prefix = rehearsable(pending)

    def attempt(candidate: list[Migration]) -> str | None:
        try:
            target.execute(rehearsal_sql(candidate), 900)
        except UpdateError as error:
            return str(error)
        return None

    failure = attempt(prefix)
    if failure is not None:
        migration, error = first_failing(prefix, attempt, failure)
        raise UpdateError(f"rehearsal failed at {migration.filename}: {error}")
    report: dict[str, Any] = {
        "target": target.label,
        "pending": [migration.filename for migration in pending],
        "rehearsed": [migration.filename for migration in prefix],
        "rehearsal": "passed; everything was rolled back",
    }
    if len(prefix) < len(pending):
        report["notRehearsed"] = [migration.filename for migration in pending[len(prefix):]]
        report["whyNotRehearsed"] = (
            f"{prefix[-1].filename} adds an enum value, which later migrations "
            "cannot use in the same transaction; apply checks them one at a time "
            "and stops at the first failure"
        )
    return report


def run_apply(target: Target, migrations: list[Migration]) -> dict[str, Any]:
    pending = pending_migrations(migrations, read_history(target))
    applied = []
    for migration in pending:
        started = time.monotonic()
        try:
            target.execute(apply_sql(migration), 600)
        except UpdateError as error:
            raise UpdateError(
                f"{migration.filename} failed and was rolled back ({error}); "
                f"applied before it: {applied or 'none'}"
            ) from error
        recorded = {row["name"] for row in read_history(target)}
        if migration.name not in recorded:
            raise UpdateError(f"{migration.filename} ran but its history row is missing")
        applied.append(migration.filename)
        print(
            f"applied {migration.filename} in {time.monotonic() - started:.1f}s",
            flush=True,
        )
    if applied:
        target.execute("notify pgrst, 'reload schema';", 60)
    remaining = pending_migrations(migrations, read_history(target))
    if remaining:
        raise UpdateError(f"still pending after apply: {[m.filename for m in remaining]}")
    return {"target": target.label, "applied": applied, "pending": []}


def run_seed(target: Target, migrations: list[Migration]) -> dict[str, Any]:
    pending = pending_migrations(migrations, read_history(target))
    if pending:
        raise UpdateError(f"apply the pending migrations first: {[m.filename for m in pending]}")
    profile = seed_profile(target)
    if seed_loaded(profile):
        return {"target": target.label, "seed": profile, "seedLoaded": True, "ran": False}
    assert_fantasy_tick_off(target)
    script = (
        "select set_config('botolago.capacity_environment', 'staging-v2', false);\n"
        + SEED_FILE.read_text("utf-8")
    )
    for attempt in range(1, SEED_ATTEMPTS + 1):
        free = assert_room_for_seed(target)
        print(f"seed attempt {attempt}: {free:.1f} GB of disk free", flush=True)
        try:
            target.execute(script, SEED_WAIT_SECONDS)
        except UpdateError as error:
            # The seed is idempotent. A dropped HTTP request can leave it
            # running on the server, so wait for it before judging.
            print(f"seed attempt {attempt} ended with: {error}", flush=True)
        deadline = time.monotonic() + SEED_WAIT_SECONDS
        while seed_running(target) and time.monotonic() < deadline:
            time.sleep(15)
        profile = seed_profile(target)
        if seed_loaded(profile):
            return {"target": target.label, "seed": profile, "seedLoaded": True, "ran": True}
    raise UpdateError(f"the seed did not complete: {profile}")


def browsing_seed_profile(target: Target) -> dict[str, int]:
    rows = target.rows(BROWSING_SEED_PROFILE_QUERY)
    if len(rows) != 1:
        raise UpdateError("the browsing seed profile query returned no row")
    return {key: int(rows[0].get(key, 0)) for key in BROWSING_SEED_PROFILE}


def run_seed_browsing(target: Target, migrations: list[Migration]) -> dict[str, Any]:
    pending = pending_migrations(migrations, read_history(target))
    if pending:
        raise UpdateError(f"apply the pending migrations first: {[m.filename for m in pending]}")
    profile = browsing_seed_profile(target)
    if profile == BROWSING_SEED_PROFILE:
        return {"target": target.label, "browsingSeed": profile, "loaded": True, "ran": False}
    # It writes fixtures, which the Fantasy tick also writes (AGENTS.md).
    assert_fantasy_tick_off(target)
    free = target.free_disk_gb()
    if free is None or free < BROWSING_SEED_MIN_FREE_DISK_GB:
        raise UpdateError(
            f"staging's free disk ({'unknown' if free is None else f'{free:.1f} GB'}) is below "
            f"the {BROWSING_SEED_MIN_FREE_DISK_GB} GB the browsing seed needs"
        )
    script = (
        "select set_config('botolago.capacity_environment', 'staging-v2', false);\n"
        + BROWSING_SEED_FILE.read_text("utf-8")
    )
    target.execute(script, SEED_WAIT_SECONDS)
    profile = browsing_seed_profile(target)
    if profile != BROWSING_SEED_PROFILE:
        raise UpdateError(f"the browsing seed did not complete: {profile}")
    return {"target": target.label, "browsingSeed": profile, "loaded": True, "ran": True}


def run_check(target: Target, migrations: list[Migration]) -> dict[str, Any]:
    report = run_plan(target, migrations)
    if report["pending"]:
        raise UpdateError(
            f"staging lacks {len(report['pending'])} migrations; run the "
            "Staging database update workflow (apply) first"
        )
    if not report["seedLoaded"]:
        raise UpdateError(
            "the Fantasy capacity seed is not loaded; run the Staging database "
            "update workflow (seed) first"
        )
    assert_fantasy_tick_off(target)
    expected = os.environ.get("BOTOLAGO_EXPECTED_STAGING_COMPUTE", "").strip()
    if expected:
        if report["compute"] == "unknown":
            raise UpdateError(
                f"staging's compute size could not be read, so it cannot be shown "
                f"to be {expected}"
            )
        if not compute_matches(report["compute"], expected):
            raise UpdateError(
                f"staging runs on {report['compute']}, not {expected}; resize it "
                "(Supabase → BotolaGO Staging V2 → Settings → Compute) first"
            )
    return report


ACTIONS: dict[str, Callable[[Target, list[Migration]], dict[str, Any]]] = {
    "plan": run_plan,
    "rehearse": run_rehearse,
    "apply": run_apply,
    "seed": run_seed,
    "seed-browsing": run_seed_browsing,
    "check": run_check,
}


def make_target() -> Target:
    local_url = os.environ.get("BOTOLAGO_STAGING_DATABASE_URL", "").strip()
    if local_url:
        return LocalTarget(local_url)
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    project_ref = os.environ.get("SUPABASE_STAGING_PROJECT_REF", "").strip()
    if not token or not project_ref:
        raise UpdateError(
            "SUPABASE_ACCESS_TOKEN and SUPABASE_STAGING_PROJECT_REF are required"
        )
    return ManagementTarget(token, project_ref)


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in ACTIONS:
        print(f"usage: staging-database-update.py {{{','.join(ACTIONS)}}}", file=sys.stderr)
        return 2
    try:
        report = ACTIONS[argv[0]](make_target(), load_migrations())
    except UpdateError as error:
        result: dict[str, Any] = {"action": argv[0], "passed": False, "error": str(error)}
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 1
    result = {"action": argv[0], "passed": True, **report}
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
