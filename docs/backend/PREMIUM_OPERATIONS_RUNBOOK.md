# BotolaGO+ (membership) operations runbook

Migrations `20261013100000` to `20261013100300`, installed by
`scripts/backend/apply-20261013100000-premium-foundation.sql`. The what and the
why are in `docs/plans/BOTOLAGO_PLUS_PLAN.md` (sections 1.2, 2c, 5, 7, 8) and
`docs/plans/BOTOLAGO_PLUS_DELIVERY_PLAN.md` (lane B); this file is what the
owner and on-call do with the database part. Nothing here is a checklist for
launch: payment providers, the billing webhook and the screens are other lanes.

## What it is, in one paragraph

BotolaGO+ is an optional paid membership. 20 MAD a month (`plus_monthly`,
renews, cancel any time) or 200 MAD a year (`plus_yearly`, 12 months from the
purchase, does not renew by itself). Prices are what the member pays, tax
included, stored in centimes (2000 and 20000). Members get cosmetic card
editions (Holo, Électrique, Pixels, Chrome; the free `standard` edition is the
earned tier's metal) and, in later lanes, deeper views of their own history. A
member's chosen edition is public wherever their card is drawn. **Membership
never changes a score, a rating, a tier, a rank or the order of any list.**

## The one rule: membership is display only

Only these functions name the membership or edition tables, and a database test
(`card_editions.test.sql`) fails if the list changes: the membership API
(`premium_status`, `get_my_premium`, `choose_card_design`,
`service_apply_billing_event`, the four `admin_*` functions), the two card reads
(`get_my_manager_card`, `get_manager_cards`, which gained one key, `edition`),
`app_private.has_premium`, `card_edition_effective`, `premium_configure`,
`premium_erase_user` and the account erasure. No ranking, league, Fantasy,
Pronostics, Pépites or Manager Card calculation reads them. If a change asks one
to, stop: it is not allowed.

## What ships, and that it ships off

- `app_private.premium_settings`: one row, `mode = 'off'`,
  `checkout_enabled = false`, `billing_paused = false`.
- Two products (`app_private.premium_products`) at 2000 and 20000 centimes, MAD.
  Provider product ids are empty until the stores and a payment provider exist.
- Five editions (`app.card_editions`): `standard` (free), `holo`, `electric`,
  `pixel`, `chrome` (paid).
- No entitlement, grant, customer, event or edition choice.
- While `mode = 'off'`: `app_private.has_premium` is false for everyone,
  `api.premium_status()` answers `{"enabled": false, ...}` with empty lists,
  `api.get_my_premium()` and `api.choose_card_design()` answer
  `{"available": false}` (before the step-up, so a signed-in account with a
  second factor is not asked for a challenge), and every card says
  `"edition": "standard"`.
- No pg_cron job. No Edge Function. Nothing scheduled.

## The switch

One row, changed only by `app_private.premium_configure(p_mode, p_checkout,
p_billing_paused)`, which only `postgres` can run. **`null` leaves that switch as
it is.** Always read the row first and write the previous values down:

```sql
select mode, checkout_enabled, billing_paused from app_private.premium_settings;
```

| Mode      | Who is a member                                                                | What the public sees                                                |
| --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `off`     | Nobody (a grant or an entitlement does not count)                              | Nothing. Every card is `standard`.                                  |
| `preview` | The same as `on`: a live grant, or a valid entitlement (a staff test purchase) | Nothing public. A member's own card shows the edition to them only. |
| `on`      | A live grant, or an entitlement that is active, cancelling or in grace         | `premium_status` enabled; editions are public on cards.             |

```sql
select app_private.premium_configure('preview', null, null);  -- launch step 1
select app_private.premium_configure('on', null, null);       -- the membership is open
select app_private.premium_configure(null, true, null);       -- web checkout may start (mode must not be off)
select app_private.premium_configure(null, false, null);      -- checkout stopped, members keep access
select app_private.premium_configure('off', null, null);      -- everything off; also forces checkout off
select app_private.premium_configure(null, null, true);       -- pause billing writes (see below)
select app_private.premium_configure(null, null, false);     -- resume billing writes
```

Switching `off` hides everything and keeps all data: entitlements, events,
grants and each member's remembered edition. Switching back on restores it. The
launch steps (delivery plan, section 5) are: `preview` with grants and test-mode
purchases for the owner and staff, then an invited group with complimentary grants, then `on` with
checkout enabled on the web. Each step is the owner's decision, run by the owner.

`api.premium_status()` reports `enabled: true` only in mode `on`.

## What writes, and who

| Writer                                                              | When                                                           | Writes                                                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `api.service_apply_billing_event` (the billing webhook, later lane) | When a provider or store notifies us                           | `app_private.billing_events` (insert only), `app.premium_entitlements`                 |
| `api.admin_grant_premium`, `api.admin_revoke_premium` (staff)       | When staff act                                                 | `app_private.premium_grants`, `app_private.admin_audit_events`, admin idempotency keys |
| `api.admin_get_premium_member` (staff)                              | When staff read one member                                     | `app_private.admin_audit_events` (the read is audited)                                 |
| `api.choose_card_design` (a member)                                 | When a member picks an edition                                 | `app.card_edition_choices` (one row per member)                                        |
| `api.set_card_history_visibility` (any signed-in account)           | When someone shows or hides their card history to league mates | `app.card_history_visibility` (one row per account, their own only)                    |
| `app_private.account_deletion_erase`                                | Hourly worker, when a deletion is due                          | Pseudonymises `app_private.billing_events`; the rest goes by cascade                   |
| `app_private.premium_configure`, the owner's scripts                | When the owner runs them                                       | `premium_settings`, `premium_products`, `card_editions`                                |

There is no scheduled job. In particular there is **no expiry tick**:
`app_private.has_premium` and `premium_effective_state` apply the dates at read
time, so a paid period that has ended stops counting at that second whether or
not the provider's event has arrived. A future job that tidies stored states (a
`cancelling` row past its date to `expired`) would only change what is stored,
never who is a member; if one is added it joins the list in `AGENTS.md`.

