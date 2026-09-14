"""Guarded recovery of the previously approved ElBotola metadata integration.

Only fixed management endpoints and fixed SQL are used. Provider responses,
credentials and command logs never enter the evidence artifact.
"""

from __future__ import annotations

import hashlib
import hmac
import base64
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

PROJECT = "tkewgajrljbwgwedqsxn"
PROJECT_NAME = "BotolaGO Production V2"
REPOSITORY = "mrdata007/botolago-foundation"
WORKFLOW = ".github/workflows/news-elbotola-recovery.yml"
MANAGEMENT = f"https://api.supabase.com/v1/projects/{PROJECT}"
FUNCTION_URL = f"https://{PROJECT}.supabase.co/functions/v1/news-ingest-elbotola"
PERMISSION_REFERENCE = "owner-confirmed-2026-08-03-elbotola-link-metadata-and-remote-hero"
COUNTER_NAMES = ("fetched", "validated", "inserted", "updated", "skipped", "rejected", "retries")
FUNCTION_FILES = (
    "supabase/functions/news-ingest-elbotola/index.ts",
    "supabase/functions/_shared/elbotola.ts",
)
VERIFIED_FILES = (WORKFLOW, "scripts/backend/elbotola-recovery.py", *FUNCTION_FILES)

PREFLIGHT_SQL = """
select p.active, p.trust_status::text, p.website_url,
  to_regprocedure('api.news_begin_provider_ingestion(text,text,text)') is not null as has_begin,
  to_regprocedure('api.news_ingest_provider_article(text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,integer,text)') is not null as has_ingest,
  to_regprocedure('api.news_attach_elbotola_hero(text,text,text)') is not null as has_hero
from app.publishers p where p.slug='elbotola';
"""

ACTIVATE_SQL = """
update app.publishers set active=true, trust_status='trusted', updated_at=statement_timestamp()
where slug='elbotola' and trust_status in ('review_required','trusted')
  and website_url in ('https://www.elbotola.com','https://www.elbotola.com/')
returning active;
"""

VERIFY_SQL = """
select
 (select jsonb_build_object(
   'id',r.id,'status',r.status,'startedAt',r.started_at,
   'fetched',r.records_fetched,'validated',r.records_validated,
   'inserted',r.records_inserted,'updated',r.records_updated,
   'skipped',r.records_skipped,'rejected',r.records_rejected)
  from app_private.news_ingestion_runs r join app.publishers p on p.id=r.publisher_id
  where p.slug='elbotola' order by r.started_at desc limit 1) as run,
 count(*)::integer as published_articles,
 count(*) filter (where e.hero_asset_id is not null)::integer as with_hero,
 max(e.published_at) as latest_publication,
 count(*) filter (where e.language <> 'ar' or e.sanitizer_version <> 'elbotola-link-v1'
  or s.canonical_url !~ '^https://www[.]elbotola[.]com/article/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]+[.]html$')::integer as invalid_metadata
from app.article_editions e join app.stories s on s.id=e.story_id
join app.publishers p on p.id=s.publisher_id
where p.slug='elbotola' and e.status='published' and e.visibility='public' and s.deleted_at is null;
"""


class RecoveryError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RecoveryError("HTTP_REDIRECT_FORBIDDEN")


def guard(environment):
    expected = environment.get("EXPECTED_COMMIT", "")
    if (
        environment.get("GITHUB_REPOSITORY") != REPOSITORY
        or environment.get("GITHUB_REF") != "refs/heads/main"
        or environment.get("GITHUB_RUN_ATTEMPT") != "1"
        or not re.fullmatch(r"[a-f0-9]{40}", expected)
        or expected != environment.get("GITHUB_SHA")
        or environment.get("CONFIRMATION") != "RUN_ELBOTOLA_RECOVERY"
    ):
        raise RecoveryError("IMMUTABLE_TARGET_GUARD_FAILED")
    event = environment.get("GITHUB_EVENT_NAME")
    mode = environment.get("ELBOTOLA_RECOVERY_MODE")
    if event == "workflow_dispatch":
        if environment.get("GITHUB_ACTOR") != "mrdata007" or mode not in ("canary", "refresh"):
            raise RecoveryError("OPERATOR_GUARD_FAILED")
    elif event == "schedule":
        if mode != "refresh" or environment.get("ELBOTOLA_SCHEDULE_ENABLED") != "true":
            raise RecoveryError("SCHEDULE_NOT_ENABLED")
    else:
        raise RecoveryError("EVENT_NOT_ALLOWED")
    if (
        environment.get("SUPABASE_PRODUCTION_PROJECT_REF") != PROJECT
        or environment.get("SUPABASE_PRODUCTION_PROJECT_NAME") != PROJECT_NAME
        or environment.get("SUPABASE_PRODUCTION_URL", "").rstrip("/") != f"https://{PROJECT}.supabase.co"
    ):
        raise RecoveryError("PRODUCTION_PROJECT_GUARD_FAILED")
    for name in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_SECRET_KEY"):
        value = environment.get(name, "")
        if not value or re.search(r"\s", value):
            raise RecoveryError("PROTECTED_CREDENTIAL_MISSING_OR_INVALID")


