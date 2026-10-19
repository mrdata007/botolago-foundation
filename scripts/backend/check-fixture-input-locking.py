#!/usr/bin/env python3
"""Real two-session lock-order checks, exclusively in the local Supabase container.

No remote URL or credentials are accepted. Uses the pgTAP file's synthetic world,
commits that setup for the competing sessions, and removes it in finally.
"""
from __future__ import annotations
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = 'supabase_db_botolago-production-v2'
PSQL = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-q', '-A', '-t', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
GW = 'c0000000-0000-4000-8000-000000000006'
FIXTURE = 'f0000000-0000-4000-8000-000000000001'


def query(sql):
    result = subprocess.run([*PSQL, '-c', sql], capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise RuntimeError('local probe SQL failed: ' + result.stderr[-1500:])
    return result.stdout.strip()


def launch(sql):
    return subprocess.Popen([*PSQL, '-c', sql], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def wait_for(predicate):
    until = time.monotonic() + 5
    while time.monotonic() < until:
        if query('select (' + predicate + ')::int') == '1':
            return
        time.sleep(.05)
    raise AssertionError('local locking barrier not reached')


def finish(process):
    stdout, stderr = process.communicate(timeout=12)
    if process.returncode:
        raise AssertionError(stderr)
    return stdout.strip().splitlines()


def cleanup():
    query(f"""begin;
      update app.fantasy_gameweeks set status='provisional' where id='{GW}';
      delete from app.player_fixture_performances where fixture_id='{FIXTURE}';
      delete from app_private.historical_performance_fixture_coverage where fixture_id='{FIXTURE}';
      delete from app.fantasy_lineups where gameweek_id='{GW}';
      delete from app.fantasy_teams where fantasy_season_id='c0000000-0000-4000-8000-000000000005';
      delete from auth.users where email like 'fg-manager-%@example.test';
      delete from app.fantasy_fixture_assignments where gameweek_id='{GW}';
      delete from app.fantasy_gameweeks where id='{GW}';
      delete from app.fantasy_players where fantasy_season_id='c0000000-0000-4000-8000-000000000005';
      delete from app.fantasy_seasons where id='c0000000-0000-4000-8000-000000000005';
      delete from app.fantasy_competitions where id='c0000000-0000-4000-8000-000000000004';
      delete from app.fixtures where id='{FIXTURE}';
      delete from app.team_memberships where season_id='c0000000-0000-4000-8000-000000000003';
      delete from app.players where slug like 'fg-player-%';
      delete from app.rounds where season_id='c0000000-0000-4000-8000-000000000003';
      delete from app.seasons where id='c0000000-0000-4000-8000-000000000003';
      delete from app.competitions where id='c0000000-0000-4000-8000-000000000002';
      delete from app.teams where slug in ('fg-club-1','fg-club-2'); commit;""")


def main():
    if query(f"select count(*) from app.fantasy_gameweeks where id='{GW}'") != '0':
        raise RuntimeError('local probe namespace already exists')
    text = (ROOT / 'supabase/tests/database/fantasy_finalizing_fixture_performance_guard.test.sql').read_text()
    setup = text[:text.index("select extensions.lives_ok(format('update app.fixtures")]
    query(setup + '\ncommit;')
    baseline_deadlocks = int(query("select deadlocks from pg_stat_database where datname=current_database()"))
    results = []
    processes = []
    try:
        for label, table, field, predicate in (
            ('fixture', 'app.fixtures', 'home_score', f"id='{FIXTURE}'"),
            ('performance', 'app.player_fixture_performances', 'goals', f"fixture_id='{FIXTURE}'")):
            query(f"update app.fantasy_gameweeks set status='provisional' where id='{GW}'")
            writer = launch(f"begin; set local application_name='fixture_guard_probe_writer'; update {table} set {field}=2 where {predicate}; select pg_sleep(3); commit;")
            processes.append(writer)
            wait_for("exists(select 1 from pg_stat_activity where application_name='fixture_guard_probe_writer' and wait_event='PgSleep')")
            finalizer = launch(f"begin; set local application_name='fixture_guard_probe_finalizer'; select id from app.fantasy_gameweeks where id='{GW}' for update; update app.fantasy_gameweeks set status='finalizing' where id='{GW}'; select id from app.fixtures where id='{FIXTURE}' for share; select {field} from {table} where {predicate}; commit;")
            processes.append(finalizer)
            wait_for("exists(select 1 from pg_stat_activity where application_name='fixture_guard_probe_finalizer' and cardinality(pg_blocking_pids(pid))>0)")
            finish(writer)
            assert finish(finalizer)[-1] == '2', 'finalizer did not see committed correction'
            results.append({'input': label, 'order': 'import_first', 'sealWaited': True, 'committedValue': 2})

            query(f"update app.fantasy_gameweeks set status='provisional' where id='{GW}'")
            finalizer = launch(f"begin; set local application_name='fixture_guard_probe_finalizer'; select id from app.fantasy_gameweeks where id='{GW}' for update; update app.fantasy_gameweeks set status='finalizing' where id='{GW}'; select pg_sleep(3); select id from app.fixtures where id='{FIXTURE}' for share; commit;")
            processes.append(finalizer)
            wait_for("exists(select 1 from pg_stat_activity where application_name='fixture_guard_probe_finalizer' and wait_event='PgSleep')")
            began = time.monotonic()
            refused = subprocess.run([*PSQL, '-c', f"update {table} set {field}=3 where {predicate}"], capture_output=True, text=True, timeout=10)
            elapsed = time.monotonic() - began
            assert refused.returncode and 'fantasy_scoring_inputs_frozen' in refused.stderr, refused.stderr
            assert elapsed < 2, f'lock-order inversion waited {elapsed:.3f}s'
            finish(finalizer)
            assert query(f"select {field} from {table} where {predicate}") == '2'
            results.append({'input': label, 'order': 'seal_first', 'refusedWithinMs': round(elapsed*1000), 'unchanged': True})
        deadlocks = int(query("select deadlocks from pg_stat_database where datname=current_database()")) - baseline_deadlocks
        assert deadlocks == 0, 'deadlock detected'
        print(json.dumps({'passed': True, 'cases': results, 'deadlockDelta': deadlocks}, indent=2))
    finally:
        for process in processes:
            if process.poll() is None:
                process.communicate(timeout=12)
        cleanup()
    assert query(f"select count(*) from app.fantasy_gameweeks where id='{GW}'") == '0'


if __name__ == '__main__':
    main()