## The billing events

`api.service_apply_billing_event(p_event jsonb)` is the only way a membership
changes. Service role only. The event model is provider-agnostic: the worker
maps CMI, Payzone, RevenueCat, App Store or Play notifications onto it. The
header of `20261013100200_premium_api.sql` lists every key. In short:

- `providerEventId` is unique across all providers (prefix it: `revenuecat:...`).
  A replay answers the first outcome and writes nothing. Two deliveries at once
  are serialised per member.
- `signatureVerified` must be `true`, set by the worker only after it verified
  the provider's signature. `false` is stored (`rejected_signature`) and moves
  nothing.
- `source` is `web`, `apple`, `google` or `grant` (a promotional entitlement
  from a store service). Events other than purchase and renewal must come from
  the source that holds the membership; a store `expire` cannot end a web
  membership.
- An event older than the member's last applied one is stored and ignored
  (`ignored_stale`), so out-of-order delivery is safe.

The state machine (`app_private.premium_next_state`, plan 5.2). `-` means the
event does not apply in that state: it is stored with outcome `ignored_state`.

| Event            | none   | active     | cancelling | grace    | on_hold  | expired  | refunded | revoked |
| ---------------- | ------ | ---------- | ---------- | -------- | -------- | -------- | -------- | ------- |
| `purchase`       | active | active     | active     | active   | active   | active   | active   | active  |
| `renewal`        | active | active     | active     | active   | active   | active   | -        | -       |
| `cancel`         | -      | cancelling | cancelling | grace    | expired  | -        | -        | -       |
| `uncancel`       | -      | -          | active     | -        | -        | -        | -        | -       |
| `payment_failed` | -      | grace      | -          | grace    | -        | -        | -        | -       |
| `hold`           | -      | on_hold    | -          | on_hold  | on_hold  | -        | -        | -       |
| `expire`         | -      | expired    | expired    | expired  | expired  | expired  | -        | -       |
| `refund`         | -      | refunded   | refunded   | refunded | refunded | refunded | -        | -       |
| `revoke`         | -      | revoked    | revoked    | revoked  | revoked  | revoked  | -        | -       |

