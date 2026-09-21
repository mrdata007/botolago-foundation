## BG-0023 — QA leagues and test accounts

**Two separate decisions. Please answer them separately.**

- **Decision 1 — archive the two duplicate QA leagues.** Reversible. Low risk. Recommended.
- **Decision 2 — delete the three `e2e.*` test accounts. THIS CANNOT BE UNDONE.** There is no
  restore, no undelete and no backup step in this script. Once committed, those accounts and
  everything hanging off them are gone permanently.

They are genuinely independent: the duplicate leagues are owned by
`qa.launch.20260920@botolago.com`, which is **not** one of the three `e2e.*` accounts. You can say
yes to one and no to the other.

Both live in one file, `scripts/backend/fantasy-cleanup-qa-artifacts.sql`. **Running that file
unchanged does Decision 1 only and deletes nothing** — not even a deletion request is filed.

### What is actually in production (verified 2026-09-21)

|                                           | Count |
| ----------------------------------------- | ----- |
| `auth.users`                              | 19    |
| of those, matching `e2e.%@botolago.com`   | 3     |
| `app.profiles`                            | 19    |
| `app.fantasy_teams`                       | 7     |
| active fantasy leagues                    | 3     |
| of those, named exactly "QA Launch Ligue" | **2** |

The two duplicates, three minutes apart — a double-submit:

| League id                              | Name            | Owner                           | Members | Created             |
| -------------------------------------- | --------------- | ------------------------------- | ------- | ------------------- |
| `f4ae1ae7-e55d-4ec5-9ac6-363ff3a1427a` | QA Launch Ligue | qa.launch.20260920@botolago.com | 1       | 2026-09-20 21:02:50 |
| `fb92f1f1-41c8-4a0e-bc25-1f27110ec802` | QA Launch Ligue | qa.launch.20260920@botolago.com | 1       | 2026-09-20 21:06:00 |

There is a **third** active league, `be13070f…` **"Ligue QA Test"** (owner
`botolagoqa1789998048@uberip.com`). It has a different name and the script does not touch it. If
you want that one archived too, tell me — it is not covered here.

The three synthetic accounts:

| Account                             | Created          | Fantasy team       | Squad rows |
| ----------------------------------- | ---------------- | ------------------ | ---------- |
| `e2e.fantasy.newcomer@botolago.com` | 2026-09-18 04:35 | none               | 0          |
| `e2e.fantasy.launch@botolago.com`   | 2026-09-18 06:48 | none               | 0          |
| `e2e.fantasy.recovery@botolago.com` | 2026-09-18 04:27 | "BG0052 Verify XI" | 15         |

---

## Decision 1 — archive the two QA leagues (reversible)

**Recommended.** Archiving sets `active = false` through the product's own
`api.archive_fantasy_league` RPC — the same call the app makes when a user archives their own
league. Nothing is deleted. The league rows, their names, their invite codes and their memberships
all stay exactly where they are; only the flag changes. If you change your mind, flipping `active`
back restores everything.

### How to run it

As the database owner (Supabase SQL editor signed in as the project owner, or `psql` as
`postgres`):

1. Open `scripts/backend/fantasy-cleanup-qa-artifacts.sql` and **change nothing**.
2. Run the whole file. **It does not commit.**
3. Read the output (below). If it looks right, uncomment and run the last line, `commit;`.
   If anything looks wrong, close the session — that rolls everything back.

### Expected output

```
NOTICE:  bg0023: archived league QA Launch Ligue (f4ae1ae7-e55d-4ec5-9ac6-363ff3a1427a) via api.archive_fantasy_league, owner team 455f8d6e-fc00-42fa-a1cf-c9dc495fd151
NOTICE:  bg0023: archived league QA Launch Ligue (fb92f1f1-41c8-4a0e-bc25-1f27110ec802) via api.archive_fantasy_league, owner team 455f8d6e-fc00-42fa-a1cf-c9dc495fd151
NOTICE:  bg0023: archived 2 league(s) named QA Launch Ligue
NOTICE:  bg0023: account half SKIPPED — p_include_accounts is false, so no account-deletion path ran and no account was touched. This is the default.

 phase  |              entity_id               |  entity_label   | action_taken
--------+--------------------------------------+-----------------+--------------
 league | f4ae1ae7-e55d-4ec5-9ac6-363ff3a1427a | QA Launch Ligue | archived
 league | fb92f1f1-41c8-4a0e-bc25-1f27110ec802 | QA Launch Ligue | archived
```

That fourth NOTICE — `account half SKIPPED` — is your confirmation that Decision 2 did **not**
happen.

Then three review tables print. The population table should read:

```
 auth_users | e2e_accounts | profiles | fantasy_teams | active_leagues | archived_leagues
------------+--------------+----------+---------------+----------------+------------------
         19 |            3 |       19 |             7 |              1 |                2
```

