-- BotolaGO Football — seed the official short code (app.teams.code) for the
-- Botola Pro 2026/27 clubs whose self-designation is VERIFIED on the club's own
-- official site. Task BG-0018 (docs/engineering/tasks/BG-0018/engineering-brief.yaml).
--
-- PRODUCTION OPERATION. Run inside ONE transaction in the trusted service
-- context (Supabase SQL editor as the database owner, or psql with the service
-- role). Rehearsed on 2026-09-18 inside a rolled-back transaction: see
-- docs/engineering/tasks/BG-0018/rehearsal-team-identity.json.
--
-- Owner decisions of 2026-09-18 that fix the VALUES below:
--   * Codes: only the nine VERIFIED official self-designations, written exactly
--     as the club writes them (4-5 characters allowed). INFERRED codes (WAC,
--     RSB, HUSA, DHJ, KACM, CODM, USAT) are NOT written and stay NULL.
--   * Wydad Casablanca: the existing value "WCA" is provider-supplied
--     (SportsMonks short_code), not independently verified club branding. It
--     is kept as-is; this script never touches it.
--   * Colours: DEFERRED entirely. This script does not write primary_color or
--     secondary_color (no official source publishes a hex value).
--   * Existing non-null codes are preserved: the UPDATE only sets code where
--     the current code IS NULL. It never replaces a non-null code.
--
-- Sources (club_identity table of the brief; classification VERIFIED):
--   Raja Casablanca   RCA   https://www.rajaclubathletic.ma/ (official biolink; handles @rcaofficiel)
--   FAR Rabat         ASFAR https://as-far.ma/fr/club/2-histoire ('A.S.F.A.R' / 'ASFAR')
--   FUS Rabat         FUS   https://fus.ma (official site footer; logo 'Logo_FUS_Rabat.png'; @FUS_OFFICIEL)
--   Maghreb Fès       MAS   https://www.maghreb-fes.com/ ('MAS Fès – Maghreb Association Sportive de Fès')
--   Ittihad Tanger    IRT   https://www.irtfoot.ma/fr ('Site officiel de l'ittihad Riadi de Tanger'; IRT throughout)
--   UTS Rabat         UTS   https://touargaclub.ma/en/le-club/ ('Union Touarga Sport (UTS)')
--   CR Khemis Zemamra RCAZ  https://rcazfc.com/ (official site of Renaissance Club Athletic Zemamra; 'RCAZ' throughout)
--   Moghreb Tétouan   MAT   https://www.matfoot.com ('Site Officiel'; MAT throughout)
--   Widad Témara      WST   https://widad-temara.com/club/ ('le surnom WST')
--
-- Durability (NOT durable until BG-0036 lands): api.ingest_football_catalog_entity
-- rewrites app.teams.code from the provider payload on every fresh team payload
-- (supabase/migrations/20260731180229_gate2b_football_catalog_ingestion.sql:277-302,
-- `code = v_code` unconditionally). The next dispatch of
-- football-current-season-recovery or the fantasy orchestrator recovery step
-- that sees a fresh provider timestamp will reset these nine codes to NULL.
-- The script is idempotent and may simply be re-run after any such ingest.
--
-- Guards (all raise and roll back):
--   * exactly 9 rows listed, names and codes unique;
--   * every code matches '^[A-Z0-9]{2,8}$' (checked before the UPDATE, so the
--     table constraint teams_code_check is never the first line of defence);
--   * every listed name matches exactly one ACTIVE app.teams row (exact match
--     on app.teams.name, NFC as stored), 9 matches in total.
-- Touches ONLY app.teams.code. Never writes name, short_name, slug, active,
-- country_id, venue_id, crest_asset_id, primary_color, secondary_color.
-- Re-running is a no-op (0 rows, no updated_at bump).

begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $identity$
declare
  n_listed integer;
  n_distinct_names integer;
  n_distinct_codes integer;
  n_bad_code integer;
  n_unmatched integer;
  n_matched integer;
  n_preserved integer;
  n_updated integer;
  bad_rows text;
