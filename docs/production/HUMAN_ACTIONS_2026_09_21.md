# Human actions — 2026-09-21

Everything here needs a person: a credential, a dashboard, a decision, or a
production write. Nothing in this file has been executed. Ordered by deadline,
not by size.

Ground truth: production Supabase `tkewgajrljbwgwedqsxn`, read-only inspection
on 2026-09-21. Every claim below is followed by the query or file that proves
it, so you can re-check anything before you act on it.

---

## Owner decisions recorded 2026-09-21

- **GW1 deadline: leave as stored. No realign.** No users are expected this
  week. §0.2 below is therefore **not** to be run — it is kept for reference and
  because the situation changes if kickoffs publish. Read §0.4 first: automation
  is now on, and that interacts with this decision.
- **`FANTASY_AUTOMATION_ENABLED` and `FOOTBALL_CURRENT_SCHEDULE_ENABLED`: set.**
- **`ELBOTOLA_SCHEDULE_ENABLED` and `GNEWS_SCHEDULE_ENABLED`: stay off.**
  Confirmed — the News stand-down wins. §1.3 and §1.4 are settled, not open.
- **Signup: email-template fix.** `{{ .Token }}` is being added to the Supabase
  confirmation template and the existing six-digit UI stays. §2.1 is settled.
- **Site URL and redirect allow-list: now set to `botolago.com`.** §2.2 is done.
- **`www.botolago.app` stays for now — do not touch it.**
- **Credential rotation (§3.2) and the Lovable service-role `SUPABASE_URL`
  (§3.3): deferred to post-launch.** Not blocking; marked `DEFERRED` in the
  ledger.

---

### 0.4 One consequence of switching automation on, given "no realign"

These two decisions interact, and the interaction is not obvious.

**The deadline may now move by itself, without anyone running anything.**
`FOOTBALL_CURRENT_SCHEDULE_ENABLED` ingests real kickoffs daily at 07:43 UTC;
`FANTASY_AUTOMATION_ENABLED` runs `api.service_sync_fantasy_calendar` hourly. If
SportsMonks publishes all eight real kickoffs **before** Wednesday 22:30 UTC,
the orchestrator will realign the assignments _and_ rewrite
`deadline_at`/`starts_at`/`ends_at`. That is a realign — just an automatic one.

It moves in the safe direction. The real matches are on 2026-09-24, so
`kickoff − 90 minutes` is necessarily **later** than the stored 2026-09-23
22:30 UTC: managers would get more time, never less.

**After Wednesday 22:30 UTC the deadline becomes immutable — at the database
level, not by convention.** `app_private.fantasy_guard_deadline_change` is a
trigger on `app.fantasy_gameweeks`:

```sql
if old.status <> 'open' or statement_timestamp() >= old.deadline_at then
  raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
end if;
```

So from that instant, **nothing** can change GW1's deadline: not the
orchestrator, not `fantasy-realign-gameweek-calendar.sql` (which guards on the
same condition), not a hand-written `UPDATE` in the SQL editor. Only a migration
that alters or drops that trigger could, and that is a much larger decision.

What that leaves, if kickoffs publish after Wednesday 22:30 UTC: the assignment
kickoffs realign to the real times (that step is not deadline-gated), while
`deadline_at` stays 2026-09-23 22:30 UTC and `starts_at`/`ends_at` stay
2026-09-24 00:00–06:00 UTC. Squads would lock well before the first match, and
the stored window would no longer contain the fixtures it is supposed to cover.

Given that no users are expected this week, that may be entirely acceptable —
it is your call and it is recorded as made. Flagging it only because "leave as
stored" and "automation on" cannot both hold once the provider publishes, and
the door closes for good on Wednesday at 22:30 UTC.

---

## 0. Before Wednesday 2026-09-23 22:30 UTC — the GW1 deadline

**This is the only item with a hard clock on it.**

### 0.1 Does the hourly orchestrator realign GW1 by itself? **NO.**

The sweep asked for a YES/NO with the lines that prove it. The answer is no, for
two independent reasons, either of which is sufficient.

**Reason one: the orchestrator has never run.** `app_private.fantasy_job_runs`
has **0 rows**. The workflow `.github/workflows/fantasy-season-orchestrator.yml`
is gated on the repository variable `FANTASY_AUTOMATION_ENABLED`, which is not
set. Nothing is running hourly. See §1.1.

