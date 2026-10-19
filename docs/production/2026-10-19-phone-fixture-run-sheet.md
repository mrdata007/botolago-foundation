# Staging phone fixture — prepared data P1–P6

Status: source prepared; hosted application and phone results pending. This is
staging data, not a production migration. It supports the existing
[real-state checklist](2026-10-16-real-state-test-checklist.md).

| Prepared state                   | Exact fixture                                                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 saved articles                | Owner A: 60; owner B: 2,001 distinct stories. Each story has a French and Arabic edition. The saved editions alternate languages.                                                      |
| P2 private league                | `Staging Private Phone QA`, 123 members, including both owners.                                                                                                                        |
| P3 historical unavailable player | Past GW1 is scored by the actual lifecycle; bench goalkeeper `DP11` is subsequently removed from the buying pool while identity and results remain.                                    |
| P4 sale value                    | Defender `DP1`: purchase 7.0, later market 7.4, sale 7.2 from the canonical sale-price function. Bank starts at 9.0. Read the actual incoming price when comparing the projected bank. |
| P5 paged global board            | 123 teams; the newly created non-login synthetic manager at team 70 is hidden after ranking. Existing users' profiles are untouched.                                                   |
| P6 identities                    | Two privately supplied, already confirmed test accounts. A third sign-up test address remains uncreated; the tester must control it.                                                   |

The other 120 actors reuse existing capacity-test identities. One additional
non-login synthetic Auth/profile row supports P5. No existing password, email,
profile or team is rewritten. The football catalog and season are new under
`f9600000-0000-4000-8000-...`. Existing measured rounds are never reopened.

## One operator-owned staging window

1. Wait for all staging workflows, including the real-clock worker alarm drill,
   to finish and restore. Check active/queued writers, cron, flags, generating
   jobs, active transactions and the worker lease. Record the current settings
   and fingerprints. Pause the saved cron jobs and application writers, then wait
   for in-flight work to settle.
2. Use `scripts/backend/staging-phone-fixture.sql`. Supply the two owner UUIDs
   privately as `botolago.qa_owner_ids` (a JSON array), and the exact staging ref
   as `botolago.release_drill`. Do not put addresses, passwords or the UUID array
   in a public dispatch input or evidence artifact.
3. Rehearse by ending the complete transaction with `rollback`. Verify absent
   `f960` world, unchanged accounts, bookmarks, history and old row fingerprints.
   Then apply the unchanged source with its final `commit`. It refuses existing
   owner bookmarks and an existing fixture rather than deleting or overwriting.
4. While the same writer window remains held, dispatch `staging-database-update`
   action `scorephoneqa`, from this branch, with the usual staging confirmation.
   Its fixed `phone-qa` selector permits only the `f960` scope. The production
   TypeScript lifecycle writes the actual past scores, rankings, rollover and
   next lineups. Global prize catch-up is deliberately refused.
5. Require 123 final rows of 96 points / 32 bench points (11,808 total), one
   rollover and next lineup per team, and a genuinely open GW2. Then rehearse
   `staging-phone-fixture-finish.sql` with rollback, verify unchanged stored
   results and snapshots, and apply it. This adds the P3/P4/P5 controls only
   after finalization; it never fabricates scores or rewrites a snapshot.
6. Verify the actual APIs under each owner's authenticated claims: A's 60 saves
   over two 50-item pages; B's 2,001 over 41 pages; unique ids and terminating
   cursors; private/global ranking continuation; historical player name and
   score; purchase/market/sale values; and the owned unavailable-player state.
   Do not count table totals as proof of those executable API contracts.
7. Compare old-row fingerprints, account fields and the expected new records.
   Restore the exact saved cron/flags. Keep sending features off unless a
   separate reminder test owns them. The fixture then remains for the phone
   session; it is not retired before the tester uses it.

The new default Fantasy season is `Staging Phone QA`. GW1 is past and finalized;
GW2 opens about two days before kickoff. Confirm its actual deadline at the
session start. This fixture does not prove a live match appears on the default
football calendar, nor create a real provider event for it.

## Independent verification and limits

`python3 scripts/backend/check-staging-phone-fixtures.py` accepts no remote
connection or credential. It exercises the exact seed in the local Supabase
Docker container, calls the real saved-article RPC under each authenticated
owner, follows every cursor and rejects duplicate ids. Its entire world is
rolled back and the pre-existing counts are checked afterwards. CI runs it in
the database job. Scoring and the final controls additionally need the hosted
sequence above; neither the source nor the local saved-list check claims that
those hosted operations passed.

Before handing the session to the owner, pin the reachable staging frontend and
verify that both browser and server use Staging V2. Record the iPhone/iOS version
and the release header/meta. Supabase Auth's sign-up/reset SMTP configuration is
separate from the Edge Functions' `RESEND_API_KEY`; the successful alert smoke
test alone does not establish A1/A2/A5. Keep those cases blocked until that path
and its redirect URLs are verified. Android, native app and screen-reader cases
retain their own evidence requirements.

After the session, retire this exact synthetic season/catalog and unpublish its
test articles in another owned staging window. Do not archive either owner or
the reused capacity identities. Preserve the result evidence and document any
owner bookmarks or other test changes before removing fixture-owned rows.
