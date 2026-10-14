# SofaScore player matching

Fantasy points come from SofaScore. For a match to score, every player SofaScore
says took part must be linked to the matching BotolaGO player. Doing that by hand
for every player would stall the points, so the system now links the clear cases
by itself and gives you a short list of the doubtful ones.

## What happens automatically

**Names never decide.** SofaScore is now the only source, and the player catalog is keyed on the
SofaScore player id. Since migration `20261013150000` the system does not compare names at all: not
the full name, not the last name, not a partial name, not a duplicate name in a squad. The SofaScore
name is stored, shown to you on the review list, and used as the display name of a player the system
creates; nothing more. A name is spelled differently by every provider, and a shared name is how one
person's points land on another.

A player is matched by **club (side) + shirt number + position**. When a SofaScore match is read,
each player on it who is not linked yet is looked up in the squad of the right team (home or away)
as it was on match day:

1. **Already linked:** nothing changes. A link that exists is never overwritten, moved or switched
   off by this process.
2. **Candidate:** a BotolaGO player with an active membership in that club for the season (valid on
   the kickoff date), **without an active SofaScore link**, whose shirt number is the one in the
   SofaScore lineup, and whose position is compatible: the same position, or neighbouring lines
   (defender and midfielder, or midfielder and forward), or either position unknown. A goalkeeper is
   only ever compatible with a goalkeeper, and a defender never with a forward.
3. **Exactly one candidate:** linked at once, on the first sighting (method `side-shirt-position`).
   Two SofaScore ids in the same match pointing at the same candidate are a conflict for both: nobody
   is linked.
4. **Nobody at that club** (no candidate, nobody with that shirt at an incompatible position, nobody
   with no shirt number on file at a compatible position: the test the unmapped-substitute check
   uses): **the player is created** (next section). No hold, no staff click.
5. **Anything else goes on your review list** with a reason and the possible player already filled
   in, so confirming is one click (below). This is the only case that holds a match.

A wrong link would hand a real person's points to someone else, so the system prefers to ask when it
cannot tell. It never guesses between two players.

### A player the catalog does not have

An appearing SofaScore player with nobody to match is **created automatically** (method
`sofascore-created`), only in the current season and only when he appeared, has a position and a name
of at least two characters:

- a BotolaGO player (`app.players`): the SofaScore name for display, the position G/D/M/F as
  goalkeeper/defender/midfielder/forward;
- a membership at the club of his side, valid for the whole season (so it covers the match being read,
  whenever it was played), with his shirt number (left blank if another active member of the club
  already wears it, as the player-list update does);
- an active SofaScore link that counts as reviewed (below);
- a Fantasy pool entry (`app.fantasy_players`, available and eligible), priced by the same rule the
  opening catalog and the player-list update use for a player with no previous rating
  (`app_private.fantasy_initial_price_v1` at rating 6.0, confidence 0), with its price evidence and
  price history rows, so a manager can pick him like anyone else.

The creation takes the same Fantasy locks as the player-list update (`fantasy:catalog`, `fantasy:squads`).
It does not pause crons or lock tables, because it runs from the live refresh. If the catalog refuses
it (for example while the post-gameweek price processing is between pages) everything the creation did
is rolled back, he is queued as `no_candidate`, and the next call tries again.

A player who did not play (unused substitute) is linked under the same rule but is never created and
never put on your list: it would only be noise.

When a player is linked or created, the finished matches of his club that wait on a player identity
are set to be tried again on the next tick.

### The reasons on the list

