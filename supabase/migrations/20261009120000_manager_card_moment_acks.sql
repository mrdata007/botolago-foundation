-- Manager Card (BG-0158), gap plan 3.1: the moments a manager has seen.
--
-- D21: the moments a manager has already seen (a card created, a tier reached,
-- a season closed...) are recorded on the server so they do not come back on
-- another device. Written only by api.ack_manager_card_moments
-- (20261009120200), read only by app_private.manager_card_moments
-- (20261009120100). Display only. Rows go with the profile (cascade) and are
-- never pruned: a row is what stops a moment repeating.
--
-- No foreign key to app.manager_cards (card_created can be acknowledged on a
-- forming card that has no card row yet) and none to seasons (a key whose
-- season disappears simply stops matching). The uuid inside a key is a
-- fantasy_season_id. "homa" is never a key: a card starts there.

create table app.manager_card_moment_acks (
  user_id uuid not null references app.profiles(id) on delete cascade,
  moment_key text not null,
  acknowledged_at timestamptz not null default statement_timestamp(),
  constraint manager_card_moment_acks_pkey primary key (user_id, moment_key),
  constraint manager_card_moment_acks_key_check check (
    char_length(moment_key) <= 80 and moment_key ~ (
      '^(card_created|founder_granted|tier_changed:(stade|pro|champion|legend)|'
      || '(first_rating|provisional_cleared|season_closed|season_started):'
      || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
  )
);

alter table app.manager_card_moment_acks enable row level security;
alter table app.manager_card_moment_acks force row level security;
revoke all on app.manager_card_moment_acks from public, anon, authenticated, service_role;

create trigger manager_card_moment_acks_refuse_unverified_mfa_actor
before insert or update or delete on app.manager_card_moment_acks
for each statement execute function app_private.refuse_unverified_mfa_actor();

comment on table app.manager_card_moment_acks is
  'The Manager Card moments a manager has seen (display only, D21). Written only by api.ack_manager_card_moments. Row security forced, no policy, no grant: only definer functions read it. Cascades from the profile; never pruned.';
