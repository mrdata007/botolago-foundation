#!/usr/bin/env python3
"""Promote one guarded BotolaGO Production V2 migration batch.

The script is intentionally usable only for the fixed Production V2 target.
Each migration and its Supabase CLI-compatible history row are committed in
one database transaction through the Supabase Management API.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


EXPECTED_PROJECT_REF = "tkewgajrljbwgwedqsxn"
EXPECTED_PROJECT_NAME = "BotolaGO Production V2"
EXPECTED_REGION = "eu-west-3"
EXPECTED_TARGET_ENVIRONMENT = "production-v2"
KNOWN_STAGING_REF = "srdrflfrfpwixsllveid"
KNOWN_LEGACY_REF = "kxpaudvntwxpahyjtxbk"
MANAGEMENT_API = "https://api.supabase.com"

BATCHES: dict[str, tuple[str, ...]] = {
    "foundation": (
        "20260719215811_greenfield_foundation.sql",
    ),
    "identity": (
        "20260720075453_identity_domain.sql",
        "20260720081817_identity_null_validation.sql",
    ),
    "football": (
        "20260720095330_football_catalog.sql",
        "20260720095345_football_match_ingestion.sql",
        "20260720095354_football_api_security.sql",
        "20260720104000_football_index_hardening.sql",
    ),
    "news_storage": (
        "20260720110053_news_editorial_catalog.sql",
        "20260720110102_news_search_ingestion.sql",
        "20260720110107_news_api_security.sql",
        "20260720110113_news_storage_index_hardening.sql",
        "20260720114217_news_advisor_index_hardening.sql",
    ),
    "notifications": (
        "20260720121725_notification_catalog.sql",
        "20260720121727_notification_delivery_runtime.sql",
        "20260720121729_notification_api_security.sql",
        "20260720121731_notification_index_hardening.sql",
        "20260720132048_notification_fanout_resume.sql",
    ),
    "fantasy_phase65": (
        "20260720141826_fantasy_catalog_rules.sql",
        "20260720141847_fantasy_teams_transfers_chips.sql",
        "20260720141850_fantasy_scoring_leagues_operations.sql",
        "20260720141854_fantasy_api_security.sql",
        "20260720144832_fantasy_position_seed.sql",
        "20260720163222_fantasy_ruleset_v1.sql",
        "20260720173500_fantasy_route_read_contracts.sql",
        "20260720174500_fantasy_index_hardening.sql",
        "20260720183645_fantasy_ruleset_v1_index_hardening.sql",
        "20260720184632_fantasy_standings_keyset_hardening.sql",
        "20260720191839_fantasy_standings_rpc_pagination.sql",
        "20260722205230_fantasy_team_fk_index_hardening.sql",
        "20260724143000_phase65_football_team_catalog.sql",
    ),
    "admin": (
        "20260724143100_admin_authorization_foundation.sql",
        "20260724170941_admin_revocation_dead_letter_status.sql",
        "20260724172623_admin_control_plane_runtime_v2.sql",
        "20260724185438_admin_security_operations.sql",
        "20260724225105_admin_activation_operations.sql",
    ),
    # This immutable baseline was promoted through separately reviewed provider
    # canaries. It remains in the manifest so later batches can prove the full
    # remote migration chain and checksums before writing anything.
    "post_gate4_baseline": (
        "20260731180229_gate2b_football_catalog_ingestion.sql",
        "20260731203317_gate3b_historical_squads_standings.sql",
        "20260801010000_gnews_article_ingestion.sql",
        "20260801010100_player_season_ratings.sql",
        "20260801010200_sportsmonks_team_crests.sql",
        "20260802010000_historical_player_performance_job.sql",
        "20260802010100_historical_player_performances.sql",
        "20260802010200_historical_performance_mapping_quarantine.sql",
        "20260802090000_football_season_browser.sql",
    ),
    "release_activation": (
        "20260803173344_fantasy_preactivation_hardening.sql",
        "20260803210943_fantasy_catalog_activation.sql",
        "20260803212218_elbotola_metadata_ingestion.sql",
    ),
}

CONFIRMATIONS = {
    batch: f"RUN_PHASE7E_B_PRODUCTION_{batch.upper()}".replace("-", "_")
    for batch in BATCHES
}

MIGRATION_PATTERN = re.compile(r"^(?P<version>[0-9]+)_(?P<name>.+)\.sql$")
SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization\s*:\s*bearer\s+)[^\s\"']+"),
    re.compile(r"\b(?:sbp|sb_secret|sb_publishable)_[A-Za-z0-9._-]+\b"),
    re.compile(r"\beyJ[A-Za-z0-9._-]+\b"),
)

EXPECTED_EDGE_FUNCTIONS_BY_BATCH: dict[str, frozenset[str]] = {
    "release_activation": frozenset({"football-ingest", "news-ingest"}),
}

# These migrations were promoted through separately reviewed provider canaries
# whose CLI-compatible history rows preserve the SQL as multiple statements.
# Pin the exact Production V2 representation observed by the protected
# read-only preflight instead of weakening history validation for any other row.
EXPECTED_MULTI_STATEMENT_HISTORY: dict[str, tuple[str, int, str]] = {
    "20260801010000": (
        "gnews_article_ingestion",
        9,
        "5daf7ec90bf06ce266f44d72d2aae3e1",
    ),
    "20260801010100": (
        "player_season_ratings",
        21,
        "b5dd99ec340264b3a0a3420a55fddeea",
    ),
    "20260801010200": (
        "sportsmonks_team_crests",
        5,
        "97c70743872e74481d28ebdef7462a34",
    ),
    "20260802010100": (
        "historical_player_performances",
        33,
        "c20c667d706bc11729f571630818f2a5",
    ),
    "20260802010200": (
        "historical_performance_mapping_quarantine",
        6,
        "316e6fccf87c8299ec07fe19425fb206",
    ),
    "20260802090000": (
        "football_season_browser",
        8,
        "5c8c1dbe68ef55bc3bc87f0ca62abb8d",
    ),
}

# This enum-value migration was promoted through a separately reviewed path
# whose one-statement history representation differs from the repository file.
# Pin the exact Production V2 row observed by the protected read-only preflight;
# all other one-statement rows continue to require the repository SHA-256.
EXPECTED_PINNED_SINGLE_STATEMENT_HISTORY: dict[str, tuple[str, int, str]] = {
    "20260802010000": (
        "historical_player_performance_job",
        1,
        "017029b2d467e255cffef2c679afa033",
    ),
}


class PromotionError(RuntimeError):
    """Stable, sanitized promotion failure."""


@dataclass(frozen=True)
class Migration:
    filename: str
    version: str
    name: str
    sql: str
    sha256: str


def sanitize(value: object) -> str:
    text = str(value).replace("\r", " ").replace("\n", " ")
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(lambda match: f"{match.group(1)}[REDACTED]" if match.lastindex else "[REDACTED]", text)
    return text[:500]


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise PromotionError(f"missing protected runtime value: {name}")
    return value


def migration_from_path(path: Path) -> Migration:
    match = MIGRATION_PATTERN.fullmatch(path.name)
    if match is None:
        raise PromotionError(f"invalid migration filename: {path.name}")
    raw = path.read_bytes()
    try:
        sql = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PromotionError(f"migration is not UTF-8: {path.name}") from exc
    return Migration(
        filename=path.name,
        version=match.group("version"),
        name=match.group("name"),
        sql=sql,
        sha256=hashlib.sha256(raw).hexdigest(),
    )


def load_migrations(repo_root: Path) -> dict[str, Migration]:
    migration_dir = repo_root / "supabase" / "migrations"
    expected_files = [filename for files in BATCHES.values() for filename in files]
    actual_files = sorted(path.name for path in migration_dir.glob("*.sql"))
    if actual_files != sorted(expected_files):
        raise PromotionError(
            "repository migration inventory differs from the reviewed migration chain"
        )
    migrations = {
        filename: migration_from_path(migration_dir / filename)
        for filename in expected_files
    }
    versions = [migration.version for migration in migrations.values()]
    if versions != sorted(versions) or len(versions) != len(set(versions)):
        raise PromotionError("migration versions are not unique and strictly ordered")
    return migrations


def batch_history_prefix(batch: str) -> tuple[str, ...]:
    result: list[str] = []
    for current_batch, files in BATCHES.items():
        if current_batch == batch:
            break
        result.extend(files)
    return tuple(result)


def build_transaction(migration: Migration) -> str:
    encoded_sql = base64.b64encode(migration.sql.encode("utf-8")).decode("ascii")
    version = migration.version
    name = migration.name.replace("'", "''")
    return f"""begin;