| Reason                                                      | Meaning                                                                                                                                                                          | What to do                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ambiguous_shirt`                                           | Two or more squad members have that shirt number at a compatible position. (The database normally forbids two active players with one number in a club; this is the safety net.) | Choose the right one.                                                        |
| `shirt_conflict`                                            | Two SofaScore ids in one match point at the same candidate. Nothing is linked.                                                                                                   | Check the candidate, then choose.                                            |
| `no_shirt_on_file`                                          | Nobody has that number, but a squad member with no number on file at a compatible position could be him. Nothing is created.                                                     | Confirm the pre-filled player, or fix the squad.                             |
| `position_mismatch`                                         | A squad member has the number, but not at a compatible position (for example a goalkeeper against an outfield player). Never linked automatically.                               | Check, then confirm or leave.                                                |
| `no_shirt`                                                  | SofaScore gave no shirt number.                                                                                                                                                  | Choose by hand if he should score.                                           |
| `weak_match`                                                | From the squad link: one candidate (same club and number) but a position is unknown.                                                                                             | Confirm if it is the right player.                                           |
| `no_candidate`                                              | Nobody known and the player could not be created (no position, a name under two characters, not the current season, or the catalog refused). Retried at the next call.           | Usually nothing. A substitute with nothing at stake does not hold the match. |
| `candidate_already_mapped` / `inactive_mapping_exists`      | The player found already has, or had, another SofaScore link. Unchanged from before.                                                                                             | Fix the other link through the normal mapping review first.                  |
| `ambiguous_name`, `partial_name`, `duplicate_name_in_squad` | Old reasons from the name-based matcher. Still valid on the list; replaced by a shirt-based reason the next time the player is seen.                                             | As for the new reason once it is replaced.                                   |

## Linking the existing catalog (once)

The players already in the catalog need their SofaScore ids once, so that the matcher above only has
to deal with newcomers. This is read from the club **squads** (`teams/get-squad`, one request per
club, about 16), not from lineups.

1. **Read (owner, no write).** Run the workflow _SofaScore squad link (production, read only report)_
   (`.github/workflows/sofascore-squad-link-production-read.yml`) from `main`. It matches each squad
   player to a catalog player of the same mapped club by shirt number and compatible position, never by
   name. Names are off by default (the repository is public); turn `show_names` on only if the artifact
   may be seen. The step summary starts with the counts:
   - **Linked automatically once applied (CONFIRMED):** exactly one candidate both ways, both shirts and
     both positions known, no existing link on either side;
   - **Need review (SUGGESTIONS):** a candidate, but something weaker (a position unknown, a shirt missing
     on the catalog side, two candidates). They become pre-filled entries on the review list;
   - **Unmatched:** squad players with no candidate (the matcher creates them if they appear), and catalog
     players with no squad entry (left alone).
2. **Review** the counts and the lists in the artifact (`report.md`, `report.json`).
3. **Generate the apply script** locally from the uploaded report:
   `bun scripts/backend/sofascore-squad-link.ts --from-report report.json --emit-sql --out-dir out --owner-auth-user-id <your staff auth user id>`.
4. **Apply (owner).** Pause the writers (`scripts/backend/sofascore-held-maintenance-pause.sql`), run
   `out/apply.sql` as it is (it ends in `DRY_RUN_ROLLBACK` and prints what it would do), then change only
   `c_commit` and `c_one_writer_checked` to `true`, run it once, read the counts back, and resume the
   writers (`sofascore-held-maintenance-resume.sql`). CONFIRMED rows are written as staff resolutions, so
   they count as reviewed; SUGGESTIONS are queued pre-filled; held matches of the clubs are set to be
   retried.

Request cost: one `teams/get-squad` per club, so about 16 RapidAPI requests for the Botola, capped by
`max_requests` (40). The apply script makes no request.

## Where the list is

The review list is read with `api.admin_sofascore_player_match_queue()`. It shows,
for each doubtful player: the SofaScore name, shirt number and position, the team,
why it is doubtful, how many times it has come up, and the possible BotolaGO
players with their names, shirt numbers and whether they are already linked to a
different SofaScore id. You need a football staff account (the same one used for
player mapping, with a second factor).

The list holds one line per SofaScore player, however many matches the player
appears in.

## How to resolve one

Pick the right BotolaGO player and call
`api.admin_resolve_sofascore_player_match('<SofaScore player id>', '<BotolaGO player id>')`.
It creates the link, counts it as reviewed (by you), and removes the line from the
list. It refuses, and changes nothing, if either side is already linked
elsewhere (a second SofaScore id included). In that case the existing link has to be
fixed first through the normal mapping review, or the id linked as a second id (below).

## What staff can do on the list

Since migration `20261014170000` the screen (`/admin/football/sofascore-players`) offers,
for each entry, besides confirming an offered candidate:

- **Find another player.** The club's squad this season, or the whole catalog searched by
  name (two letters or more), each player with his club, shirt, position and SofaScore
  state. `api.admin_sofascore_player_link_options('<SofaScore id>', '<query or null>')`.
  A player with no SofaScore id can be linked the ordinary way (as above); a player whose
  SofaScore link is active can take this id as a **second id** (next point); a player whose
  link is switched off is shown but offers nothing.
- **Link as second ID.** When SofaScore keeps two profiles of one person, the second id is
  attached to the player, who keeps his main id.
  `api.admin_sofascore_link_alias('<SofaScore id>', '<BotolaGO player id>')`. Refused, and
  nothing changes, when the player has no active main link
  (`sofascore_alias_needs_primary`), or the id is already linked to anyone.
- **Create this player.** For a player the catalog does not have: the player, a membership
  of the entry's club for the whole current season, his Fantasy pool entry at the opening
  price, and the link, all in one go, made by the same function the automatic matcher uses
  (`app_private.sofascore_create_catalog_player`). Name, shirt and position come from
  SofaScore and can be corrected; the club is the entry's. A shirt another active member of
  the club wears is left blank. `api.admin_sofascore_create_player('<SofaScore id>', name,
shirt, position)`, each optional. Offered only when the entry has a club, a position and
  a match of the current season (`canCreate` on the list).

There is no "dismiss" action: an entry is on the list because a match is held for him, and
hiding it would hide the hold, not lift it. Every action needs `football.manage_mappings`
and a second factor (the reads also accept `football.read_operations`), closes the entry,
is written to the match log with your account, and sets the club's held Fantasy matches to
be tried again on the next tick.

## Second SofaScore ids

SofaScore sometimes keeps two profiles of one person, and a lineup can use either. A
catalog player has one **main** SofaScore id (his row of `football_provider_mappings`, as
before) and may have **second ids** (`app_private.sofascore_player_aliases`).

- One SofaScore id is a main id or a second id, never both, and belongs to one player only.
  The alias table refuses an id that is mapped or already someone's second id. The mapping
  table is not changed (no trigger is added to it): every writer here checks the alias
  table first, and an id that ended up as both anyway is read as a conflict, inactive and
  unreviewed, so it cannot score for anyone until a person fixes it.
- Everything that turns a SofaScore id into a player (the automatic matcher, the Fantasy
  context and recorder, the player performances) reads it through
  `app_private.sofascore_player_identity`: a second id is the player of the main link,
  active only while the second id and the main link are both active, and reviewed only
  while the main link is reviewed and the second id carries its staff proof (a log row of
  method `staff-alias`, with the staff account, that agrees with it).
- Everything that goes from a player to his SofaScore id (the weekly catalog's names,
  shirts and photos, the squad link, the admin reads) uses the main id only.
- The automatic matcher never matches or creates a player for an id that is a second id:
  it returns the player. A switched-off second id is queued as `inactive_mapping_exists`.
- A second id is never deleted or moved; it can only be switched off (`active = false`).
- Not yet covered: the live match page's lineups and events
  (`api.ingest_football_match_details`) still link main ids only, so a second id shows
  there under its SofaScore name, without a link to the player. It costs no points. It goes
  in once the open live-details pull request (#473) is merged.

The owner's verified pairs of 2026-10-14 are attached once with
`scripts/backend/attach-sofascore-verified-aliases.sql` (guarded, dry by default).

If the list still shows a player after the next match, it is because no link
exists yet. Once linked, the player is no longer asked about.

## Who did it, and how to undo it

Every link made here is recorded in `app_private.sofascore_player_match_log`: the
method (`exact-name`, `name-and-shirt`, `side-shirt-position`, `sofascore-created`,
`staff-resolution` or `staff-alias`), the match it was seen in, and for staff links
who made it. A player staff created is a `staff-resolution` whose evidence says
`"action": "create"`. The link itself carries a marker in
its `source_version`:

- `sofascore-auto-map:exact-name:<id>` or `sofascore-auto-map:name-and-shirt:<id>`
  for the automatic ones;
- `sofascore-admin-resolve:<id>` for the ones you made.

To undo a wrong automatic link, switch that mapping off (`active = false`) through
the normal mapping review. The switched-off link is never reused by this process:
the player shows up on the list as a conflict the next time they appear, and the
right link is then made through the normal mapping review.

## What "reviewed" means here

The Fantasy function only accepts a SofaScore player whose link is "active and
reviewed". That meant a two-person proposal had executed it. It still does,
unchanged. The automatic matcher adds one more accepted proof (it needs no staff
provenance, and `side-shirt-position` links use it exactly as the older methods did,
reported as `reviewProvenance` `automatic_side_shirt_position` or `automatic_sofascore_created`): a log row that
exists and agrees with the link on SofaScore id, BotolaGO player and method, with
the exact marker above. A marker written by hand, or a link moved to another
player afterwards, no longer counts. An automatic link does not count as
evidence for the Flashscore supporting-evidence check, which still needs a
person-approved link.

## For the engineers

- `api.service_sofascore_auto_map_players(p_fixture_id uuid, p_players jsonb)`
  (service role only) returns `{"mapped": [{"sofascorePlayerId", "playerId"}],
"queued": n, "conflicts": n, "created": n, "createFailed": n}`. `queued` counts every player put on the list,
  and `conflicts` is the part of those that collided with an existing link.
  `mapped` includes links that already existed.
- Calls are serialised by an advisory lock and use the table's unique constraints,
  so two calls at once cannot create two links. Re-running the same call changes
  nothing except the "times seen" counter on the list.
- Only players with an active membership of the team in the fixture's season and
  valid on the kickoff date, with the lineup's shirt number, a compatible position
  (`app_private.sofascore_position_compatible`) and no active SofaScore mapping are
  candidates. Names are not read by the decision.
- What it costs Fantasy: only the rare leftovers above hold a match (and a substitute with nothing at stake
  is still left out when the queue says `no_candidate`). A held match is retried until 21 days after kickoff
  (migration `20261013150100`), so any link made in that window releases it. See `SOFASCORE_FANTASY_SIMPLE.md`.
- A created player, end to end (read from the code, not run here): the recorder's identity checks accept
  him (an active SofaScore link with the log proof, pointing at the player the row names); the recorder and
  the scoring checks need a membership of one of the fixture's two clubs valid on the kickoff date, which
  the season-long membership gives; the pool (`api.fantasy_player_pool`) lists active, eligible entries, and
  the new one is both; the price passes the ruleset's initial-price bounds like the player-list update's.
  What can stop the insert is the guard `fantasy_guard_unfinished_price_catalog`
  (`fantasy_price_processing_in_progress`, while the post-gameweek price journal is between pages): the
  creation is rolled back, counted as `createFailed`, and tried again at the next call. The weekly catalog
  job updates the name, shirt and (if switched on) position of mapped players, so a created player is kept
  current like any other.
- The migration writes only when the functions are called. Applying it changes no
  data.