**Reason two: even if it ran right now, it would change nothing, and after
Wednesday 22:30 UTC it can never change GW1 again.**

Current state of GW1, read from production:

| field                                     | value                  |
| ----------------------------------------- | ---------------------- |
| status                                    | `open`                 |
| deadline_at                               | 2026-09-23 22:30:00+00 |
| starts_at                                 | 2026-09-24 00:00:00+00 |
| active counting assignments               | 8                      |
| of those, with an **unconfirmed** kickoff | **8**                  |
| frozen assignments                        | 0                      |

"Unconfirmed" is not a judgement call — `app_private.fantasy_kickoff_confirmed`
is exactly:

```sql
select p_kickoff_at is not null
  and (p_kickoff_at at time zone 'UTC')::time <> time '00:00:00';
```

All eight fixtures still carry the provider placeholder `2026-09-24 00:00:00Z`,
so all eight are unconfirmed.

Now follow `api.service_sync_fantasy_calendar` for GW1:

1. GW1 is `open` with no frozen assignments, so it is **not** skipped as
   `gameweek_locked`.
2. The realign step updates `assigned_kickoff_at` only
   `where app_private.fantasy_kickoff_confirmed(f.kickoff_at)` — today that
   matches **zero** rows.
3. It then counts `unconfirmed_active`. At 8 > 0 it writes the note
   `deadline_unconfirmed` and **skips the entire deadline-and-window update**.
   This is deliberate and correct: a partially published round must never
   produce a deadline derived from a placeholder.
4. If and when SportsMonks publishes real kickoffs for **all eight** fixtures,
   `unconfirmed_active` reaches 0 and the function would compute
   `new_deadline = first real kickoff − 90 minutes`
   (`app.fantasy_deadline_rules.minutes_before_first_fixture = 90`) and write it.
5. **But** that write is guarded by:

   ```sql
   if gw.status = 'open' and gw.deadline_at <= statement_timestamp() then
     notes := notes || '"deadline_locked"'::jsonb;
   ```

   GW1 is `open` and its deadline is 2026-09-23 22:30 UTC. **From that instant
   onward the orchestrator can never move GW1's deadline**, no matter what
   SportsMonks publishes afterwards.

So the automatic path only saves you if **all eight** real kickoffs land
**before** Wednesday 22:30 UTC **and** automation is switched on first. If
either is untrue, you must run §0.2 yourself.

The failure this prevents is not cosmetic. If the deadline stays at 2026-09-23
22:30 UTC while the real matches kick off during 2026-09-24, managers lose
their squads roughly a day early — and the lifecycle worker separately refuses
to freeze a gameweek whose fixture kickoff differs from its assignment
(`fantasy_fixture_resolution_required`), which blocks the gameweek entirely.

### 0.2 Realigning GW1 by hand — NOT TO BE RUN (owner decision: leave as stored)

Use `scripts/backend/fantasy-realign-gameweek-calendar.sql`. It derives the
deadline from the ruleset (90 minutes before the first kickoff); it never
accepts a hand-typed deadline. It was rehearsed on 2026-09-18 inside a
rolled-back transaction (`docs/qa/FANTASY_LAUNCH_HARDENING_2026_09_18.md §2`).

Edit exactly one value — the parameter block near the top:

```sql
p_gameweek_id   uuid        := '3cc19aaa-ea33-4909-845b-db33314b4071';  -- GW1 2026/27, already correct
p_first_kickoff timestamptz := '<LNFP_KICKOFF_UTC>';                    -- official first kickoff, UTC
```

`<LNFP_KICKOFF_UTC>` is the official first kickoff of round 1 as published by
the LNFP, **in UTC**, in the form `2026-09-24T20:00:00Z`. Morocco is UTC+1, so a
19:00 local kickoff is `18:00:00Z`. Getting the timezone wrong moves every
manager's deadline by an hour.

Run the whole file, as the database owner, in the Supabase SQL editor (or psql
with the service role). It opens its own transaction. Its guards all raise and
roll back rather than half-applying:

- the gameweek must be `open` with its deadline still in the future;
- every fixture must still be scheduled / not started;
- the new deadline must be in the future.

**Verify afterwards** — both queries, not just the first:

```sql
-- 1. the gameweek itself
select sequence_number, status, deadline_at, starts_at, ends_at
from app.fantasy_gameweeks
where id = '3cc19aaa-ea33-4909-845b-db33314b4071';
-- expect: deadline_at = your kickoff minus 90 minutes, starts_at = your kickoff

-- 2. the assignments, which are what the lifecycle worker actually reads
select f.id, f.kickoff_at, a.assigned_kickoff_at,
       app_private.fantasy_kickoff_confirmed(f.kickoff_at) as confirmed
from app.fantasy_fixture_assignments a
join app.fixtures f on f.id = a.fixture_id
where a.gameweek_id = '3cc19aaa-ea33-4909-845b-db33314b4071'
  and a.superseded_at is null
order by a.assigned_kickoff_at;
-- expect: 8 rows, every `confirmed` true, kickoff_at = assigned_kickoff_at
```

If the second query still shows `confirmed = false` anywhere, the deadline is
not safe yet and the gameweek will not freeze.

**If a guard trips**, it names what tripped it — do not loosen it. A guard
firing means the world is not in the state the script assumes, and the right
response is to find out why, not to edit the guard.

---

### 0.3 Deactivate the five relegated clubs (BG-0043)

**Why.** `app.teams` holds 21 rows with `active = true`, but Botola Pro 2026/27 has 16
participants. Five clubs left over from the 2024/25 backfill are still marked active, so
`api.football_team_catalog` — which does correctly filter on `active` — offers 21 clubs to the
news filters, the club pages and the FDR grid. The five are:

| Club              | id                                     |
| ----------------- | -------------------------------------- |
| Chabab Mohammédia | `7ff33380-1236-45e5-9c3e-97e753961cc9` |
| JS Soualem        | `318655a9-db9f-4706-abb2-df0fa4b13baf` |
| Olympic Safi      | `32fb7b61-9af4-4667-8978-b739b5e3f170` |
| Olympique Dcheïra | `f2715f02-38ed-4feb-a4e5-72444ad39529` |
| Yacoub El Mansour | `e595b91e-4d8f-4f3d-92d7-c23d7e332544` |

None of them has a 2026/27 squad row, a 2026/27 fixture, or a single fantasy player. Their
history (memberships, fixtures, standings, provider mappings, crests) is untouched by this
operation — only the `active` flag changes.

### How to run it

1. Open the Supabase SQL editor for project `tkewgajrljbwgwedqsxn` **as the database owner**, or
   connect with `psql` as `postgres`. This needs a BYPASSRLS session: every `app.*` table carries
   `FORCE ROW LEVEL SECURITY`, so `service_role` has no path to a raw `UPDATE` on `app.teams`.
2. Paste the whole of `scripts/backend/football-deactivate-non-current-teams.sql` and run it.
   The file opens its own transaction and **does not commit** — the final `commit;` is
   deliberately commented out.
3. Read the `NOTICE` output and the two review queries at the bottom (see below).
4. If — and only if — the output matches what is expected, run `commit;`.
   If anything at all looks wrong, run `rollback;`. Closing the session without committing also
   rolls back, which is the safe outcome.

### What the output should look like

Three notices, in this order:

```
NOTICE:  bg0043: current season(s): {<the 2026/27 season id>}
NOTICE:  bg0043: about to deactivate 5 club(s):
  - Chabab Mohammédia (7ff33380-1236-45e5-9c3e-97e753961cc9)
  - JS Soualem (318655a9-db9f-4706-abb2-df0fa4b13baf)
  - Olympic Safi (32fb7b61-9af4-4667-8978-b739b5e3f170)
  - Olympique Dcheïra (f2715f02-38ed-4feb-a4e5-72444ad39529)
  - Yacoub El Mansour (e595b91e-4d8f-4f3d-92d7-c23d7e332544)
NOTICE:  bg0043: deactivated 5 club(s); 16 clubs remain active
```

Then a five-row result listing exactly those five clubs, a 21-row listing of every club with its
`active` flag, and finally:

```
 active_clubs | inactive_clubs | catalog_entries
--------------+----------------+-----------------
           16 |              5 |              16
```

**`active_clubs = 16`, `inactive_clubs = 5`, `catalog_entries = 16`.** If those three numbers are
right and the five names are the five above, commit.