def validate_canary_run(run):
    if not isinstance(run, dict) or (
        run.get("path") != WORKFLOW
        or run.get("event") != "workflow_dispatch"
        or run.get("conclusion") != "success"
        or run.get("head_branch") != "main"
        or not re.fullmatch(r"[a-f0-9]{40}", run.get("head_sha", ""))
        or run.get("run_attempt") != 1
        or run.get("repository", {}).get("full_name") != REPOSITORY
    ):
        raise RecoveryError("VERIFIED_CANARY_RUN_REQUIRED")


def dedicated_trigger(secret_key):
    # Domain separation produces an independent credential, reproducible only in
    # the protected runner. It is never a public derivative or the service key.
    return hmac.new(secret_key.encode(), f"botolago:{PROJECT}:elbotola-ingestion:v1".encode(), hashlib.sha256).hexdigest()


def configuration_payload(trigger):
    # No shared GNews or football runtime secret is read, written or deleted.
    values = {
        "ELBOTOLA_SYNDICATION_APPROVED": "true",
        "ELBOTOLA_ORIGIN": "https://www.elbotola.com",
        "ELBOTOLA_PAGE_SIZE": "10",
        "ELBOTOLA_TIMEOUT_MS": "10000",
        "ELBOTOLA_MAX_RETRIES": "1",
        "ELBOTOLA_INGESTION_TRIGGER_SECRET": trigger,
    }
    return [{"name": name, "value": value} for name, value in values.items()]


def validate_response(response):
    if not isinstance(response, dict) or response.get("provider") != "elbotola" or response.get("languages") != ["ar"]:
        raise RecoveryError("UNEXPECTED_INGESTION_RESPONSE")
    counters = response.get("counters")
    if not isinstance(counters, dict) or any(type(counters.get(name)) is not int or counters[name] < 0 for name in COUNTER_NAMES):
        raise RecoveryError("INVALID_INGESTION_COUNTERS")
    if (
        not 1 <= counters["fetched"] <= 10
        or counters["rejected"] != 0
        or counters["validated"] != counters["fetched"]
        or counters["inserted"] + counters["updated"] + counters["skipped"] != counters["fetched"]
    ):
        raise RecoveryError("INGESTION_RECONCILIATION_FAILED")
    return {name: counters[name] for name in COUNTER_NAMES}


def validate_database(result, counters, started):
    if not isinstance(result, list) or len(result) != 1:
        raise RecoveryError("DATABASE_VERIFICATION_FAILED")
    row = result[0]
    run = row.get("run")
    if not isinstance(run, dict) or run.get("status") != "succeeded":
        raise RecoveryError("DATABASE_INGESTION_NOT_SUCCEEDED")
    try:
        run_started = datetime.fromisoformat(run["startedAt"].replace("Z", "+00:00"))
        latest = datetime.fromisoformat(row["latest_publication"].replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError):
        raise RecoveryError("DATABASE_TIMESTAMPS_INVALID") from None
    if run_started < started or any(run.get(name) != counters[name] for name in COUNTER_NAMES if name != "retries"):
        raise RecoveryError("DATABASE_RUN_DOES_NOT_RECONCILE")
    if row.get("published_articles", 0) < counters["fetched"] or row.get("invalid_metadata") != 0:
        raise RecoveryError("DATABASE_METADATA_INVALID")
    if (started - latest).total_seconds() > 48 * 60 * 60:
        raise RecoveryError("NEWS_STILL_STALE")
    return {name: row[name] for name in ("published_articles", "with_hero", "latest_publication", "invalid_metadata")}


