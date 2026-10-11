/**
 * The "catch-up" part of the owner install script
 * (build-apply-sofascore-automatic.ts).
 *
 * On 2026-10-11 the owner read production (read-only) and found that 27
 * migration versions the repository has are missing from
 * supabase_migrations.schema_migrations:
 *
 *   - 4 migrations that were genuinely never applied (the script applies them
 *     as ordinary steps: see STEPS there);
 *   - 1 function (api.fantasy_gameweek_summary) that production holds in an
 *     unreviewed older shape (fixed by a guarded step, below);
 *   - 24 migrations whose objects ARE in production (applied by another path),
 *     only their history row is missing.
 *
 * For the last group this file works out, from the repository alone, what the
 * script must find in production before it writes the history rows: the md5 of
 * the body text of every function the migration creates, the tables, the enum
 * types and labels. Production keeps a function body in pg_proc.prosrc, and
 * md5(prosrc) equals the md5 of the exact text between the dollar-quote tags.
 *
 * The expected value of a function is its CURRENT repository definition: when
 * a later (recorded) migration replaced or renamed the function, that later
 * body is what production holds, and it is the one compared. Migrations this
 * script applies itself, or that come after it (version > CHAIN_END), are left
 * out of the chain because they have not run yet when the check runs.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  followChain,
  listMigrations,
  md5,
  migrationsDir,
  readChain,
  splitStatements,
  stripFullLineComments,
} from "./sql-migration-objects";

/** The four migrations the script applies as full steps (never applied in production). */
export const NEW_STEP_VERSIONS = [
  "20260925090500",
  "20261001170000",
  "20261010140000",
  "20261011170000",
] as const;

/** The 24 migrations whose objects are in production but whose history row is missing. */
export const HISTORY_VERSIONS = [
  "20260919130000",
  "20260919150000",
  "20260919160000",
  "20260921120000",
  "20260921140000",
  "20260921160000",
  "20260921170000",
  "20260921180000",
  "20260921190000",
  "20260921200000",
  "20260921220000",
  "20260922180000",
  "20260922180100",
  "20260922180200",
  "20260922200000",
  "20260922200100",
  "20260924100000",
  "20260924120000",
  "20260924140000",
  "20260924140100",
  "20260924163000",
  "20260924170000",
  "20260924173000",
  "20260927153000",
] as const;

/** The last migration the owner found recorded; later ones are steps of the script itself. */
export const CHAIN_END = "20261011100000";

/** 20260921160000 is in production without its full-line `--` comments (owner's measurement, fact c). */
export const SEASON_STATS_PRODUCTION_PROSRC_MD5 = "1b141bf8a70e0db8e6ecd402b2f9beb9";
const COMMENT_STRIPPED_VERSION = "20260921160000";

/** api.fantasy_gameweek_summary(uuid): production's unreviewed body (owner's measurement, fact d). */
export const GAMEWEEK_SUMMARY = {
  signature: "api.fantasy_gameweek_summary(uuid)",
  name: "api.fantasy_gameweek_summary",
  nargs: 1,
  version: "20260921200000",
  productionProsrcMd5: "ae72632ee97802080b5a08c4215d4c61",
} as const;

/** The seed 20260921220000 reported 23 rows when it was reviewed against production. */
export const STORY_TEAMS_SEEDED_ROWS = 23;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export interface HistoryFunction {
  /** The history row this check belongs to. */
  version: string;
  schema: string;
  name: string;
  nargs: number;
  /** md5(prosrc) values that count as the reviewed body. */
  accepted: string[];
  /** Migration that last set the body; differs from `version` when a later recorded migration replaced it. */
  definedIn: string;
}
export interface HistoryType {
  version: string;
  name: string;
  labels: string[];
  /** Enum still open to `alter type add value` later: the labels must be present, not the whole list. */
  extended: boolean;
}
export interface HistoryModel {
  rows: { version: string; name: string; sha256: string }[];
  functions: HistoryFunction[];
  tables: { version: string; name: string }[];
  types: HistoryType[];
  typeValues: { version: string; type: string; label: string }[];
}