Member features: `active`, `cancelling` (until `current_period_end`) and `grace`
(until `grace_until`; 7 days from the failure when the provider gives no date).
Never: `on_hold`, `expired`, `refunded`, `revoked`. A grace that has ended reads
as `expired` on the web and `on_hold` in a store. Buying again while a period is
still running never shortens what was paid for (the later end wins). The yearly
product does not renew: `get_my_premium` reports `cancelAtPeriodEnd: true`.

### Looking at what happened (reads only)

```sql
-- the last events and what became of them
select id, provider_event_id, provider, source, event_type, outcome, state_before, state_after, occurred_at
from app_private.billing_events order by id desc limit 50;

-- events that did not apply, and why
select outcome, count(*) from app_private.billing_events group by outcome order by count(*) desc;

-- members by effective state
select app_private.premium_effective_state(state, source, current_period_end, grace_until) as state, count(*)
from app.premium_entitlements group by 1 order by 2 desc;
```

`api.admin_premium_overview()` gives the same counts to staff (counts only, no
member list), and `api.admin_get_premium_member(user, reason, request id)` shows
one member (entitlement, grants, last 20 events without payloads) and is written
to the admin audit log.

### Correcting a wrong state

Never update `app.premium_entitlements` by hand. Send the correcting event
through `api.service_apply_billing_event` (a real provider event id, or a
`manual:<ticket>` id for a decision by the owner), or give a complimentary grant.
A manual correction is a write: follow "Before any write" below, and say so in
the report.

## Grants

Complimentary memberships (press, partners, support goodwill, the owner's
preview) are `app_private.premium_grants` rows made by staff with
`api.admin_grant_premium(user, ends_at, reason, idempotency key)`: permission
`premium.grant` (held by `platform_admin`), second factor and a recent
authentication, a reason of 8 to 500 characters, at most 400 days, audited, and
repeating the same key answers the first grant. `api.admin_revoke_premium`
ends one at once. A grant counts in modes `preview` and `on`, independently of
any paid entitlement. **One admin is enough** (owner decision, 2026-10-13): single operator, recent
authentication, reason, audit. Do not add dual control for grants in the admin
lane.

## Prices and products

`app_private.premium_products` is configuration, changed by the owner's script,
not by a migration. A price change affects what the paywall shows and the saving
it computes (`premium_status.savingMinor`: twelve months at the monthly price
minus the yearly price, 4000 centimes today); it does not change what a provider
already charges a member. Set the stores' and the payment provider's product ids
in `provider_product_ids` when they exist. Retire a product with
`active = false`: it cannot be bought (`ignored_product`) but existing members
keep renewing.

```sql
update app_private.premium_products
set provider_product_ids = provider_product_ids || '{"apple": "com.botolago.plus.monthly"}'::jsonb
where code = 'plus_monthly';
```

## Editions

