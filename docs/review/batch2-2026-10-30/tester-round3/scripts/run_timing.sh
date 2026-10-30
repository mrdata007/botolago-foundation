#!/bin/bash
cd /tmp/r3pg
N=${1:-5k}
./mkcopy.sh post$N held$N >/dev/null 2>&1; ./mkcopy.sh post$N on$N >/dev/null 2>&1
./q -d held$N -q -v ON_ERROR_STOP=1 -f heldsetup.sql 2>&1 | tail -3
echo "insert into app_private.fantasy_api_rating_seasons (season_id, from_gameweek, owner_approval) values ('d6300000-0000-4000-8000-000000000001', 6, 'perf scratch');" > on.sql
./q -d on$N -q -f on.sql
./q -d held$N -Atc "select app_private.fantasy_any_held(), (select count(*) from app_private.fantasy_shown_rankings)"
for d in pre$N post$N on$N held$N; do echo "### $d"; ./q -d $d -f timing.sql 2>&1 | grep "|"; done
