#!/usr/bin/env python3
"""Real Edge worker probes on staging. Does not fake time or raise DB limits.

The held-row probe deliberately coordinates a lock holder and worker as one
operator-owned drill. Full 30/90-minute alert delivery remains a separate gate.
"""
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("staging_runtime", ROOT / "scripts/backend/staging-release-runtime.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
GW = "f9500000-0000-4000-8000-000000000021"


def main():
    ref = os.environ.get("SUPABASE_STAGING_PROJECT_REF", "")
    runtime.validate_ref(ref)
    target = runtime.UPDATE.ManagementTarget(os.environ["SUPABASE_ACCESS_TOKEN"], ref)
    runtime.readiness(target)
    # Discovery must select only the disposable drill season on real Edge calls.
    selected = target.rows("select id from app.fantasy_seasons where status in ('planned','registration_open','active') order by created_at desc limit 1")[0]["id"]
    if selected != "f9500000-0000-4000-8000-000000000005":
        raise RuntimeError("staging_probe_discovery_scope_refused")
    original_url = target.rows("select functions_base_url as url from app_private.notification_email_settings")[0]["url"]
    if original_url != f"https://{ref}.supabase.co/functions/v1":
        raise RuntimeError("staging_probe_base_url_refused")
    scheduler = target.execute("select app_private.scheduler_token() as token",60)[0]["token"]

    def edge(auth=True):
        headers = {"Content-Type":"application/json"}
        if auth:
            headers["x-botolago-scheduler-token"] = scheduler
        req = urllib.request.Request(original_url+"/fantasy-lifecycle-worker", data=b'{"job":"lifecycle"}',headers=headers)
        began=time.monotonic()
        try:
            with urllib.request.urlopen(req,timeout=160) as response:
                status,body=response.status,json.load(response)
        except urllib.error.HTTPError as error:
            status,body=error.code,json.load(error)
        return status,body,round((time.monotonic()-began)*1000)

    def report(probe,status,body,elapsed):
        print(json.dumps({"probe":probe,"http_status":status,"duration_ms":elapsed,
            **{k:body[k] for k in ("status","error","code","workerCode","recorded","calls") if k in body}}),flush=True)

    status,body,elapsed=edge(False)
    report("unauthorized",status,body,elapsed)
    if status!=401:
        raise RuntimeError("staging_probe_auth_failed")
    status,body,elapsed=edge()
    report("disabled",status,body,elapsed)
    if status!=200 or body.get("status")!="disabled":
        raise RuntimeError("staging_probe_disabled_failed")
    lease_token=None
    try:
        target.execute("select app_private.fantasy_automation_configure(true); select app_private.fantasy_worker_configure(true);",60)
        lease=target.execute("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true); select api.service_fantasy_worker_lease_acquire('manual:staging-edge-probe',420) as lease",60)[0]["lease"]
        if not lease.get("acquired"):
            raise RuntimeError("staging_probe_lease_unavailable")
        lease_token=str(uuid.UUID(lease["token"]))
        status,body,elapsed=edge()
        report("lease_held",status,body,elapsed)
        if status!=200 or body.get("status")!="lease_held":
            raise RuntimeError("staging_probe_lease_exclusion_failed")
        target.execute("update app_private.notification_email_settings set functions_base_url=null where id",60)
        answer=target.execute("select app_private.fantasy_worker_tick() as outcome",60)[0]["outcome"]
        print(json.dumps({"probe":"missing_base_url","tick_outcome":answer}),flush=True)
        if answer!="not_configured":
            raise RuntimeError("staging_probe_missing_url_failed")
        target.execute(f"update app_private.notification_email_settings set functions_base_url='{original_url}' where id",60)
        target.execute("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true); "
            f"select api.service_fantasy_worker_lease_release('{lease_token}'::uuid)",60)
        lease_token=None
        # A real row lock, real time and the unchanged API timeouts. The
        # Management connection is the lock holder; the worker uses PostgREST.
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            held=pool.submit(target.execute,f"""begin;
              set local application_name='botolago-staging-row-lock-probe';
              set local statement_timeout='60s';
              select id from app.fantasy_gameweeks where id='{GW}' for update;
              select pg_sleep(45); rollback;""",70)
            ready=False
            for _ in range(20):
                ready=target.rows("select exists(select 1 from pg_stat_activity where application_name='botolago-staging-row-lock-probe' and wait_event='PgSleep') as ready")[0]["ready"]
                if ready:
                    break
                time.sleep(0.5)
            if not ready:
                raise RuntimeError("staging_probe_lock_barrier_failed")
            status,body,elapsed=edge()
            report("held_row",status,body,elapsed)
            if status!=500 or body.get("status")!="failed" or not body.get("recorded"):
                raise RuntimeError("staging_probe_stall_not_recorded")
            held.result()
        # A subsequent real invocation must recover without editing scores.
        status,body,elapsed=edge()
        report("after_lock_release",status,body,elapsed)
        if status!=200 or body.get("status")!="ok" or not body.get("recorded"):
            raise RuntimeError("staging_probe_recovery_failed")
    finally:
        # The entry preflight requires these switches off. Restore them even
        # after a failed probe; cron remains paused throughout.
        target.execute("select app_private.fantasy_automation_configure(false); select app_private.fantasy_worker_configure(false); "
            f"update app_private.notification_email_settings set functions_base_url='{original_url}' where id;",60)
        if lease_token:
            target.execute("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true); "
                f"select api.service_fantasy_worker_lease_release('{lease_token}'::uuid)",60)
        final=target.rows("select (select count(*) from cron.job where active) as active_cron, "
            "exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now()) as lease_held")[0]
        print(json.dumps({"probe":"restoration",**final}),flush=True)


if __name__=="__main__":
    try:
        main()
    except Exception as error:
        code=str(error) if type(error) is RuntimeError and str(error).startswith("staging_probe_") else "staging_probe_failed"
        print(json.dumps({"passed":False,"error":code,"error_type":type(error).__name__}))
        sys.exit(1)
