-- BotolaGO V2 — Phase 6: stable Fantasy position reference catalog.
-- Quotas and scoring remain ruleset-owned and are deliberately not seeded.

insert into app.fantasy_positions (code, name, display_order) values
  ('GK', 'Goalkeeper', 1),
  ('DEF', 'Defender', 2),
  ('MID', 'Midfielder', 3),
  ('FWD', 'Forward', 4)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order;