`19 / 3 / 19 / 7` unchanged — nothing was deleted. One active league left (that's "Ligue QA Test"),
two archived.

Re-running after committing prints `already_applied (leagues)` and writes nothing.

### Verification query

```sql
select league.id, league.name, league.active, league.member_count,
       account.email as owner_email, league.updated_at
from app.fantasy_leagues league
left join auth.users account on account.id = league.owner_user_id
order by league.active desc, league.name;
```

Expect three rows: "Ligue QA Test" still `active = t`, both "QA Launch Ligue" rows `active = f`.

---

## Decision 2 — delete the three `e2e.*` accounts

# ⚠️ THIS CANNOT BE UNDONE.

There is no undo, no soft-delete and no backup taken by this script. `delete from auth.users`
cascades to `app.profiles` and from there to preferences, followed teams and competitions, device
registrations, notifications and notification subscriptions. Once you commit, that data does not
come back.

This is why the flag exists: the file as shipped has `p_include_accounts => false`. You have to
deliberately edit it to `true`. If you never edit it, this decision never happens.

### What the script actually does in this half

There is one account-deletion path in the codebase and it is a _request_, not an erasure:
`api.request_account_deletion()` — what the app calls when a user asks to delete their account. It
files a row and an audit entry, and nothing else; **no worker exists that processes those requests
into an actual erasure.** So the script does both, in order: it calls that request RPC for each
account (so the audit trail the product would have written exists first), then performs the
`delete from auth.users` that the schema's `ON DELETE CASCADE` chain was built around. It does not
invent a new deletion routine.

### Read this before you say yes: it will refuse today

As of 2026-09-21, **all three accounts are blocked** and the script will refuse rather than delete
anything. Six tables reference `app.profiles` with `ON DELETE RESTRICT`, and each account still has
rows in at least one:

| Account                             | What blocks it                                              |
| ----------------------------------- | ----------------------------------------------------------- |
| `e2e.fantasy.newcomer@botolago.com` | 2 fantasy idempotency keys (expire 2026-09-25 → 2026-10-18) |
| `e2e.fantasy.launch@botolago.com`   | 2 fantasy idempotency keys (expire 2026-09-25 → 2026-10-18) |
| `e2e.fantasy.recovery@botolago.com` | 1 fantasy team + 1 mutation-audit row + 17 idempotency keys |

So there are really three options:

- **(a) Do nothing.** Three synthetic accounts sit in a 19-user table. They cost nothing and they
  are not visible to users. This is a perfectly reasonable answer, especially before launch.
- **(b) Wait.** The idempotency keys all expire by **2026-10-18**. If nothing purges them they will
  still be rows, so waiting alone does not unblock it — but it does make them safe to clear.
- **(c) Tear the fantasy artefacts down first**, then delete. The existing path for that is
  `scripts/backend/fantasy-catalog-restage-maintenance.sql`, which already has these three accounts
  in its allow-list. That is a bigger, separately-reviewed operation and I'd want to walk through it
  with you rather than have you run it from a checklist.

**My recommendation: (a), for now.** Nothing about these accounts blocks launch, and Decision 1
gets you the cleanup that actually matters.

### How to run it, if you decide to

1. Do Decision 1 first and make sure you are happy with it.
2. In `scripts/backend/fantasy-cleanup-qa-artifacts.sql`, find the call near the bottom and change
   the last argument:

   ```sql
   select * from pg_temp.bg0023_cleanup_qa_artifacts(
     p_expected_league_count  => 2,
     p_expected_account_count => 3,
     p_include_accounts       => false   -- <-- change to true
   );
   ```

3. Run the whole file. It will print a `WARNING` line telling you the account half is enabled, and
   then — today — refuse with `account_blocked_by_reference`, listing exactly what is holding each
   account. **Nothing is written, including the league archiving**, because both halves share one
   transaction.
4. Only if it gets past that guard do you get the deletion, and only `commit;` makes it real.

### Verification query

```sql
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from auth.users where email like 'e2e.%@botolago.com') as e2e_accounts,
  (select count(*) from app.profiles) as profiles,
  (select count(*) from app.fantasy_teams) as fantasy_teams;
```

Before: `19 | 3 | 19 | 7`. After a committed account run: `16 | 0 | 16 | 6`.

---

## If a guard trips — what to do

Every guard rolls the **whole** transaction back, both halves together. A trip never leaves things
half-done.

| Message                         | What it means                                                                                                                  | What to do                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unexpected_qa_league_count`    | The number of active leagues named "QA Launch Ligue" isn't 2. The message names every match.                                   | Somebody created or archived one since 2026-09-21. Re-run the Decision 1 verification query, send me the new list, and I'll re-approve the number. **Do not** just change the 2 to match. |
| `qa_league_membership_drift`    | One of the duplicates no longer has exactly one member — somebody joined it.                                                   | **Stop.** It is not a disposable QA league any more. Tell me who joined; archiving would hide a real person's league.                                                                     |
| `qa_league_owner_unresolved`    | A duplicate's owner has no active owner-role membership backed by a fantasy team, so the archive RPC can't be called for them. | Tell me. It means the league and its membership have drifted apart; nothing was written.                                                                                                  |
| `archive_count_mismatch`        | After archiving, a league under that name is somehow still active.                                                             | Should be impossible. Tell me; nothing was committed.                                                                                                                                     |
| `unexpected_account_count`      | The e2e pattern matched a different number of accounts than 3. The message names every match.                                  | **Stop and read the names.** This is the guard that stops a widened pattern from erasing a real user. Send me the list. Never loosen it.                                                  |
| `account_blocked_by_reference`  | An account still owns rows in a table that RESTRICTs. Names each account and all six counts.                                   | **Expected today** — see the table above. Either accept option (a) and leave the accounts alone, or come to me about the restage-maintenance teardown. Nothing was written.               |
| `account_delete_count_mismatch` | The delete removed a different number of rows than 3.                                                                          | Should be impossible. Tell me; nothing was committed.                                                                                                                                     |
