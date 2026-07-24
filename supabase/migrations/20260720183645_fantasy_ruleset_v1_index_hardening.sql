-- Cover every foreign-key path introduced by Fantasy Ruleset v1.0. These are
-- additive indexes only; no rules, ownership, or worker behavior changes.

create index fantasy_chip_uses_chip_rule_idx
  on app.fantasy_chip_uses (chip_rule_id);

create index fantasy_fixture_assignments_fixture_idx
  on app.fantasy_fixture_assignments (fixture_id);

create index fantasy_fixture_assignments_original_gameweek_idx
  on app.fantasy_fixture_assignments (original_gameweek_id);

create index fantasy_deadline_change_audit_changed_by_idx
  on app_private.fantasy_deadline_change_audit (changed_by);

create index fantasy_free_transfer_rollovers_chip_rule_idx
  on app_private.fantasy_free_transfer_rollovers (chip_rule_id);
