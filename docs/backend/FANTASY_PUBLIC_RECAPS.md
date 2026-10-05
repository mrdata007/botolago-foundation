# Fantasy public gameweek recaps (R4)

Migration: `supabase/migrations/20261005130000_fantasy_public_recaps.sql`.
Test: `supabase/tests/database/fantasy_public_recaps.test.sql`.

A manager may publish the recap of one **finalized** gameweek under an alias
they choose. Anyone with the link reads it at `/journee/<publicId>`, signed in
or not.

## Switches (both OFF after the migration)

One row in `app_private.fantasy_public_recap_settings`:

| Switch            | Effect                                                                     |
| ----------------- | -------------------------------------------------------------------------- |
| `publish_enabled` | Managers see "Rendre ma journée publique" and can publish.                 |
| `read_enabled`    | Public pages answer. Off: every public page shows "not available" at once. |

Only the owner changes them, as a production write through the reviewed path
(`CLAUDE.md`, "Production database writes"):

```sql
-- Turn public recaps on (publish, read):
select app_private.fantasy_public_recap_configure(true, true);
-- Withdraw every public page immediately, keep the private recap:
select app_private.fantasy_public_recap_configure(false, false);
-- Change one switch only (null leaves the other as it is):
select app_private.fantasy_public_recap_configure(null, false);
```

Suggested order: apply the migration with both switches off, turn `read_enabled`
and `publish_enabled` on for a pilot, watch, then leave them on.

## What is public

Built on the server from the stored result, never from figures the app sends:
season name, gameweek number, the chosen alias, the final score, whether it
was corrected, the calculation version and update time, the transfer cost,
the chip, and the effective captain (name, points, multiplier) when the stored
captain bonus agrees with the player's points and the parts add up to the
final score.

Never: e-mail, real name, account or team ids, team name (unless chosen as the
alias), private leagues, invite codes, future squad.

## Lifecycle

- **Publish**: the signed-in owner (MFA step-up applies), gameweek `finalized`
  or `corrected`, result final, alias 2–40 characters. Publishing again
  returns the same link (the alias is updated).
- **Correct**: the page reads the stored result on every request, so an
  authoritative correction shows at once, marked "corrected" with its revision.
- **Revoke**: owner only; the page answers "not available" on the next
  request. The row is kept for the record with its alias cleared.
- **Republish** after revoking: a new link. A revoked link never comes back.
- **Cache**: the page is served `Cache-Control: no-store` and `noindex`.

Revoking stops access to BotolaGO's page. It cannot retract images the
manager downloaded or shared, or copies other services cached; the app says
so next to the button.

## Privacy in measurement

Page views and events report `/journee/*`, never the public id
(`src/lib/analytics.ts`).