export function historyModel(root: string): HistoryModel {
  const history = new Set<string>(HISTORY_VERSIONS);
  const skipped = new Set<string>(NEW_STEP_VERSIONS);
  const chain = readChain(root, (v) => v <= CHAIN_END && !skipped.has(v));
  const catalog = followChain(chain);

  const migrations = listMigrations(root);
  const rows = HISTORY_VERSIONS.map((version) => {
    const m = migrations.find((x) => x.version === version);
    if (!m) throw new Error(`history version ${version} has no migration file`);
    const text = readFileSync(join(migrationsDir(root), m.file), "utf8");
    return { version, name: m.name, sha256: sha256(text) };
  });

  const functions: HistoryFunction[] = [];
  for (const fn of catalog.functions.values()) {
    const touched = fn.touchedBy.filter((v) => history.has(v));
    if (touched.length === 0) continue;
    if (fn.name === GAMEWEEK_SUMMARY.name && fn.nargs === GAMEWEEK_SUMMARY.nargs) continue;
    const [schema, name] = fn.name.split(".") as [string, string];
    const full = md5(fn.body);
    const stripped = md5(stripFullLineComments(fn.body));
    let accepted = [full];
    if (fn.definedIn === COMMENT_STRIPPED_VERSION) {
      accepted = fn.name === "api.fantasy_player_season_stats" ? [stripped] : [full, stripped];
    }
    if (
      fn.name === "api.fantasy_player_season_stats" &&
      stripped !== SEASON_STATS_PRODUCTION_PROSRC_MD5
    ) {
      throw new Error(
        "the comment-stripped season stats body no longer matches the measured production md5",
      );
    }
    functions.push({
      version: touched[touched.length - 1]!,
      schema,
      name,
      nargs: fn.nargs,
      accepted: [...new Set(accepted)],
      definedIn: fn.definedIn,
    });
  }
  functions.sort(
    (a, b) =>
      a.version.localeCompare(b.version) ||
      `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`) ||
      a.nargs - b.nargs,
  );

  const tables = [...catalog.tables.values()]
    .filter((t) => history.has(t.createdIn))
    .map((t) => ({ version: t.createdIn, name: t.name }))
    .sort((a, b) => a.version.localeCompare(b.version) || a.name.localeCompare(b.name));
  const types = [...catalog.types.values()]
    .filter((t) => history.has(t.createdIn))
    .map((t) => ({
      version: t.createdIn,
      name: t.name,
      labels: [...t.labels],
      extended: t.extended,
    }))
    .sort((a, b) => a.version.localeCompare(b.version) || a.name.localeCompare(b.name));

  // `alter type ... add value` in a history migration: that label must exist.
  const typeValues: HistoryModel["typeValues"] = [];
  for (const file of chain.filter((f) => history.has(f.version))) {
    for (const st of splitStatements(file.sql)) {
      const m =
        /^alter\s+type\s+(\S+)\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'((?:[^']|'')*)'/i.exec(
          st.skeleton,
        );
      if (m)
        typeValues.push({ version: file.version, type: m[1]!, label: m[2]!.replace(/''/g, "'") });
    }
  }
  return { rows, functions, tables, types, typeValues };
}

