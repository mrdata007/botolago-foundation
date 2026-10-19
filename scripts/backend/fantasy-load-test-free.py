#!/usr/bin/env python3
"""Five standard GitHub runners, staging only, no AWS or paid provisioning.

Only account identifiers, fingerprints and sanitized observations cross jobs.
Passwords are derived independently inside protected jobs; the workload child
receives publishable credentials and its own user sessions only.
"""
from __future__ import annotations

import hashlib
import hmac
import importlib.util
import ipaddress
import json
import os
import re
import concurrent.futures
import threading
from collections import Counter
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
REF = "srdrflfrfpwixsllveid"
GW = "fa640000-0000-4000-8000-000000000003"
RUNTIME = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "botolago-free"
PUBLIC = RUNTIME / "evidence"
CONTEXT = PUBLIC / "context.json"


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/backend" / filename)
    loaded = importlib.util.module_from_spec(spec)
    sys.modules[name] = loaded
    spec.loader.exec_module(loaded)
    return loaded


BASE = module("free_capacity_base", "fantasy-capacity-orchestrator.py")
UPDATE = module("free_staging_update", "staging-database-update.py")
BASE.GAMEWEEK_ID = GW


def scope():
    value = os.environ["SCOPE"]
    if value not in {"rehearsal", "launch-sized"}:
        raise RuntimeError("free_scope_refused")
    return value


def password(token, run, number):
    message = f"botolago-free-load/v1/{run}/{number}".encode()
    return hmac.new(token.encode(), message, hashlib.sha256).hexdigest()


