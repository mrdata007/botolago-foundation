#!/usr/bin/env python3
"""Guarded Production V2 PostgREST exposure and Identity/Profile smoke gate.

This script is deliberately pinned to BotolaGO Production V2. It changes only
the hosted PostgREST exposed-schema setting, preserves the previous setting for
rollback, and never applies SQL migrations or creates Auth users.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


EXPECTED_PROJECT_REF = "tkewgajrljbwgwedqsxn"
EXPECTED_PROJECT_NAME = "BotolaGO Production V2"
EXPECTED_REGION = "eu-west-3"
EXPECTED_TARGET_ENVIRONMENT = "production-v2"
KNOWN_STAGING_REF = "srdrflfrfpwixsllveid"
KNOWN_LEGACY_REF = "kxpaudvntwxpahyjtxbk"
EXPECTED_CONFIRMATION = "RUN_PHASE7F_PRODUCTION_API_IDENTITY"
EXPECTED_MIGRATION_COUNT = 35
EXPECTED_CANONICAL_TABLE_COUNT = 113
TARGET_DB_SCHEMA = "api"
TARGET_EXTRA_SEARCH_PATH = "extensions"
ALLOWED_INITIAL_SCHEMA_SETS = {
    ("graphql_public", "public"),
    ("api",),
}
MANAGEMENT_API = "https://api.supabase.com"
MAX_HTTP_REQUESTS = 80

SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization\s*:\s*(?:bearer\s+)?)[^\s\"']+"),
    re.compile(r"\b(?:sbp|sb_secret|sb_publishable)_[A-Za-z0-9._-]+\b"),
    re.compile(r"\beyJ[A-Za-z0-9._-]+\b"),
    re.compile(r"(?i)(refresh_token|access_token|token_hash|hashed_token)[\"'=:\s]+[^\s,\"'}]+"),
)


class ActivationError(RuntimeError):
    """Stable, sanitized activation failure."""


def sanitize(value: object, limit: int = 500) -> str:
    text = str(value).replace("\r", " ").replace("\n", " ")
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(
            lambda match: f"{match.group(1)}[REDACTED]" if match.lastindex else "[REDACTED]",
            text,
        )
    return text[:limit]


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    path.chmod(0o600)


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ActivationError(f"missing protected runtime value: {name}")
    return value


def normalize_csv(value: object) -> tuple[str, ...]:
    return tuple(sorted(part.strip() for part in str(value or "").split(",") if part.strip()))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def assert_repository_dependencies(repo_root: Path) -> dict[str, Any]:
    """Prove the frozen runtime does not depend on public or GraphQL Data APIs."""

    source_root = repo_root / "src"
    forbidden = (
        "/graphql/v1",
        'schema("public")',
        "schema('public')",
        "db: { schema: \"public\"",
        "db: { schema: 'public'",
    )
    matches: list[str] = []
    for path in source_root.rglob("*"):
        if not path.is_file() or path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
            continue
        if ".test." in path.name or path.name.endswith(".d.ts"):
            continue
        text = path.read_text(encoding="utf-8")
        for token in forbidden:
            if token in text:
                matches.append(f"{path.relative_to(repo_root)}:{token}")
    if matches:
        raise ActivationError("runtime depends on public or GraphQL Data API")
    v2_client = (source_root / "integrations" / "supabase" / "v2-client.ts").read_text(
        encoding="utf-8"
    )
    if '.schema("api")' not in v2_client:
        raise ActivationError("V2 runtime does not explicitly select the api schema")
    return {
        "runtimePublicOrGraphqlDependencies": 0,
        "v2ApiSchemaExplicit": True,
        "decision": "expose api only; remove public and graphql_public",
    }


def load_promoter(repo_root: Path) -> Any:
    path = repo_root / "scripts" / "backend" / "phase7e-production-migration-promoter.py"
    spec = importlib.util.spec_from_file_location("phase7e_promoter_for_phase7f", path)
    if spec is None or spec.loader is None:
        raise ActivationError("unable to load reviewed migration verifier")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@dataclass(frozen=True)
class HttpResult:
    status: int
    content_type: str
    body: bytes

    def json(self) -> Any:
        try:
            return json.loads(self.body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ActivationError(f"non_json_response: HTTP {self.status}") from exc


class HttpClient:
    def __init__(self) -> None:
        self.request_count = 0

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        timeout: int = 30,
    ) -> HttpResult:
        self.request_count += 1
        if self.request_count > MAX_HTTP_REQUESTS:
            raise ActivationError("bounded request cap exceeded")
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "BotolaGO-Phase7F/1.0",
                **(headers or {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return HttpResult(
                    status=response.status,
                    content_type=response.headers.get("Content-Type", ""),
                    body=response.read(),
                )
        except urllib.error.HTTPError as exc:
            return HttpResult(
                status=exc.code,
                content_type=exc.headers.get("Content-Type", ""),
                body=exc.read(),
            )
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ActivationError(f"network_error: {sanitize(exc)}") from exc


class ManagementClient:
    def __init__(self, http: HttpClient, token: str) -> None:
        self._http = http
        self._headers = {"Authorization": f"Bearer {token}"}

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        timeout: int = 60,
    ) -> Any:
        result = self._http.request(
            method,
            f"{MANAGEMENT_API}{path}",
            headers=self._headers,
            payload=payload,
            timeout=timeout,
        )
        if result.status not in (200, 201):
            classification = "management_api_request_failed"
            try:
                parsed = result.json()
                if isinstance(parsed, dict):
                    classification = sanitize(
                        parsed.get("code") or parsed.get("error_code") or classification
                    )
            except ActivationError:
                pass
            raise ActivationError(f"{classification}: HTTP {result.status}")
        return {} if not result.body else result.json()

    def get(self, path: str) -> Any:
        return self.request("GET", path)

    def patch(self, path: str, payload: dict[str, Any]) -> Any:
        return self.request("PATCH", path, payload)

    def query(self, sql: str, *, read_only: bool, timeout: int = 60) -> list[dict[str, Any]]:
        response = self.request(
            "POST",
            f"/v1/projects/{EXPECTED_PROJECT_REF}/database/query",
            {"query": sql, "read_only": read_only},
            timeout=timeout,
        )
        if isinstance(response, list):
            return response
        if isinstance(response, dict):
            rows = response.get("result", response.get("data", []))
            if isinstance(rows, list):
                return rows
        raise ActivationError("management_api_database_query_shape_invalid")


def assert_environment(expected_commit: str, repo_root: Path) -> tuple[str, str, str]:
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
        raise ActivationError("production project-ref guard failed")
    if configured_ref in (KNOWN_STAGING_REF, KNOWN_LEGACY_REF):
        raise ActivationError("staging or legacy target is forbidden")
    if configured_name != EXPECTED_PROJECT_NAME:
        raise ActivationError("production project-name guard failed")
    if target_environment != EXPECTED_TARGET_ENVIRONMENT or admin_environment != "production":
        raise ActivationError("production environment guard failed")
    if repository_url and production_url and repository_url.rstrip("/") != production_url.rstrip("/"):
        raise ActivationError("production URL variables disagree")
    if configured_url.rstrip("/") != f"https://{EXPECTED_PROJECT_REF}.supabase.co":
        raise ActivationError("production URL guard failed")

    actual_commit = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()
    if actual_commit != expected_commit:
        raise ActivationError("checked-out repository commit differs from expected_commit")
    return token, secret_key, configured_url.rstrip("/")


def assert_management_target(client: ManagementClient) -> dict[str, Any]:
    project = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}")
    organizations = client.get("/v1/organizations")
    if not isinstance(project, dict):
        raise ActivationError("management project response is invalid")
    returned_ref = project.get("ref") or project.get("id")
    if (
        returned_ref != EXPECTED_PROJECT_REF
        or project.get("name") != EXPECTED_PROJECT_NAME
        or project.get("region") != EXPECTED_REGION
        or project.get("status") != "ACTIVE_HEALTHY"
    ):
        raise ActivationError("management project identity or health guard failed")
    organization_id = project.get("organization_id")
    organization_rows = (
        organizations if isinstance(organizations, list) else organizations.get("organizations", [])
    )
    if not organization_id or not any(row.get("id") == organization_id for row in organization_rows):
        raise ActivationError("authenticated account does not own the selected project")

    backups = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/database/backups")
    completed = [
        row
        for row in backups.get("backups", [])
        if isinstance(row, dict) and row.get("status") == "COMPLETED"
    ]
    if not completed:
        raise ActivationError("backup readiness insufficient")
    functions = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/functions")
    if functions:
        raise ActivationError("Edge Functions must remain absent")
    return {
        "ref": returned_ref,
        "name": project.get("name"),
        "region": project.get("region"),
        "status": project.get("status"),
        "databaseVersion": (project.get("database") or {}).get("version"),
        "completedBackupCount": len(completed),
        "latestCompletedBackup": max(row.get("inserted_at", "") for row in completed),
        "pitrEnabled": bool(backups.get("pitr_enabled")),
        "edgeFunctionCount": 0,
    }


INVARIANT_SQL = """
select jsonb_build_object(
  'canonicalTableCount', (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('app', 'app_private')
      and relation.relkind in ('r', 'p')
  ),
  'forcedRlsCount', (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('app', 'app_private')
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  'nonForcedTables', coalesce((
    select jsonb_agg(namespace.nspname || '.' || relation.relname order by 1)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('app', 'app_private')
      and relation.relkind in ('r', 'p')
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ), '[]'::jsonb),
  'anonApiUsage', has_schema_privilege('anon', 'api', 'USAGE'),
  'authenticatedApiUsage', has_schema_privilege('authenticated', 'api', 'USAGE'),
  'anonAppUsage', has_schema_privilege('anon', 'app', 'USAGE'),
  'authenticatedAppUsage', has_schema_privilege('authenticated', 'app', 'USAGE'),
  'anonPrivateUsage', has_schema_privilege('anon', 'app_private', 'USAGE'),
  'authenticatedPrivateUsage', has_schema_privilege('authenticated', 'app_private', 'USAGE'),
  'cronJobCount', case
    when to_regclass('cron.job') is null then 0
    else (select count(*)::integer from cron.job)
  end,
  'authUserCount', (select count(*)::integer from auth.users),
  'profileCount', (select count(*)::integer from app.profiles),
  'preferenceCount', (select count(*)::integer from app.user_preferences),
  'missingProfileCount', (
    select count(*)::integer from auth.users users
    left join app.profiles profile on profile.id = users.id
    where profile.id is null
  ),
  'missingPreferenceCount', (
    select count(*)::integer from auth.users users
    left join app.user_preferences preference on preference.user_id = users.id
    where preference.user_id is null
  ),
  'orphanProfileCount', (
    select count(*)::integer from app.profiles profile
    left join auth.users users on users.id = profile.id
    where users.id is null
  ),
  'identityTriggerCount', (
    select count(*)::integer
    from pg_trigger trigger
    where trigger.tgrelid = 'auth.users'::regclass
      and trigger.tgname = 'botolago_v2_auth_user_created'
      and not trigger.tgisinternal
  ),
  'staffPrincipalCount', (select count(*)::integer from app_private.staff_principals),
  'activePlatformAdminCount', (
    select count(*)::integer
    from app_private.staff_role_assignments assignment
    join app_private.admin_roles role on role.id = assignment.role_id
    where role.name = 'platform_admin'
      and assignment.status = 'active'
      and assignment.starts_at <= statement_timestamp()
      and (assignment.expires_at is null or assignment.expires_at > statement_timestamp())
  ),
  'realtimeApiPublicationCount', (
    select count(*)::integer
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'api'
      and tablename = 'live_fixture_updates'
  )
) as invariant
""".strip()


def collect_invariants(client: ManagementClient) -> dict[str, Any]:
    rows = client.query(INVARIANT_SQL, read_only=True)
    if not rows or not isinstance(rows[0].get("invariant"), dict):
        raise ActivationError("production invariant query returned no result")
    value = rows[0]["invariant"]
    expected = {
        "canonicalTableCount": EXPECTED_CANONICAL_TABLE_COUNT,
        "forcedRlsCount": EXPECTED_CANONICAL_TABLE_COUNT,
        "nonForcedTables": [],
        "anonApiUsage": True,
        "authenticatedApiUsage": True,
        "anonAppUsage": False,
        "authenticatedAppUsage": False,
        "anonPrivateUsage": False,
        "authenticatedPrivateUsage": False,
        "cronJobCount": 0,
        "missingProfileCount": 0,
        "missingPreferenceCount": 0,
        "orphanProfileCount": 0,
        "identityTriggerCount": 1,
        "staffPrincipalCount": 0,
        "activePlatformAdminCount": 0,
        "realtimeApiPublicationCount": 1,
    }
    for key, expected_value in expected.items():
        if value.get(key) != expected_value:
            raise ActivationError(f"production security invariant failed: {key}")
    if int(value.get("authUserCount") or 0) < 1:
        raise ActivationError("no existing Production V2 Auth user is available for smoke testing")
    return value


def assert_migration_parity(client: ManagementClient, repo_root: Path) -> dict[str, Any]:
    promoter = load_promoter(repo_root)
    migrations = promoter.load_migrations(repo_root)
    history = promoter.read_history(client)
    completed = promoter.assert_history("admin", history, migrations)
    if len(history) != EXPECTED_MIGRATION_COUNT or completed != len(promoter.BATCHES["admin"]):
        raise ActivationError("Production V2 migration history is not the exact 35-file chain")
    return {"historyCount": len(history), "checksumParity": "exact"}


def get_postgrest_config(client: ManagementClient) -> dict[str, Any]:
    value = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/postgrest")
    if not isinstance(value, dict):
        raise ActivationError("PostgREST configuration response is invalid")
    schemas = normalize_csv(value.get("db_schema"))
    if schemas not in ALLOWED_INITIAL_SCHEMA_SETS:
        raise ActivationError("PostgREST exposed schemas differ from the approved before/after sets")
    return {
        "db_schema": str(value.get("db_schema") or ""),
        "db_extra_search_path": str(value.get("db_extra_search_path") or ""),
        "max_rows": value.get("max_rows"),
        "db_pool": value.get("db_pool"),
        "db_pool_acquisition_timeout": value.get("db_pool_acquisition_timeout"),
    }


def set_postgrest_config(client: ManagementClient, db_schema: str, extra_search_path: str) -> None:
    client.patch(
        f"/v1/projects/{EXPECTED_PROJECT_REF}/postgrest",
        {
            "db_schema": db_schema,
            "db_extra_search_path": extra_search_path,
        },
    )


def wait_for_postgrest(
    client: ManagementClient,
    expected_schemas: tuple[str, ...],
    expected_extra_search_path: tuple[str, ...],
) -> dict[str, Any]:
    for _ in range(12):
        config = get_postgrest_config(client)
        if (
            normalize_csv(config["db_schema"]) == expected_schemas
            and normalize_csv(config["db_extra_search_path"]) == expected_extra_search_path
        ):
            return config
        time.sleep(5)
    raise ActivationError("PostgREST effective configuration did not converge")


def get_publishable_key(client: ManagementClient) -> str:
    keys = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/api-keys?reveal=true")
    if not isinstance(keys, list):
        raise ActivationError("API key inventory response is invalid")
    publishable = [
        str(row.get("api_key") or "")
        for row in keys
        if isinstance(row, dict) and row.get("type") == "publishable"
    ]
    if len(publishable) != 1 or not publishable[0].startswith("sb_publishable_"):
        raise ActivationError("exactly one Production V2 publishable key is required")
    return publishable[0]


def project_request(
    http: HttpClient,
    project_url: str,
    method: str,
    path: str,
    *,
    api_key: str,
    access_token: str | None = None,
    schema: str | None = None,
    payload: dict[str, Any] | None = None,
) -> HttpResult:
    headers = {"apikey": api_key}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    if schema:
        headers["Accept-Profile"] = schema
        headers["Content-Profile"] = schema
    return http.request(method, f"{project_url}{path}", headers=headers, payload=payload)


def result_code(result: HttpResult) -> str | None:
    try:
        body = result.json()
    except ActivationError:
        return None
    if isinstance(body, dict):
        return str(body.get("code") or body.get("error_code") or body.get("message") or "")[:100]
    return None


def record_case(
    cases: list[dict[str, Any]],
    name: str,
    result: HttpResult,
    expected_statuses: set[int],
    *,
    expected_rows: int | None = None,
) -> Any:
    parsed: Any = None
    if result.body and "json" in result.content_type.lower():
        parsed = result.json()
    row_count = len(parsed) if isinstance(parsed, list) else None
    passed = result.status in expected_statuses
    if expected_rows is not None:
        passed = passed and row_count == expected_rows
    cases.append(
        {
            "case": name,
            "status": result.status,
            "errorCode": result_code(result) if result.status >= 400 else None,
            "rowCount": row_count,
            "passed": passed,
        }
    )
    if not passed:
        raise ActivationError(f"Identity/Profile smoke case failed: {name}")
    return parsed


def select_existing_ordinary_user(client: ManagementClient) -> tuple[str, str]:
    rows = client.query(
        """
select users.id::text as id, users.email
from auth.users users
left join app_private.staff_principals staff on staff.auth_user_id = users.id
where users.email_confirmed_at is not null
  and users.email is not null
  and staff.id is null
order by users.created_at, users.id
limit 1
""".strip(),
        read_only=True,
    )
    if len(rows) != 1 or not rows[0].get("id") or not rows[0].get("email"):
        raise ActivationError("no verified ordinary Auth user is available for smoke testing")
    return str(rows[0]["id"]), str(rows[0]["email"])


def mint_ephemeral_existing_user_session(
    http: HttpClient,
    project_url: str,
    secret_key: str,
    publishable_key: str,
    email: str,
) -> tuple[str, str | None]:
    link = project_request(
        http,
        project_url,
        "POST",
        "/auth/v1/admin/generate_link",
        api_key=secret_key,
        access_token=secret_key,
        payload={"type": "magiclink", "email": email},
    )
    if link.status != 200:
        raise ActivationError(f"existing-user session link failed: HTTP {link.status}")
    properties = (link.json().get("properties") or {}) if isinstance(link.json(), dict) else {}
    token_hash = properties.get("hashed_token")
    if not token_hash:
        raise ActivationError("existing-user session link omitted the token hash")
    verified = project_request(
        http,
        project_url,
        "POST",
        "/auth/v1/verify",
        api_key=publishable_key,
        payload={"type": "magiclink", "token_hash": token_hash},
    )
    if verified.status != 200:
        raise ActivationError(f"existing-user session verification failed: HTTP {verified.status}")
    session = verified.json()
    if not isinstance(session, dict) or not session.get("access_token"):
        raise ActivationError("existing-user session response is incomplete")
    return str(session["access_token"]), session.get("refresh_token")


def revoke_ephemeral_session(
    http: HttpClient,
    project_url: str,
    publishable_key: str,
    access_token: str,
) -> None:
    result = project_request(
        http,
        project_url,
        "POST",
        "/auth/v1/logout?scope=local",
        api_key=publishable_key,
        access_token=access_token,
    )
    if result.status not in (200, 204):
        raise ActivationError(f"ephemeral smoke session revocation failed: HTTP {result.status}")


def run_smoke(
    http: HttpClient,
    client: ManagementClient,
    project_url: str,
    secret_key: str,
) -> dict[str, Any]:
    publishable_key = get_publishable_key(client)
    user_id, user_email = select_existing_ordinary_user(client)
    cases: list[dict[str, Any]] = []
    access_token: str | None = None
    try:
        record_case(
            cases,
            "anon_explicit_username_availability",
            project_request(
                http,
                project_url,
                "POST",
                "/rest/v1/rpc/username_availability",
                api_key=publishable_key,
                schema="api",
                payload={"candidate": "activation_probe_reserved"},
            ),
            {200},
        )
        record_case(
            cases,
            "anon_profile_is_empty",
            project_request(
                http,
                project_url,
                "GET",
                "/rest/v1/my_profile?select=*",
                api_key=publishable_key,
                schema="api",
            ),
            {200},
            expected_rows=0,
        )
        record_case(
            cases,
            "anon_app_schema_unexposed",
            project_request(
                http,
                project_url,
                "GET",
                "/rest/v1/profiles?select=id&limit=1",
                api_key=publishable_key,
                schema="app",
            ),
            {406},
        )
        record_case(
            cases,
            "anon_private_schema_unexposed",
            project_request(
                http,
                project_url,
                "GET",
                "/rest/v1/staff_principals?select=id&limit=1",
                api_key=publishable_key,
                schema="app_private",
            ),
            {406},
        )
        record_case(
            cases,
            "public_schema_unexposed",
            project_request(
                http,
                project_url,
                "GET",
                "/rest/v1/nonexistent_activation_probe?select=*",
                api_key=publishable_key,
                schema="public",
            ),
            {406},
        )
        record_case(
            cases,
            "graphql_not_exposed",
            project_request(
                http,
                project_url,
                "POST",
                "/graphql/v1",
                api_key=publishable_key,
                payload={"query": "query ActivationProbe { __typename }"},
            ),
            {400, 401, 403, 404, 406},
        )
        record_case(
            cases,
            "invalid_token_rejected",
            project_request(
                http,
                project_url,
                "GET",
                "/rest/v1/my_profile?select=*",
                api_key=publishable_key,
                access_token="invalid.activation.token",
                schema="api",
            ),
            {401},
        )

        access_token, _refresh_token = mint_ephemeral_existing_user_session(
            http, project_url, secret_key, publishable_key, user_email
        )
        profile = record_case(
            cases,
            "authenticated_reads_own_profile",
            project_request(
                http,
                project_url,
                "GET",
                "/rest/v1/my_profile?select=*",
                api_key=publishable_key,
                access_token=access_token,
                schema="api",
            ),
            {200},
            expected_rows=1,
        )
        if not isinstance(profile, list) or str(profile[0].get("id")) != user_id:
            raise ActivationError("authenticated profile identity mismatch")
        record_case(
            cases,
            "authenticated_cannot_read_unrelated_profile",
            project_request(
                http,
                project_url,
                "GET",
                f"/rest/v1/my_profile?select=*&id=eq.{uuid.uuid4()}",
                api_key=publishable_key,
                access_token=access_token,
                schema="api",
            ),
            {200},
            expected_rows=0,
        )
        record_case(
            cases,
            "ordinary_user_denied_admin_context",
            project_request(
                http,
                project_url,
                "POST",
                "/rest/v1/rpc/get_my_staff_context",
                api_key=publishable_key,
                access_token=access_token,
                schema="api",
                payload={},
            ),
            {403},
        )
        record_case(
            cases,
            "authenticated_direct_canonical_write_unexposed",
            project_request(
                http,
                project_url,
                "PATCH",
                f"/rest/v1/profiles?id=eq.{user_id}",
                api_key=publishable_key,
                access_token=access_token,
                schema="app",
                payload={"display_name": "must-not-write"},
            ),
            {406},
        )
    finally:
        if access_token:
            revoke_ephemeral_session(http, project_url, publishable_key, access_token)

    return {
        "actorFingerprint": fingerprint(user_id),
        "existingUserReused": True,
        "newAuthUsersCreated": 0,
        "temporarySessionRevoked": True,
        "caseCount": len(cases),
        "cases": cases,
    }


def query_logs(
    client: ManagementClient,
    started_at: str,
    completed_at: str,
) -> dict[str, Any]:
    sql = """
SELECT source_name, count() AS event_count
FROM logs
WHERE timestamp >= parseDateTimeBestEffort({started:String})
  AND timestamp <= parseDateTimeBestEffort({completed:String})
  AND (
    toInt32OrZero(log_attributes['response.status_code']) >= 500
    OR positionCaseInsensitive(event_message, 'row-level security') > 0
    OR positionCaseInsensitive(event_message, 'permission denied') > 0
  )
GROUP BY source_name
ORDER BY event_count DESC
LIMIT 20
""".strip()
    params = urllib.parse.urlencode(
        {
            "sql": sql.replace("{started:String}", f"'{started_at}'").replace(
                "{completed:String}", f"'{completed_at}'"
            ),
            "iso_timestamp_start": started_at,
            "iso_timestamp_end": completed_at,
        }
    )
    response = client.get(
        f"/v1/projects/{EXPECTED_PROJECT_REF}/analytics/endpoints/logs?{params}"
    )
    if not isinstance(response, dict) or response.get("error"):
        raise ActivationError("post-change unified log inspection failed")
    rows = response.get("result", [])
    if not isinstance(rows, list):
        raise ActivationError("post-change unified log response is invalid")
    total = sum(int(row.get("event_count") or 0) for row in rows if isinstance(row, dict))
    return {
        "queryOutcome": "QUERIED_ZERO" if total == 0 else "QUERIED_NONZERO",
        "errorEventCount": total,
        "sources": [
            {
                "source": sanitize(row.get("source_name") or "unknown", 100),
                "count": int(row.get("event_count") or 0),
            }
            for row in rows
            if isinstance(row, dict)
        ],
    }


def preflight(
    client: ManagementClient,
    repo_root: Path,
) -> dict[str, Any]:
    target = assert_management_target(client)
    migrations = assert_migration_parity(client, repo_root)
    invariants = collect_invariants(client)
    postgrest = get_postgrest_config(client)
    dependency_audit = assert_repository_dependencies(repo_root)
    return {
        "timestampUtc": utc_now(),
        "target": target,
        "migrations": migrations,
        "security": invariants,
        "postgrest": postgrest,
        "dependencyAudit": dependency_audit,
        "schedules": "disabled",
        "workers": "disabled",
        "result": "PASS",
    }


def rollback(
    client: ManagementClient,
    previous: dict[str, Any],
    evidence_dir: Path,
    reason: str,
) -> dict[str, Any]:
    set_postgrest_config(
        client,
        str(previous["db_schema"]),
        str(previous["db_extra_search_path"]),
    )
    restored = wait_for_postgrest(
        client,
        normalize_csv(previous["db_schema"]),
        normalize_csv(previous["db_extra_search_path"]),
    )
    evidence = {
        "timestampUtc": utc_now(),
        "reason": sanitize(reason),
        "restored": restored,
        "dataMutations": 0,
        "migrationRollbacks": 0,
        "result": "ROLLED_BACK",
    }
    write_json(evidence_dir / "rollback.json", evidence)
    return evidence


def run(args: argparse.Namespace) -> None:
    repo_root = Path(args.repo_root).resolve()
    evidence_dir = Path(args.evidence_dir).resolve()
    if args.confirmation != EXPECTED_CONFIRMATION:
        raise ActivationError("manual activation confirmation is invalid")
    token, secret_key, project_url = assert_environment(args.expected_commit, repo_root)
    http = HttpClient()
    client = ManagementClient(http, token)
    started_at = utc_now()
    preflight_value = preflight(client, repo_root)
    write_json(evidence_dir / "preflight.json", preflight_value)

    previous = preflight_value["postgrest"]
    already_active = normalize_csv(previous["db_schema"]) == (TARGET_DB_SCHEMA,)
    changed = False
    try:
        if not already_active:
            # Treat the PATCH outcome as ambiguous until the read-after-write
            # converges. A connection failure after the server commits must
            # still take the exact-prior rollback path.
            changed = True
            set_postgrest_config(
                client,
                TARGET_DB_SCHEMA,
                TARGET_EXTRA_SEARCH_PATH,
            )
        effective = wait_for_postgrest(
            client,
            (TARGET_DB_SCHEMA,),
            (TARGET_EXTRA_SEARCH_PATH,),
        )
        smoke = run_smoke(http, client, project_url, secret_key)
        postflight_value = preflight(client, repo_root)
        if normalize_csv(postflight_value["postgrest"]["db_schema"]) != (TARGET_DB_SCHEMA,):
            raise ActivationError("post-change api exposure invariant failed")
        completed_at = utc_now()
        logs = query_logs(client, started_at, completed_at)
        if logs["errorEventCount"] > 0:
            raise ActivationError("unexpected production errors appeared during activation window")
        result = {
            "timestampUtc": completed_at,
            "repositoryCommit": args.expected_commit,
            "projectRef": EXPECTED_PROJECT_REF,
            "before": previous,
            "after": effective,
            "postgrestChanged": changed,
            "identityProfileSmoke": smoke,
            "profileBackfill": {
                "authUsers": postflight_value["security"]["authUserCount"],
                "profiles": postflight_value["security"]["profileCount"],
                "preferences": postflight_value["security"]["preferenceCount"],
                "missingProfiles": 0,
                "missingPreferences": 0,
                "orphanProfiles": 0,
                "staffPrincipals": 0,
                "platformAdministrators": 0,
                "idempotentTriggerVerified": True,
            },
            "logs": logs,
            "postflight": postflight_value,
            "httpRequestCount": http.request_count,
            "prohibitedActions": {
                "migrationsApplied": 0,
                "newAuthUsersCreated": 0,
                "ownerBootstraps": 0,
                "secondOperatorsAssigned": 0,
                "workersEnabled": 0,
                "schedulesEnabled": 0,
                "edgeFunctionsCreated": 0,
                "capacityTraffic": False,
                "stagingTouched": False,
                "legacyTouched": False,
            },
            "result": "PASS",
        }
        write_json(evidence_dir / "activation-report.json", result)
        print(
            json.dumps(
                {
                    "projectRef": EXPECTED_PROJECT_REF,
                    "effectiveSchemas": ["api"],
                    "smokeCases": smoke["caseCount"],
                    "httpRequestCount": http.request_count,
                    "result": "PASS",
                },
                sort_keys=True,
            )
        )
    except Exception as exc:
        if changed:
            rollback(client, previous, evidence_dir, sanitize(exc))
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-commit", required=True)
    parser.add_argument("--confirmation", required=True)
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--evidence-dir", required=True)
    return parser.parse_args()


def main() -> int:
    try:
        run(parse_args())
    except ActivationError as exc:
        print(f"activation_failed: {sanitize(exc)}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"activation_failed: unexpected_{type(exc).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