`app.card_editions` is the catalogue: `status` (`active` or `retired`),
`starts_at` and `ends_at` (a window, both optional), French and Arabic labels,
`finish` (the renderer's key). `standard` can never be paid, retired or
windowed (a table check). A retired or out-of-window edition cannot be chosen and
a card that wore it shows `standard`; the member's choice row is kept.

A card shows the chosen edition only if the member is a member now. When
membership ends the card goes back to `standard` everywhere and the choice is
remembered; renewing brings it back. In `preview` an edition is shown only to the
card's owner. `card.edition` is added to `api.get_my_manager_card` and to every
card of `api.get_manager_cards`; nothing else about those answers changed.

## Premium card reads: « Votre carrière » and « Face-à-face+ »

Migration `20261013100400_premium_card_reads.sql`, applied by
`scripts/backend/apply-20261013100400-premium-card-reads.sql` **after** the
foundation. It adds one table, nine helpers and four api functions, and replaces
nothing. It schedules no job.

| Function                                              | Who                            | Answers                                                                                                             |
| ----------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `api.get_my_card_career(p_season text)`               | Members                        | The caller's own season week by week, best and worst weeks, captain hit rate, transfer gains, season against season |
| `api.get_card_duel(p_other_team uuid, p_season text)` | Members, against a league mate | Today's two cards; the week-by-week comparison only if the mate allows it                                           |
| `api.set_card_history_visibility(p_visible boolean)`  | Any signed-in account          | Shows or hides the caller's card history to league mates                                                            |
| `api.get_my_card_history_visibility()`                | Any signed-in account          | The current value (`false` until set)                                                                               |

`p_season` is a Fantasy season id or its label (`2026/27`, or `2026/2027`);
absent means the current season.

**Display only, nothing computed.** The reads take what the Manager Card already
computed (`app.manager_card_gameweeks`) and what Fantasy already stored (results,
lineups, player points, confirmed transfers) and write nothing. The card's
calculation is not touched. The captain figures repeat the card's CAP definition
and the transfer gains its TRF definition (D4) in separate read-only functions
(`app_private.card_captain_rows`, `app_private.card_transfer_rows`); the pgTAP
test `premium_card_reads.test.sql` proves they agree with the card: the mean
captain share equals `cap_raw` and the mean transfer gain equals `trf_raw`,
before and after the season's last gameweek. If the card's rules change (a new
`rules_version` with another CAP or TRF definition), these two helpers must be
updated with them and that test is the alarm. `card_captain_rows` reads
`cap_ignore_deadlines_before` and `card_transfer_rows` reads
`trf_window_gameweeks` from the **active** rules row.

**What a caller gets** (checked in this order: argument, off, step-up, caller,
membership):

| Situation                                               | Answer                                         |
| ------------------------------------------------------- | ---------------------------------------------- |
| BotolaGO+ `off`, or the Manager Card reads off          | `{"available": false}`                         |
| `preview`, caller is not a member                       | `{"available": false}` (nothing public yet)    |
| `on`, caller is not a member (or the membership lapsed) | `{"available": true, "locked": true}`, no data |
| A member                                                | `{"available": true, "locked": false, ...}`    |

**The privacy switch (plan Q6, law 09-08, CNDP).** `app.card_history_visibility`
holds one row per account that ever set it; **no row means hidden**, and the
default stays off until the lawyer answers. A duel shows the friend's
week-by-week history only if the friend switched it on. Hidden, the answer
carries only today's card values (what `api.get_manager_cards` already shows
league mates), `historyVisible: false`, no weeks and no summary. A friend does
not need to be a member, and their switch wins. To change the default for
everyone later is a new migration (a changed column default and, if wanted, a
backfill), not a setting.

**Who is a league mate.** Both accounts are active members of the same **active
private** league of the season compared. A public league does not count; a
member who left or was removed does not count; an inactive league does not
count. Anything else (unknown team, oneself, no shared league, a season not
shared, a deleted-pending profile) is the same `PT404 card_duel_not_found`, so
nothing says which it was.

**Operations.**

- Switching BotolaGO+ `off` turns all four off and keeps every privacy row.
- The only table written is `app.card_history_visibility`, by each account for
  itself (ordinary app traffic, like the acknowledgement of card moments). To
  write to it directly (a support request, a lawyer's instruction) pause nothing
  else; take the baseline read first
  (`select count(*), count(*) filter (where visible_to_league_mates) from
app.card_history_visibility;`) and compare after. The account erasure removes
  the row by cascade.
- Cost: both reads are per-caller and bounded by the season's gameweeks. The
  best/worst weeks rank each of at most six gameweeks over that gameweek's
  results (index `fantasy_team_gameweek_results_rank_idx`); measure on a large
  fixture before switching on, as for the card tick.
- Lanes that change `api.get_manager_cards`, the card tables or the Fantasy
  results contract should rerun `premium_card_reads.test.sql`.

## Account deletion

`app_private.account_deletion_erase` now:

- takes the member's `:premium` advisory lock (the same one the billing writer
  takes), so an event cannot land half-way through the erasure;