class Recovery:
    def __init__(self, environment):
        guard(environment)
        self.env = environment
        self.directory = Path(environment["ELBOTOLA_RECOVERY_DIR"])
        self.evidence = self.directory / "evidence"
        self.evidence.mkdir(parents=True, mode=0o700, exist_ok=True)
        self.opener = build_opener(NoRedirect())
        self.trigger = dedicated_trigger(environment["SUPABASE_SECRET_KEY"])
        if environment.get("GITHUB_ACTIONS") == "true":
            print("::add-mask::" + self.trigger)

    def request(self, url, token, method="GET", payload=None, headers=None):
        request_headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        request_headers.update(headers or {})
        data = None
        if payload is not None:
            request_headers["Content-Type"] = "application/json"
            data = json.dumps(payload).encode()
        request = Request(url, data=data, headers=request_headers, method=method)
        try:
            with self.opener.open(request, timeout=60) as response:
                raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise RecoveryError("HTTP_RESPONSE_TOO_LARGE")
                return json.loads(raw) if raw else None
        except HTTPError as error:
            raise RecoveryError(f"HTTP_{error.code}") from None
        except (URLError, TimeoutError, ValueError):
            raise RecoveryError("HTTP_REQUEST_FAILED") from None

    def management(self, path="", method="GET", payload=None):
        if path not in ("", "/secrets", "/database/query", "/functions"):
            raise RecoveryError("MANAGEMENT_PATH_NOT_ALLOWED")
        return self.request(MANAGEMENT + path, self.env["SUPABASE_ACCESS_TOKEN"], method, payload)

    def sql(self, query):
        return self.management("/database/query", "POST", {"query": query})

    def save(self, filename, value):
        target = self.evidence / filename
        target.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        target.chmod(0o600)

    def state(self):
        return json.loads((self.evidence / "preflight.json").read_text())

    def preflight(self):
        project = self.management()
        if project.get("id") != PROJECT or project.get("name") != PROJECT_NAME or project.get("status") != "ACTIVE_HEALTHY":
            raise RecoveryError("PROJECT_NOT_HEALTHY")
        if self.env["GITHUB_EVENT_NAME"] == "schedule":
            run_id = self.env.get("ELBOTOLA_CANARY_VERIFIED_RUN_ID", "")
            if not re.fullmatch(r"[0-9]+", run_id):
                raise RecoveryError("VERIFIED_CANARY_RUN_REQUIRED")
            run = self.request(f"https://api.github.com/repos/{REPOSITORY}/actions/runs/{run_id}", self.env.get("GITHUB_TOKEN", ""))
            validate_canary_run(run)
            # A manual refresh is not proof of deployment/canary. Verify the two
            # canary-only steps and exact ingestion implementation at that SHA.
            jobs = self.request(f"https://api.github.com/repos/{REPOSITORY}/actions/runs/{run_id}/jobs", self.env.get("GITHUB_TOKEN", ""))
            steps = [step for job in jobs.get("jobs", []) for step in job.get("steps", [])]
            for name in ("Configure isolated ElBotola runtime", "Deploy only reviewed ElBotola function", "Activate publisher and verify bounded ingestion"):
                if not any(step.get("name") == name and step.get("conclusion") == "success" for step in steps):
                    raise RecoveryError("VERIFIED_CANARY_STEPS_REQUIRED")
            for filename in VERIFIED_FILES:
                previous = self.request(f"https://api.github.com/repos/{REPOSITORY}/contents/{filename}?ref={run['head_sha']}", self.env.get("GITHUB_TOKEN", ""))
                if previous.get("encoding") != "base64" or base64.b64decode(previous.get("content", "")) != Path(filename).read_bytes():
                    raise RecoveryError("INGESTION_IMPLEMENTATION_CHANGED_RECANARY_REQUIRED")
        rows = self.sql(PREFLIGHT_SQL)
        if not isinstance(rows, list) or len(rows) != 1:
            raise RecoveryError("ELBOTOLA_PUBLISHER_MISSING")
        publisher = rows[0]
        if publisher.get("trust_status") not in ("trusted", "review_required") or publisher.get("website_url") not in ("https://www.elbotola.com", "https://www.elbotola.com/"):
            raise RecoveryError("ELBOTOLA_PUBLISHER_BLOCKED")
        if any(publisher.get(key) is not True for key in ("has_begin", "has_ingest", "has_hero")):
            raise RecoveryError("ELBOTOLA_DATABASE_PREREQUISITE_MISSING")
        if self.env["ELBOTOLA_RECOVERY_MODE"] == "refresh" and publisher.get("active") is not True:
            raise RecoveryError("ELBOTOLA_PUBLISHER_NOT_ACTIVE")
        self.save("preflight.json", {
            "schemaVersion": 1, "projectRef": PROJECT,
            "expectedCommit": self.env["EXPECTED_COMMIT"], "runId": self.env["GITHUB_RUN_ID"],
            "mode": self.env["ELBOTOLA_RECOVERY_MODE"], "permissionReference": PERMISSION_REFERENCE,
            "previousPublisherActive": publisher["active"], "previousPublisherTrust": publisher["trust_status"],
            "functionSha256": {name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in FUNCTION_FILES},
        })

    def configure(self):
        if self.env["ELBOTOLA_RECOVERY_MODE"] != "canary":
            raise RecoveryError("CONFIGURATION_REQUIRES_CANARY")
        self.state()
        payload = configuration_payload(self.trigger)
        self.management("/secrets", "POST", payload)
        self.save("configuration.json", {"configuredNames": [item["name"] for item in payload], "sharedTriggerOverwritten": False})

    def ingest(self):
        state = self.state()
        functions = self.management("/functions")
        matches = [function for function in functions if function.get("slug") == "news-ingest-elbotola"]
        if len(matches) != 1 or matches[0].get("status") != "ACTIVE" or matches[0].get("verify_jwt") is not True:
            raise RecoveryError("ELBOTOLA_SECURE_FUNCTION_MISSING")
        if self.env["ELBOTOLA_RECOVERY_MODE"] == "canary":
            rows = self.sql(ACTIVATE_SQL)
            if len(rows) != 1 or rows[0].get("active") is not True:
                raise RecoveryError("PUBLISHER_ACTIVATION_FAILED")
        started = datetime.now(timezone.utc)
        response = self.request(FUNCTION_URL, self.env["SUPABASE_SECRET_KEY"], "POST", {"job": "elbotola"}, {
            "apikey": self.env["SUPABASE_SECRET_KEY"],
            "x-botolago-ingestion-key": self.trigger,
        })
        counters = validate_response(response)
        database = validate_database(self.sql(VERIFY_SQL), counters, started)
        self.save("result.json", {"schemaVersion": 1, "verdict": "pass", "provider": "elbotola", "languages": ["ar"],
            "expectedCommit": state["expectedCommit"], "runId": self.env["GITHUB_RUN_ID"],
            "mode": state["mode"], "functionVersion": matches[0].get("version"), "counters": counters, "database": database})

    def rollback(self):
        state = self.state()
        # Preserve a previously active integration and all published article history.
        if state["previousPublisherActive"] is False:
            trust = state["previousPublisherTrust"]
            if trust not in ("trusted", "review_required"):
                raise RecoveryError("ROLLBACK_STATE_INVALID")
            self.sql("update app.publishers set active=false, trust_status='" + trust + "', updated_at=statement_timestamp() where slug='elbotola' and trust_status <> 'blocked';")
            self.save("rollback.json", {"publisherRestoredInactive": True, "articlesDeleted": False, "sharedTriggerChanged": False})

    def scan(self):
        values = [self.env.get(name, "") for name in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_SECRET_KEY", "GITHUB_TOKEN")]
        values.append(self.trigger)
        for path in self.evidence.glob("*.json"):
            contents = path.read_text()
            if any(value and value in contents for value in values):
                raise RecoveryError("CREDENTIAL_IN_EVIDENCE")
            if re.search(r"(?:sbp_|sb_secret_|eyJ[A-Za-z0-9_-]+\.)", contents):
                raise RecoveryError("CREDENTIAL_PATTERN_IN_EVIDENCE")


def main():
    recovery = None
    try:
        command = sys.argv[1] if len(sys.argv) == 2 else ""
        if command not in ("preflight", "configure", "ingest", "rollback", "scan"):
            raise RecoveryError("COMMAND_NOT_ALLOWED")
        recovery = Recovery(os.environ)
        getattr(recovery, command)()
        print("ELBOTOLA_" + command.upper() + "_PASS")
        return 0
    except Exception as error:
        code = str(error) if isinstance(error, RecoveryError) else "ELBOTOLA_RECOVERY_FAILED"
        if recovery is not None:
            recovery.save("failure.json", {"verdict": "fail", "code": code})
        print(code)
        return 1


if __name__ == "__main__":
    sys.exit(main())