### Verification query — run this **after** committing

```sql
select
  (select count(*) from app.teams where active) as active_clubs,
  (select count(*) from app.teams where not active) as inactive_clubs,
  jsonb_array_length(api.football_team_catalog('fr', 100)) as catalog_entries,
  jsonb_array_length(api.football_team_catalog('ar', 100)) as catalog_entries_ar,
  (select string_agg(name, ', ' order by name) from app.teams where not active) as deactivated_clubs;
```

Expected: `16 | 5 | 16 | 16 | Chabab Mohammédia, JS Soualem, Olympic Safi, Olympique Dcheïra,
Yacoub El Mansour`.

Then reload a page that uses the club list (the news team filter, or the club index). It should
offer 16 clubs, not 21. `api.news_team_filters` and the FDR grid need no separate check: the news
filter applies the same `active` predicate, and `api.fantasy_fixture_difficulty` never reads
`app.teams` at all — it derives its clubs from the fantasy season's fixture assignments, which
only ever contain 2026/27 fixtures.

### Re-running it

The script is idempotent. A second run finds no candidates, prints

```
NOTICE:  bg0043: already_applied — no active club is outside the current season; 16 clubs remain active, nothing written
```

and writes nothing — not even an `updated_at` bump. If you are unsure whether the first run
committed, just run it again and read that notice.

### If a guard trips

Every guard raises an exception, which rolls the **entire** transaction back. Nothing is ever
partially applied. **Do not edit the script to make a guard pass** — the guards exist precisely
because deactivating the wrong clubs is far worse than not deactivating any. Report the message
to engineering (BG-0043) instead.

