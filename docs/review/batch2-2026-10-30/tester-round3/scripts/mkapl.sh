#!/bin/bash
W=/home/user/botolago-foundation/.claude/worktrees/agent-a861aa9684f56fd1a
Q=/tmp/r3pg/q
$Q -Atc "select pg_terminate_backend(pid) from pg_stat_activity where datname='pre' and pid<>pg_backend_pid()" >/dev/null
$Q -q -c "drop database if exists apl with (force)" -c "create database apl template pre"
$Q -d apl -q -c "create schema if not exists supabase_migrations; drop table if exists supabase_migrations.schema_migrations; create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text)"
for f in $W/supabase/migrations/*.sql; do
  b=$(basename $f .sql); v=${b%%_*}
  if [[ "$v" < "20261030" ]]; then echo "insert into supabase_migrations.schema_migrations(version,name) values ('$v','${b#*_}');"; fi
done | $Q -d apl -q
$Q -d apl -Atc "select count(*), max(version) from supabase_migrations.schema_migrations"
