#!/bin/bash
W=/home/user/botolago-foundation/.claude/worktrees/agent-a861aa9684f56fd1a
Q=/tmp/r3pg/q
DB=${1:-post}
for f in $W/supabase/migrations/202610301*.sql; do
  echo "== $(basename $f)"
  $Q -d $DB -q -v ON_ERROR_STOP=1 -1 -f $f 2>&1 | grep -i -E "error" | head -3
done
$Q -d $DB -Atc "select to_regprocedure('app_private.fantasy_any_held()')"