| Message                                                                              | What it means                                                                                                                                                                                         | What to do                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bg0043 refused: no_current_season`                                                  | No `app.seasons` row has `is_current = true`.                                                                                                                                                         | Something is wrong with the season state, not with the club list. Stop and report.                                                                                       |
| `bg0043 refused: unexpected_affected_count — expected 5 clubs, found N: ...`         | The list of clubs with no 2026/27 participation is no longer exactly those five. The message names every club it found. Most likely a squad or fixture import is mid-flight, or a new club was added. | Wait for any running import to finish and run it again. If the list is still not the five, stop: the expected count needs re-approving with the new list, not loosening. |
| `bg0043 refused: affected_club_has_fantasy_player — <club>: N fantasy player row(s)` | One of the candidates is priced into a fantasy season. Deactivating it would strand its players.                                                                                                      | Stop and report. This needs a fantasy-side decision first.                                                                                                               |
| `bg0043 refused: affected_club_has_current_season_fixture` / `..._membership`        | A club became part of the current season between the script's read and its write — an import committed underneath it.                                                                                 | Run it again; the candidate list will be recomputed.                                                                                                                     |
| `bg0043 refused: unexpected_remaining_active_count — expected 16 ... found N`        | The surviving active count is not 16.                                                                                                                                                                 | Stop and report. Do not commit.                                                                                                                                          |
| `bg0043 refused: write_count_mismatch`                                               | The update touched a different number of rows than there were candidates.                                                                                                                             | Stop and report. Do not commit.                                                                                                                                          |

### Note for later

This fixes today's data; it does not stop the drift. `app.teams.active` is set to `true` by the
provider ingest and nothing ever reconciles the complement, so a historical backfill re-run can
re-activate these five, and the next relegation will recreate the problem. The durable rule is
tracked separately (engineering brief BG-0043, option (b), to be folded into BG-0036). Re-running
this script is the interim remedy.

---

## 1. Automation switches (GitHub repository variables)

Path for every one of these: **repository → Settings → Secrets and variables →
Actions → Variables tab → New repository variable**. These are _variables_, not
secrets — do not create them under the Secrets tab, where the workflows will not
see them.

Evidence for "off": `app_private.fantasy_job_runs` has 0 rows; the last football
ingestion run was 2026-09-18 10:06 UTC; the last news ingestion run was
2026-09-18 04:42 UTC (18 runs total, none since).

### 1.1 `FANTASY_AUTOMATION_ENABLED` — **DONE, set by the owner 2026-09-21**

|                |                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Value          | `true`                                                                                                                                                                                                            |
| Gates          | `.github/workflows/fantasy-season-orchestrator.yml`, hourly                                                                                                                                                       |
| First run does | calls `api.service_sync_fantasy_calendar`, then the lifecycle progression: creates/updates scheduled gameweeks from published rounds, realigns assignment kickoffs, opens and closes gameweeks on their deadlines |
| Verify         | the workflow appears under Actions with a green run, **and** `select count(*) from app_private.fantasy_job_runs;` becomes non-zero                                                                                |
| If it fails    | read the run log and the returned `rounds[].notes` — `kickoff_unconfirmed`, `round_incomplete` and `deadline_unconfirmed` are the function declining to act on incomplete provider data, not errors               |

Note the ordering trap: switching this on does **not** retroactively fix GW1
(see §0.1). Do §0.2 as well unless you have confirmed all eight real kickoffs
landed before Wednesday 22:30 UTC.

### 1.2 `FOOTBALL_CURRENT_SCHEDULE_ENABLED` — **DONE, set by the owner 2026-09-21** (still needs the canary run id below)

|                |                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Value          | `true`                                                                                                                                   |
| Gates          | `.github/workflows/football-current-season-recovery.yml`, daily 07:43 UTC                                                                |
| First run does | pulls current-season fixtures, results and squads from SportsMonks — this is what will eventually replace the eight placeholder kickoffs |
| Verify         | `select max(started_at), max(completed_at) from app_private.football_ingestion_runs;` moves past 2026-09-18 10:06 UTC                    |

**This workflow also requires the verified canary run id** (item N3 of the
hardening audit). That id is the GitHub Actions **run id of the most recent
canary dispatch you verified** — open Actions → the canary workflow → the run
you checked → the numeric id at the end of its URL. The workflow byte-compares
the current implementation against what was verified at that run, and refuses to
proceed if either has changed since. If you set the schedule variable without
the canary id, the run will fail closed rather than ingest unverified code.

### 1.3 `ELBOTOLA_SCHEDULE_ENABLED` — **SETTLED: stays off.**

The sweep asked for this to be switched on. The owner confirmed on 2026-09-21
that the News stand-down wins and this variable stays off.

For the record, the schedule is already off in two ways now: the variable is
unset, and the stand-down removes the `schedule:` trigger from
`.github/workflows/news-elbotola-recovery.yml` while keeping manual dispatch.
`docs/qa/LIMITED_PUBLIC_RELEASE_2026_09_14.md` claims this schedule was enabled;
the run history says otherwise — believe the run history.

One consequence to know about if you ever turn News back on:
`verifyPriorCanary` in `scripts/backend/elbotola-recovery.ts` byte-compares the
workflow and the script against the last verified canary commit. The stand-down
changed both, so the next `refresh` dispatch will fail with
`ingestion_implementation_changed_recanary_required` until a fresh `canary`
dispatch is run and `ELBOTOLA_CANARY_VERIFIED_RUN_ID` updated. That is the guard
working, not a regression, and it is harmless while News is down.

### 1.4 `GNEWS_SCHEDULE_ENABLED` — **DO NOT SET.** Same reason as §1.3.

`GNEWS_COMMERCIAL_LICENSE_APPROVED` is a separate gate and is **a legal
decision, not a switch**. Do not set it to make a workflow run. It exists to
record that someone with the authority to do so has confirmed the commercial
licence position for redistributing that content.

---

## 2. Signup is broken on botolago.com — two P0s, both yours

Found by a live QA run on 2026-09-21 using two real new accounts. **A new user
cannot currently complete signup.** Both accounts had to be confirmed by
invoking the Supabase verify URL outside the browser.

### 2.1 The verify screen asks for a code that is never sent — **SETTLED: template fix**

`/auth/verify` renders "Nous avons envoyé un code à 6 chiffres à …" and a
six-box code input. The only mail Supabase sends is a magic link containing no
digits at all. Entering any code returns `403 POST /auth/v1/verify` and the UI
says "Code expiré. Renvoyez un nouveau code." Logging in instead returns `400`
and "E-mail non confirmé."

The product and the project are configured for two different flows. **Which do
you want?**

- **Keep the code UI** → Supabase → Authentication → Email Templates → Confirm
  signup, and include `{{ .Token }}` in the template. The existing screen then
  works as written.
- **Switch to a link flow** → the `/auth/verify` screen changes to "check your
  inbox" and stops asking for a code. That is a code change; tell me and I will
  route it.

I am not picking for you: one is a template edit you own, the other changes what
the product does.

### 2.2 The confirmation link lands on the wrong domain — **DONE by the owner 2026-09-21**

The signup request asks for `redirect_to=https://botolago.com/auth/callback`.
Supabase overrides it with the project's configured **Site URL**, and the
emailed link resolves `303` to `https://www.botolago.app#access_token=…`. That
domain serves a _separate deployment of the same app_, so the session is created
on the wrong origin and `botolago.com` stays signed out. Reproduced on both test
accounts.

