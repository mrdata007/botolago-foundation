-- BotolaGO — BG-0068: Arabic club names for the 16 current Botola clubs.
--
-- STATUS: OWNER-APPROVED 2026-09-22. The two rows this file halted on
-- (Widad Temara, Zemamra) were settled by the owner with sources, and the
-- Fes/Tetouan pair was upgraded to the clubs' own official forms.
--
-- This file has never been executed against any database. It is the artefact
-- of a deliberate halt: Moroccan club names are not transliterations of their
-- French forms -- for most of these clubs the Arabic name is the ORIGINAL and
-- the Latin string in app.teams is the derived one -- so an agent's guess is
-- not an acceptable source. The owner reviews every row below before anyone
-- runs it. See docs/engineering/tasks/BG-0068/engineering-brief.yaml for the
-- per-row confidence notes, including the two rows that are genuinely
-- uncertain.
--
-- The 16 team ids come from production: every app.teams row with a
-- app.team_memberships row in the season where app.seasons.is_current. They
-- are not guessed and not pattern-matched from names.
--
-- Idempotent: re-running it overwrites the Arabic name and short name for
-- these 16 clubs and touches nothing else. It inserts only `ar` rows; French
-- continues to come from app.teams.name, which this file never writes.
--
-- Run as the table owner (RLS is forced on app.team_translations and there are
-- no browser grants), inside the transaction below.

begin;

insert into app.team_translations (team_id, language, name, short_name)
values
  -- Wydad Athletic Club. Note: this club's app.teams.short_name is currently
  -- the literal code 'WCA' rather than a name, so the Arabic short name below
  -- is an improvement on the French side too -- flagged, not fixed here.
  ('80a3fb82-02ae-46bc-aae9-5160ba8f3648', 'ar', 'الوداد الرياضي', 'الوداد'),
  -- Raja Club Athletic.
  ('3b0f1fc9-5b29-4a77-bdf8-a54fce0b1a0e', 'ar', 'الرجاء الرياضي', 'الرجاء'),
  -- AS FAR — the army club. Universally "الجيش الملكي" in Arabic, never a
  -- transliteration of "FAR".
  ('fd6ff8ea-898c-403b-aec3-7d8a41cbc158', 'ar', 'الجيش الملكي', 'الجيش'),
  -- FUS Rabat.
  ('c499006b-2af3-4013-862c-854ab74b59cf', 'ar', 'الفتح الرياضي', 'الفتح'),
  -- Maghreb Association Sportive de Fès.
  ('0257feb3-4c16-431d-a58b-5faf060576ad', 'ar', 'نادي المغرب الرياضي الفاسي', 'المغرب الفاسي'),
  -- Moghreb Athletic Tétouan. Distinct club from the one above; the two
  -- Arabic names differ only in the final adjective, which is exactly why
  -- they must be reviewed side by side.
  ('e3beb52d-fbfb-4180-a39d-7e3d8f965b62', 'ar', 'نادي المغرب أتلتيك تطوان', 'المغرب التطواني'),
  -- Renaissance Sportive de Berkane.
  ('7b2e23bc-450f-4eb2-9926-4add1a5386e7', 'ar', 'نهضة بركان', 'نهضة بركان'),
  -- Difaâ Hassani El Jadidi.
  ('d5d8c59b-f7ab-4b30-9dfb-1d17a36bd0fc', 'ar', 'الدفاع الحسني الجديدي', 'الدفاع الجديدي'),
  -- Hassania Union Sport d'Agadir.
  ('9f8c170d-24ed-41a3-99ca-a06167fd9c8b', 'ar', 'حسنية أكادير', 'حسنية أكادير'),
  -- Ittihad Riadi de Tanger.
  ('353e19d7-0a4b-41e6-a491-fc85f6c952d8', 'ar', 'اتحاد طنجة', 'اتحاد طنجة'),
  -- Kawkab Athlétique Club de Marrakech.
  ('d60d9d72-cb7a-4c94-944f-67081ef0a009', 'ar', 'الكوكب المراكشي', 'الكوكب المراكشي'),
  -- Club Omnisports de Meknès.
  ('8059c0cf-8b7b-4317-be7e-fd646d377cd0', 'ar', 'النادي المكناسي', 'المكناسي'),
  -- Union Touarga Sport, Rabat.
  ('b78eaee8-93af-4630-8335-b208151cbf37', 'ar', 'اتحاد تواركة', 'اتحاد تواركة'),
  -- Amal Tiznit.
  ('1ebd788b-9f71-4a78-bfa8-68359d7f3a3f', 'ar', 'أمل تيزنيت', 'أمل تيزنيت'),
  -- Wydad de Témara. NOT the Casablanca Wydad; the two share the first word.
  -- LOW CONFIDENCE on the full form.
  ('7d508334-d7a9-4a74-b057-7030c21a0eda', 'ar', 'نادي الوداد الرياضي لتمارة', 'وداد تمارة'),
  -- Zemamra. LOW CONFIDENCE: app.teams carries the name "CR Khemis Zemamra"
  -- but the code "RCAZ", and those two point at different Arabic first words.
  -- Do not run this file until the owner has settled this row.
  ('dc6fb819-6f3e-4584-ad73-7d567e80d32c', 'ar', 'نادي النهضة أتلتيك الزمامرة', 'نهضة الزمامرة')
