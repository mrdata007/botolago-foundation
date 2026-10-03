# Production: three reviewed dates of birth recorded (2026-10-02)

Three player dates of birth, approved by the owner one by one, were recorded in
Production V2 (`tkewgajrljbwgwedqsxn`) on 2026-10-02 as manual, sourced
observations. Nothing else was written.

Result: `THREE_DOB_IMPORT_APPLIED_AND_VERIFIED`.

## What was written

| Player (app id)                                      | Date of birth | Sources read by the owner's review |
| ---------------------------------------------------- | ------------- | ---------------------------------- |
| `f3e4ac15-2770-48c6-a89f-5d8158404e8b` (Zamrat)      | 2002-05-15    | FotMob, BeSoccer                   |
| `96837dad-5250-4fd9-b0ee-8bb0dbd16d17` (Gnolou)      | 2002-12-18    | FotMob, Sofascore                  |
| `721d92d0-1763-43b9-9b9c-54edcc03c07b` (Balla Conté) | 2004-04-15    | FotMob, FBref, Flashscore          |

For each: one manual `date_of_birth` observation (recorded by the one staff member
who holds `football.correct`, with the sources written in its reference and note),
`app.players.date_of_birth` set by the reviewed resolver, and one
`football.player_attribute_correct` audit event, the same form the admin correction
screen writes. A manual observation outranks a provider's (priority 10 against 20),
so a later provider date cannot silently replace these.

## Who was left out, on purpose

- **Mostakim** (`d3055da0-73be-4728-8357-b80cf5c4c4e3`): one source only, so not
  approved. After the write he still has no date of birth and no observation.
- Held for more evidence, not written: Mouhtachim (identity unclear), Cofi
  (21 vs 22 September 2003), Al Aiz (no evidence). Dates that read 1 January and
  dates where sources disagree were excluded as well.

## How it was done

| What                                   | Value                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Apply workflow run                     | [37029558351](https://github.com/mrdata007/botolago-foundation/actions/runs/37029558351)                                               |
| Main commit it ran on                  | `f5006f552af9fb3b41fb7e9a88932770d57859f8`                                                                                             |
| Reviewed script                        | `scripts/backend/data-player-dob-manual-observations.sql`                                                                              |
| Reviewed script SHA-256                | `1b3bfe4e583d60d85d405f298ee2c5fa16232cd09e3f7adcbef5512803a082ac`                                                                     |
| Commit version SHA-256                 | `e236c0389725a24e6b0a3c4a868918d9476f6ca250a4e5bb5fc2afa6939a77de`                                                                     |
| Rehearsal (rolled back, nothing saved) | [37025210850](https://github.com/mrdata007/botolago-foundation/actions/runs/37025210850) on `1af6586a7a285184667cd296082732f50850a42f` |

The commit version is the rehearsed script with its single `rollback;` line turned
into `commit;`; a test proves that is the only difference. The workflow is
owner-only, main-only, typed-confirmation, one attempt, never retried. Two earlier
rehearsal attempts stopped harmlessly before the script ran (a read-only check that
called a function that role may not use, fixed in #303, and one dropped network
connection).

Before dispatching, production was re-read and matched the rehearsal baseline.

## Before and after

|                              | Before | After |
| ---------------------------- | ------ | ----- |
| Players with a date of birth | 766    | 769   |
| Date-of-birth observations   | 766    | 769   |
| All attribute observations   | 766    | 769   |
| Audit events                 | 3      | 6     |
| Players in total             | 993    | 993   |

## Proof that nothing else moved

Identical before and after, read by the workflow and again independently:

- mapping rows 1,541; reviewed-provider (Sofascore/Flashscore) mapping rows 0;
  candidates 1,004; mapping proposals 0;
- candidate digest `4495fc80ec3e9bbe4cce284ec1a9a6f4`;
  mapping identity digest `5a3a2a1e748ecdf488f9f98e29f942b5`;
- cron jobs 14, digest `5e3bb0b2d3bfc5d697ff50dfe78cfd06` (no new schedule);
- Fantasy gameweek digest `9568bcf1c092fca15a0bdf9a08c117ca`, Fantasy points rows 623;
- latest migration `20261002110000`, 146 history rows (this was data, not a migration);
- every other player row and every other observation unchanged (digests compared
  by the workflow).

No mapping proposal was created, approved or executed.