set local lock_timeout = '4s';
set local statement_timeout = '120s';
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key
);
alter table supabase_migrations.schema_migrations
  add column if not exists statements text[];
alter table supabase_migrations.schema_migrations
  add column if not exists name text;
{migration.sql}
insert into supabase_migrations.schema_migrations(version, name, statements)
values (
  '{version}',
  '{name}',
  array[convert_from(decode('{encoded_sql}', 'base64'), 'UTF8')]
);
commit;"""


class ManagementClient:
    def __init__(self, token: str, project_ref: str) -> None:
        self._token = token
        self._project_ref = project_ref

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        timeout: int = 60,
    ) -> Any:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{MANAGEMENT_API}{path}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
                "User-Agent": "BotolaGO-Phase7E-B/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                status = response.status
                response_body = response.read()
        except urllib.error.HTTPError as exc:
            status = exc.code
            response_body = exc.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise PromotionError(f"management_api_network_error: {sanitize(exc)}") from exc
        if status not in (200, 201):
            classification = "management_api_request_failed"
            try:
                parsed = json.loads(response_body)
                code = sanitize(parsed.get("code") or parsed.get("error_code") or "")
                if code:
                    classification = code
            except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
                pass
            raise PromotionError(f"{classification}: HTTP {status}")
        if not response_body:
            return {}
        try:
            return json.loads(response_body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise PromotionError(f"management_api_non_json_response: HTTP {status}") from exc

    def get(self, path: str) -> Any:
        return self.request("GET", path)

    def query(self, sql: str, *, read_only: bool, timeout: int = 60) -> list[dict[str, Any]]:
        response = self.request(
            "POST",
            f"/v1/projects/{self._project_ref}/database/query",
            {"query": sql, "read_only": read_only},
            timeout=timeout,
        )
        if isinstance(response, list):
            return response
        if isinstance(response, dict):
            rows = response.get("result", response.get("data", []))
            if isinstance(rows, list):
                return rows
        raise PromotionError("management_api_database_query_shape_invalid")


def assert_target_environment() -> tuple[str, str]:
    token = require_env("SUPABASE_ACCESS_TOKEN")
    secret_key = require_env("SUPABASE_SECRET_KEY")
    configured_ref = require_env("SUPABASE_PRODUCTION_PROJECT_REF")
    configured_name = require_env("SUPABASE_PRODUCTION_PROJECT_NAME")
    target_environment = require_env("BOTOLAGO_TARGET_ENVIRONMENT")
    admin_environment = require_env("BOTOLAGO_ADMIN_ENVIRONMENT")
    admin_ref = require_env("BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF")
    repository_url = os.environ.get("SUPABASE_URL", "").strip()
    production_url = os.environ.get("SUPABASE_PRODUCTION_URL", "").strip()
    configured_url = repository_url or production_url

    if configured_ref != EXPECTED_PROJECT_REF or admin_ref != EXPECTED_PROJECT_REF:
        raise PromotionError("production project-ref guard failed")
    if configured_ref in (KNOWN_STAGING_REF, KNOWN_LEGACY_REF):
        raise PromotionError("staging or legacy target is forbidden")
    if configured_name != EXPECTED_PROJECT_NAME:
        raise PromotionError("production project-name guard failed")
    if target_environment != EXPECTED_TARGET_ENVIRONMENT or admin_environment != "production":
        raise PromotionError("production environment guard failed")
    if repository_url and production_url and repository_url.rstrip("/") != production_url.rstrip("/"):
        raise PromotionError("production URL variables disagree")
    if configured_url.rstrip("/") != f"https://{EXPECTED_PROJECT_REF}.supabase.co":
        raise PromotionError("production URL guard failed")
    return token, secret_key


def assert_management_target(client: ManagementClient, batch: str) -> dict[str, Any]:
    project = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}")
    organizations = client.get("/v1/organizations")
    if not isinstance(project, dict):
        raise PromotionError("management project response is invalid")
    returned_ref = project.get("ref") or project.get("id")
    if (
        returned_ref != EXPECTED_PROJECT_REF
        or project.get("name") != EXPECTED_PROJECT_NAME
        or project.get("region") != EXPECTED_REGION
        or project.get("status") != "ACTIVE_HEALTHY"
    ):
        raise PromotionError("management project identity or health guard failed")
    organization_id = project.get("organization_id")
    organization_rows = organizations if isinstance(organizations, list) else organizations.get("organizations", [])
    if not organization_id or not any(row.get("id") == organization_id for row in organization_rows):
        raise PromotionError("authenticated account does not own the selected project")

    backups = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/database/backups")
    completed = [
        row
        for row in backups.get("backups", [])
        if isinstance(row, dict) and row.get("status") == "COMPLETED"
    ]
    if not completed:
        raise PromotionError("backup readiness insufficient")
    functions = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/functions")
    if not isinstance(functions, list):
        raise PromotionError("management Edge Function inventory is invalid")
    expected_functions = EXPECTED_EDGE_FUNCTIONS_BY_BATCH.get(batch, frozenset())
    actual_functions: dict[str, dict[str, Any]] = {}
    for function in functions:
        if not isinstance(function, dict) or not isinstance(function.get("slug"), str):
            raise PromotionError("management Edge Function inventory is invalid")
        actual_functions[function["slug"]] = function
    if frozenset(actual_functions) != expected_functions:
        raise PromotionError("deployed Edge Function inventory differs from the reviewed baseline")
    for slug, function in actual_functions.items():
        if function.get("status") != "ACTIVE" or function.get("verify_jwt") is not True:
            raise PromotionError(f"deployed Edge Function guard failed: {slug}")
    return {
        "ref": returned_ref,
        "name": project.get("name"),
        "region": project.get("region"),
        "status": project.get("status"),
        "databaseVersion": (project.get("database") or {}).get("version"),
        "completedBackupCount": len(completed),
        "latestCompletedBackup": max(row.get("inserted_at", "") for row in completed),
        "pitrEnabled": bool(backups.get("pitr_enabled")),
        "edgeFunctionCount": len(actual_functions),
        "edgeFunctionSlugs": sorted(actual_functions),
    }


def auth_health(secret_key: str) -> None:
    request = urllib.request.Request(
        f"https://{EXPECTED_PROJECT_REF}.supabase.co/auth/v1/settings",
        method="GET",
        headers={"apikey": secret_key, "User-Agent": "BotolaGO-Phase7E-B/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status = response.status
    except urllib.error.HTTPError as exc:
        status = exc.code
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise PromotionError(f"production_auth_health_network_error: {sanitize(exc)}") from exc
    if status != 200:
        raise PromotionError(f"production Auth health check failed: HTTP {status}")


def migration_table_exists(client: ManagementClient) -> bool:
    rows = client.query(
        "select to_regclass('supabase_migrations.schema_migrations') is not null as exists",
        read_only=True,
    )
    return bool(rows and rows[0].get("exists"))


def read_history(client: ManagementClient) -> list[dict[str, Any]]:
    if not migration_table_exists(client):
        return []
    return client.query(
        """
