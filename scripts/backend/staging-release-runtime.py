#!/usr/bin/env python3
"""Deploy the repository's Edge runtime to Staging V2, with no production path.

Runs only in the existing protected staging workflow. Scheduler credentials
move from staging's own vault to staging's Edge secret store in process memory;
neither their values nor provider keys enter logs or artifacts.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[2]
REF = "srdrflfrfpwixsllveid"
SPEC = importlib.util.spec_from_file_location("staging_update", ROOT / "scripts/backend/staging-database-update.py")
assert SPEC and SPEC.loader
UPDATE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = UPDATE
SPEC.loader.exec_module(UPDATE)


def validate_ref(ref: str) -> None:
    if ref != REF:
        raise RuntimeError("staging_runtime_refused_target")


def deploy_failure_categories(stderr: str) -> list[str]:
    """Report only fixed labels, never upstream text, paths or credentials."""
    value = stderr.lower()
    patterns = {
        "authorization": r"unauthori[sz]ed|forbidden|access token|\b40[13]\b",
        "network": r"timed? ?out|connection|error sending request|fetch failed|resolve host",
        "docker": r"docker|daemon",
        "dependency": r"module not found|cannot find|failed to resolve|failed to bundle|import|deno.lock",
        "entrypoint": r"entrypoint|entry point|no such file",
        "permission": r"permission denied|operation not permitted",
        "rate_limit": r"rate limit|\b429\b",
        "server": r"\b50[0-9]\b|internal server",
    }
    return [name for name, pattern in patterns.items() if re.search(pattern, value)]


def readiness(target) -> dict:
    row = target.rows("""select
      (select count(*) from cron.job where active)::int as active_cron,
      (select lifecycle_tick_enabled from app_private.fantasy_automation_settings) as fantasy_on,
      (select lifecycle_worker_enabled from app_private.fantasy_automation_settings) as worker_on,
      (select mode from app_private.notification_email_settings) as email_mode,
      (select mode from app_private.notification_push_settings) as push_mode,
      (select count(*) from app_private.ai_home_story_jobs where status='generating')::int as generating,
      exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now()) as lease_held,
      exists(select 1 from vault.secrets where name='botolago_scheduler_token') as scheduler_present
    """)[0]
    if row["active_cron"] or row["fantasy_on"] or row["worker_on"] or row["generating"] or row["lease_held"]:
        raise RuntimeError("staging_runtime_writers_not_paused")
    if row["email_mode"] != "off" or row["push_mode"] != "off":
        raise RuntimeError("staging_runtime_delivery_not_off")
    if not row["scheduler_present"]:
        raise RuntimeError("staging_runtime_scheduler_missing")
    if UPDATE.pending_migrations(UPDATE.load_migrations(), UPDATE.read_history(target)):
        raise RuntimeError("staging_runtime_migrations_pending")
    return row


def deploy(target, ref: str, run=subprocess.run) -> dict:
    validate_ref(ref)
    print(json.dumps({"phase": "readiness"}), flush=True)
    readiness(target)
    secret_names = {item["name"] for item in target._request("GET", f"/v1/projects/{ref}/secrets", None, 60)}
    print(json.dumps({"phase": "secret_name_preflight",
                      "email_provider_secret_present": "RESEND_API_KEY" in secret_names,
                      "email_from_override_present": "EMAIL_FROM" in secret_names,
                      "app_url_override_present": "APP_URL" in secret_names}), flush=True)
    config = tomllib.loads((ROOT / "supabase/config.toml").read_text())
    names = sorted(p.name for p in (ROOT / "supabase/functions").iterdir() if p.is_dir() and (p / "index.ts").is_file())
    print(json.dumps({"phase": "scheduler_transfer"}), flush=True)
    # The Management API's read-only role cannot decrypt Vault secrets. The
    # owner connection runs this SELECT; the query still changes no DB data.
    token = target.execute("select app_private.scheduler_token() as token", 60)[0]["token"]
    if not isinstance(token, str) or len(token) < 32:
        raise RuntimeError("staging_runtime_invalid_scheduler")
    print(json.dumps({"phase": "scheduler_secret_store"}), flush=True)
    target._request("POST", f"/v1/projects/{ref}/secrets", [
        {"name": "BOTOLAGO_SCHEDULER_TOKEN", "value": token}
    ], 60)
    del token
    print(json.dumps({"phase": "edge_deployment"}), flush=True)
    deployed = []
    for name in names:
        command = [str(ROOT / "node_modules/.bin/supabase"), "functions", "deploy", name,
                   "--project-ref", ref]
        # Config is the reviewed source of each function's authentication mode.
        if config.get("functions", {}).get(name, {}).get("verify_jwt") is False:
            command.append("--no-verify-jwt")
        result = run(command, cwd=ROOT, env={**os.environ, "SUPABASE_TELEMETRY_DISABLED": "1"},
                     capture_output=True, text=True, timeout=300)
        if result.returncode:
            print(json.dumps({"phase": "deploy_failure", "function": name,
                              "exit_code": result.returncode,
                              "categories": deploy_failure_categories(getattr(result, "stderr", ""))}), flush=True)
            raise RuntimeError(f"staging_runtime_deploy_failed:{name}")
        deployed.append(name)
        print(json.dumps({"deployed": name}), flush=True)
    target.execute("select app_private.notification_email_configure('off', "
                   f"'https://{ref}.supabase.co/functions/v1', '{{}}'::uuid[], false);", 60)
    functions = target._request("GET", f"/v1/projects/{ref}/functions", None, 60)
    listed = {item["slug"]: item for item in functions}
    if any(name not in listed or listed[name]["status"] != "ACTIVE" for name in names):
        raise RuntimeError("staging_runtime_inventory_mismatch")
    if any(listed[name]["verify_jwt"] != config.get("functions", {}).get(name, {}).get("verify_jwt", True) for name in names):
        raise RuntimeError("staging_runtime_authentication_mismatch")
    secrets = target._request("GET", f"/v1/projects/{ref}/secrets", None, 60)
    secret_names = {item["name"] for item in secrets}
    return {"project": ref, "functions": [
        {"name": name, "version": listed[name]["version"], "verify_jwt": listed[name]["verify_jwt"]}
        for name in names
    ], "scheduler_secret_present": "BOTOLAGO_SCHEDULER_TOKEN" in secret_names,
       "email_provider_secret_present": "RESEND_API_KEY" in secret_names,
       "source_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()}


def main() -> int:
    try:
        ref = os.environ.get("SUPABASE_STAGING_PROJECT_REF", "")
        validate_ref(ref)
        print(json.dumps({"phase": "target_validation"}), flush=True)
        target = UPDATE.ManagementTarget(os.environ["SUPABASE_ACCESS_TOKEN"], ref)
        report = deploy(target, ref)
        print(json.dumps({"passed": True, **report}, sort_keys=True, indent=2))
        return 0
    except Exception as error:
        # Do not print an upstream response, exception payload, or subprocess
        # stderr: secret-store requests can carry credentials.
        code = str(error) if type(error) is RuntimeError and str(error).startswith("staging_runtime_") else "staging_runtime_setup_failed"
        http = re.match(r"HTTP (\d{3}):", str(error))
        print(json.dumps({"passed": False, "error": code, "error_type": type(error).__name__,
                          "http_status": int(http[1]) if http else None}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