Supabase → Authentication → URL Configuration:

- **Site URL**: `https://botolago.com`
- **Redirect URLs**: include `https://botolago.com/**`

This also closes the item the sweep listed as "confirm Site URL / Redirect URLs"
(BG-0021 B7) — it is not a confirmation, it is a live defect.

Separate question for you: **should `www.botolago.app` be serving a second copy
of the app at all?** Two live deployments of the same product on two domains
will keep producing this class of bug.

### 2.3 Confirmation email is unbranded and English-only

Lower severity, same screen. The mail arrives from "Supabase Auth"
`<noreply@mail.app.supabase.io>`, subject "Confirm your email address", body in
English with an "Opt out of these emails → supabase.com" footer — sent to
someone who signed up entirely in French. Worth fixing in the same template
visit as §2.1.

---

## 3. Security and configuration

### 3.1 Enable leaked-password protection

Supabase → Authentication → Password security → enable "Leaked password
protection". Currently a WARN from the Supabase advisor. One toggle.

### 3.2 Rotate the credentials in the hardening doc — DEFERRED to post-launch

`docs/qa/FANTASY_LAUNCH_HARDENING_2026_09_18.md §1` (BG-0021). They were written
into a document in the repository, so treat them as disclosed regardless of who
has read it. Rotate, then update whatever consumes them.

### 3.3 Set `SUPABASE_URL` and the matching service-role key in Lovable — DEFERRED to post-launch

BG-0060. The Lovable hosting environment needs both, and the key must match the
URL — a service-role key from a different project fails in ways that look like
permission bugs rather than configuration ones.

---

## 4. Decisions only you can make

| #   | Decision                                                      | Why it is blocked on you                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | **Legal pages** (BG-0067)                                     | The Terms and Privacy documents are transcribed, rendered and linked, but carry **eight blanks only you hold**: company name, RC number, ICE number, registered address, contact email, CNDP receipt number, and the analytics and email providers actually in use. A test fails on purpose until they are filled — a placeholder on a live Terms page reads as unfinished, and a blank CNDP receipt number is worse, because the sentence around it asserts a registration that has not been issued. |
| 4.2 | **French news source** (BG-0065)                              | Moot while News is hidden. Becomes live again the moment News is switched back on.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4.3 | **Lovable badge** (BG-0066)                                   | Already removed from production on the upgraded plan; kept here because the sweep lists it. Re-check after any republish.                                                                                                                                                                                                                                                                                                                                                                             |
| 4.4 | **Arabic club names** (BG-0068)                               | A lane is drafting Arabic full and short names for the 16 current clubs. **Do not apply the seed until you have read the list** — Moroccan club names have established Arabic forms, and a wrong one is more embarrassing in Arabic than leaving it in Latin. The table will be appended here.                                                                                                                                                                                                        |
| 4.5 | **Roster duplicates** (BG-0057 / task L)                      | Four clusters of duplicated players — Boukhanfer ×2 (Hassania), Coulibaly ×3 (Wydad), El Ghazouani ×2 (Moghreb Tétouan), Errahouli ×2. No squad owns any of them today, so this is cheap now and expensive later. The candidate rows and the one-line question per cluster will be appended here.                                                                                                                                                                                                     |
| 4.6 | **Test accounts and duplicate QA leagues** (BG-0023 / task M) | 19 auth users, three of them `e2e.*@botolago.com`; two active leagues both named "QA Launch Ligue", one member each. A guarded cleanup script will be appended here. Archiving the leagues and deleting synthetic accounts are separate decisions — the second is irreversible.                                                                                                                                                                                                                       |

---