select
  version,
  coalesce(name, '') as name,
  coalesce(array_length(statements, 1), 0) as statement_count,
  md5(array_to_string(coalesce(statements, array[]::text[]), E'\\n')) as statements_md5,
  case
    when coalesce(array_length(statements, 1), 0) = 1
      then encode(convert_to(statements[1], 'UTF8'), 'hex')
    else null
  end as statement_hex
from supabase_migrations.schema_migrations
order by version
""".strip(),
        read_only=True,
    )


def assert_history(
    batch: str,
    history: list[dict[str, Any]],
    migrations: dict[str, Migration],
) -> int:
    previous_files = batch_history_prefix(batch)
    batch_files = BATCHES[batch]
    remote_versions = [str(row.get("version", "")) for row in history]
    previous_versions = [migrations[name].version for name in previous_files]
    batch_versions = [migrations[name].version for name in batch_files]
    if remote_versions[: len(previous_versions)] != previous_versions:
        raise PromotionError("remote migration history does not match the required prior batches")
    remainder = remote_versions[len(previous_versions) :]
    if remainder != batch_versions[: len(remainder)]:
        raise PromotionError("remote migration history is not an exact prefix of the selected batch")
    if len(remainder) > len(batch_versions):
        raise PromotionError("remote migration history contains later or unexpected migrations")

    expected_files = previous_files + batch_files[: len(remainder)]
    for row, filename in zip(history, expected_files, strict=True):
        expected = migrations[filename]
        if row.get("name") != expected.name:
            raise PromotionError(f"migration name mismatch: {expected.version}")
        pinned_multi_statement = EXPECTED_MULTI_STATEMENT_HISTORY.get(expected.version)
        if pinned_multi_statement is not None:
            pinned_name, pinned_count, pinned_md5 = pinned_multi_statement
            if (
                expected.name != pinned_name
                or int(row.get("statement_count") or 0) != pinned_count
                or row.get("statements_md5") != pinned_md5
            ):
                raise PromotionError(
                    f"migration multi-statement history mismatch: {expected.version}"
                )
            continue
        pinned_single_statement = EXPECTED_PINNED_SINGLE_STATEMENT_HISTORY.get(
            expected.version
        )
        if pinned_single_statement is not None:
            pinned_name, pinned_count, pinned_md5 = pinned_single_statement
            if (
                expected.name != pinned_name
                or int(row.get("statement_count") or 0) != pinned_count
                or row.get("statements_md5") != pinned_md5
            ):
                raise PromotionError(
                    f"migration pinned single-statement history mismatch: {expected.version}"
                )
            continue
        if int(row.get("statement_count") or 0) != 1:
            raise PromotionError(f"migration statement history is non-canonical: {expected.version}")
        encoded_statement = row.get("statement_hex")
        try:
            recorded_sha256 = hashlib.sha256(bytes.fromhex(encoded_statement)).hexdigest()
        except (TypeError, ValueError) as exc:
            raise PromotionError(
                f"migration statement history is unreadable: {expected.version}"
            ) from exc
        if recorded_sha256 != expected.sha256:
            raise PromotionError(f"migration checksum mismatch: {expected.version}")
    return len(remainder)


def cron_job_count(client: ManagementClient) -> int:
    rows = client.query("select to_regclass('cron.job') is not null as exists", read_only=True)
    if not rows or not rows[0].get("exists"):
        return 0
    count_rows = client.query("select count(*)::integer as count from cron.job", read_only=True)
    return int(count_rows[0]["count"])


def foundation_verification(client: ManagementClient) -> dict[str, Any]:
    rows = client.query(
        """
