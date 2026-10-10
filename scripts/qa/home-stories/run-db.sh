#!/usr/bin/env bash
# Reproducible isolated migration check. No Supabase project URL or credentials.
set -euo pipefail
cd "$(dirname "$0")/../../.."
container="botolago-stories-test"
if docker container inspect "$container" >/dev/null 2>&1; then
  echo "Container $container already exists; refuse to overwrite another test database." >&2
  exit 1
fi
docker run -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
if [[ ${1:-} != --keep ]]; then trap 'docker rm -f "$container" >/dev/null' EXIT; fi
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
sql() { docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1; }
sql < scripts/qa/home-stories/bootstrap.sql
sql < supabase/migrations/20260724143100_admin_authorization_foundation.sql
python3 - <<'PY' | sql
from pathlib import Path
source = Path('supabase/migrations/20260720110102_news_search_ingestion.sql').read_text()
start = source.index('create or replace function app_private.write_editorial_audit(')
print(source[start:source.index('$$;', start)+3])
PY
sql < supabase/migrations/20261009094920_home_stories.sql
sql < scripts/qa/home-stories/assertions.sql
