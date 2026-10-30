#!/bin/bash
# usage: suites.sh <db> <outfile>
W=/home/user/botolago-foundation/.claude/worktrees/agent-a861aa9684f56fd1a
: > $2
for f in $W/supabase/tests/database/fantasy_*.test.sql $W/supabase/tests/database/ops_health_*.test.sql $W/supabase/tests/database/ops_alert_*.test.sql $W/supabase/tests/database/rapidapi_*.test.sql $W/supabase/tests/database/pepites_sportapi_ratings.test.sql $W/supabase/tests/database/news_sitemap_snapshot.test.sql; do
  b=$(basename $f .test.sql)
  r=$(timeout 600 /tmp/r3pg/q -d $1 -A -t -f $f 2>&1)
  ok=$(echo "$r" | grep -c "^ok"); nok=$(echo "$r" | grep -c "^not ok"); err=$(echo "$r" | grep -c "ERROR")
  echo "$b ok=$ok notok=$nok err=$err" >> $2
  echo "$r" | grep -E "^not ok|ERROR" | head -4 | sed "s/^/    /" >> $2
done
echo FINISHED >> $2