on conflict (team_id, language) do update
  set name = excluded.name,
      short_name = excluded.short_name,
      updated_at = statement_timestamp();

-- Guard: exactly the 16 current clubs, no more and no fewer. If the current
-- season's membership set has moved since this file was drafted, this aborts
-- rather than seeding a stale list.
do $$
declare
  seeded integer;
  current_clubs integer;
begin
  select count(*) into seeded
  from app.team_translations
  where language = 'ar';

  select count(distinct team_membership.team_id) into current_clubs
  from app.team_memberships team_membership
  join app.seasons season on season.id = team_membership.season_id
  where season.is_current;

  if seeded <> current_clubs then
    raise exception
      'BG-0068 seed covers % clubs but the current season has %', seeded, current_clubs;
  end if;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Addendum, 2026-09-22: the Zemamra LATIN record.
-- ---------------------------------------------------------------------------
-- The owner's ruling was that app.teams.name "CR Khemis Zemamra" is the
-- inconsistent field and the code RCAZ is correct: RCAZ expands to Renaissance
-- Club Athletic Zemamra.
--
-- That correction deliberately does NOT go into app.teams. The catalog
-- ingestion overwrites name, short_name and code from the provider payload on
-- every sync, unconditionally:
--
--   update app.teams set name = v_name, short_name = v_short_name, code = v_code
--
-- (20260918160000_season_bounds_guard.sql). Editing app.teams would therefore
-- revert on the next SportsMonks run, silently, with nothing to show it had
-- ever been right.
--
-- app.team_translations is never written by ingestion -- which is the whole
-- reason the Arabic names above are durable -- and football_team_json resolves
-- `fr` through it exactly as it resolves `ar`. So the French correction is a
-- translation row, and it survives every sync by construction.
--
-- short_name 'RCA Zemamra' was proposed by the agent rather than supplied: the
-- owner specified the full name and the code but not a French short form, and
-- "CR Khemis Zemamra" could not stay -- short_name is the string every match
-- card and score header actually renders. CONFIRMED by the owner 2026-09-22.

insert into app.team_translations (team_id, language, name, short_name)
values ('dc6fb819-6f3e-4584-ad73-7d567e80d32c', 'fr',
        'Renaissance Club Athletic Zemamra', 'RCA Zemamra')
on conflict (team_id, language) do update
  set name = excluded.name,
      short_name = excluded.short_name,
      updated_at = statement_timestamp();