- **refuses** (`PT409 account_deletion_subscription_active`) while the member
  holds a renewing **web** subscription that is `active` or in `grace`. The
  billing worker must cancel it at the provider first (state `cancelling`); the
  deletion worker releases the request and retries on its next hourly run.
  Store subscriptions (Apple, Google) can only be cancelled by the member in the
  store and are not refused; the terms must say so;
- pseudonymises `app_private.billing_events` before the account goes (user id
  cleared, raw payload emptied, a stable `erased-<hash>` pseudonym, `erased_at`);
  amounts, currency, dates, product and provider event ids are kept as
  accounting records kept for **5 years** (owner decision, 2026-10-13). No purge
  ships and no job is scheduled: the rows stay until a reviewed, switch-gated
  purge is added in a later migration;
- everything else (entitlement, grants, customer ids, edition choice) goes by
  cascade with the profile.

## Before any write (AGENTS.md)

1. List what is running: other agents, workflows, the scheduled jobs in
   `AGENTS.md`. Nothing may be writing to the same database.
2. Pause the BotolaGO+ writer if the write touches its tables:
   `select app_private.premium_configure(null, null, true);` makes
   `api.service_apply_billing_event` refuse with a retryable `PT503
premium_billing_paused` and store nothing, so a provider redelivers later. A
   delivery already in flight can still finish: check the Edge Function logs
   (once the webhook exists) as well as the setting. Resume with
   `(null, null, false)` afterwards.
3. `premium_configure('off')` is **not** a pause: it hides the membership but the
   webhook still records events (billing facts are true whatever the mode).
4. A write to the account-deletion tables or the erase function also needs
   `select app_private.account_deletion_configure(false);` (and back on after).
5. Take a baseline read immediately before and compare immediately after.

## Applying the migrations

Exactly the house path (`CLAUDE.md`, `docs/backend/MIGRATIONS.md`,
`RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`). Forward-only; the owner runs the
guarded script; nothing here is applied by an agent.

1. After the pull request is merged and its `database-quality` job is green.
2. **Staging first** (`srdrflfrfpwixsllveid`), then production
   (`tkewgajrljbwgwedqsxn`), one at a time, never both at once.
3. Pause automatic account deletion
   (`select app_private.account_deletion_configure(false);`), note whether it was
   on. The script refuses while it is on or a request is being processed.
4. Paste `scripts/backend/apply-20261013100000-premium-foundation.sql` in the SQL
   editor and run it as shipped. It is a rehearsal: it applies, checks, and ends
   with a deliberate error `REHEARSAL PASSED -- nothing was saved: {state}`; the
   state it carries is what a real run would save. Re-read to confirm the
   rollback held: `select to_regclass('app_private.premium_settings') is null;`
   must say `true`.
5. Change `'rehearsal'` to `'apply'` in the `bg.premium_mode` line near the top
   and run again. The result row says `Applied`. Then re-read:
   `select * from app_private.premium_settings;` is `off / false / false`.
6. Switch account deletion back on if it was on.
7. Look at staging (the read queries above, `api.premium_status()`) and leave
   it off. Production only after staging has been looked at.

If a check fires, nothing is saved. Do not edit a check: it means the database
is not in the state the script assumes. The script is rebuilt from the migration
files by `bun scripts/backend/build-apply-premium-foundation.ts` and a test
fails if they drift.

