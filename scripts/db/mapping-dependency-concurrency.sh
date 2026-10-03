#!/usr/bin/env bash
# LOCAL, DISPOSABLE DATABASES ONLY. Two real sessions, one executing a Flashscore proposal while the other
# changes the supporting Sofascore mapping, in both orders and in a timed stress, against the database
# functions. Needs a Postgres whose template database has every migration applied (including the
# supporting-dependency one). It creates and drops its own scratch database; it never touches anything else.
#
#   PGHOST=/tmp/localdb PGPORT=55555 PGUSER=postgres TEMPLATE=postgres \
#     scripts/db/mapping-dependency-concurrency.sh
set -euo pipefail
cd "$(dirname "$0")"
TEMPLATE="${TEMPLATE:-postgres}"
DB="conc_$$"
PSQL=(psql -X -q -At -v ON_ERROR_STOP=1)
case "${PGHOST:-}" in /*|localhost|127.0.0.1) ;; *) echo "refusing: PGHOST must be a local socket or localhost"; exit 2;; esac
fail=0
note() { printf '%s\n' "$*"; }
check() { if [ "$2" = "$3" ]; then note "PASS  $1"; else note "FAIL  $1 (got '$2', wanted '$3')"; fail=1; fi; }
cleanup() { "${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "create database $DB template $TEMPLATE" >/dev/null
Q() { "${PSQL[@]}" -d "$DB" "$@"; }
OP="select set_config('request.jwt.claims','{\"sub\":\"e1000000-0000-4000-8000-0000000000d1\",\"role\":\"authenticated\",\"aal\":\"aal2\",\"session_id\":\"e2000000-0000-4000-8000-0000000000d1\"}', false);"
Q -f mapping-dependency-concurrency.setup.sql >/dev/null
check "setup: 40 approved Flashscore proposals wait" "$(Q -c 'select count(*) from public.conc_pending')" "40"

now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
prop() { Q -c "select proposal from public.conc_pending where i = $1"; }
sup()  { Q -c "select supporting from public.conc_pending where i = $1"; }
exec_sql() { echo "$OP select api.admin_football_mapping_execute('$(prop "$1")'::uuid, gen_random_uuid())::jsonb ->> 'code';" ; }

# --- A. the supporting row is being updated (lock held) when execute starts: execute must wait, then refuse.
(Q -c "begin; update app_private.football_provider_mappings set active = false where id = '$(sup 1)'; select pg_sleep(4); commit;" >/dev/null) &
sleep 1
t0=$(now_ms)
out=$(Q -c "$OP select coalesce(api.admin_football_mapping_execute('$(prop 1)'::uuid, gen_random_uuid())::jsonb ->> 'code', 'executed');" | tail -1)
t1=$(now_ms); wait
check "A. execute waits for the concurrent update to commit" "$([ $((t1 - t0)) -ge 2500 ] && echo waited || echo "no wait ($((t1 - t0)) ms)")" "waited"
check "A. and then refuses, seeing the committed change" "$out" "supporting_mapping_inactive"
check "A. no Flashscore mapping was written" "$(Q -c "select count(*) from app_private.football_provider_mappings where provider_name='flashscore' and external_id='F1'")" "0"

# --- B. execute is in flight (validated, not yet committed) when the supporting row is updated: the update must wait.
(Q -c "$OP begin; select api.admin_football_mapping_execute('$(prop 2)'::uuid, gen_random_uuid())::jsonb ->> 'ok'; select pg_sleep(4); commit;" >/dev/null) &
sleep 1.5
t0=$(now_ms)
Q -c "update app_private.football_provider_mappings set active = false where id = '$(sup 2)'" >/dev/null
t1=$(now_ms); wait
check "B. a concurrent deactivation waits until the executing transaction ends" "$([ $((t1 - t0)) -ge 2000 ] && echo waited || echo "no wait ($((t1 - t0)) ms)")" "waited"
check "B. the Flashscore mapping was written while its supporting mapping was valid" "$(Q -c "select count(*) from app_private.football_provider_mappings where provider_name='flashscore' and external_id='F2'")" "1"

# --- C. as A, but the concurrent change is a RETARGET (the supporting mapping now resolves to another player).
(Q -c "begin; update app_private.football_provider_mappings set internal_entity_id = 'a1000000-0000-4000-8000-000000000041' where id = '$(sup 3)'; select pg_sleep(4); commit;" >/dev/null) &
sleep 1
t0=$(now_ms)
out=$(Q -c "$OP select coalesce(api.admin_football_mapping_execute('$(prop 3)'::uuid, gen_random_uuid())::jsonb ->> 'code', 'executed');" | tail -1)
t1=$(now_ms); wait
check "C. execute waits for the concurrent retarget to commit" "$([ $((t1 - t0)) -ge 2500 ] && echo waited || echo "no wait ($((t1 - t0)) ms)")" "waited"
check "C. and then refuses (the retargeted row no longer matches its audit record)" "$out" "supporting_mapping_unreviewed"
check "C. no Flashscore mapping was written" "$(Q -c "select count(*) from app_private.football_provider_mappings where provider_name='flashscore' and external_id='F3'")" "0"

# --- D. stress: 30 trials of execute racing a deactivation at random offsets. No deadlock, no unexplained error, and
#        every outcome is coherent: executed (a mapping exists) or refused for the supporting mapping (none exists).
bad=0; deadlocks=0
for n in $(seq 5 34); do
  d1=$(python3 -c "import random; print(round(random.uniform(0, 0.4), 3))")
  (sleep "$d1"; Q -c "update app_private.football_provider_mappings set active = false where id = '$(sup "$n")'" >/dev/null 2>>"/tmp/$DB.err") &
  res=$(Q -c "$OP select coalesce(api.admin_football_mapping_execute('$(prop "$n")'::uuid, gen_random_uuid())::jsonb ->> 'code', 'executed');" 2>>"/tmp/$DB.err" | tail -1)
  wait
  have=$(Q -c "select count(*) from app_private.football_provider_mappings where provider_name='flashscore' and external_id='F$n'")
  case "$res:$have" in
    executed:1|supporting_mapping_inactive:0) ;;
    *) bad=$((bad + 1)); note "      odd outcome in trial $n: '$res' with $have mapping row(s)";;
  esac
done
deadlocks=$(grep -ci "deadlock" "/tmp/$DB.err" || true)
check "D. 30 racing trials: no deadlock" "$deadlocks" "0"
check "D. 30 racing trials: every outcome coherent (executed with a mapping, or refused with none)" "$bad" "0"
rm -f "/tmp/$DB.err"
[ "$fail" -eq 0 ] && note "ALL CONCURRENCY CHECKS PASSED" || { note "CONCURRENCY CHECKS FAILED"; exit 1; }