/** The history check (preflight): runs only for rows not recorded at the start. */
export function historyVerifySql(model: HistoryModel): string {
  const pending = (v: string) =>
    `exists (select 1 from pg_temp.sofascore_plan p where p.version = ${v} and not p.was_recorded)`;
  const fnRows = model.functions
    .map(
      (f) =>
        `      (${q(f.version)}, ${q(f.schema)}, ${q(f.name)}, ${f.nargs}, array[${f.accepted
          .map(q)
          .join(", ")}], ${q(f.definedIn)})`,
    )
    .join(",\n");
  const tableRows = model.tables.map((t) => `      (${q(t.version)}, ${q(t.name)})`).join(",\n");
  const typeRows = model.types
    .map(
      (t) =>
        `      (${q(t.version)}, ${q(t.name)}, array[${t.labels.map(q).join(", ")}], ${t.extended})`,
    )
    .join(",\n");
  const valueRows = model.typeValues
    .map((t) => `      (${q(t.version)}, ${q(t.type)}, ${q(t.label)})`)
    .join(",\n");
  return `
-- Migration history to complete. These ${model.rows.length} migrations are missing from
-- supabase_migrations.schema_migrations although what they create is in
-- production (they were applied by another path). Before a history row is
-- written, what the migration created is checked here: the body of every
-- function (md5 of pg_proc.prosrc against the repository body), every table,
-- every enum type and label. api.fantasy_gameweek_summary is checked by its
-- own step after it is brought to the reviewed body. Nothing is written here.
do $history_check$
declare
  problems text[] := '{}';
  e record;
  actual text[];
begin
  for e in
    select * from (values
${fnRows}
    ) as t(version, schema_name, fn_name, nargs, accepted, defined_in)
    where ${pending("t.version")}
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = e.schema_name and p.proname = e.fn_name and p.pronargs = e.nargs
          and md5(p.prosrc) = any (e.accepted)) then
      problems := problems || (e.version || ': function ' || e.schema_name || '.' || e.fn_name || ' (' || e.nargs
        || ' arguments) is missing, or its body (md5 of prosrc) is not the repository body last set in ' || e.defined_in);
    end if;
  end loop;

  for e in
    select * from (values
${tableRows}
    ) as t(version, table_name)
    where ${pending("t.version")}
  loop
    if to_regclass(e.table_name) is null then
      problems := problems || (e.version || ': table ' || e.table_name || ' is missing');
    end if;
  end loop;

  for e in
    select * from (values
${typeRows}
    ) as t(version, type_name, labels, extended)
    where ${pending("t.version")}
  loop
    if to_regtype(e.type_name) is null then
      problems := problems || (e.version || ': type ' || e.type_name || ' is missing');
    else
      actual := array(select enumlabel::text from pg_enum
                       where enumtypid = to_regtype(e.type_name) order by enumsortorder);
      if (e.extended and not actual @> e.labels) or (not e.extended and actual is distinct from e.labels) then
        problems := problems || (e.version || ': type ' || e.type_name || ' does not have the labels '
          || array_to_string(e.labels, ', ') || ' (it has ' || coalesce(array_to_string(actual, ', '), 'none') || ')');
      end if;
    end if;
  end loop;

  for e in
    select * from (values
${valueRows}
    ) as t(version, type_name, label)
    where ${pending("t.version")}
  loop
    if to_regtype(e.type_name) is null
      or not exists (select 1 from pg_enum where enumtypid = to_regtype(e.type_name) and enumlabel = e.label) then
      problems := problems || (e.version || ': type ' || e.type_name || ' lacks the value ' || e.label);
    end if;
  end loop;

  -- The data these migrations wrote. Only what can be judged fairly is checked.
  if ${pending(q("20260919160000"))} and (
    to_regclass('app_private.news_editorial_write_keys') is null
    or not exists (select 1 from app_private.news_editorial_write_keys)) then
    problems := problems || '20260919160000: the editorial write secret row is missing from app_private.news_editorial_write_keys'::text;
  end if;
  if ${pending(q("20260924140100"))} and (
    to_regclass('app_private.notification_email_settings') is null
    or not exists (select 1 from app_private.notification_email_settings)) then
    problems := problems || '20260924140100: the email settings row is missing from app_private.notification_email_settings'::text;
  end if;
  -- 20260921220000 is a seed derived from headlines (it reported ${STORY_TEAMS_SEEDED_ROWS} rows when it was
  -- reviewed). Re-running its query today could match newer articles, so the fair test is that the table holds
  -- at least the rows it seeded.
  if ${pending(q("20260921220000"))} and (
    to_regclass('app.story_teams') is null
    or (select count(*) from app.story_teams) < ${STORY_TEAMS_SEEDED_ROWS}) then
    problems := problems || 'the story teams seed (20260921220000) is not in place: app.story_teams holds fewer than ${STORY_TEAMS_SEEDED_ROWS} rows'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: production does not match what migrations missing from the history create -- nothing was saved, no history row was written: %', problems;
  end if;
end
$history_check$;
`;
}

/** Inserts the history rows (after the checks above passed, and after the gameweek summary fix). */
export function historyInsertSql(model: HistoryModel): string {
  const values = model.rows
    .map(
      (r) =>
        `  (${q(r.version)}, ${q(r.name)}, ${q(
          `-- History row only. supabase/migrations/${r.version}_${r.name}.sql was applied to production by another path; apply-sofascore-automatic.sql checked what it creates and recorded it without running it. File sha256 ${r.sha256}`,
        )})`,
    )
    .join(",\n");
  return `
-- The history rows. Each is written only if it was not recorded at the start,
-- and only after the check above passed. The file is NOT run: its objects are
-- already in production (checked).
insert into supabase_migrations.schema_migrations (version, name, statements)
select h.version, h.name, array[h.note]
  from (values
${values}
  ) as h(version, name, note)
 where exists (select 1 from pg_temp.sofascore_plan p where p.version = h.version and not p.was_recorded);
`;
}

