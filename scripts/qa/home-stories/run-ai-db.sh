#!/usr/bin/env bash
# Owns one disposable database; refuses existing containers, never contacts Supabase.
set -euo pipefail
cd "$(dirname "$0")/../../.."
bash scripts/qa/home-stories/run-db.sh --keep
trap 'docker rm -f botolago-stories-test >/dev/null' EXIT
sql() { docker exec -i botolago-stories-test psql -U postgres -v ON_ERROR_STOP=1; }
sql < scripts/qa/home-stories/ai-bootstrap.sql
sql < supabase/migrations/20261009195943_ai_home_stories.sql
python3 - <<'PY' | sql
from pathlib import Path
source=Path('supabase/tests/database/ai_home_stories.test.sql').read_text()
print(source.split('$scenario$')[1])
PY
