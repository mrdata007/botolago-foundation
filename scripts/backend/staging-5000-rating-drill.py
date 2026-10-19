#!/usr/bin/env python3
"""Run the isolated scoring drill; credentials stay inside the protected job."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("staging_runtime", ROOT / "scripts/backend/staging-release-runtime.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def main():
    ref = os.environ.get("SUPABASE_STAGING_PROJECT_REF", "")
    runtime.validate_ref(ref)
    target = runtime.UPDATE.ManagementTarget(os.environ["SUPABASE_ACCESS_TOKEN"], ref)
    runtime.readiness(target)
    fixture = os.environ.get("STAGING_DRILL_FIXTURE", "operator")
    if fixture not in {"operator", "edge-runtime", "phone-qa"}:
        raise RuntimeError("staging_drill_fixture_refused")
    namespace = {"operator":"f9500000","edge-runtime":"f9510000","phone-qa":"f9600000"}[fixture]
    team_count, league_count = (123,1) if fixture == "phone-qa" else (5000,500)
    counts = target.rows(f"""select
      (select count(*) from app.fantasy_teams where fantasy_season_id='{namespace}-0000-4000-8000-000000000005') as teams,
      (select count(*) from app.fantasy_leagues where fantasy_season_id='{namespace}-0000-4000-8000-000000000005' and active) as leagues,
      (select count(*) from app.fantasy_lineups where gameweek_id='{namespace}-0000-4000-8000-000000000021' and locked_at is not null) as lineups""")[0]
    if counts != {"teams": team_count, "leagues": league_count, "lineups": team_count}:
        raise RuntimeError("staging_drill_fixture_incomplete")
    keys = target._request("GET", f"/v1/projects/{ref}/api-keys", None, 60)
    key = next(k["api_key"] for k in keys if k.get("name") == "service_role")
    child_env = {k: v for k, v in os.environ.items() if k not in {"SUPABASE_ACCESS_TOKEN", "GITHUB_TOKEN"}}
    child_env.update(STAGING_DRILL_URL=f"https://{ref}.supabase.co", STAGING_DRILL_SERVICE_KEY=key)
    result = subprocess.run(["bun", "scripts/backend/staging-5000-rating-drill.ts"], cwd=ROOT,
                            env=child_env, timeout=1500, capture_output=True, text=True)
    # Only the drill's structured records enter the workflow log. Never print
    # subprocess errors/stacks or the private environment.
    for line in result.stdout.splitlines():
        if line.startswith('{"kind":') or line.startswith('{"error":"staging_drill_'):
            print(line, flush=True)
    if result.returncode:
        raise RuntimeError("staging_drill_worker_failed")
    proof = target.rows(f"""select count(*) as results,min(final_score) as min_score,max(final_score) as max_score,
      sum(final_score) as sum_score,count(*) filter(where state='final') as final_rows,
      (select count(*) from app.fantasy_rankings where gameweek_id='{namespace}-0000-4000-8000-000000000021'
        and league_id is null) as ranked
      from app.fantasy_team_gameweek_results where gameweek_id='{namespace}-0000-4000-8000-000000000021'""")[0]
    expected = {"results":team_count,"min_score":96,"max_score":96,"sum_score":96*team_count,"final_rows":team_count,"ranked":team_count}
    print(json.dumps({"kind":"independent_sql_proof", "passed":proof==expected, **proof}), flush=True)
    if proof != expected:
        raise RuntimeError("staging_drill_score_mismatch")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = str(error) if type(error) is RuntimeError and str(error).startswith("staging_drill_") else "staging_drill_setup_failed"
        print(json.dumps({"passed":False,"error":code,"error_type":type(error).__name__}))
        sys.exit(1)