select jsonb_build_object(
  'schemas', (
    select jsonb_agg(nspname order by nspname)
    from pg_namespace
    where nspname in ('api', 'app', 'app_private')
  ),
  'updatedAtHelperCount', (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'set_updated_at'
      and p.prosecdef = false
  ),
  'anonApiUsage', has_schema_privilege('anon', 'api', 'USAGE'),
  'anonAppUsage', has_schema_privilege('anon', 'app', 'USAGE'),
  'anonPrivateUsage', has_schema_privilege('anon', 'app_private', 'USAGE'),
  'authenticatedApiUsage', has_schema_privilege('authenticated', 'api', 'USAGE'),
  'authenticatedAppUsage', has_schema_privilege('authenticated', 'app', 'USAGE'),
  'authenticatedPrivateUsage', has_schema_privilege('authenticated', 'app_private', 'USAGE')
) as verification
""".strip(),
        read_only=True,
    )
    verification = rows[0]["verification"]
    if verification.get("schemas") != ["api", "app", "app_private"]:
        raise PromotionError("foundation schema verification failed")
    if int(verification.get("updatedAtHelperCount") or 0) != 1:
        raise PromotionError("foundation updated_at helper verification failed")
    expected_grants = {
        "anonApiUsage": True,
        "anonAppUsage": False,
        "anonPrivateUsage": False,
        "authenticatedApiUsage": True,
        "authenticatedAppUsage": False,
        "authenticatedPrivateUsage": False,
    }
    for key, expected in expected_grants.items():
        if verification.get(key) is not expected:
            raise PromotionError(f"foundation schema grant verification failed: {key}")
    return verification


def release_activation_verification(client: ManagementClient) -> dict[str, Any]:
    rows = client.query(
        """