begin
  -- Curated identity rows (team_name = app.teams.name exactly; code = official self-designation).
  drop table if exists pg_temp.bg0018_identity;
  create temp table bg0018_identity on commit drop as
  select v.team_name, v.code,
         (select t.id from app.teams t where t.name = v.team_name and t.active) as matched_id
  from (values
    ('Raja Casablanca',   'RCA'),   -- source: https://www.rajaclubathletic.ma/ (official biolink, handles @rcaofficiel) — VERIFIED
    ('FAR Rabat',         'ASFAR'), -- source: https://as-far.ma/fr/club/2-histoire ('A.S.F.A.R' / 'ASFAR') — VERIFIED
    ('FUS Rabat',         'FUS'),   -- source: https://fus.ma (official site footer; 'Logo_FUS_Rabat.png'; @FUS_OFFICIEL) — VERIFIED
    ('Maghreb Fès',       'MAS'),   -- source: https://www.maghreb-fes.com/ ('MAS Fès – Maghreb Association Sportive de Fès') — VERIFIED
    ('Ittihad Tanger',    'IRT'),   -- source: https://www.irtfoot.ma/fr ('Site officiel de l'ittihad Riadi de Tanger', IRT throughout) — VERIFIED
    ('UTS Rabat',         'UTS'),   -- source: https://touargaclub.ma/en/le-club/ ('Union Touarga Sport (UTS)') — VERIFIED
    ('CR Khemis Zemamra', 'RCAZ'),  -- source: https://rcazfc.com/ (official site of Renaissance Club Athletic Zemamra, 'RCAZ' throughout) — VERIFIED
    ('Moghreb Tétouan',   'MAT'),   -- source: https://www.matfoot.com ('Site Officiel', MAT throughout) — VERIFIED
    ('Widad Témara',      'WST')    -- source: https://widad-temara.com/club/ ('le surnom WST') — VERIFIED
  ) as v(team_name, code);
  -- Not listed on purpose (owner decision 2026-09-18): Wydad Casablanca keeps the
  -- provider value WCA; Amal Tiznit, CODM Meknès, Difaâ El Jadida, Hassania Agadir,
  -- Kawkab Marrakech, RSB Berkane stay NULL (codes only INFERRED).

  -- Guard 1: exactly nine unique rows.
  select count(*), count(distinct team_name), count(distinct code)
    into n_listed, n_distinct_names, n_distinct_codes
  from pg_temp.bg0018_identity;
  if n_listed <> 9 or n_distinct_names <> 9 or n_distinct_codes <> 9 then
    raise exception 'identity_rows_invalid (listed=%, distinct_names=%, distinct_codes=%; expected 9/9/9)',
      n_listed, n_distinct_names, n_distinct_codes;
  end if;

  -- Guard 2: code format before the table constraint sees it.
  select count(*), string_agg(team_name || '=' || coalesce(code, '<null>'), ', ')
    into n_bad_code, bad_rows
  from pg_temp.bg0018_identity where code is null or code !~ '^[A-Z0-9]{2,8}$';
  if n_bad_code > 0 then
    raise exception 'code_format_invalid (%)', bad_rows;
  end if;

  -- Guard 3: every name matches exactly one active team (the scalar subquery above
  -- already raises on more than one match; here we catch zero matches).
  select count(*) filter (where matched_id is null), count(distinct matched_id),
         string_agg(team_name, ', ') filter (where matched_id is null)
    into n_unmatched, n_matched, bad_rows
  from pg_temp.bg0018_identity;
  if n_unmatched > 0 or n_matched <> 9 then
    raise exception 'team_name_unmatched (unmatched=%, matched=%; names: %)', n_unmatched, n_matched, bad_rows;
  end if;

  -- Rows whose code is already set are preserved (never overwritten).
  select count(*) into n_preserved
  from pg_temp.bg0018_identity v join app.teams t on t.id = v.matched_id
  where t.code is not null and t.code is distinct from v.code;

  -- The one and only write: fill NULL codes; no-op on re-run (updated_at untouched).
  update app.teams t
     set code = v.code
    from pg_temp.bg0018_identity v
   where t.id = v.matched_id
     and t.code is null
     and t.code is distinct from v.code;
  get diagnostics n_updated = row_count;

  raise notice 'team identity applied: % rows (codes only; % listed, % preserved with a pre-existing code)',
    n_updated, n_listed, n_preserved;
end $identity$;

-- Review the result, then COMMIT (or ROLLBACK).
select t.name, t.short_name, t.code, t.primary_color, t.secondary_color, t.updated_at
from app.teams t
where t.active
order by t.name;
-- commit;