export interface GameweekFix {
  /** create or replace, comment, revoke, grant: the four statements of 20260921200000 for this function, as written. */
  text: string;
  sha256: string;
  /** md5(prosrc) of the reviewed body. */
  prosrcMd5: string;
}

export function gameweekFix(root: string): GameweekFix {
  const file = readdirFor(root, GAMEWEEK_SUMMARY.version);
  const statements = splitStatements(readFileSync(join(migrationsDir(root), file), "utf8")).filter(
    (st) => st.skeleton.includes("api.fantasy_gameweek_summary"),
  );
  const kinds = statements.map((st) =>
    /^(create or replace function|comment on function|revoke|grant)/i
      .exec(st.skeleton)?.[1]
      ?.toLowerCase(),
  );
  if (kinds.join("|") !== "create or replace function|comment on function|revoke|grant") {
    throw new Error(`unexpected statements for api.fantasy_gameweek_summary: ${kinds.join("|")}`);
  }
  const text = statements.map((st) => st.raw).join("\n\n") + "\n";
  return { text, sha256: sha256(text), prosrcMd5: md5(statements[0]!.bodies[0]!) };
}

function readdirFor(root: string, version: string): string {
  const m = listMigrations(root).find((x) => x.version === version);
  if (!m) throw new Error(`no migration file for ${version}`);
  return m.file;
}

export const GAMEWEEK_FIX_TAG = "$bg_fantasy_gameweek_summary_file$";

/** Preflight (always): production must hold the known old body or the reviewed one. */
export function gameweekFixPreflightSql(fix: GameweekFix): string {
  return `
  -- api.fantasy_gameweek_summary(uuid): production holds a slightly different,
  -- unreviewed body (md5 of prosrc ${GAMEWEEK_SUMMARY.productionProsrcMd5}). It is brought to the reviewed
  -- body of ${GAMEWEEK_SUMMARY.version} below. Any other body is not the state this was written for.
  if to_regprocedure('${GAMEWEEK_SUMMARY.signature}') is null
    or to_regclass('app.fantasy_gameweeks') is null
    or to_regclass('app.fantasy_team_gameweek_results') is null then
    raise exception 'stop: api.fantasy_gameweek_summary or a table it reads is missing -- production is not the state ${GAMEWEEK_SUMMARY.version} was written for';
  end if;
  if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('${GAMEWEEK_SUMMARY.signature}'))
      not in ('${GAMEWEEK_SUMMARY.productionProsrcMd5}', '${fix.prosrcMd5}') then
    raise exception 'stop: api.fantasy_gameweek_summary is neither the version production held on 2026-10-11 (prosrc md5 ${GAMEWEEK_SUMMARY.productionProsrcMd5}) nor the reviewed one -- production is not the state this was written for';
  end if;`;
}

/** The apply block: replaces the function when it still has the old body. */
export function gameweekFixApplySql(fix: GameweekFix): string {
  return `
-- api.fantasy_gameweek_summary(uuid) brought to the reviewed body of ${GAMEWEEK_SUMMARY.version}
-- (create or replace with the repository text, then its comment and grants).
-- Skipped when it already has that body.
do $apply_gameweek_summary$
declare
  fix_text text := ${GAMEWEEK_FIX_TAG}${fix.text}${GAMEWEEK_FIX_TAG};
  current_md5 text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('${GAMEWEEK_SUMMARY.signature}'));
begin
  if current_md5 = '${fix.prosrcMd5}' then
    return;
  end if;
  if current_md5 is distinct from '${GAMEWEEK_SUMMARY.productionProsrcMd5}' then
    raise exception 'stop: api.fantasy_gameweek_summary is not the version production held on 2026-10-11 (prosrc md5)';
  end if;
  if encode(sha256(convert_to(fix_text, 'UTF8')), 'hex') is distinct from '${fix.sha256}' then
    raise exception 'stop: the api.fantasy_gameweek_summary text is not the repository text byte for byte -- was this script cut short or changed?';
  end if;
  execute fix_text;
end
$apply_gameweek_summary$;
`;
}