## 4.4a Arabic club names — your confirmation needed (BG-0068)

The table below ships **empty** and every read coalesces to the Latin name, so
nothing is blocked while you decide: the migration reproduces today's output
exactly until a seed is approved. Applying a wrong name is the only way to make
this worse than it is now.

Full file: `scripts/backend/football-team-arabic-names-seed.sql`. These are the
16 clubs with a membership in the current season, read from production.

| Latin name        | Proposed Arabic               | Proposed short  | Confidence                                                                                                                                                                                 |
| ----------------- | ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wydad Casablanca  | الوداد الرياضي                | الوداد          | high                                                                                                                                                                                       |
| Raja Casablanca   | الرجاء الرياضي                | الرجاء          | high                                                                                                                                                                                       |
| FAR Rabat         | الجيش الملكي                  | الجيش           | high — the common name, not a transliteration of "FAR"; say if you want the full formal form                                                                                               |
| FUS Rabat         | الفتح الرياضي                 | الفتح           | high                                                                                                                                                                                       |
| Maghreb Fès       | المغرب الفاسي                 | المغرب الفاسي   | high                                                                                                                                                                                       |
| Moghreb Tétouan   | المغرب التطواني               | المغرب التطواني | high                                                                                                                                                                                       |
| RSB Berkane       | نهضة بركان                    | نهضة بركان      | high — common form; the formal form is longer                                                                                                                                              |
| Difaâ El Jadida   | الدفاع الحسني الجديدي         | الدفاع الجديدي  | high                                                                                                                                                                                       |
| Hassania Agadir   | حسنية أكادير                  | حسنية أكادير    | high                                                                                                                                                                                       |
| Ittihad Tanger    | اتحاد طنجة                    | اتحاد طنجة      | high                                                                                                                                                                                       |
| Kawkab Marrakech  | الكوكب المراكشي               | الكوكب المراكشي | high                                                                                                                                                                                       |
| Amal Tiznit       | أمل تيزنيت                    | أمل تيزنيت      | high                                                                                                                                                                                       |
| CODM Meknès       | النادي المكناسي               | المكناسي        | **medium** — المكناسي is certain; whether the club writes the full omnisports formula is not                                                                                               |
| UTS Rabat         | اتحاد تواركة                  | اتحاد تواركة    | **medium** — تواركة is certain; whether الرياضي is appended is not                                                                                                                         |
| Widad Témara      | وداد تمارة                    | وداد تمارة      | **LOW — please supply.** Not the Casablanca Wydad; a wrong rendering reads as a different club                                                                                             |
| CR Khemis Zemamra | الشباب الرياضي لخميس الزمامرة | شباب الزمامرة   | **LOW — please supply.** Production contradicts itself: `name` is "CR Khemis Zemamra" (→ الشباب) but `code` is "RCAZ" (→ الرجاء). Different first words — the French row may also be wrong |

**Two rows need you specifically**: Widad Témara and CR Khemis Zemamra. The
twelve marked high are established names rather than transliterations and are
safe to accept as a block; the two marked medium differ only in whether a formal
suffix is written.

There is also one gap this work does **not** close. `api.fantasy_player_pool`
emits `teamName` and `teamShortName` and still returns Latin in Arabic. It takes
no language argument, and `CREATE OR REPLACE` cannot add a parameter — giving it
one means a `DROP`, which changes the signature that the generated types, the
repository and 22 Playwright journeys are pinned to. That belongs in its own
release, not here. A header-based workaround was written and then deleted,
correctly: it would have keyed club names off the viewer's browser locale rather
than the app's language, which is a silent wrong answer in place of an honest
Latin one.

---

## 5. After the PRs merge

**Publish `main` from Lovable** (BG-0022). A GitHub merge is not a deployment.
The frontend only changes when Lovable publishes, so after merging: publish,
record the deployment id, and verify the live bundle changed — the reliable
signal is a content-hashed chunk filename changing, not the HTML hash, which
moves on its own for unrelated reasons.

---

## Appendix — sections pending from in-flight lanes

These will be appended to this file as each lane reports. They are named here so
nothing is silently dropped:

- **§4.5 table** — the eight duplicate roster rows with id, DOB and provider
  external id (BG-0057).
- **§4.6 script** — the guarded QA-league and test-account cleanup (BG-0023).