def child_environment():
    # No Management, GitHub or AWS credential reaches an authenticated worker.
    return {key: value for key, value in os.environ.items()
            if key in {"PATH", "HOME", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE"}
            or key.startswith("BOTOLAGO_LOAD_")}


def github(arguments):
    result = subprocess.run(["gh", *arguments], capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError("free_github_request_failed")
    return result.stdout


def artifact(name, wait_seconds=1200):
    target = RUNTIME / "downloads" / name
    until = time.monotonic() + wait_seconds
    while time.monotonic() < until:
        listing = json.loads(github(["api", f"repos/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}/artifacts?per_page=100"]))
        matches = [a for a in listing["artifacts"] if a["name"] == name and not a["expired"]]
        if len(matches) == 1:
            target.mkdir(parents=True, exist_ok=True)
            github(["run", "download", os.environ["GITHUB_RUN_ID"], "--name", name, "--dir", str(target)])
            return target
        if len(matches) > 1:
            raise RuntimeError("free_duplicate_artifact")
        time.sleep(5)
    raise RuntimeError("free_barrier_timeout")


class FreeGate(BASE.CapacityGate):
    def __init__(self):
        if os.environ.get("SUPABASE_STAGING_PROJECT_REF") != REF:
            raise RuntimeError("free_target_refused")
        self.target = UPDATE.ManagementTarget(os.environ["SUPABASE_ACCESS_TOKEN"], REF)
        runtime = {key: os.environ[key] for key in (
            "SUPABASE_ACCESS_TOKEN", "SUPABASE_STAGING_PROJECT_REF",
            "SUPABASE_STAGING_URL", "SUPABASE_STAGING_PUBLISHABLE_KEY")}
        if runtime["SUPABASE_STAGING_URL"] != f"https://{REF}.supabase.co":
            raise RuntimeError("free_url_refused")
        self.runtime = runtime
        self.project_ref = REF
        self.supabase_url = runtime["SUPABASE_STAGING_URL"]
        self.mode = BASE.SETUP_REHEARSAL_MODE if scope() == "rehearsal" else BASE.LAUNCH_SIZED_MODE
        self.users_per_runner = 25 if scope() == "rehearsal" else 200
        self.total_users = self.users_per_runner * 5
        self.first_user_number = 50001
        self.last_user_number = self.first_user_number + self.total_users - 1
        self.run_id = f"gha-{os.environ['GITHUB_RUN_ID']}-{os.environ['GITHUB_RUN_ATTEMPT']}"
        self.artifact_dir = PUBLIC / "observations"
        self.artifact_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.temp_secret = None
        self.temp_key_id = None
        self.temp_key_ids = []
        self.users = []
        self.user_creation_stats = Counter()
        self.sql_samples = []
        self.sql_sampler_stop = threading.Event()
        self.sql_sampler_thread = None
        self.database_observer_path = self.artifact_dir / "database-observer.ndjson"
        self.metrics_process = None

    def sql(self, query):
        return self.target.execute(query, 120)

    def _write_state(self):
        # No plaintext credentials in the recovery artifact.
        if CONTEXT.exists():
            state = json.loads(CONTEXT.read_text())
            state["temporaryMetricsKeyId"] = self.temp_key_id
            BASE.private_json(CONTEXT, state)

    def await_metrics(self):
        stdout, _ = self.metrics_process.communicate(timeout=30)
        if self.metrics_process.returncode:
            raise RuntimeError("free_metrics_collector_failed")
        summary = json.loads(stdout)
        if not metrics_complete(summary, scope() == "rehearsal"):
            raise RuntimeError("free_metrics_incomplete")
        self.metrics_summary = summary
        return summary

    def create_users(self):
        lock = threading.Lock()
        next_request = [time.monotonic()]
        def create(number):
            email = f"fantasy-gate-{self.run_id}-{number}@staging.botolago.invalid"
            record = {"number": number, "email": email,
                      "password": password(self.runtime["SUPABASE_ACCESS_TOKEN"], self.run_id, number)}
            with lock:
                request_at = next_request[0]
                next_request[0] += 0.2
            time.sleep(max(0, request_at - time.monotonic()))
            # No retry of an ambiguous Auth write. Recovery enumerates this
            # exact run prefix even when an API response is lost.
            result = self.auth_admin("POST", "/admin/users", {
                "email": email, "password": record["password"], "email_confirm": True})
            record["user_id"] = str(BASE.uuid.UUID(result["id"]))
            return record
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            self.users = list(executor.map(create, range(self.first_user_number, self.last_user_number + 1)))
        if len({u["user_id"] for u in self.users}) != self.total_users:
            raise RuntimeError("free_duplicate_created_users")


def baseline(gate):
    return gate.sql("""select jsonb_build_object(
      'users',(select count(*) from auth.users),
      'teams',(select count(*) from app.fantasy_teams),
      'results',(select md5(string_agg(to_jsonb(r)::text, '' order by id)) from app.fantasy_team_gameweek_results r),
      'qaTeams',(select md5(string_agg(to_jsonb(t)::text, '' order by t.id)) from app.fantasy_teams t join auth.users u on u.id=t.user_id where u.email not like '%@staging.botolago.invalid'),
      'oldGameweeks',(select jsonb_agg(to_jsonb(g) order by id) from app.fantasy_gameweeks g where fantasy_season_id='fa630000-0000-4000-8000-000000000001' and id<>'fa640000-0000-4000-8000-000000000003')) as state""")[0]["state"]


def preflight():
    gate = FreeGate()
    repo = json.loads(github(["api", f"repos/{os.environ['GITHUB_REPOSITORY']}"]))
    if repo["private"] or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted":
        raise RuntimeError("free_standard_public_runner_required")
    if UPDATE.pending_migrations(UPDATE.load_migrations(), UPDATE.read_history(gate.target)):
        raise RuntimeError("free_pending_migrations")
    if gate.target.compute() not in {"ci_micro", "Micro", "micro"}:
        raise RuntimeError("free_compute_snapshot_changed")
    disk = gate.target.free_disk_gb()
    if disk is None or disk < 5:
        raise RuntimeError("free_disk_guard")
    row = gate.sql("""select
      exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now()) as lease,
      exists(select 1 from app_private.ai_home_story_jobs where status='generating') as generating,
      (select lifecycle_tick_enabled or lifecycle_worker_enabled from app_private.fantasy_automation_settings) as fantasy,
      (select mode<>'off' or football_live_refresh_enabled from app_private.notification_email_settings) as email,
      (select mode<>'off' from app_private.notification_push_settings) as push,
      (select enabled from app_private.ops_alert_state) as alerts,
      (exists(select 1 from app_private.ai_content_settings where enabled)
       or exists(select 1 from app_private.ai_home_story_settings where enabled)
       or exists(select 1 from app_private.account_deletion_settings where enabled)
       or exists(select 1 from app_private.manager_card_settings where compute_enabled)
       or exists(select 1 from app_private.trophy_settings where enabled)
       or exists(select 1 from app_private.pepites_settings where mode<>'off')
       or exists(select 1 from app_private.prediction_settings where mode<>'off')) as other_writers,
      (select enabled from app_private.rivals_settings) as rivals,
      (select jsonb_agg(jsonb_build_object('jobid',jobid,'active',active) order by jobid) from cron.job) as cron,
      (select count(*) from auth.users where email like 'fantasy-gate-%@staging.botolago.invalid') as stale_users,
      exists(select 1 from app.fantasy_gameweeks where id='fa640000-0000-4000-8000-000000000003') as stale_fixture,
      exists(select 1 from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid() and state<>'idle') as active_client
    """)[0]
    if any(row[key] for key in ("lease", "generating", "fantasy", "email", "push", "alerts", "other_writers", "stale_users", "stale_fixture", "active_client")):
        raise RuntimeError("free_writer_or_stale_state_guard")
    keys = gate.management("GET", f"/v1/projects/{REF}/api-keys")
    if any(k.get("name") == BASE.TEMP_KEY_NAME for k in keys):
        raise RuntimeError("free_stale_metrics_key")
    secret_names = {item["name"] for item in gate.management("GET", f"/v1/projects/{REF}/secrets")}
    BASE.private_json(CONTEXT, {"emailProviderSecretPresent": "RESEND_API_KEY" in secret_names,
                                "schedulerSecretPresent": "BOTOLAGO_SCHEDULER_TOKEN" in secret_names,
                                "baseline": baseline(gate), "settings": row, "runId": gate.run_id,
                                "source": os.environ["GITHUB_SHA"], "scope": scope(), "diskFreeGb": disk})


def prepare():
    gate = FreeGate()
    state = json.loads(CONTEXT.read_text())
    if baseline(gate) != state["baseline"]:
        raise RuntimeError("free_baseline_changed")
    gate.sql("select cron.alter_job(jobid, active:=false) from cron.job; select app_private.rivals_configure(false);")
    try:
        # A paused scheduler can have an invocation already in flight.
        quiet = gate.sql("select count(*)::int as n from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid() and state<>'idle'")[0]["n"]
        if quiet:
            raise RuntimeError("free_inflight_writer")
        # A new empty GW, never an update of a finalized gameweek.
        sql = f"""begin; insert into app.fantasy_gameweeks
        (id,fantasy_season_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
        values('{GW}','{BASE.SEASON_ID}',3,'GitHub isolated capacity GW3',
        '2090-01-09 10:30+00','2090-01-09 12:00+00','2090-01-16 12:00+00','open'); rollback;"""
        gate.sql(sql)
        if gate.sql(f"select count(*)::int as n from app.fantasy_gameweeks where id='{GW}'")[0]["n"]:
            raise RuntimeError("free_fixture_rollback_failed")
        gate.sql(sql.replace("rollback;", "commit;"))
        gate.create_temporary_key()
        gate.create_users()
        gate.seed_user_fantasy_state()
    finally:
        # Recover partial Auth creation by its exact run-specific address.
        state = json.loads(CONTEXT.read_text())
        state["users"] = gate.sql("select id::text as user_id, split_part(split_part(email,'@',1),'-',-1)::int as number "
                                 f"from auth.users where email like 'fantasy-gate-{gate.run_id}-%@staging.botolago.invalid' order by number")
        BASE.private_json(CONTEXT, state)
        gate.delete_temporary_key()


def provision():
    index = int(os.environ["SHARD"])
    if index not in range(5):
        raise RuntimeError("free_shard_refused")
    state = json.loads((artifact("free-context") / "context.json").read_text())
    expected = 25 if scope() == "rehearsal" else 200
    users = state["users"][index * expected:(index + 1) * expected]
    if len(users) != expected or state["source"] != os.environ["GITHUB_SHA"]:
        raise RuntimeError("free_assignment_invalid")
    records = [{**u, "email": f"fantasy-gate-{state['runId']}-{u['number']}@staging.botolago.invalid",
                "password": password(os.environ["SUPABASE_ACCESS_TOKEN"], state["runId"], u["number"])} for u in users]
    credentials = RUNTIME / "credentials.json"
    BASE.private_json(credentials, records)
    env = child_environment()
    env.update({"BOTOLAGO_STAGING_SUPABASE_URL": f"https://{REF}.supabase.co",
                "BOTOLAGO_STAGING_PUBLISHABLE_KEY": os.environ["SUPABASE_STAGING_PUBLISHABLE_KEY"],
                "BOTOLAGO_LOAD_ENVIRONMENT": "staging-v2", "BOTOLAGO_SESSION_OPERATION": "provision",
                "BOTOLAGO_CAPACITY_MODE": "setup_rehearsal" if scope() == "rehearsal" else "launch_sized",
                "BOTOLAGO_EXPECTED_SESSION_USERS": str(expected), "BOTOLAGO_RUNNER_ID": str(index),
                "BOTOLAGO_LOAD_CREDENTIAL_CACHE": str(credentials),
                "BOTOLAGO_LOAD_SESSION_CACHE": str(RUNTIME / "sessions.json"),
                "BOTOLAGO_SESSION_DIAGNOSTICS_PATH": str(RUNTIME / "auth-diagnostics.ndjson")})
    result = subprocess.run([sys.executable, str(ROOT / "scripts/backend/fantasy-session-provisioner.py")],
                            env=env, capture_output=True, text=True, timeout=900)
    credentials.unlink(missing_ok=True)
    if result.returncode:
        raise RuntimeError("free_session_provision_failed")
    ready = json.loads(result.stdout)
    # An HTTPS-observed public origin; duplicates fail the cross-runner barrier.
    ip = subprocess.check_output(["curl", "--fail", "--silent", "--show-error", "--max-time", "20", "https://api.ipify.org"], text=True).strip()
    if not ipaddress.ip_address(ip).is_global:
        raise RuntimeError("free_origin_invalid")
    session = module("free_session", "fantasy-session-provisioner.py")
    tokens = json.loads((RUNTIME / "sessions.json").read_text())
    ready.update({"origin": ip, "source": state["source"], "scope": scope(),
                  "minimumExpiry": min(session.decode_claims(s["access_token"])["exp"] for s in tokens)})
    BASE.private_json(PUBLIC / "ready.json", ready)


def validate_ready(shards, expected, source, now):
    if len(shards) != 5 or {s["runnerId"] for s in shards} != set(range(5)):
        raise RuntimeError("free_missing_shards")
    if len({s["origin"] for s in shards}) != 5:
        raise RuntimeError("free_duplicate_origins")
    for field in ("subjectFingerprints", "sessionFingerprints", "accessTokenFingerprints", "refreshTokenFingerprints"):
        values = [v for s in shards for v in s[field]]
        if len(values) != expected * 5 or len(set(values)) != expected * 5:
            raise RuntimeError("free_duplicate_sessions")
    if any(s["source"] != source or s["sessions"] != expected or s["minimumExpiry"] < now + 1500 for s in shards):
        raise RuntimeError("free_session_validity_or_source_failed")


def barrier():
    shards = [json.loads((artifact(f"free-ready-{i}") / "ready.json").read_text()) for i in range(5)]
    validate_ready(shards, 25 if scope() == "rehearsal" else 200, os.environ["GITHUB_SHA"], time.time())
    gate_start = time.time() + 135
    BASE.private_json(PUBLIC / "schedule.json", {"gateStart": gate_start, "soakStart": gate_start + 180,
                                               "scope": scope(), "source": os.environ["GITHUB_SHA"], "runners": shards})


def workload():
    index = int(os.environ["SHARD"])
    schedule = json.loads((artifact("free-schedule") / "schedule.json").read_text())
    if schedule["source"] != os.environ["GITHUB_SHA"] or schedule["scope"] != scope():
        raise RuntimeError("free_schedule_mismatch")
    env = child_environment()
    env.update({"BOTOLAGO_STAGING_SUPABASE_URL": f"https://{REF}.supabase.co",
                "BOTOLAGO_STAGING_PUBLISHABLE_KEY": os.environ["SUPABASE_STAGING_PUBLISHABLE_KEY"],
                "BOTOLAGO_LOAD_ENVIRONMENT": "staging-v2", "BOTOLAGO_LOAD_FIXTURE": "github-fresh",
                "BOTOLAGO_LOAD_USERS": "125" if scope() == "rehearsal" else "1000",
                "BOTOLAGO_LOAD_SHARD_COUNT": "5", "BOTOLAGO_LOAD_SHARD_INDEX": str(index),
                "BOTOLAGO_LOAD_FIRST_USER": "50001", "BOTOLAGO_LOAD_SUSTAINED_RPS": "65",
                "BOTOLAGO_LOAD_BURST_RPS": "175", "BOTOLAGO_LOAD_INCLUDE_SAMPLES": "1",
                "BOTOLAGO_LOAD_SESSION_CACHE": str(RUNTIME / "sessions.json")})
    profiles = [("setup_rehearsal", 0, 0, schedule["gateStart"])] if scope() == "rehearsal" else [
        ("launch_sized_gate", 60, 10, schedule["gateStart"]),
        ("launch_sized_soak", 600, 0, schedule["soakStart"])]
    for profile, duration, burst, start in profiles:
        time.sleep(index * 15)
        env.update({"BOTOLAGO_LOAD_PROFILE": profile, "BOTOLAGO_LOAD_DURATION_SECONDS": str(duration),
                    "BOTOLAGO_LOAD_BURST_SECONDS": str(burst), "BOTOLAGO_LOAD_START_AT": str(start),
                    "BOTOLAGO_LOAD_RESULTS_PATH": str(PUBLIC / f"{profile}.json")})
        result = subprocess.run([sys.executable, str(ROOT / "scripts/backend/fantasy-load-test.py")],
                                env=env, capture_output=True, text=True, timeout=900)
        if result.returncode:
            BASE.private_json(PUBLIC / "workload-failure.json", {"profile": profile, "diagnostic": BASE.safe_runner_diagnostic(result.stderr)})
            raise RuntimeError("free_workload_failed")


def monitor():
    gate = FreeGate()
    try:
        schedule = json.loads((PUBLIC / "schedule.json").read_text())
        time.sleep(max(0, schedule["gateStart"] - 30 - time.time()))
        gate.create_temporary_key()
        gate.start_database_observer()
        gate.start_metrics()
        # Existing collector: 300 seconds for rehearsal, 900 for measured load.
        while gate.metrics_process.poll() is None:
            time.sleep(5)
        summary = gate.await_metrics()
        gate.stop_database_observer()
        analysis = gate.analyze_metrics()
        records = [json.loads(line) for line in (gate.artifact_dir / "metrics.ndjson").read_text().splitlines() if line]
        expected_end = schedule["gateStart"] if scope() == "rehearsal" else schedule["soakStart"] + 600
        timestamps = [BASE.datetime.fromisoformat(r["sampledAt"]).timestamp() for r in records]
        observer_times = [BASE.datetime.fromisoformat(r["sampled_at"]).timestamp() for r in gate.sql_samples]
        coverage = {"metricsCoverWorkload": bool(timestamps) and min(timestamps) <= schedule["gateStart"] and max(timestamps) >= expected_end,
                    "databaseObserverCoversWorkload": bool(observer_times) and min(observer_times) <= schedule["gateStart"] and max(observer_times) >= expected_end}
        BASE.private_json(PUBLIC / "metrics.json", {"summary": summary, "analysis": analysis, "coverage": coverage})
    finally:
        gate.stop_database_observer()
        gate.delete_temporary_key()


def metrics_complete(summary, rehearsal):
    return summary["scrapeErrors"] == 0 and summary["scrapes"] >= (5 if rehearsal else 15)


def finish():
    gate = FreeGate()
    if not CONTEXT.exists():
        print(json.dumps({"passed": False, "status": "preflight_did_not_authorize_writes"}))
        return 2
    state = json.loads(CONTEXT.read_text())
    owned_run = re.fullmatch(r"gha-([0-9]+)-([0-9]+)", state["runId"])
    if (not owned_run or owned_run[1] != os.environ["GITHUB_RUN_ID"]
            or int(owned_run[2]) > int(os.environ["GITHUB_RUN_ATTEMPT"])
            or state["source"] != os.environ["GITHUB_SHA"]):
        raise RuntimeError("free_recovery_context_refused")
    # Enumerate the exact owned prefix, including a partially failed creation.
    gate.users = gate.sql("select id::text as user_id from auth.users where email like "
                          f"'fantasy-gate-{state['runId']}-%@staging.botolago.invalid'")
    verdict = {"scope": scope(), "fullGate": False, "passed": False}
    try:
        gate.integrity() if gate.users else None
        schedule = json.loads((RUNTIME / "all" / "free-schedule" / "schedule.json").read_text())
        metrics = json.loads((RUNTIME / "all" / "free-metrics" / "metrics.json").read_text())
        criteria = {}
        if scope() == "rehearsal":
            shards = [json.loads((RUNTIME / "all" / f"free-result-{i}" / "setup_rehearsal.json").read_text()) for i in range(5)]
            criteria["allPrepared"] = all(s["readiness"]["ready"] and s["profile"]["requests"] == 0 and s["readiness"]["preparedUsers"] == 25 for s in shards)
        else:
            for profile in ("launch_sized_gate", "launch_sized_soak"):
                shards = [json.loads((RUNTIME / "all" / f"free-result-{i}" / f"{profile}.json").read_text()) for i in range(5)]
                aggregate = gate.aggregate_profile(profile, shards)
                verdict[profile] = aggregate
                criteria.update({f"{profile}_{k}": v for k, v in aggregate["passCriteria"].items()})
        analysis = metrics["analysis"]
        criteria.update(metrics["coverage"])
        criteria.update({"metricsComplete": metrics_complete(metrics["summary"], scope() == "rehearsal"),
                         "cpu": analysis["maxCpuPercent"] is not None and analysis["maxCpuPercent"] < 80,
                         "connections": analysis["maxConnectionUtilizationPercent"] < 80,
                         "pool": analysis["maxPoolUtilizationPercent"] is not None and analysis["maxPoolUtilizationPercent"] < 80,
                         "deadlocks": analysis["deadlockDelta"] == 0, "conflicts": analysis["conflictDelta"] == 0,
                         "integrity": gate.integrity()["passed"]})
        verdict.update({"criteria": criteria, "passed": all(criteria.values()), "metrics": metrics,
                        "origins": [s["origin"] for s in schedule["runners"]]})
    except Exception as error:
        verdict["failureType"] = type(error).__name__
    finally:
        cleanup = {}
        errors = []
        restored = False
        try:
            cleanup = gate.delete_users_and_state()
            gate.sql(f"delete from app.fantasy_gameweeks where id='{GW}' and name='GitHub isolated capacity GW3'")
            # Recover a collector key even if its job stopped between creation
            # and its finally block. Preflight forbids a pre-existing named key.
            keys = gate.management("GET", f"/v1/projects/{REF}/api-keys")
            for key in keys:
                if key.get("name") == BASE.TEMP_KEY_NAME:
                    gate.temp_key_ids.append(str(key.get("id") or key.get("key_id")))
            gate.delete_temporary_key()
            restored = baseline(gate) == state["baseline"]
        except Exception as error:
            errors.append(type(error).__name__)
        finally:
            for job in state["settings"]["cron"]:
                try:
                    gate.sql(f"select cron.alter_job({int(job['jobid'])}, active:={str(job['active']).lower()})")
                except Exception as error:
                    errors.append(type(error).__name__)
            try:
                gate.sql(f"select app_private.rivals_configure({str(state['settings']['rivals']).lower()})")
                actual = gate.sql("select jobid,active from cron.job order by jobid")
                cron_restored = actual == state["settings"]["cron"]
            except Exception as error:
                errors.append(type(error).__name__)
                cron_restored = False
            verdict.update({"cleanup": cleanup, "cleanupErrors": errors,
                            "baselineRestored": restored, "cronRestored": cron_restored,
                            "passed": verdict["passed"] and restored and cron_restored and not errors
                            and bool(cleanup) and all(v == 0 for v in cleanup.values())})
            BASE.private_json(PUBLIC / "verdict.json", verdict)
    print(json.dumps(verdict, indent=2))
    return 0 if verdict["passed"] else 2


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True, mode=0o700)
    operation = sys.argv[1]
    actions = {"preflight": preflight, "prepare": prepare, "provision": provision,
               "barrier": barrier, "workload": workload, "monitor": monitor, "finish": finish}
    try:
        return actions[operation]() or 0
    except Exception as error:
        # API errors and Auth payloads can contain secrets; only stable class/code.
        print(json.dumps({"passed": False, "operation": operation, "errorType": type(error).__name__,
                          "code": str(error) if str(error).startswith("free_") else "free_operation_failed"}), flush=True)
        return 1
    finally:
        if operation == "workload":
            (RUNTIME / "sessions.json").unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
