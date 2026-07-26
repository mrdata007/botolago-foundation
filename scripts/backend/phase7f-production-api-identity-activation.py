#!/usr/bin/env python3
"""Fail-closed Production V2 API/Identity activation controller.

The only production mutation implemented here is the reviewed PostgREST
exposed-schema change.  Every mutation is journaled before it is attempted and
can be recovered independently by ``--recover-from-state``.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import os
import re
import secrets
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable


EXPECTED_PROJECT_REF = "tkewgajrljbwgwedqsxn"
EXPECTED_PROJECT_NAME = "BotolaGO Production V2"
EXPECTED_REGION = "eu-west-3"
EXPECTED_TARGET_ENVIRONMENT = "production-v2"
KNOWN_STAGING_REF = "srdrflfrfpwixsllveid"
KNOWN_LEGACY_REF = "kxpaudvntwxpahyjtxbk"
EXPECTED_CONFIRMATION = "RUN_PHASE7F_PRODUCTION_API_IDENTITY"
EXPECTED_MIGRATION_COUNT = 35
EXPECTED_CANONICAL_TABLE_COUNT = 112
TARGET_DB_SCHEMA = "api"
TARGET_EXTRA_SEARCH_PATH = "extensions"
ALLOWED_INITIAL_SCHEMA_SETS = {("graphql_public", "public"), ("api",)}
MANAGEMENT_API = "https://api.supabase.com"
MAX_HTTP_REQUESTS = 120
SHARED_CONCURRENCY_GROUP = "botolago-production-v2-mutation"
EXPECTED_REPOSITORY = "mrdata007/botolago-foundation"
EXPECTED_GITHUB_REF = "refs/heads/main"
EXPECTED_GITHUB_EVENT = "workflow_dispatch"
APPROVAL_COMMENT_PREFIX = "APPROVE_PHASE7F"
APPROVAL_WINDOW_SECONDS = 600
APPROVAL_POLL_INTERVAL_SECONDS = 10

VERDICTS = {
    "NOT_EXECUTED",
    "FAILED_BEFORE_MUTATION",
    "MUTATION_IN_PROGRESS",
    "ACTIVATED_PENDING_TESTS",
    "PASS",
    "FAILED_ROLLED_BACK",
    "ROLLBACK_FAILED",
    "ACTIVATION_STATE_AMBIGUOUS",
    "SESSION_CLEANUP_FAILED",
    "EVIDENCE_FAILURE",
}
HTTP_CODES = {
    400: "HTTP_BAD_REQUEST",
    401: "HTTP_UNAUTHORIZED",
    403: "HTTP_FORBIDDEN",
    404: "HTTP_NOT_FOUND",
    406: "HTTP_NOT_ACCEPTABLE",
    409: "HTTP_CONFLICT",
    429: "HTTP_RATE_LIMITED",
    500: "HTTP_SERVER_ERROR",
    502: "HTTP_UPSTREAM_ERROR",
    503: "HTTP_UNAVAILABLE",
    504: "HTTP_TIMEOUT",
}
ALLOWED_UPSTREAM_CODES = re.compile(
    r"^(?:PGRST[0-9]{3}|PT[0-9]{3}|42501|42P01|22P02|23505)$"
)
SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization\s*:\s*(?:bearer\s+)?)[^\s\"']+"),
    re.compile(r"\b(?:sbp|sb_secret|sb_publishable)_[A-Za-z0-9._-]+\b"),
    re.compile(r"\beyJ[A-Za-z0-9._-]+\b"),
    re.compile(
        r"(?i)(refresh_token|access_token|token_hash|hashed_token|password)"
        r"[\"'=:\s]+[^\s,\"'}]+"
    ),
    re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"),
)
UUID_PATTERN = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b"
)


class ActivationError(RuntimeError):
    """A stable failure code plus an optional sanitized diagnostic."""

    def __init__(self, code: str, detail: object | None = None) -> None:
        self.code = code
        self.detail = sanitize(detail, 240) if detail is not None else None
        super().__init__(code)


class SignalAbort(ActivationError):
    pass


class AmbiguousMutation(ActivationError):
    pass


def sanitize(value: object, limit: int = 500) -> str:
    text = str(value).replace("\r", " ").replace("\n", " ")
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(
            lambda match: f"{match.group(1)}[REDACTED]"
            if match.lastindex
            else "[REDACTED]",
            text,
        )
    text = UUID_PATTERN.sub("[UUID]", text)
    return text[:limit]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def canonical_json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
        path.chmod(0o600)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


write_json = atomic_write_json


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ActivationError("PROTECTED_VALUE_MISSING", name)
    return value


def normalize_csv(value: object) -> tuple[str, ...]:
    return tuple(
        sorted(part.strip() for part in str(value or "").split(",") if part.strip())
    )


def load_promoter(repo_root: Path) -> Any:
    path = repo_root / "scripts/backend/phase7e-production-migration-promoter.py"
    spec = importlib.util.spec_from_file_location("phase7e_promoter_for_phase7f", path)
    if spec is None or spec.loader is None:
        raise ActivationError("PROMOTER_LOAD_FAILED")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def assert_repository_dependencies(repo_root: Path) -> dict[str, Any]:
    source_root = repo_root / "src"
    forbidden = (
        "/graphql/v1",
        'schema("public")',
        "schema('public')",
        'db: { schema: "public"',
        "db: { schema: 'public'",
    )
    for path in source_root.rglob("*"):
        if (
            not path.is_file()
            or path.suffix not in {".ts", ".tsx", ".js", ".jsx"}
            or ".test." in path.name
            or path.name.endswith(".d.ts")
        ):
            continue
        text = path.read_text(encoding="utf-8")
        if any(token in text for token in forbidden):
            raise ActivationError("FORBIDDEN_RUNTIME_SCHEMA_DEPENDENCY")
    v2_client = (
        source_root / "integrations/supabase/v2-client.ts"
    ).read_text(encoding="utf-8")
    if '.schema("api")' not in v2_client:
        raise ActivationError("API_SCHEMA_NOT_EXPLICIT")
    return {
        "runtimePublicOrGraphqlDependencies": 0,
        "v2ApiSchemaExplicit": True,
    }


@dataclass(frozen=True)
class HttpResult:
    status: int
    content_type: str
    body: bytes

    def json(self) -> Any:
        try:
            return json.loads(self.body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ActivationError("RESPONSE_PARSE_ERROR") from exc


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
        mutation: bool = False,
    ) -> HttpResult:
        self.request_count += 1
        if self.request_count > MAX_HTTP_REQUESTS:
            raise ActivationError("REQUEST_CAP_EXCEEDED")
        body = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "BotolaGO-Phase7F/2.0",
                **(headers or {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return HttpResult(
                    response.status,
                    response.headers.get("Content-Type", ""),
                    response.read(),
                )
        except urllib.error.HTTPError as exc:
            return HttpResult(
                exc.code, exc.headers.get("Content-Type", ""), exc.read()
            )
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if mutation:
                raise AmbiguousMutation("MUTATION_RESPONSE_AMBIGUOUS") from exc
            raise ActivationError("HTTP_TIMEOUT") from exc


def stable_result_code(result: HttpResult) -> str:
    if result.body and "json" in result.content_type.lower():
        try:
            parsed = result.json()
            if isinstance(parsed, dict):
                candidate = str(parsed.get("code") or parsed.get("error_code") or "")
                if ALLOWED_UPSTREAM_CODES.fullmatch(candidate):
                    return candidate
        except ActivationError:
            return "RESPONSE_PARSE_ERROR"
    return HTTP_CODES.get(result.status, "UNEXPECTED_STATUS")


class ManagementClient:
    def __init__(self, http: HttpClient, token: str) -> None:
        self._http = http
        self._headers = {"Authorization": f"Bearer {token}"}

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        *,
        timeout: int = 60,
        mutation: bool = False,
    ) -> Any:
        result = self._http.request(
            method,
            f"{MANAGEMENT_API}{path}",
            headers=self._headers,
            payload=payload,
            timeout=timeout,
            mutation=mutation,
        )
        if result.status not in (200, 201):
            raise ActivationError(
                stable_result_code(result),
                f"management request returned HTTP {result.status}",
            )
        return {} if not result.body else result.json()

    def get(self, path: str) -> Any:
        return self.request("GET", path)

    def patch(self, path: str, payload: dict[str, Any]) -> Any:
        return self.request("PATCH", path, payload, mutation=True)

    def query(
        self, sql: str, *, read_only: bool, timeout: int = 60
    ) -> list[dict[str, Any]]:
        response = self.request(
            "POST",
            f"/v1/projects/{EXPECTED_PROJECT_REF}/database/query",
            {"query": sql, "read_only": read_only},
            timeout=timeout,
            mutation=not read_only,
        )
        if isinstance(response, list):
            return response
        if isinstance(response, dict):
            rows = response.get("result", response.get("data", []))
            if isinstance(rows, list):
                return rows
        raise ActivationError("MANAGEMENT_QUERY_SHAPE_INVALID")


class StateJournal:
    def __init__(self, path: Path) -> None:
        self.path = path

    def create(
        self, *, project_ref: str, commit: str, run_id: str, previous: dict[str, Any]
    ) -> dict[str, Any]:
        state = {
            "projectRef": project_ref,
            "repositoryCommit": commit,
            "runId": sanitize(run_id, 100),
            "createdAtUtc": utc_now(),
            "updatedAtUtc": utc_now(),
            "previousDbSchema": str(previous["db_schema"]),
            "previousDbExtraSearchPath": str(previous["db_extra_search_path"]),
            "mutationAttempted": False,
            "mutationConfirmed": False,
            "rollbackRequired": False,
            "rollbackAttempted": False,
            "rollbackVerified": False,
            "sessionCleanupVerified": False,
            "verdict": "NOT_EXECUTED",
        }
        atomic_write_json(self.path, state)
        return state

    def read(self) -> dict[str, Any]:
        try:
            state = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise ActivationError("STATE_JOURNAL_MISSING") from exc
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ActivationError("STATE_JOURNAL_CORRUPT") from exc
        required = {
            "projectRef",
            "repositoryCommit",
            "previousDbSchema",
            "previousDbExtraSearchPath",
            "mutationAttempted",
            "mutationConfirmed",
            "rollbackRequired",
            "rollbackAttempted",
            "rollbackVerified",
            "verdict",
        }
        if not isinstance(state, dict) or not required.issubset(state):
            raise ActivationError("STATE_JOURNAL_CORRUPT")
        if state["projectRef"] != EXPECTED_PROJECT_REF or state["verdict"] not in VERDICTS:
            raise ActivationError("STATE_JOURNAL_TARGET_INVALID")
        return state

    def update(self, **changes: Any) -> dict[str, Any]:
        state = self.read()
        if "verdict" in changes and changes["verdict"] not in VERDICTS:
            raise ActivationError("STATE_VERDICT_INVALID")
        state.update(changes)
        state["updatedAtUtc"] = utc_now()
        atomic_write_json(self.path, state)
        return state


def assert_environment(
    expected_commit: str, repo_root: Path
) -> tuple[str, str, str, str, str]:
    token = require_env("SUPABASE_ACCESS_TOKEN")
    secret_key = require_env("SUPABASE_SECRET_KEY")
    smoke_user_id = require_env("BOTOLAGO_PRODUCTION_SMOKE_USER_UUID")
    aal2_token = require_env("BOTOLAGO_AAL2_NON_STAFF_ACCESS_TOKEN")
    try:
        uuid.UUID(smoke_user_id)
    except ValueError as exc:
        raise ActivationError("SMOKE_USER_UUID_INVALID") from exc
    if len(require_env("BOTOLAGO_AAL2_EVIDENCE_SHA256")) != 64:
        raise ActivationError("AAL2_ATTESTATION_INVALID")

    configured_ref = require_env("SUPABASE_PRODUCTION_PROJECT_REF")
    if (
        configured_ref != EXPECTED_PROJECT_REF
        or require_env("BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF")
        != EXPECTED_PROJECT_REF
    ):
        raise ActivationError("PROJECT_REF_GUARD_FAILED")
    if configured_ref in (KNOWN_STAGING_REF, KNOWN_LEGACY_REF):
        raise ActivationError("FORBIDDEN_PROJECT_TARGET")
    if require_env("SUPABASE_PRODUCTION_PROJECT_NAME") != EXPECTED_PROJECT_NAME:
        raise ActivationError("PROJECT_NAME_GUARD_FAILED")
    if (
        require_env("BOTOLAGO_TARGET_ENVIRONMENT")
        != EXPECTED_TARGET_ENVIRONMENT
        or require_env("BOTOLAGO_ADMIN_ENVIRONMENT") != "production"
    ):
        raise ActivationError("ENVIRONMENT_GUARD_FAILED")
    repository_url = os.environ.get("SUPABASE_URL", "").strip()
    production_url = os.environ.get("SUPABASE_PRODUCTION_URL", "").strip()
    if repository_url and production_url and repository_url.rstrip(
        "/"
    ) != production_url.rstrip("/"):
        raise ActivationError("PROJECT_URL_GUARD_FAILED")
    configured_url = (repository_url or production_url).rstrip("/")
    if configured_url != f"https://{EXPECTED_PROJECT_REF}.supabase.co":
        raise ActivationError("PROJECT_URL_GUARD_FAILED")
    actual_commit = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()
    if actual_commit != expected_commit:
        raise ActivationError("COMMIT_GUARD_FAILED")
    return token, secret_key, configured_url, smoke_user_id, aal2_token


def github_request(http: HttpClient, token: str, path: str) -> HttpResult:
    return http.request(
        "GET",
        f"https://api.github.com{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


def require_positive_integer(name: str) -> int:
    value = require_env(name)
    if not value.isascii() or not value.isdigit() or int(value) < 1:
        raise ActivationError("PROTECTED_VALUE_INVALID", name)
    return int(value)


def require_first_run_attempt() -> int:
    if require_env("GITHUB_RUN_ATTEMPT") != "1":
        raise ActivationError("GITHUB_WORKFLOW_RERUN_FORBIDDEN")
    return 1


def parse_github_timestamp(value: object) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ActivationError("GITHUB_TIMESTAMP_INVALID")
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ActivationError("GITHUB_TIMESTAMP_INVALID") from exc
    if parsed.tzinfo is None:
        raise ActivationError("GITHUB_TIMESTAMP_INVALID")
    return parsed.astimezone(timezone.utc)


def github_response_json(
    response: HttpResult, failure_code: str
) -> dict[str, Any] | list[Any]:
    if response.status != 200:
        raise ActivationError(failure_code)
    try:
        parsed = response.json()
    except ActivationError as exc:
        raise ActivationError(failure_code) from exc
    if not isinstance(parsed, (dict, list)):
        raise ActivationError(failure_code)
    return parsed


def classic_branch_protection_safe(value: dict[str, Any]) -> bool:
    reviews = value.get("required_pull_request_reviews")
    enforce_admins = value.get("enforce_admins")
    force_pushes = value.get("allow_force_pushes")
    deletions = value.get("allow_deletions")
    if not isinstance(reviews, dict):
        return False
    bypass = reviews.get("bypass_pull_request_allowances")
    if not isinstance(bypass, dict):
        raise ActivationError("GITHUB_BRANCH_PROTECTION_UNVERIFIED")
    for actor_type in ("users", "teams", "apps"):
        actors = bypass.get(actor_type)
        if not isinstance(actors, list):
            raise ActivationError("GITHUB_BRANCH_PROTECTION_UNVERIFIED")
        if actors:
            raise ActivationError("GITHUB_BRANCH_PROTECTION_UNSAFE")
    return bool(
        int(reviews.get("required_approving_review_count") or 0) >= 1
        and reviews.get("dismiss_stale_reviews") is True
        and reviews.get("require_last_push_approval") is True
        and isinstance(enforce_admins, dict)
        and enforce_admins.get("enabled") is True
        and isinstance(force_pushes, dict)
        and force_pushes.get("enabled") is False
        and isinstance(deletions, dict)
        and deletions.get("enabled") is False
    )


def ruleset_ref_patterns(
    value: dict[str, Any],
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    conditions = value.get("conditions")
    if not isinstance(conditions, dict):
        raise ActivationError("GITHUB_RULESET_PATTERN_UNVERIFIED")
    ref_name = conditions.get("ref_name")
    if not isinstance(ref_name, dict):
        raise ActivationError("GITHUB_RULESET_PATTERN_UNVERIFIED")
    includes_value = ref_name.get("include")
    excludes_value = ref_name.get("exclude")
    if not isinstance(includes_value, list) or not isinstance(
        excludes_value, list
    ):
        raise ActivationError("GITHUB_RULESET_PATTERN_UNVERIFIED")
    if not all(isinstance(item, str) for item in includes_value) or not all(
        isinstance(item, str) for item in excludes_value
    ):
        raise ActivationError("GITHUB_RULESET_PATTERN_UNVERIFIED")
    includes = tuple(includes_value)
    excludes = tuple(excludes_value)
    for pattern in (*includes, *excludes):
        if any(character in pattern for character in ("*", "?", "[", "]", "\\")):
            raise ActivationError("GITHUB_RULESET_PATTERN_UNVERIFIED")
        if pattern in {"~ALL", "~DEFAULT_BRANCH"}:
            continue
        if not pattern.startswith("refs/heads/") or not pattern.removeprefix(
            "refs/heads/"
        ):
            raise ActivationError("GITHUB_RULESET_PATTERN_UNVERIFIED")
    return includes, excludes


def ruleset_requires_default_branch_resolution(
    value: dict[str, Any],
) -> bool:
    includes, excludes = ruleset_ref_patterns(value)
    explicit_include_matches_main = any(
        pattern != "~DEFAULT_BRANCH"
        and pattern in {"~ALL", "refs/heads/main"}
        for pattern in includes
    )
    return "~DEFAULT_BRANCH" in excludes or (
        "~DEFAULT_BRANCH" in includes
        and not explicit_include_matches_main
    )


def ruleset_targets_main(
    value: dict[str, Any], *, default_branch: str | None = None
) -> bool:
    if value.get("target") != "branch":
        return False
    includes, excludes = ruleset_ref_patterns(value)

    def matches_main(pattern: str) -> bool:
        if pattern == "~ALL":
            return True
        if pattern == "~DEFAULT_BRANCH":
            return default_branch == "main"
        return pattern == "refs/heads/main"

    return any(matches_main(item) for item in includes) and not any(
        matches_main(item) for item in excludes
    )


def ruleset_applies_to_main(
    value: dict[str, Any], *, default_branch: str | None = None
) -> bool:
    return (
        ruleset_targets_main(value, default_branch=default_branch)
        and value.get("enforcement") == "active"
    )


def branch_ruleset_safe(
    value: dict[str, Any], *, default_branch: str | None = None
) -> bool:
    if not ruleset_applies_to_main(
        value, default_branch=default_branch
    ):
        return False
    if "bypass_actors" not in value or not isinstance(
        value["bypass_actors"], list
    ):
        raise ActivationError("GITHUB_RULESET_UNVERIFIED")
    if value["bypass_actors"]:
        raise ActivationError("GITHUB_RULESET_UNSAFE")
    rules = {
        str(row.get("type")): row
        for row in value.get("rules") or []
        if isinstance(row, dict)
    }
    pull_request = rules.get("pull_request")
    parameters = (
        pull_request.get("parameters")
        if isinstance(pull_request, dict)
        else None
    )
    return bool(
        isinstance(parameters, dict)
        and int(parameters.get("required_approving_review_count") or 0) >= 1
        and parameters.get("dismiss_stale_reviews_on_push") is True
        and parameters.get("require_last_push_approval") is True
        and "non_fast_forward" in rules
        and "deletion" in rules
    )


def verify_main_governance(
    http: HttpClient, token: str, repository: str
) -> dict[str, Any]:
    classic = github_request(
        http, token, f"/repos/{repository}/branches/main/protection"
    )
    classic_value: dict[str, Any] | None = None
    if classic.status == 200:
        parsed = github_response_json(
            classic, "GITHUB_BRANCH_PROTECTION_UNVERIFIED"
        )
        if not isinstance(parsed, dict):
            raise ActivationError("GITHUB_BRANCH_PROTECTION_UNVERIFIED")
        classic_value = parsed
        if classic_branch_protection_safe(parsed):
            return {
                "mode": "CLASSIC_BRANCH_PROTECTION",
                "branch": "main",
                "requiredApprovals": int(
                    parsed["required_pull_request_reviews"][
                        "required_approving_review_count"
                    ]
                ),
                "staleReviewsDismissed": True,
                "latestPushApprovalRequired": True,
                "administratorBypassAllowed": False,
                "forcePushAllowed": False,
                "deletionAllowed": False,
                "result": "PASS",
            }

    rulesets_response = github_request(
        http,
        token,
        f"/repos/{repository}/rulesets?"
        + urllib.parse.urlencode(
            {"includes_parents": "true", "targets": "branch"}
        ),
    )
    if rulesets_response.status != 200:
        if classic.status not in (200, 404):
            raise ActivationError("GITHUB_BRANCH_PROTECTION_UNVERIFIED")
        if classic_value is not None:
            raise ActivationError("GITHUB_BRANCH_PROTECTION_UNSAFE")
        raise ActivationError("GITHUB_RULESET_UNVERIFIED")
    summaries = github_response_json(
        rulesets_response, "GITHUB_RULESET_UNVERIFIED"
    )
    if not isinstance(summaries, list):
        raise ActivationError("GITHUB_RULESET_UNVERIFIED")
    applicable_seen = False
    unsafe_seen = False
    default_branch: str | None = None
    default_branch_loaded = False
    for summary in summaries:
        if not isinstance(summary, dict) or not isinstance(
            summary.get("id"), int
        ):
            raise ActivationError("GITHUB_RULESET_UNVERIFIED")
        detail_response = github_request(
            http,
            token,
            f"/repos/{repository}/rulesets/{summary['id']}",
        )
        if detail_response.status != 200:
            raise ActivationError("GITHUB_RULESET_UNVERIFIED")
        detail = github_response_json(
            detail_response, "GITHUB_RULESET_UNVERIFIED"
        )
        if not isinstance(detail, dict):
            raise ActivationError("GITHUB_RULESET_UNVERIFIED")
        if (
            ruleset_requires_default_branch_resolution(detail)
            and not default_branch_loaded
        ):
            repository_response = github_request(
                http, token, f"/repos/{repository}"
            )
            repository_value = github_response_json(
                repository_response, "GITHUB_RULESET_UNVERIFIED"
            )
            if not isinstance(repository_value, dict) or not isinstance(
                repository_value.get("default_branch"), str
            ):
                raise ActivationError("GITHUB_RULESET_UNVERIFIED")
            default_branch = repository_value["default_branch"]
            default_branch_loaded = True
        if ruleset_targets_main(detail, default_branch=default_branch):
            applicable_seen = True
            if branch_ruleset_safe(
                detail, default_branch=default_branch
            ):
                pull_rule = next(
                    row
                    for row in detail["rules"]
                    if row.get("type") == "pull_request"
                )
                return {
                    "mode": "REPOSITORY_RULESET",
                    "branch": "main",
                    "rulesetIdHash": fingerprint(str(detail["id"])),
                    "requiredApprovals": int(
                        pull_rule["parameters"][
                            "required_approving_review_count"
                        ]
                    ),
                    "staleReviewsDismissed": True,
                    "latestPushApprovalRequired": True,
                    "administratorBypassAllowed": False,
                    "forcePushAllowed": False,
                    "deletionAllowed": False,
                    "result": "PASS",
                }
            unsafe_seen = True
    if classic_value is not None:
        raise ActivationError("GITHUB_BRANCH_PROTECTION_UNSAFE")
    if applicable_seen or unsafe_seen:
        raise ActivationError("GITHUB_RULESET_UNSAFE")
    raise ActivationError("GITHUB_BRANCH_PROTECTION_UNVERIFIED")


def github_list(
    http: HttpClient,
    token: str,
    path: str,
    failure_code: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for page in range(1, 11):
        separator = "&" if "?" in path else "?"
        response = github_request(
            http,
            token,
            f"{path}{separator}"
            + urllib.parse.urlencode({"per_page": 100, "page": page}),
        )
        parsed = github_response_json(response, failure_code)
        if not isinstance(parsed, list) or not all(
            isinstance(row, dict) for row in parsed
        ):
            raise ActivationError(failure_code)
        rows.extend(parsed)
        if len(parsed) < 100:
            return rows
    raise ActivationError(failure_code)


def verify_exact_reviewed_commit(
    http: HttpClient,
    token: str,
    repository: str,
    commit: str,
    required_reviewer_id: int,
    actor_id: int,
) -> dict[str, Any]:
    pulls = github_list(
        http,
        token,
        f"/repos/{repository}/commits/{commit}/pulls",
        "GITHUB_PR_GOVERNANCE_UNVERIFIED",
    )
    applicable = [
        row
        for row in pulls
        if (row.get("base") or {}).get("ref") == "main"
        and row.get("state") == "closed"
        and row.get("merged_at")
        and row.get("merge_commit_sha") == commit
    ]
    if not applicable:
        raise ActivationError("GITHUB_APPROVED_PR_NOT_FOUND")
    if len(applicable) != 1:
        raise ActivationError("GITHUB_MULTIPLE_PR_MATCHES")
    pull = applicable[0]
    number = pull.get("number")
    head_commit = (pull.get("head") or {}).get("sha")
    author_id = ((pull.get("user") or {}).get("id"))
    if not isinstance(number, int) or not isinstance(head_commit, str):
        raise ActivationError("GITHUB_PR_GOVERNANCE_UNVERIFIED")

    reviews = github_list(
        http,
        token,
        f"/repos/{repository}/pulls/{number}/reviews",
        "GITHUB_PR_GOVERNANCE_UNVERIFIED",
    )
    latest_by_reviewer: dict[int, dict[str, Any]] = {}
    for review in sorted(
        reviews,
        key=lambda row: (
            str(row.get("submitted_at") or ""),
            int(row.get("id") or 0),
        ),
    ):
        reviewer_id = (review.get("user") or {}).get("id")
        if isinstance(reviewer_id, int):
            latest_by_reviewer[reviewer_id] = review
    for review in latest_by_reviewer.values():
        if (
            review.get("state") == "CHANGES_REQUESTED"
            and review.get("commit_id") == head_commit
        ):
            raise ActivationError("GITHUB_PR_GOVERNANCE_UNVERIFIED")
    designated = latest_by_reviewer.get(required_reviewer_id)
    reviewer = (designated or {}).get("user") or {}
    if (
        designated is None
        or designated.get("state") != "APPROVED"
        or reviewer.get("type") != "User"
        or "copilot" in str(reviewer.get("login") or "").lower()
    ):
        raise ActivationError("GITHUB_REQUIRED_REVIEWER_MISSING")
    if designated.get("commit_id") != head_commit:
        raise ActivationError("GITHUB_REVIEW_STALE")

    head_response = github_request(
        http, token, f"/repos/{repository}/commits/{head_commit}"
    )
    head_value = github_response_json(
        head_response, "GITHUB_PR_GOVERNANCE_UNVERIFIED"
    )
    if not isinstance(head_value, dict):
        raise ActivationError("GITHUB_PR_GOVERNANCE_UNVERIFIED")
    latest_push_author_id = (head_value.get("author") or {}).get("id")
    if required_reviewer_id in {
        actor_id,
        author_id,
        latest_push_author_id,
    }:
        raise ActivationError("GITHUB_REVIEWER_NOT_INDEPENDENT")
    return {
        "pullRequestNumber": number,
        "reviewedHeadPrefix": head_commit[:12],
        "mergeCommitPrefix": commit[:12],
        "reviewerIdHash": fingerprint(str(required_reviewer_id)),
        "approvalTimestamp": str(designated.get("submitted_at")),
        "result": "PASS",
    }


def verify_conflicting_runs(
    http: HttpClient, token: str, repository: str, run_id: str
) -> dict[str, Any]:
    conflicts: list[dict[str, Any]] = []
    for status in ("queued", "in_progress"):
        response = github_request(
            http,
            token,
            f"/repos/{repository}/actions/runs?"
            + urllib.parse.urlencode({"status": status, "per_page": 100}),
        )
        parsed = github_response_json(
            response, "GITHUB_CONFLICT_CHECK_UNVERIFIED"
        )
        if not isinstance(parsed, dict):
            raise ActivationError("GITHUB_CONFLICT_CHECK_UNVERIFIED")
        for row in parsed.get("workflow_runs", []):
            if not isinstance(row, dict):
                raise ActivationError("GITHUB_CONFLICT_CHECK_UNVERIFIED")
            path = str(row.get("path") or "")
            if (
                path
                in {
                    ".github/workflows/phase7e-b-production-migration-promotion.yml",
                    ".github/workflows/phase7f-production-api-identity-activation.yml",
                }
                and str(row.get("id")) != run_id
            ):
                conflicts.append(
                    {
                        "workflow": Path(path).name,
                        "status": str(row.get("status")),
                        "runIdHash": fingerprint(str(row.get("id"))),
                    }
                )
    if conflicts:
        raise ActivationError("CONFLICTING_PRODUCTION_WORKFLOW")
    return {
        "conflictingProductionRuns": 0,
        "concurrencyGroup": SHARED_CONCURRENCY_GROUP,
    }


def verify_github_governance(
    http: HttpClient, expected_commit: str
) -> dict[str, Any]:
    require_first_run_attempt()
    token = require_env("BOTOLAGO_GITHUB_GOVERNANCE_TOKEN")
    repository = require_env("GITHUB_REPOSITORY")
    run_id = require_env("GITHUB_RUN_ID")
    required_reviewer_id = require_positive_integer(
        "BOTOLAGO_GITHUB_REQUIRED_REVIEWER_ID"
    )
    actor_id = require_positive_integer("GITHUB_ACTOR_ID")
    if (
        repository != EXPECTED_REPOSITORY
        or require_env("GITHUB_REF") != EXPECTED_GITHUB_REF
        or require_env("GITHUB_EVENT_NAME") != EXPECTED_GITHUB_EVENT
        or require_env("GITHUB_SHA") != expected_commit
    ):
        raise ActivationError("GITHUB_PR_GOVERNANCE_UNVERIFIED")
    return {
        "mainGovernance": verify_main_governance(
            http, token, repository
        ),
        "exactCommitReview": verify_exact_reviewed_commit(
            http,
            token,
            repository,
            expected_commit,
            required_reviewer_id,
            actor_id,
        ),
        "conflicts": verify_conflicting_runs(
            http, token, repository, run_id
        ),
        "result": "PASS",
    }


def format_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def create_run_approval_request(
    *,
    now: datetime | None = None,
    nonce: str | None = None,
) -> dict[str, Any]:
    run_attempt = require_first_run_attempt()
    requested_at = (now or datetime.now(timezone.utc)).astimezone(
        timezone.utc
    )
    repository = require_env("GITHUB_REPOSITORY")
    workflow = require_env("GITHUB_WORKFLOW")
    run_id = require_positive_integer("GITHUB_RUN_ID")
    commit = require_env("GITHUB_SHA")
    issue_number = require_positive_integer(
        "BOTOLAGO_PRODUCTION_APPROVAL_ISSUE_NUMBER"
    )
    required_reviewer_id = require_positive_integer(
        "BOTOLAGO_GITHUB_REQUIRED_REVIEWER_ID"
    )
    actor_id = require_positive_integer("GITHUB_ACTOR_ID")
    if (
        repository != EXPECTED_REPOSITORY
        or not re.fullmatch(r"[a-f0-9]{40}", commit)
    ):
        raise ActivationError("GITHUB_APPROVAL_ISSUE_UNVERIFIED")
    if required_reviewer_id == actor_id:
        raise ActivationError("GITHUB_RUN_SELF_APPROVAL_FORBIDDEN")
    approval_nonce = nonce or secrets.token_hex(16)
    if not re.fullmatch(r"[a-f0-9]{32,}", approval_nonce):
        raise ActivationError("GITHUB_RUN_APPROVAL_INVALID")
    expires_at = requested_at + timedelta(
        seconds=APPROVAL_WINDOW_SECONDS
    )
    expected_comment = (
        f"{APPROVAL_COMMENT_PREFIX} run_id={run_id} "
        f"run_attempt={run_attempt} commit={commit} "
        f"project_ref={EXPECTED_PROJECT_REF} nonce={approval_nonce}"
    )
    return {
        "repository": repository,
        "workflow": workflow,
        "runId": run_id,
        "runAttempt": run_attempt,
        "commit": commit,
        "projectRef": EXPECTED_PROJECT_REF,
        "issueNumber": issue_number,
        "requiredReviewerId": required_reviewer_id,
        "dispatcherId": actor_id,
        "nonce": approval_nonce,
        "requestedAt": format_timestamp(requested_at),
        "expiresAt": format_timestamp(expires_at),
        "expectedComment": expected_comment,
    }


def normalized_comment(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def validate_run_approval_request(request: dict[str, Any]) -> None:
    run_attempt = require_first_run_attempt()
    requested_at = parse_github_timestamp(request.get("requestedAt"))
    expires_at = parse_github_timestamp(request.get("expiresAt"))
    nonce = str(request.get("nonce") or "")
    expected_comment = (
        f"{APPROVAL_COMMENT_PREFIX} run_id={require_env('GITHUB_RUN_ID')} "
        f"run_attempt={require_env('GITHUB_RUN_ATTEMPT')} "
        f"commit={require_env('GITHUB_SHA')} "
        f"project_ref={EXPECTED_PROJECT_REF} nonce={nonce}"
    )
    expected = {
        "repository": require_env("GITHUB_REPOSITORY"),
        "workflow": require_env("GITHUB_WORKFLOW"),
        "runId": require_positive_integer("GITHUB_RUN_ID"),
        "runAttempt": run_attempt,
        "commit": require_env("GITHUB_SHA"),
        "projectRef": EXPECTED_PROJECT_REF,
        "issueNumber": require_positive_integer(
            "BOTOLAGO_PRODUCTION_APPROVAL_ISSUE_NUMBER"
        ),
        "requiredReviewerId": require_positive_integer(
            "BOTOLAGO_GITHUB_REQUIRED_REVIEWER_ID"
        ),
        "dispatcherId": require_positive_integer("GITHUB_ACTOR_ID"),
        "expectedComment": expected_comment,
    }
    if any(request.get(key) != value for key, value in expected.items()):
        raise ActivationError("GITHUB_RUN_APPROVAL_INVALID")
    if (
        expected["repository"] != EXPECTED_REPOSITORY
        or not re.fullmatch(r"[a-f0-9]{40}", str(expected["commit"]))
        or not re.fullmatch(r"[a-f0-9]{32,}", nonce)
        or expires_at <= requested_at
        or (expires_at - requested_at).total_seconds()
        > APPROVAL_WINDOW_SECONDS
    ):
        raise ActivationError("GITHUB_RUN_APPROVAL_INVALID")
    if expected["requiredReviewerId"] == expected["dispatcherId"]:
        raise ActivationError("GITHUB_RUN_SELF_APPROVAL_FORBIDDEN")


def wait_for_run_approval(
    http: HttpClient,
    request: dict[str, Any],
    *,
    now_fn: Callable[[], datetime] | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    validate_run_approval_request(request)
    token = require_env("BOTOLAGO_GITHUB_GOVERNANCE_TOKEN")
    repository = str(request["repository"])
    issue_number = int(request["issueNumber"])
    reviewer_id = int(request["requiredReviewerId"])
    dispatcher_id = int(request["dispatcherId"])
    requested_at = parse_github_timestamp(request["requestedAt"])
    expires_at = parse_github_timestamp(request["expiresAt"])
    clock = now_fn or (lambda: datetime.now(timezone.utc))
    if reviewer_id == dispatcher_id:
        raise ActivationError("GITHUB_RUN_SELF_APPROVAL_FORBIDDEN")

    issue_response = github_request(
        http, token, f"/repos/{repository}/issues/{issue_number}"
    )
    issue = github_response_json(
        issue_response, "GITHUB_APPROVAL_ISSUE_UNVERIFIED"
    )
    if (
        not isinstance(issue, dict)
        or issue.get("number") != issue_number
        or issue.get("state") != "open"
        or issue.get("pull_request") is not None
    ):
        raise ActivationError("GITHUB_APPROVAL_ISSUE_UNVERIFIED")

    expected = str(request["expectedComment"])
    while clock().astimezone(timezone.utc) <= expires_at:
        comments = github_list(
            http,
            token,
            f"/repos/{repository}/issues/{issue_number}/comments?"
            + urllib.parse.urlencode(
                {
                    "since": format_timestamp(requested_at),
                }
            ),
            "GITHUB_APPROVAL_ISSUE_UNVERIFIED",
        )
        for comment in comments:
            body = normalized_comment(comment.get("body"))
            created_at = parse_github_timestamp(comment.get("created_at"))
            if created_at <= requested_at:
                continue
            author = comment.get("user") or {}
            author_id = author.get("id")
            starts_approval = body.startswith(
                f"{APPROVAL_COMMENT_PREFIX} "
            )
            if body == expected:
                if author_id == dispatcher_id:
                    raise ActivationError(
                        "GITHUB_RUN_SELF_APPROVAL_FORBIDDEN"
                    )
                if (
                    author_id != reviewer_id
                    or author.get("type") != "User"
                    or "copilot"
                    in str(author.get("login") or "").lower()
                ):
                    raise ActivationError(
                        "GITHUB_RUN_APPROVER_MISMATCH"
                    )
                if created_at > expires_at:
                    raise ActivationError("GITHUB_RUN_APPROVAL_EXPIRED")
                updated_at = parse_github_timestamp(
                    comment.get("updated_at")
                )
                if updated_at != created_at:
                    raise ActivationError("GITHUB_RUN_APPROVAL_INVALID")
                return {
                    "commentIdHash": fingerprint(
                        str(comment.get("id"))
                    ),
                    "reviewerIdHash": fingerprint(str(reviewer_id)),
                    "approvalTimestamp": format_timestamp(created_at),
                    "runId": int(request["runId"]),
                    "runAttempt": int(request["runAttempt"]),
                    "commitPrefix": str(request["commit"])[:12],
                    "result": "PASS",
                }
            if starts_approval and author_id == reviewer_id:
                if created_at > expires_at:
                    raise ActivationError("GITHUB_RUN_APPROVAL_EXPIRED")
                raise ActivationError("GITHUB_RUN_APPROVAL_INVALID")
        remaining = (
            expires_at - clock().astimezone(timezone.utc)
        ).total_seconds()
        if remaining <= 0:
            break
        sleep_fn(min(APPROVAL_POLL_INTERVAL_SECONDS, remaining))
    raise ActivationError("GITHUB_RUN_APPROVAL_TIMEOUT")


def assert_management_target(client: ManagementClient) -> dict[str, Any]:
    project = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}")
    organizations = client.get("/v1/organizations")
    if not isinstance(project, dict):
        raise ActivationError("MANAGEMENT_PROJECT_RESPONSE_INVALID")
    returned_ref = project.get("ref") or project.get("id")
    if (
        returned_ref != EXPECTED_PROJECT_REF
        or project.get("name") != EXPECTED_PROJECT_NAME
        or project.get("region") != EXPECTED_REGION
        or project.get("status") != "ACTIVE_HEALTHY"
    ):
        raise ActivationError("MANAGEMENT_TARGET_GUARD_FAILED")
    organization_id = project.get("organization_id")
    organization_rows = (
        organizations
        if isinstance(organizations, list)
        else organizations.get("organizations", [])
    )
    if not organization_id or not any(
        row.get("id") == organization_id for row in organization_rows
    ):
        raise ActivationError("MANAGEMENT_OWNERSHIP_GUARD_FAILED")
    backups = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/database/backups")
    completed = [
        row
        for row in backups.get("backups", [])
        if isinstance(row, dict) and row.get("status") == "COMPLETED"
    ]
    if not completed:
        raise ActivationError("BACKUP_READINESS_INSUFFICIENT")
    if backups.get("walg_enabled") is not True:
        raise ActivationError("WALG_STATE_UNVERIFIED")
    functions = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/functions")
    if functions:
        raise ActivationError("EDGE_FUNCTION_STATE_ACTIVE")
    return {
        "ref": returned_ref,
        "name": project.get("name"),
        "region": project.get("region"),
        "status": project.get("status"),
        "databaseVersion": (project.get("database") or {}).get("version"),
        "latestCompletedBackup": max(
            row.get("inserted_at", "") for row in completed
        ),
        "walGEnabled": True,
        "pitrState": "ENABLED"
        if backups.get("pitr_enabled")
        else "DISABLED_ACCEPTED",
        "edgeFunctionCount": 0,
    }


INVARIANT_SQL = """
select jsonb_build_object(
  'canonicalTableCount', (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('app','app_private') and c.relkind in ('r','p')),
  'forcedRlsCount', (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('app','app_private') and c.relkind in ('r','p') and c.relrowsecurity and c.relforcerowsecurity),
  'nonForcedTableCount', (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('app','app_private') and c.relkind in ('r','p') and (not c.relrowsecurity or not c.relforcerowsecurity)),
  'cronJobCount', case when to_regclass('cron.job') is null then 0 else (select count(*)::integer from cron.job) end,
  'missingProfileCount', (select count(*)::integer from auth.users u left join app.profiles p on p.id=u.id where p.id is null),
  'missingPreferenceCount', (select count(*)::integer from auth.users u left join app.user_preferences p on p.user_id=u.id where p.user_id is null),
  'orphanProfileCount', (select count(*)::integer from app.profiles p left join auth.users u on u.id=p.id where u.id is null),
  'identityTriggerCount', (select count(*)::integer from pg_trigger where tgrelid='auth.users'::regclass and tgname='botolago_v2_auth_user_created' and not tgisinternal),
  'staffPrincipalCount', (select count(*)::integer from app_private.staff_principals),
  'activePlatformAdminCount', (select count(*)::integer from app_private.staff_role_assignments a join app_private.admin_roles r on r.id=a.role_id where r.name='platform_admin' and a.status='active' and a.starts_at<=statement_timestamp() and (a.expires_at is null or a.expires_at>statement_timestamp())),
  'ownerBootstrapAuditCount', (select count(*)::integer from app_private.admin_audit_events where action='security.bootstrap_platform_admin' and outcome='succeeded'),
  'pendingPrivilegedApprovalCount', (select count(*)::integer from app_private.admin_approval_requests where status='pending'),
  'footballActiveRunCount', (select count(*)::integer from app_private.football_ingestion_runs where status in ('pending','running')),
  'newsActiveRunCount', (select count(*)::integer from app_private.news_ingestion_runs where status in ('pending','running')),
  'notificationActiveRunCount', (select count(*)::integer from app_private.notification_fanout_runs where status in ('pending','processing')),
  'notificationActiveScheduleCount', (select count(*)::integer from app_private.notification_schedules where status in ('scheduled','claimed','retry_scheduled')),
  'fantasyActiveRunCount', (select count(*)::integer from app_private.fantasy_job_runs where status in ('pending','running')),
  'adminActiveWorkerCount', (select count(*)::integer from app_private.admin_worker_runs where status='running'),
  'adminPendingRevocationCount', (select count(*)::integer from app_private.staff_session_revocation_requests where status in ('pending','processing','failed')),
  'realtimeApiPublicationCount', (select count(*)::integer from pg_publication_tables where pubname='supabase_realtime' and schemaname='api' and tablename='live_fixture_updates')
) as invariant
""".strip()


def collect_invariants(client: ManagementClient) -> dict[str, Any]:
    rows = client.query(INVARIANT_SQL, read_only=True)
    if not rows or not isinstance(rows[0].get("invariant"), dict):
        raise ActivationError("RUNTIME_INVARIANT_QUERY_INVALID")
    value = rows[0]["invariant"]
    expected = {
        "canonicalTableCount": EXPECTED_CANONICAL_TABLE_COUNT,
        "forcedRlsCount": EXPECTED_CANONICAL_TABLE_COUNT,
        "nonForcedTableCount": 0,
        "cronJobCount": 0,
        "missingProfileCount": 0,
        "missingPreferenceCount": 0,
        "orphanProfileCount": 0,
        "identityTriggerCount": 1,
        "staffPrincipalCount": 0,
        "activePlatformAdminCount": 0,
        "ownerBootstrapAuditCount": 0,
        "pendingPrivilegedApprovalCount": 0,
        "footballActiveRunCount": 0,
        "newsActiveRunCount": 0,
        "notificationActiveRunCount": 0,
        "notificationActiveScheduleCount": 0,
        "fantasyActiveRunCount": 0,
        "adminActiveWorkerCount": 0,
        "adminPendingRevocationCount": 0,
        "realtimeApiPublicationCount": 1,
    }
    for key, expected_value in expected.items():
        if value.get(key) != expected_value:
            raise ActivationError("RUNTIME_INVARIANT_FAILED", key)
    value["workersMeasured"] = True
    value["schedulesMeasured"] = True
    return value


def assert_migration_parity(
    client: ManagementClient, repo_root: Path
) -> dict[str, Any]:
    promoter = load_promoter(repo_root)
    migrations = promoter.load_migrations(repo_root)
    history = promoter.read_history(client)
    completed = promoter.assert_history("admin", history, migrations)
    if (
        len(history) != EXPECTED_MIGRATION_COUNT
        or completed != len(promoter.BATCHES["admin"])
    ):
        raise ActivationError("MIGRATION_PARITY_FAILED")
    return {"historyCount": len(history), "checksumParity": "EXACT"}


def load_expected_manifest(repo_root: Path) -> tuple[dict[str, Any], str]:
    path = repo_root / "scripts/backend/phase7f-api-surface-manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise ActivationError("API_MANIFEST_INVALID") from exc
    digest = hashlib.sha256(canonical_json(manifest).encode()).hexdigest()
    return manifest, digest


def validate_manifest_security(manifest: dict[str, Any]) -> None:
    schemas = {row["schema_name"]: row for row in manifest["schemas"]}
    if schemas["app"]["role_privileges"]["authenticatedUsage"] is not True:
        raise ActivationError("CANONICAL_APP_USAGE_MISSING")
    if (
        schemas["app"]["role_privileges"]["anonUsage"]
        or schemas["app_private"]["role_privileges"]["anonUsage"]
        or schemas["app_private"]["role_privileges"]["authenticatedUsage"]
    ):
        raise ActivationError("CANONICAL_SCHEMA_PRIVILEGE_UNSAFE")
    forbidden = {
        "INSERT",
        "UPDATE",
        "DELETE",
        "TRUNCATE",
        "TRIGGER",
        "REFERENCES",
    }
    if any(
        row["privilege"] in forbidden
        for row in manifest["browserRelationPrivileges"]
    ):
        raise ActivationError("CANONICAL_BROWSER_WRITE_GRANT")
    if any(not row["forceRowSecurity"] for row in manifest["canonicalTables"]):
        raise ActivationError("CANONICAL_FORCE_RLS_MISSING")
    for routine in manifest["apiRoutines"]:
        grantees = {grant["grantee"] for grant in routine["grants"]}
        if "PUBLIC" in grantees:
            raise ActivationError("CANONICAL_PUBLIC_EXECUTE_GRANT")
        if routine["security_definer"] and 'search_path=""' not in routine[
            "configuration"
        ]:
            raise ActivationError("CANONICAL_DEFINER_SEARCH_PATH_UNSAFE")


def assert_api_manifest(
    client: ManagementClient, repo_root: Path
) -> dict[str, Any]:
    expected, expected_digest = load_expected_manifest(repo_root)
    validate_manifest_security(expected)
    sql = (
        repo_root / "scripts/backend/phase7f-api-surface-manifest.sql"
    ).read_text(encoding="utf-8")
    rows = client.query(sql, read_only=True, timeout=90)
    if len(rows) != 1 or not isinstance(rows[0].get("manifest"), dict):
        raise ActivationError("API_MANIFEST_QUERY_INVALID")
    actual = rows[0]["manifest"]
    if canonical_json(actual) != canonical_json(expected):
        raise ActivationError("API_MANIFEST_DRIFT")
    return {
        "manifestVersion": expected["manifestVersion"],
        "manifestSha256": expected_digest,
        "apiRelationCount": len(expected["apiRelations"]),
        "apiRoutineCount": len(expected["apiRoutines"]),
        "canonicalPolicyCount": len(expected["canonicalPolicies"]),
        "canonicalTableCount": len(expected["canonicalTables"]),
        "result": "EXACT_MATCH",
    }


def validate_smoke_user(
    client: ManagementClient, smoke_user_id: str
) -> dict[str, Any]:
    quoted = str(uuid.UUID(smoke_user_id))
    rows = client.query(
        f"""
