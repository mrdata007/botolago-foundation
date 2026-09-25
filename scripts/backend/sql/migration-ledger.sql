-- Migration ledger: what a database's migration history says it ran, one row
-- per recorded migration. READ-ONLY.
--
-- Two md5s of the recorded SQL, after dropping blank lines, whole-line
-- comments and the apply wrappers' `set local lock_timeout` /
-- `set local statement_timeout` lines:
--   code_md5  -- the remaining lines, trimmed, joined by newlines: equal when
--                a tool stripped comments or re-indented the file;
--   dense_md5 -- the same text without any whitespace or semicolons: equal
--                also when the Supabase CLI stored the file split into
--                statements.
-- scripts/backend/migration-ledger-compare.ts computes both for the
-- repository's files. Run with: psql "$DB_URL" -At -F $'\t' -f <this file>
with code as (
  select m.version, m.name,
    coalesce((
      select string_agg(btrim(l.line, E' \t\r'), E'\n' order by l.n)
      from unnest(string_to_array(array_to_string(m.statements, E'\n'), E'\n')) with ordinality as l(line, n)
      where btrim(l.line, E' \t\r') <> ''
        and btrim(l.line, E' \t\r') !~ '^--'
        and btrim(l.line, E' \t\r') !~* '^set local (lock_timeout|statement_timeout) = ''[^'']*'';?$'
    ), '') as text
  from supabase_migrations.schema_migrations m
)
select version, name, md5(text) as code_md5,
  md5(regexp_replace(text, E'[ \t\r\n;]', '', 'g')) as dense_md5
from code
order by version;
