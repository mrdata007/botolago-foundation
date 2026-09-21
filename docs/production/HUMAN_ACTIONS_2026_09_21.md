# Human actions — 2026-09-21

Everything here needs a person: a credential, a dashboard, a decision, or a
production write. Nothing in this file has been executed. Ordered by deadline,
not by size.

Ground truth: production Supabase `tkewgajrljbwgwedqsxn`, read-only inspection
on 2026-09-21. Every claim below is followed by the query or file that proves
it, so you can re-check anything before you act on it.

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

| field | value |
|---|---|
| status | `open` |
| deadline_at | 2026-09-23 22:30:00+00 |
| starts_at | 2026-09-24 00:00:00+00 |
| active counting assignments | 8 |
| of those, with an **unconfirmed** kickoff | **8** |
| frozen assignments | 0 |

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

### 0.2 Realigning GW1 by hand

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

## 1. Automation switches (GitHub repository variables)

Path for every one of these: **repository → Settings → Secrets and variables →
Actions → Variables tab → New repository variable**. These are *variables*, not
secrets — do not create them under the Secrets tab, where the workflows will not
see them.

Evidence for "off": `app_private.fantasy_job_runs` has 0 rows; the last football
ingestion run was 2026-09-18 10:06 UTC; the last news ingestion run was
2026-09-18 04:42 UTC (18 runs total, none since).

### 1.1 `FANTASY_AUTOMATION_ENABLED` — **set this**

| | |
|---|---|
| Value | `true` |
| Gates | `.github/workflows/fantasy-season-orchestrator.yml`, hourly |
| First run does | calls `api.service_sync_fantasy_calendar`, then the lifecycle progression: creates/updates scheduled gameweeks from published rounds, realigns assignment kickoffs, opens and closes gameweeks on their deadlines |
| Verify | the workflow appears under Actions with a green run, **and** `select count(*) from app_private.fantasy_job_runs;` becomes non-zero |
| If it fails | read the run log and the returned `rounds[].notes` — `kickoff_unconfirmed`, `round_incomplete` and `deadline_unconfirmed` are the function declining to act on incomplete provider data, not errors |

Note the ordering trap: switching this on does **not** retroactively fix GW1
(see §0.1). Do §0.2 as well unless you have confirmed all eight real kickoffs
landed before Wednesday 22:30 UTC.

### 1.2 `FOOTBALL_CURRENT_SCHEDULE_ENABLED` — **set this, but it needs a second value**

| | |
|---|---|
| Value | `true` |
| Gates | `.github/workflows/football-current-season-recovery.yml`, daily 07:43 UTC |
| First run does | pulls current-season fixtures, results and squads from SportsMonks — this is what will eventually replace the eight placeholder kickoffs |
| Verify | `select max(started_at), max(completed_at) from app_private.football_ingestion_runs;` moves past 2026-09-18 10:06 UTC |

**This workflow also requires the verified canary run id** (item N3 of the
hardening audit). That id is the GitHub Actions **run id of the most recent
canary dispatch you verified** — open Actions → the canary workflow → the run
you checked → the numeric id at the end of its URL. The workflow byte-compares
the current implementation against what was verified at that run, and refuses to
proceed if either has changed since. If you set the schedule variable without
the canary id, the run will fail closed rather than ingest unverified code.

### 1.3 `ELBOTOLA_SCHEDULE_ENABLED` — **DO NOT SET. Confirm with me first.**

The sweep asks for this to be switched on. **That contradicts your decision of
2026-09-21 to unpublish the link-out articles and hide News for launch.** I have
assumed the later decision wins and built the News stand-down accordingly; this
variable stays off.

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

### 2.1 The verify screen asks for a code that is never sent — **decision needed**

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

### 2.2 The confirmation link lands on the wrong domain — **fix in Supabase**

The signup request asks for `redirect_to=https://botolago.com/auth/callback`.
Supabase overrides it with the project's configured **Site URL**, and the
emailed link resolves `303` to `https://www.botolago.app#access_token=…`. That
domain serves a *separate deployment of the same app*, so the session is created
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

### 3.2 Rotate the credentials in the hardening doc

`docs/qa/FANTASY_LAUNCH_HARDENING_2026_09_18.md §1` (BG-0021). They were written
into a document in the repository, so treat them as disclosed regardless of who
has read it. Rotate, then update whatever consumes them.

### 3.3 Set `SUPABASE_URL` and the matching service-role key in Lovable

BG-0060. The Lovable hosting environment needs both, and the key must match the
URL — a service-role key from a different project fails in ways that look like
permission bugs rather than configuration ones.

---

## 4. Decisions only you can make

| # | Decision | Why it is blocked on you |
|---|---|---|
| 4.1 | **Legal pages** (BG-0067) | The Terms and Privacy documents are transcribed, rendered and linked, but carry **eight blanks only you hold**: company name, RC number, ICE number, registered address, contact email, CNDP receipt number, and the analytics and email providers actually in use. A test fails on purpose until they are filled — a placeholder on a live Terms page reads as unfinished, and a blank CNDP receipt number is worse, because the sentence around it asserts a registration that has not been issued. |
| 4.2 | **French news source** (BG-0065) | Moot while News is hidden. Becomes live again the moment News is switched back on. |
| 4.3 | **Lovable badge** (BG-0066) | Already removed from production on the upgraded plan; kept here because the sweep lists it. Re-check after any republish. |
| 4.4 | **Arabic club names** (BG-0068) | A lane is drafting Arabic full and short names for the 16 current clubs. **Do not apply the seed until you have read the list** — Moroccan club names have established Arabic forms, and a wrong one is more embarrassing in Arabic than leaving it in Latin. The table will be appended here. |
| 4.5 | **Roster duplicates** (BG-0057 / task L) | Four clusters of duplicated players — Boukhanfer ×2 (Hassania), Coulibaly ×3 (Wydad), El Ghazouani ×2 (Moghreb Tétouan), Errahouli ×2. No squad owns any of them today, so this is cheap now and expensive later. The candidate rows and the one-line question per cluster will be appended here. |
| 4.6 | **Test accounts and duplicate QA leagues** (BG-0023 / task M) | 19 auth users, three of them `e2e.*@botolago.com`; two active leagues both named "QA Launch Ligue", one member each. A guarded cleanup script will be appended here. Archiving the leagues and deleting synthetic accounts are separate decisions — the second is irreversible. |

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

- **§0.3** — `scripts/backend/football-deactivate-non-current-teams.sql`: how to
  run it, the five clubs it deactivates, the verification query, and what to do
  if a guard trips (task D / BG-0043).
- **§4.4 table** — the 16 Arabic club names for your confirmation (BG-0068).
- **§4.5 table** — the eight duplicate roster rows with id, DOB and provider
  external id (BG-0057).
- **§4.6 script** — the guarded QA-league and test-account cleanup (BG-0023).