select
  users.id::text as id,
  users.email,
  (users.email_confirmed_at is not null) as email_verified,
  (users.banned_until is not null and users.banned_until > statement_timestamp()) as banned,
  (users.deleted_at is not null) as deleted,
  (select count(*)::integer from app.profiles where id=users.id) as profile_count,
  (select count(*)::integer from app_private.staff_principals where auth_user_id=users.id) as staff_count,
  (select count(*)::integer from app_private.staff_role_assignments a join app_private.staff_principals s on s.id=a.staff_principal_id where s.auth_user_id=users.id and a.status='active') as role_count,
  (select count(*)::integer from app_private.admin_approval_requests a join app_private.staff_principals s on s.id=a.requester_principal_id where s.auth_user_id=users.id and a.status='pending') as pending_approval_count,
  (select count(*)::integer from auth.mfa_factors where user_id=users.id and status::text='verified') as verified_factor_count,
  (select count(*)::integer from auth.sessions where user_id=users.id) as baseline_session_count
from auth.users users
where users.id='{quoted}'::uuid
""".strip(),
        read_only=True,
    )
    if len(rows) != 1 or rows[0].get("id") != quoted:
        raise ActivationError("APPROVED_SMOKE_USER_NOT_FOUND")
    row = rows[0]
    if not row.get("email_verified") or row.get("banned") or row.get("deleted"):
        raise ActivationError("APPROVED_SMOKE_USER_DISABLED")
    for field, code in (
        ("profile_count", "APPROVED_SMOKE_PROFILE_INVALID"),
        ("staff_count", "APPROVED_SMOKE_USER_STAFF_LINKED"),
        ("role_count", "APPROVED_SMOKE_USER_HAS_ROLE"),
        ("pending_approval_count", "APPROVED_SMOKE_USER_HAS_APPROVAL"),
    ):
        expected = 1 if field == "profile_count" else 0
        if int(row.get(field) or 0) != expected:
            raise ActivationError(code)
    if int(row.get("verified_factor_count") or 0) < 1:
        raise ActivationError("AAL2_SMOKE_FACTOR_MISSING")
    return {
        "id": quoted,
        "email": str(row["email"]),
        "fingerprint": fingerprint(quoted),
        "baselineSessionCount": int(row.get("baseline_session_count") or 0),
        "verifiedMfaFactorCount": int(row.get("verified_factor_count") or 0),
    }


def read_postgrest_config(client: ManagementClient) -> dict[str, Any]:
    value = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/postgrest")
    if not isinstance(value, dict):
        raise ActivationError("POSTGREST_CONFIG_RESPONSE_INVALID")
    return {
        "db_schema": str(value.get("db_schema") or ""),
        "db_extra_search_path": str(
            value.get("db_extra_search_path") or ""
        ),
        "max_rows": value.get("max_rows"),
        "db_pool": value.get("db_pool"),
        "db_pool_acquisition_timeout": value.get(
            "db_pool_acquisition_timeout"
        ),
    }


def get_postgrest_config(client: ManagementClient) -> dict[str, Any]:
    value = read_postgrest_config(client)
    if normalize_csv(value.get("db_schema")) not in ALLOWED_INITIAL_SCHEMA_SETS:
        raise ActivationError("POSTGREST_CONFIG_UNEXPECTED")
    return value


def set_postgrest_config(
    client: ManagementClient, db_schema: str, extra_search_path: str
) -> None:
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
            and normalize_csv(config["db_extra_search_path"])
            == expected_extra_search_path
        ):
            return config
        time.sleep(5)
    raise ActivationError("POSTGREST_CONVERGENCE_TIMEOUT")


def classify_effective_config(
    current: dict[str, Any] | None, previous: dict[str, Any]
) -> str:
    if current is None:
        return "UNVERIFIED"
    current_pair = (
        normalize_csv(current["db_schema"]),
        normalize_csv(current["db_extra_search_path"]),
    )
    previous_pair = (
        normalize_csv(previous["db_schema"]),
        normalize_csv(previous["db_extra_search_path"]),
    )
    if current_pair == previous_pair:
        return "UNCHANGED"
    if current_pair == (
        (TARGET_DB_SCHEMA,),
        (TARGET_EXTRA_SEARCH_PATH,),
    ):
        return "INTENDED_ACTIVATION_APPLIED"
    return "UNEXPECTED_CONFIGURATION"


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
        "reasonCode": sanitize(reason, 100),
        "restored": restored,
        "result": "FAILED_ROLLED_BACK",
    }
    write_json(evidence_dir / "rollback.json", evidence)
    return evidence


def recover_from_state(
    client: ManagementClient,
    journal: StateJournal,
    evidence_dir: Path,
    *,
    preserve_pending_activation: bool = False,
) -> dict[str, Any]:
    state = journal.read()
    preserved_verdict = (
        state["verdict"]
        if state["verdict"] in {"SESSION_CLEANUP_FAILED", "EVIDENCE_FAILURE"}
        else None
    )
    if state["verdict"] == "PASS":
        return {"result": "PASS", "recoveryAction": "NONE"}
    if (
        state["verdict"] == "EVIDENCE_FAILURE"
        and state["rollbackVerified"]
    ):
        return {
            "result": "EVIDENCE_FAILURE",
            "recoveryAction": "ROLLBACK_ALREADY_VERIFIED",
        }
    previous = {
        "db_schema": state["previousDbSchema"],
        "db_extra_search_path": state["previousDbExtraSearchPath"],
    }
    try:
        current = read_postgrest_config(client)
    except Exception:
        journal.update(verdict="ACTIVATION_STATE_AMBIGUOUS")
        raise ActivationError("ACTIVATION_STATE_AMBIGUOUS")
    classification = classify_effective_config(current, previous)
    if (
        preserve_pending_activation
        and state["verdict"] == "ACTIVATED_PENDING_TESTS"
        and classification == "INTENDED_ACTIVATION_APPLIED"
    ):
        return {
            "result": "ACTIVATED_PENDING_TESTS",
            "recoveryAction": "EFFECTIVE_STATE_VERIFIED",
        }
    if classification == "UNCHANGED":
        state = journal.update(
            rollbackRequired=False,
            rollbackVerified=True,
            verdict=preserved_verdict
            or (
                "FAILED_ROLLED_BACK"
                if state["mutationAttempted"]
                else "FAILED_BEFORE_MUTATION"
            ),
        )
        write_json(evidence_dir / "recovery.json", {
            "configurationClassification": classification,
            "result": state["verdict"],
        })
        return state
    if classification in (
        "INTENDED_ACTIVATION_APPLIED",
        "UNEXPECTED_CONFIGURATION",
    ):
        journal.update(rollbackRequired=True, rollbackAttempted=True)
        try:
            rollback(
                client,
                previous,
                evidence_dir,
                "INDEPENDENT_RECOVERY",
            )
        except AmbiguousMutation as exc:
            try:
                verified = read_postgrest_config(client)
            except Exception as verify_error:
                journal.update(
                    rollbackVerified=False,
                    verdict="ROLLBACK_FAILED",
                )
                raise ActivationError(
                    "ROLLBACK_FAILED", verify_error
                ) from verify_error
            if classify_effective_config(verified, previous) != "UNCHANGED":
                journal.update(
                    rollbackVerified=False,
                    verdict="ROLLBACK_FAILED",
                )
                raise ActivationError("ROLLBACK_FAILED", exc) from exc
            write_json(
                evidence_dir / "rollback.json",
                {
                    "timestampUtc": utc_now(),
                    "reasonCode": "AMBIGUOUS_RESPONSE_VERIFIED",
                    "restored": verified,
                    "result": "FAILED_ROLLED_BACK",
                },
            )
        except Exception as exc:
            journal.update(
                rollbackVerified=False,
                verdict="ROLLBACK_FAILED",
            )
            raise ActivationError("ROLLBACK_FAILED", exc) from exc
        state = journal.update(
            rollbackRequired=False,
            rollbackVerified=True,
            verdict=preserved_verdict or "FAILED_ROLLED_BACK",
        )
        return state
    journal.update(verdict="ACTIVATION_STATE_AMBIGUOUS")
    raise ActivationError("ACTIVATION_STATE_AMBIGUOUS")


def get_publishable_key(client: ManagementClient) -> str:
    keys = client.get(f"/v1/projects/{EXPECTED_PROJECT_REF}/api-keys?reveal=true")
    if not isinstance(keys, list):
        raise ActivationError("PUBLISHABLE_KEY_INVENTORY_INVALID")
    values = [
        str(row.get("api_key") or "")
        for row in keys
        if isinstance(row, dict) and row.get("type") == "publishable"
    ]
    if len(values) != 1 or not values[0].startswith("sb_publishable_"):
        raise ActivationError("PUBLISHABLE_KEY_INVENTORY_INVALID")
    return values[0]


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
    mutation: bool = False,
) -> HttpResult:
    headers = {"apikey": api_key}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    if schema:
        headers["Accept-Profile"] = schema
        headers["Content-Profile"] = schema
    return http.request(
        method,
        f"{project_url}{path}",
        headers=headers,
        payload=payload,
        mutation=mutation,
    )


def decode_jwt_claims(token: str) -> dict[str, Any]:
    try:
        encoded = token.split(".")[1]
        encoded += "=" * (-len(encoded) % 4)
        value = json.loads(base64.urlsafe_b64decode(encoded))
    except Exception as exc:
        raise ActivationError("SESSION_TOKEN_CLAIMS_INVALID") from exc
    if not isinstance(value, dict):
        raise ActivationError("SESSION_TOKEN_CLAIMS_INVALID")
    return value


def record_case(
    cases: list[dict[str, Any]],
    name: str,
    actor: str,
    category: str,
    result: HttpResult,
    expected_status: int,
    expected_code: str | None,
    *,
    expected_rows: int | None = None,
) -> Any:
    parsed: Any = None
    if result.body and "json" in result.content_type.lower():
        parsed = result.json()
    actual_code = stable_result_code(result) if result.status >= 400 else None
    row_count = len(parsed) if isinstance(parsed, list) else None
    passed = result.status == expected_status and actual_code == expected_code
    if expected_rows is not None:
        passed = passed and row_count == expected_rows
    cases.append(
        {
            "case": name,
            "actorClass": actor,
            "requestCategory": category,
            "expectedStatus": expected_status,
            "expectedErrorCode": expected_code,
            "actualStatus": result.status,
            "actualErrorCode": actual_code,
            "rowCount": row_count,
            "result": "PASS" if passed else "FAIL",
        }
    )
    if not passed:
        raise ActivationError("SMOKE_CASE_FAILED", name)
    return parsed


def mint_session(
    http: HttpClient,
    project_url: str,
    secret_key: str,
    publishable_key: str,
    email: str,
) -> tuple[str, str]:
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
        raise ActivationError(stable_result_code(link))
    parsed_link = link.json()
    properties = (
        parsed_link.get("properties") or {}
        if isinstance(parsed_link, dict)
        else {}
    )
    token_hash = properties.get("hashed_token")
    if not token_hash:
        raise ActivationError("SESSION_LINK_RESPONSE_INVALID")
    verified = project_request(
        http,
        project_url,
        "POST",
        "/auth/v1/verify",
        api_key=publishable_key,
        payload={"type": "magiclink", "token_hash": token_hash},
        mutation=True,
    )
    if verified.status != 200:
        raise ActivationError(stable_result_code(verified))
    session = verified.json()
    if not isinstance(session, dict) or not session.get("access_token"):
        raise ActivationError("SESSION_RESPONSE_INVALID")
    access_token = str(session["access_token"])
    claims = decode_jwt_claims(access_token)
    session_id = str(claims.get("session_id") or "")
    try:
        uuid.UUID(session_id)
    except ValueError as exc:
        raise ActivationError("SESSION_IDENTIFIER_MISSING") from exc
    return access_token, session_id


def session_exists(client: ManagementClient, session_id: str) -> bool:
    value = str(uuid.UUID(session_id))
    rows = client.query(
        f"select exists(select 1 from auth.sessions where id='{value}'::uuid) as present",
        read_only=True,
    )
    return bool(rows and rows[0].get("present"))


def session_count(client: ManagementClient, user_id: str) -> int:
    value = str(uuid.UUID(user_id))
    rows = client.query(
        f"select count(*)::integer as count from auth.sessions "
        f"where user_id='{value}'::uuid",
        read_only=True,
    )
    if len(rows) != 1:
        raise ActivationError("SESSION_INVENTORY_INVALID")
    return int(rows[0].get("count") or 0)


def revoke_session(
    http: HttpClient,
    client: ManagementClient,
    project_url: str,
    publishable_key: str,
    access_token: str,
    session_id: str,
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
        fallback = project_request(
            http,
            project_url,
            "POST",
            "/auth/v1/logout?scope=global",
            api_key=publishable_key,
            access_token=access_token,
        )
        if fallback.status not in (200, 204):
            raise ActivationError("SESSION_ADMIN_CLEANUP_FAILED")
    for _ in range(6):
        if not session_exists(client, session_id):
            return
        time.sleep(2)
    raise ActivationError("SESSION_RESIDUAL_VERIFICATION_FAILED")


def fallback_revoke_all_smoke_sessions(
    http: HttpClient,
    client: ManagementClient,
    project_url: str,
    secret_key: str,
    publishable_key: str,
    user_id: str,
    email: str,
) -> None:
    """Use a supported Auth session to globally revoke an ambiguous session."""

    cleanup_token, _cleanup_session_id = mint_session(
        http, project_url, secret_key, publishable_key, email
    )
    result = project_request(
        http,
        project_url,
        "POST",
        "/auth/v1/logout?scope=global",
        api_key=publishable_key,
        access_token=cleanup_token,
    )
    if result.status not in (200, 204):
        raise ActivationError("SESSION_ADMIN_CLEANUP_FAILED")
    for _ in range(6):
        if session_count(client, user_id) == 0:
            return
        time.sleep(2)
    raise ActivationError("SESSION_RESIDUAL_VERIFICATION_FAILED")


def verify_aal2_token(token: str, smoke_user_id: str) -> None:
    claims = decode_jwt_claims(token)
    if claims.get("sub") != smoke_user_id or claims.get("aal") != "aal2":
        raise ActivationError("AAL2_SESSION_PREREQUISITE_INVALID")


def verify_aal2_runtime_session(
    http: HttpClient,
    client: ManagementClient,
    project_url: str,
    aal2_token: str,
    smoke_user_id: str,
) -> dict[str, Any]:
    verify_aal2_token(aal2_token, smoke_user_id)
    publishable_key = get_publishable_key(client)
    result = project_request(
        http,
        project_url,
        "GET",
        "/auth/v1/user",
        api_key=publishable_key,
        access_token=aal2_token,
    )
    if result.status != 200:
        raise ActivationError("AAL2_SESSION_PREREQUISITE_INVALID")
    user = result.json()
    claims = decode_jwt_claims(aal2_token)
    session_id = str(claims.get("session_id") or "")
    if (
        not isinstance(user, dict)
        or user.get("id") != smoke_user_id
        or not session_exists(client, session_id)
    ):
        raise ActivationError("AAL2_SESSION_PREREQUISITE_INVALID")
    return {
        "actorFingerprint": fingerprint(smoke_user_id),
        "sessionFingerprint": fingerprint(session_id),
        "assuranceLevel": "aal2",
        "activeSessionVerified": True,
    }


def run_smoke(
    http: HttpClient,
    client: ManagementClient,
    project_url: str,
    secret_key: str,
    smoke_user: dict[str, Any],
    aal2_token: str,
) -> dict[str, Any]:
    publishable_key = get_publishable_key(client)
    user_id = smoke_user["id"]
    verify_aal2_token(aal2_token, user_id)
    cases: list[dict[str, Any]] = []
    access_token: str | None = None
    session_id: str | None = None
    cleanup_verified = False

    def request(
        method: str,
        path: str,
        *,
        actor_token: str | None = None,
        schema: str = "api",
        payload: dict[str, Any] | None = None,
    ) -> HttpResult:
        return project_request(
            http,
            project_url,
            method,
            path,
            api_key=publishable_key,
            access_token=actor_token,
            schema=schema,
            payload=payload,
        )

    try:
        record_case(
            cases,
            "anon_my_profile_rejected",
            "ANONYMOUS",
            "PROFILE_READ",
            request("GET", "/rest/v1/my_profile?select=*"),
            401,
            "42501",
        )
        record_case(
            cases,
            "anon_profile_mutation_rejected",
            "ANONYMOUS",
            "PROFILE_MUTATION",
            request(
                "PATCH",
                "/rest/v1/my_profile?id=not.is.null",
                payload={"display_name": "denied"},
            ),
            401,
            "42501",
        )
        for name, path, schema in (
            ("anon_app_unexposed", "/rest/v1/profiles?select=id&limit=1", "app"),
            (
                "anon_app_private_unexposed",
                "/rest/v1/staff_principals?select=id&limit=1",
                "app_private",
            ),
        ):
            record_case(
                cases,
                name,
                "ANONYMOUS",
                "SCHEMA_BOUNDARY",
                request("GET", path, schema=schema),
                406,
                "PGRST106",
            )
        record_case(
            cases,
            "anon_staff_context_rejected",
            "ANONYMOUS",
            "ADMIN_RPC",
            request("POST", "/rest/v1/rpc/get_my_staff_context", payload={}),
            401,
            "PT401",
        )
        record_case(
            cases,
            "anon_owner_bootstrap_rejected",
            "ANONYMOUS",
            "BOOTSTRAP_RPC",
            request(
                "POST",
                "/rest/v1/rpc/admin_bootstrap_first_platform_admin",
                payload={
                    "p_auth_user_id": user_id,
                    "p_reason": "Gate One denial probe",
                    "p_synthetic_test": False,
                },
            ),
            404,
            "PGRST202",
        )
        record_case(
            cases,
            "anon_role_assignment_rejected",
            "ANONYMOUS",
            "ADMIN_RPC",
            request(
                "POST",
                "/rest/v1/rpc/admin_assign_role",
                payload={
                    "p_target_auth_user_id": user_id,
                    "p_role_name": "platform_admin",
                    "p_expires_at": None,
                    "p_reason": "Gate One denial probe",
                    "p_reference": "gate-one",
                    "p_idempotency_key": str(uuid.uuid4()),
                    "p_approval_id": None,
                },
            ),
            404,
            "PGRST202",
        )
        record_case(
            cases,
            "anon_approval_rejected",
            "ANONYMOUS",
            "ADMIN_RPC",
            request(
                "POST",
                "/rest/v1/rpc/admin_request_approval",
                payload={
                    "p_required_permission": "security.manage_staff",
                    "p_target_domain": "security",
                    "p_target_entity_id": user_id,
                    "p_operation_type": "staff.assign_platform_admin",
                    "p_safe_payload_reference": {},
                    "p_reason": "Gate One denial probe",
                    "p_expires_at": utc_now(),
                    "p_idempotency_key": str(uuid.uuid4()),
                },
            ),
            404,
            "PGRST202",
        )
        record_case(
            cases,
            "malformed_token_rejected",
            "MALFORMED_TOKEN",
            "PROFILE_READ",
            request(
                "GET",
                "/rest/v1/my_profile?select=*",
                actor_token="invalid.activation.token",
            ),
            401,
            "PGRST301",
        )
        record_case(
            cases,
            "graphql_schema_removed",
            "ANONYMOUS",
            "GRAPHQL",
            project_request(
                http,
                project_url,
                "POST",
                "/graphql/v1",
                api_key=publishable_key,
                payload={"query": "query GateOne { __typename }"},
            ),
            404,
            "PGRST202",
        )

        access_token, session_id = mint_session(
            http,
            project_url,
            secret_key,
            publishable_key,
            smoke_user["email"],
        )
        claims = decode_jwt_claims(access_token)
        if claims.get("sub") != user_id or claims.get("aal") != "aal1":
            raise ActivationError("AAL1_SESSION_IDENTITY_INVALID")
        profile = record_case(
            cases,
            "ordinary_reads_own_profile",
            "AUTHENTICATED_AAL1",
            "PROFILE_READ",
            request(
                "GET",
                "/rest/v1/my_profile?select=*",
                actor_token=access_token,
            ),
            200,
            None,
            expected_rows=1,
        )
        if not isinstance(profile, list) or str(profile[0].get("id")) != user_id:
            raise ActivationError("SMOKE_PROFILE_IDENTITY_MISMATCH")
        other = str(uuid.uuid4())
        record_case(
            cases,
            "ordinary_cannot_read_other_profile",
            "AUTHENTICATED_AAL1",
            "PROFILE_ISOLATION",
            request(
                "GET",
                f"/rest/v1/my_profile?select=*&id=eq.{other}",
                actor_token=access_token,
            ),
            200,
            None,
            expected_rows=0,
        )
        record_case(
            cases,
            "ordinary_profile_mutation_rejected",
            "AUTHENTICATED_AAL1",
            "PROFILE_MUTATION",
            request(
                "PATCH",
                f"/rest/v1/my_profile?id=eq.{other}",
                actor_token=access_token,
                payload={"display_name": "denied"},
            ),
            403,
            "42501",
        )
        for actor, token in (
            ("AUTHENTICATED_AAL1", access_token),
            ("AUTHENTICATED_AAL2_NON_STAFF", aal2_token),
        ):
            for name, path, payload in (
                (
                    "staff_context",
                    "/rest/v1/rpc/get_my_staff_context",
                    {},
                ),
                (
                    "role_assignment",
                    "/rest/v1/rpc/admin_assign_role",
                    {
                        "p_target_auth_user_id": other,
                        "p_role_name": "platform_admin",
                        "p_expires_at": None,
                        "p_reason": "denial probe",
                        "p_reference": "gate-one",
                        "p_idempotency_key": str(uuid.uuid4()),
                        "p_approval_id": None,
                    },
                ),
                (
                    "approval",
                    "/rest/v1/rpc/admin_request_approval",
                    {
                        "p_required_permission": "security.manage_staff",
                        "p_target_domain": "security",
                        "p_target_entity_id": other,
                        "p_operation_type": "staff.assign_platform_admin",
                        "p_safe_payload_reference": {},
                        "p_reason": "Gate One denial probe",
                        "p_expires_at": utc_now(),
                        "p_idempotency_key": str(uuid.uuid4()),
                    },
                ),
            ):
                record_case(
                    cases,
                    f"{actor.lower()}_{name}_rejected",
                    actor,
                    "ADMIN_RPC",
                    request("POST", path, actor_token=token, payload=payload),
                    403,
                    "PT403",
                )
            record_case(
                cases,
                f"{actor.lower()}_bootstrap_rejected",
                actor,
                "BOOTSTRAP_RPC",
                request(
                    "POST",
                    "/rest/v1/rpc/admin_bootstrap_first_platform_admin",
                    actor_token=token,
                    payload={
                        "p_auth_user_id": user_id,
                        "p_reason": "Gate One denial probe",
                        "p_synthetic_test": False,
                    },
                ),
                404,
                "PGRST202",
            )
    except (AmbiguousMutation, SignalAbort) as exc:
        try:
            fallback_revoke_all_smoke_sessions(
                http,
                client,
                project_url,
                secret_key,
                publishable_key,
                user_id,
                smoke_user["email"],
            )
            cleanup_verified = True
            access_token = None
            session_id = None
        except Exception as cleanup_error:
            raise ActivationError(
                "SESSION_CLEANUP_FAILED", cleanup_error
            ) from cleanup_error
        if isinstance(exc, SignalAbort):
            raise
        raise ActivationError("SESSION_CREATION_AMBIGUOUS") from exc
    finally:
        if access_token and session_id:
            try:
                revoke_session(
                    http,
                    client,
                    project_url,
                    publishable_key,
                    access_token,
                    session_id,
                )
                cleanup_verified = True
            except Exception as exc:
                raise ActivationError("SESSION_CLEANUP_FAILED", exc) from exc
    if not cleanup_verified:
        raise ActivationError("SESSION_CLEANUP_FAILED")
    return {
        "actorFingerprint": smoke_user["fingerprint"],
        "approvedImmutableUser": True,
        "newAuthUsersCreated": 0,
        "temporarySessionIdHash": fingerprint(session_id or ""),
        "temporarySessionCleanupVerified": True,
        "aal2NonStaffPrerequisiteVerified": True,
        "caseCount": len(cases),
        "cases": cases,
    }


def query_logs(
    client: ManagementClient, started_at: str, completed_at: str
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
            "sql": sql.replace(
                "{started:String}", f"'{started_at}'"
            ).replace("{completed:String}", f"'{completed_at}'"),
            "iso_timestamp_start": started_at,
            "iso_timestamp_end": completed_at,
        }
    )
    response = client.get(
        f"/v1/projects/{EXPECTED_PROJECT_REF}/analytics/endpoints/logs?{params}"
    )
    if not isinstance(response, dict) or response.get("error"):
        raise ActivationError("LOG_QUERY_FAILED")
    rows = response.get("result", [])
    if not isinstance(rows, list):
        raise ActivationError("LOG_QUERY_FAILED")
    total = sum(
        int(row.get("event_count") or 0)
        for row in rows
        if isinstance(row, dict)
    )
    return {
        "queryOutcome": "QUERIED_ZERO" if total == 0 else "QUERIED_NONZERO",
        "errorEventCount": total,
        "sources": [
            {
                "source": sanitize(row.get("source_name") or "unknown", 80),
                "count": int(row.get("event_count") or 0),
            }
            for row in rows
            if isinstance(row, dict)
        ],
    }


def preflight(
    client: ManagementClient,
    repo_root: Path,
    smoke_user_id: str,
) -> dict[str, Any]:
    return {
        "timestampUtc": utc_now(),
        "target": assert_management_target(client),
        "migrations": assert_migration_parity(client, repo_root),
        "apiSurface": assert_api_manifest(client, repo_root),
        "runtime": collect_invariants(client),
        "smokeUser": {
            key: value
            for key, value in validate_smoke_user(
                client, smoke_user_id
            ).items()
            if key not in {"id", "email"}
        },
        "postgrest": get_postgrest_config(client),
        "dependencyAudit": assert_repository_dependencies(repo_root),
        "result": "PASS",
    }


def run(args: argparse.Namespace) -> None:
    repo_root = Path(args.repo_root).resolve()
    evidence_dir = Path(args.evidence_dir).resolve()
    state_path = Path(args.state_file).resolve()
    if args.confirmation != EXPECTED_CONFIRMATION:
        raise ActivationError("CONFIRMATION_INVALID")
    token, secret_key, project_url, smoke_user_id, aal2_token = (
        assert_environment(args.expected_commit, repo_root)
    )
    http = HttpClient()
    client = ManagementClient(http, token)
    journal = StateJournal(state_path)
    started_at = utc_now()
    try:
        preflight_value = preflight(client, repo_root, smoke_user_id)
        preflight_value["aal2Prerequisite"] = verify_aal2_runtime_session(
            http,
            client,
            project_url,
            aal2_token,
            smoke_user_id,
        )
        write_json(evidence_dir / "preflight.json", preflight_value)
        previous = preflight_value["postgrest"]
        journal.create(
            project_ref=EXPECTED_PROJECT_REF,
            commit=args.expected_commit,
            run_id=os.environ.get("GITHUB_RUN_ID", "local"),
            previous=previous,
        )
        already_active = normalize_csv(previous["db_schema"]) == (
            TARGET_DB_SCHEMA,
        )
        if not already_active:
            journal.update(
                mutationAttempted=True,
                rollbackRequired=True,
                verdict="MUTATION_IN_PROGRESS",
            )
            try:
                set_postgrest_config(
                    client, TARGET_DB_SCHEMA, TARGET_EXTRA_SEARCH_PATH
                )
            except AmbiguousMutation:
                current: dict[str, Any] | None
                try:
                    current = read_postgrest_config(client)
                except Exception:
                    current = None
                classification = classify_effective_config(current, previous)
                if classification == "INTENDED_ACTIVATION_APPLIED":
                    journal.update(mutationConfirmed=True)
                else:
                    raise ActivationError(
                        "ACTIVATION_STATE_AMBIGUOUS", classification
                    )
            else:
                journal.update(mutationConfirmed=True)
        effective = wait_for_postgrest(
            client,
            (TARGET_DB_SCHEMA,),
            (TARGET_EXTRA_SEARCH_PATH,),
        )
        journal.update(verdict="ACTIVATED_PENDING_TESTS")
        smoke_user = validate_smoke_user(client, smoke_user_id)
        smoke = run_smoke(
            http,
            client,
            project_url,
            secret_key,
            smoke_user,
            aal2_token,
        )
        journal.update(sessionCleanupVerified=True)
        postflight_value = preflight(client, repo_root, smoke_user_id)
        if normalize_csv(
            postflight_value["postgrest"]["db_schema"]
        ) != (TARGET_DB_SCHEMA,):
            raise ActivationError("POSTFLIGHT_SCHEMA_FAILED")
        completed_at = utc_now()
        logs = query_logs(client, started_at, completed_at)
        if logs["errorEventCount"] > 0:
            raise ActivationError("UNEXPECTED_PRODUCTION_ERROR_LOGS")
        result = {
            "timestampUtc": completed_at,
            "repositoryCommit": args.expected_commit,
            "projectRef": EXPECTED_PROJECT_REF,
            "before": previous,
            "after": effective,
            "mutationAttempted": not already_active,
            "mutationConfirmed": True,
            "rollbackAttempted": False,
            "rollbackVerified": False,
            "sessionCleanupVerified": True,
            "identityProfileSmoke": smoke,
            "logs": logs,
            "postflight": postflight_value,
            "httpRequestCount": http.request_count,
            "result": "PASS",
        }
        write_json(evidence_dir / "activation-report.json", result)
        state = journal.update(
            rollbackRequired=not already_active,
            rollbackVerified=False,
            sessionCleanupVerified=True,
            verdict="ACTIVATED_PENDING_TESTS",
        )
        write_json(evidence_dir / "activation-state.json", state)
        print(
            json.dumps(
                {
                    "project": EXPECTED_PROJECT_NAME,
                    "effectiveSchemas": ["api"],
                    "smokeCases": smoke["caseCount"],
                    "result": "PASS_PENDING_EVIDENCE",
                },
                sort_keys=True,
            )
        )
    except Exception as exc:
        if state_path.exists():
            if isinstance(exc, ActivationError) and exc.code == "SESSION_CLEANUP_FAILED":
                journal.update(verdict="SESSION_CLEANUP_FAILED")
            try:
                recover_from_state(client, journal, evidence_dir)
            except Exception:
                pass
            try:
                write_json(
                    evidence_dir / "activation-state.json", journal.read()
                )
            except Exception:
                pass
        else:
            try:
                write_json(
                    evidence_dir / "activation-report.json",
                    {
                        "timestampUtc": utc_now(),
                        "mutationAttempted": False,
                        "mutationConfirmed": False,
                        "rollbackAttempted": False,
                        "rollbackVerified": False,
                        "sessionCleanupVerified": False,
                        "result": "FAILED_BEFORE_MUTATION",
                        "errorCode": exc.code
                        if isinstance(exc, ActivationError)
                        else f"UNEXPECTED_{type(exc).__name__.upper()}",
                    },
                )
            except Exception:
                pass
        raise


def mark_evidence_outcome(
    client: ManagementClient,
    state_file: Path,
    evidence_dir: Path,
    upload_outcome: str,
    scan_outcome: str,
) -> None:
    journal = StateJournal(state_file)
    if upload_outcome != "success" or scan_outcome != "success":
        recover_from_state(client, journal, evidence_dir)
        journal.update(verdict="EVIDENCE_FAILURE")
        raise ActivationError("EVIDENCE_FAILURE")
    state = journal.read()
    if (
        state["verdict"] != "ACTIVATED_PENDING_TESTS"
        or not state["sessionCleanupVerified"]
    ):
        raise ActivationError("ACTIVATION_DID_NOT_PASS")
    journal.update(rollbackRequired=False, verdict="PASS")


def install_signal_handlers() -> None:
    def handler(signum: int, _frame: Any) -> None:
        name = signal.Signals(signum).name
        raise SignalAbort("PROCESS_SIGNALLED", name)

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


def record_github_failure(
    evidence_dir: Path, filename: str, exc: ActivationError
) -> None:
    write_json(
        evidence_dir / filename,
        {
            "timestampUtc": utc_now(),
            "result": "FAILED_BEFORE_MUTATION",
            "errorCode": exc.code,
        },
    )


def create_run_approval_files(
    request_file: Path, evidence_dir: Path
) -> None:
    request = create_run_approval_request()
    write_json(request_file, request)
    write_json(
        evidence_dir / "github-approval-request.json",
        {
            "repository": request["repository"],
            "workflow": request["workflow"],
            "runId": request["runId"],
            "runAttempt": request["runAttempt"],
            "commitPrefix": str(request["commit"])[:12],
            "projectRef": request["projectRef"],
            "issueNumber": request["issueNumber"],
            "requestedAt": request["requestedAt"],
            "expiresAt": request["expiresAt"],
            "nonceHash": fingerprint(str(request["nonce"])),
            "result": "AWAITING_SECOND_PERSON_APPROVAL",
        },
    )
    summary_path = Path(require_env("GITHUB_STEP_SUMMARY"))
    with summary_path.open("a", encoding="utf-8") as summary:
        summary.write("## Phase 7F second-person approval required\n\n")
        summary.write("Post this exact one-line comment on the dedicated ")
        summary.write("production approval issue before expiry:\n\n")
        summary.write(f"`{request['expectedComment']}`\n\n")
        summary.write(f"Expires: `{request['expiresAt']}`\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-commit")
    parser.add_argument("--confirmation")
    parser.add_argument("--repo-root")
    parser.add_argument("--evidence-dir")
    parser.add_argument("--state-file")
    parser.add_argument("--recover-from-state")
    parser.add_argument("--verify-github-governance", action="store_true")
    parser.add_argument("--create-run-approval-request", action="store_true")
    parser.add_argument("--wait-for-run-approval", action="store_true")
    parser.add_argument("--approval-request-file")
    parser.add_argument("--finalize-evidence", action="store_true")
    parser.add_argument("--upload-outcome")
    parser.add_argument("--scan-outcome")
    parser.add_argument("--primary-outcome")
    args = parser.parse_args()
    if args.verify_github_governance:
        if not args.evidence_dir or not args.expected_commit:
            parser.error("--evidence-dir and --expected-commit are required")
        return args
    if args.create_run_approval_request or args.wait_for_run_approval:
        if not args.evidence_dir or not args.approval_request_file:
            parser.error(
                "--evidence-dir and --approval-request-file are required"
            )
        return args
    if args.finalize_evidence:
        if not args.state_file or not args.evidence_dir:
            parser.error("--state-file and --evidence-dir are required")
        return args
    if args.recover_from_state:
        if not args.evidence_dir:
            parser.error("--evidence-dir is required")
        return args
    required = (
        "expected_commit",
        "confirmation",
        "repo_root",
        "evidence_dir",
        "state_file",
    )
    if any(not getattr(args, name) for name in required):
        parser.error("activation arguments are incomplete")
    return args


def main() -> int:
    install_signal_handlers()
    args = parse_args()
    try:
        if args.verify_github_governance:
            evidence_dir = Path(args.evidence_dir)
            try:
                evidence = verify_github_governance(
                    HttpClient(), args.expected_commit
                )
            except ActivationError as exc:
                record_github_failure(
                    evidence_dir, "github-governance.json", exc
                )
                raise
            write_json(evidence_dir / "github-governance.json", evidence)
            return 0
        if args.create_run_approval_request:
            evidence_dir = Path(args.evidence_dir)
            try:
                create_run_approval_files(
                    Path(args.approval_request_file),
                    evidence_dir,
                )
            except ActivationError as exc:
                record_github_failure(
                    evidence_dir, "github-approval-request.json", exc
                )
                raise
            return 0
        if args.wait_for_run_approval:
            evidence_dir = Path(args.evidence_dir)
            try:
                request = json.loads(
                    Path(args.approval_request_file).read_text(
                        encoding="utf-8"
                    )
                )
                if not isinstance(request, dict):
                    raise ActivationError("GITHUB_RUN_APPROVAL_INVALID")
                evidence = wait_for_run_approval(HttpClient(), request)
            except (
                ActivationError,
                FileNotFoundError,
                json.JSONDecodeError,
            ) as exc:
                failure = (
                    exc
                    if isinstance(exc, ActivationError)
                    else ActivationError("GITHUB_RUN_APPROVAL_INVALID")
                )
                record_github_failure(
                    evidence_dir, "github-run-approval.json", failure
                )
                raise failure
            write_json(
                evidence_dir / "github-run-approval.json", evidence
            )
            return 0
        if args.finalize_evidence:
            token = require_env("SUPABASE_ACCESS_TOKEN")
            mark_evidence_outcome(
                ManagementClient(HttpClient(), token),
                Path(args.state_file),
                Path(args.evidence_dir),
                args.upload_outcome or "",
                args.scan_outcome or "",
            )
            return 0
        if args.recover_from_state:
            token = require_env("SUPABASE_ACCESS_TOKEN")
            client = ManagementClient(HttpClient(), token)
            recover_from_state(
                client,
                StateJournal(Path(args.recover_from_state)),
                Path(args.evidence_dir),
                preserve_pending_activation=args.primary_outcome == "success",
            )
            return 0
        run(args)
    except ActivationError as exc:
        suffix = f": {exc.detail}" if exc.detail else ""
        print(f"activation_failed: {exc.code}{suffix}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(
            f"activation_failed: UNEXPECTED_{type(exc).__name__.upper()}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
