# Plan: publish a journée's Fantasy points all at once (29 Oct 2026)

Owner request: no more "some matches have points, others don't". Publish the
whole journée at one fixed moment, when every rating is in. Plan first.

## What happens today (checked in code and production)

- Fantasy points are Sofascore ratings, so no match has points while it is
  being played. A match gets points the moment its ratings arrive, player by
  player. Rankings move every 10 minutes as they arrive.
- Measured on the 10 most recent matches:
  - first ratings come 11 to 26 h after the final whistle;
  - every player is rated or settled 12 to 38 h after it;
  - two matches took longer: the Sofascore outage (96 h), and short cameos,
    which settle as "Not rated" only at the 48 h read.
- Once all ratings are in, the system finalizes the journée in one go: prices,
  the "points ready" notification, prizes, Manager Card, trophies and rivals.
  Those already wait for the end. Only the points and rankings trickle out.

## Proposal

1. **One publication time per journée:** 14:00 Morocco time, two days after
   the journée's last match.
   - Example: Journée 5 ends Thursday evening, so its points go out Saturday
     at 14:00.
   - That covers every normal case measured (12–38 h), with room to spare.
2. **Until then, fans see no new points for that journée.**
   - Match pages (scores, goals, line-ups) are unchanged.
   - The Fantasy screens say «Points de la Journée 5 : samedi à 14h»
     (Arabic too).
3. **At 14:00 everything goes out together:** points, rankings, leagues,
   Manager Card, trophies, prizes and the "points ready" notification and
   email. This is one moment, the same for everyone.
4. **If a rating is still missing at 14:00,** the whole journée waits until
   14:00 the next day. It is never published half-done. After 7 days the
   owner is alerted to decide.
5. **Short cameos settle faster.** One extra rating read is added just after
   the 24 h mark, so a 1–9 minute cameo can settle at about 24 h instead of 48 h.
   - This costs about 8 extra SportAPI calls a journée.
6. **The watchdog follows the new rule.**
   - A missing rating before the publication time is information, not an alarm.
   - It fails only if the journée could not be published at its time.
   - This also ends the red watchdog after every match day.
7. **Starts with Journée 6.** Journée 5 already shows most of its points, and
   hiding them now would look worse.

## What does not change

- Scoring rules, captain, chips and transfers.
- The next journée opens on time, as today. Managers pick their team for the
  next round before the last round's points are out, which is already the case
  with midweek rounds.
- Live match data.

## How it is built (Batch 2, Builder, then Tester, then Lead)

- **Database:**
  - a "publish not before" time for each journée, worked out from its last
    match;
  - the worker waits for it before writing points and finalizing;
  - the watchdog thresholds are updated;
  - the extra rating read is added.
- **Website:** the "points on Saturday at 14:00" message, French and Arabic,
  with screenshots, following the screen rules.
- **Tests:** the existing Fantasy tests, plus new ones for "nothing shows
  before the time", "all shows at the time" and "one rating missing, so the
  whole journée waits a day".
- **Owner steps after review:** apply the migration, deploy the worker
  function, publish the site. Nothing goes live without the owner's yes.

## Urgent, separate: Journée 6 has not opened (deadline 30 Oct 18:30 UTC)

- **The cause.**
  - Maghreb Fès v RSB Berkane was booked in the Fantasy calendar for 20:00.
  - It kicked off at 17:00 instead.
  - The step that closes Journée 5 and opens Journée 6 refuses any match whose
    kick-off differs from the booked time. It has failed every 10 minutes since
    the match ended.
  - The calendar update that normally fixes the times never touches a round
    that has already started.
- **The fix tonight.** A guarded one-off script sets that one match's booked
  time to 17:00.
  - It pauses the Fantasy jobs, records an audit line, and is rehearsed first.
  - After it, the next worker pass closes Journée 5 and opens Journée 6.
  - It is fair: every Journée 5 team was locked on 24 Oct, before both times.
- **The permanent fix.** Batch 2 item F7: a match moved after the lock no longer
  blocks the close.