**Then the premium card reads**, once the foundation is applied on that database
(the script refuses otherwise): paste
`scripts/backend/apply-20261013100400-premium-card-reads.sql`, same two steps
(rehearsal, then `'apply'` in the `bg.premium_reads_mode` line). It replaces no
function, so it needs no pause of automatic account deletion; it still follows
"Before any write" (nothing else writing). Re-read after the rehearsal:
`select to_regclass('app.card_history_visibility') is null;` must say `true`.
It is rebuilt by `bun scripts/backend/build-apply-premium-card-reads.ts` and
`apply-premium-card-reads-script.test.ts` fails if they drift.

## Rolling back

There is no down migration (forward-only). In order of how much you want to undo:

1. **Stop it being visible**: `select app_private.premium_configure('off', null,
null);`. Nobody is a member, every card is `standard`, the paywall answers
   disabled. Data is kept. This is the rollback for anything that went wrong at
   launch.
2. **Stop money**: `select app_private.premium_configure(null, false, null);`
   stops checkout and keeps members. Members who paid keep what they paid for.
3. **Stop writes** while you work: `(null, null, true)` as above.
4. **Remove the premium card reads** (not expected): a new forward migration that
   drops the four api functions, the nine helpers and
   `app.card_history_visibility`. Nothing else depends on them. Switching
   BotolaGO+ off already hides them.
5. **Remove the objects** (not expected): a new forward migration that drops the
   functions, the tables, the two permissions and restores
   `account_deletion_erase`, `api.get_my_manager_card` and `api.get_manager_cards`
   to their previous definitions (`20261012200100`, `20261010120200`), written
   and reviewed like any other, applied by a guarded script. Billing events are
   accounting records: export them before dropping anything.

## Open questions

Decided by the owner on 2026-10-13: preview counts entitlements, grants need one
admin, billing records are kept 5 years. Still open: whether to refuse deletion
for a store subscription, and the Arabic labels of the editions (the owner will
review them).

Premium card reads: the default of the privacy switch (hidden, until the lawyer
answers plan Q6 / the CNDP point); whether a duel whose friend keeps their history
hidden should still show the per-journée scores that the league table already
shows league mates (today it does not: nothing of the friend's weeks appears);
whether a former league mate should remain comparable for a season they shared
(today both memberships must be active now).

---

## Draft entry for `AGENTS.md` (not applied: AGENTS.md is edited in its own commit)

Add at the end of item 3, "Check the scheduled jobs too", after the account
deletion and Manager Card paragraphs:

> Where migrations 20261013100000 to 20261013100300 are applied, BotolaGO+
> (membership) adds no pg_cron job. Its one automatic writer is the billing
> webhook (`billing-webhook` and `billing-restore`, Edge Functions of a later
> lane), which calls `api.service_apply_billing_event` when a payment provider
> or app store notifies us, at any hour, not on a schedule. It writes
> `app_private.billing_events` and `app.premium_entitlements`. Staff grants write
> `app_private.premium_grants`, a member choosing a card edition writes
> `app.card_edition_choices`, an account switching its card history on or off for
> league mates writes `app.card_history_visibility` (its own row only; the premium
> card reads of migration 20261013100400 write nothing else), and the account erasure pseudonymises
> `app_private.billing_events` ([PREMIUM_OPERATIONS_RUNBOOK.md](docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md)).
> Pause the billing writer before a write that touches those tables, and restore
> it afterwards: `select app_private.premium_configure(null, null, true);` makes
> the function refuse with a retryable 503 (providers redeliver) and store
> nothing; `select app_private.premium_configure(null, null, false);` resumes.
> Record `select mode, checkout_enabled, billing_paused from
app_private.premium_settings;` first. Switching the mode off
> (`premium_configure('off', null, null)`) hides the membership but does **not**
> stop the webhook recording events. A delivery already in flight can finish
> after the pause: check the Edge Function logs as well as the setting. Pause
> automatic account deletion too (above) before a write to the erase function.