select jsonb_build_object(
  'serviceRoutineCount', (
    select count(distinct procedure.proname)::integer
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api'
      and procedure.proname in (
        'preview_fantasy_catalog_activation',
        'service_stage_fantasy_catalog',
        'service_open_fantasy_registration',
        'service_rollback_fantasy_catalog',
        'news_ingest_provider_article',
        'news_attach_elbotola_hero'
      )
  ),
  'browserExecuteGrantCount', (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema = 'api'
      and routine_name in (
        'preview_fantasy_catalog_activation',
        'service_stage_fantasy_catalog',
        'service_open_fantasy_registration',
        'service_rollback_fantasy_catalog',
        'news_ingest_provider_article',
        'news_attach_elbotola_hero'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'elbotolaPublisher', (
    select jsonb_build_object(
      'active', active,
      'trustStatus', trust_status,
      'ingestionMode', ingestion_mode,
      'websiteUrl', website_url
    )
    from app.publishers
    where slug = 'elbotola'
  ),
  'catalogActivationRunCount', (
    select count(*)::integer from app_private.fantasy_catalog_activation_runs
  ),
  'registrationActivationRunCount', (
    select count(*)::integer from app_private.fantasy_registration_activation_runs
  ),
  'initialPriceEvidenceCount', (
    select count(*)::integer from app_private.fantasy_initial_price_evidence
  )
) as verification
""".strip(),
        read_only=True,
    )
    verification = rows[0]["verification"]
    if int(verification.get("serviceRoutineCount") or 0) != 6:
        raise PromotionError("release activation routine verification failed")
    if int(verification.get("browserExecuteGrantCount") or 0) != 0:
        raise PromotionError("release activation browser grant verification failed")
    publisher = verification.get("elbotolaPublisher")
    if not isinstance(publisher, dict) or publisher != {
        "active": False,
        "trustStatus": "review_required",
        "ingestionMode": "api",
        "websiteUrl": "https://www.elbotola.com/",
    }:
        raise PromotionError("ElBotola inactive publisher verification failed")
    for key in (
        "catalogActivationRunCount",
        "registrationActivationRunCount",
        "initialPriceEvidenceCount",
    ):
        if int(verification.get(key) or 0) != 0:
            raise PromotionError(f"release activation unexpectedly created runtime data: {key}")
    return verification


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    path.chmod(0o600)


def run_batch(args: argparse.Namespace) -> None:
    repo_root = Path(args.repo_root).resolve()
    evidence_dir = Path(args.evidence_dir).resolve()
    batch = args.batch
    if args.confirmation != CONFIRMATIONS[batch]:
        raise PromotionError("manual batch confirmation does not match the selected batch")
    token, secret_key = assert_target_environment()
    migrations = load_migrations(repo_root)
    client = ManagementClient(token, EXPECTED_PROJECT_REF)

    target = assert_management_target(client, batch)
    auth_health(secret_key)
    if cron_job_count(client) != 0:
        raise PromotionError("production cron schedules must be empty before promotion")
    history_before = read_history(client)
    completed_in_batch = assert_history(batch, history_before, migrations)
    if completed_in_batch == len(BATCHES[batch]):
        raise PromotionError("selected migration batch is already complete")

    preflight = {
        "batch": batch,
        "target": target,
        "historyCountBefore": len(history_before),
        "completedInSelectedBatchBefore": completed_in_batch,
        "cronJobCount": 0,
        "workersAndSchedules": "disabled",
    }
    write_json(evidence_dir / "preflight.json", preflight)

    applied: list[dict[str, Any]] = []
    for filename in BATCHES[batch][completed_in_batch:]:
        migration = migrations[filename]
        started = time.monotonic()
        client.query(build_transaction(migration), read_only=False, timeout=180)
        duration_ms = round((time.monotonic() - started) * 1000)
        history_after_file = read_history(client)
        assert_history(batch, history_after_file, migrations)
        applied.append(
            {
                "filename": migration.filename,
                "version": migration.version,
                "name": migration.name,
                "sha256": migration.sha256,
                "durationMs": duration_ms,
            }
        )
        write_json(evidence_dir / "applied-migrations.json", applied)

    target_after = assert_management_target(client, batch)
    auth_health(secret_key)
    final_cron_count = cron_job_count(client)
    if final_cron_count != 0:
        raise PromotionError("a production schedule became active during promotion")
    history_after = read_history(client)
    completed_after = assert_history(batch, history_after, migrations)
    if completed_after != len(BATCHES[batch]):
        raise PromotionError("selected migration batch did not complete")

    batch_verification: dict[str, Any] = {}
    if batch == "foundation":
        batch_verification = foundation_verification(client)
    elif batch == "release_activation":
        batch_verification = release_activation_verification(client)

    postflight = {
        "batch": batch,
        "target": target_after,
        "historyCountAfter": len(history_after),
        "completedInSelectedBatchAfter": completed_after,
        "cronJobCount": final_cron_count,
        "workersAndSchedules": "disabled",
        "batchVerification": batch_verification,
        "result": "PASS",
    }
    write_json(evidence_dir / "postflight.json", postflight)
    print(
        json.dumps(
            {
                "batch": batch,
                "appliedCount": len(applied),
                "historyCountAfter": len(history_after),
                "cronJobCount": final_cron_count,
                "result": "PASS",
            },
            sort_keys=True,
        )
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", choices=tuple(BATCHES), required=True)
    parser.add_argument("--confirmation", required=True)
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--evidence-dir", required=True)
    return parser.parse_args()


def main() -> int:
    try:
        run_batch(parse_args())
    except PromotionError as exc:
        print(f"promotion_failed: {sanitize(exc)}", file=sys.stderr)
        return 1
    except Exception as exc:  # Last-chance stable error contract.
        print(f"promotion_failed: unexpected_{type(exc).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
