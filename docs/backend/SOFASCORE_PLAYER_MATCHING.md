# SofaScore player matching

Fantasy points come from SofaScore. For a match to score, every player SofaScore
says took part must be linked to the matching BotolaGO player. Doing that by hand
for every player would stall the points, so the system now links the clear cases
by itself and gives you a short list of the doubtful ones.

## What happens automatically

**Names never decide.** Since migration `20261013150000` the system does not compare
names at all: not the full name, not the last name, not a partial name, not a
duplicate name in a squad. The SofaScore name is stored and shown to you on the
review list, nothing more. A name is spelled differently by every provider, and a
shared name is how one person's points land on another.

A player is matched by **side + shirt number + position**. When a SofaScore match is
read, each player on it who is not linked yet is looked up in the squad of the right
team (home or away) as it was on match day:

1. **Already linked:** nothing changes. A link that exists is never overwritten,
   moved or switched off by this process.
2. **Candidate:** a BotolaGO player with an active membership in that club for the
   season (valid on the kickoff date), **without an active SofaScore link**, whose
   shirt number is the one in the SofaScore lineup, and whose position is
   compatible: the same position, or neighbouring lines (defender and midfielder,
   or midfielder and forward), or either position unknown. A goalkeeper is only ever
   compatible with a goalkeeper, and a defender never with a forward.
3. **Exactly one candidate, seen in two different matches** with the same pairing
   and no contradicting sighting: linked automatically. The number of matches is the
   constant `AUTOMATCH_MIN_MATCHES` (`app_private.sofascore_automatch_min_matches()`,
   2).
4. **Anything else goes on your review list** with a reason and the possible player
   already filled in, so confirming is one click (next section).

A wrong link would hand a real person's points to someone else, so the system
prefers to ask. It never guesses between two players.

A player who did not play (unused substitute) is linked under the same rule but is
never put on your list: it would only be noise.

### The reasons on the list

| Reason                                                      | Meaning                                                                                                                                                                             | What to do                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `awaiting_second_match`                                     | One candidate, seen in only one match so far. It links itself when a second match shows the same pairing.                                                                           | Confirm the pre-filled player now, or wait.                 |
| `ambiguous_shirt`                                           | Two or more squad members have that shirt number at a compatible position. (The database normally forbids two active players with one number in a club; this is the safety net.)    | Choose the right one.                                       |
| `no_shirt`                                                  | SofaScore gave no shirt number.                                                                                                                                                     | Choose by hand if he should score.                          |
| `no_candidate`                                              | Nobody in the squad has that shirt number (or the only one is already linked). A substitute with nothing the score depends on does not hold the match for this reason.              | Add the player to the app if he should score.               |
| `position_mismatch`                                         | A squad member has the number, but not at a compatible position (for example a goalkeeper against an outfield player). Never linked automatically.                                  | Check, then confirm or leave.                               |
| `shirt_conflict`                                            | The sightings disagree: this SofaScore id was paired with another player before, or another SofaScore id is paired with the same player (also within one match). Nothing is linked. | Check the offered players, then choose.                     |
| `candidate_already_mapped` / `inactive_mapping_exists`      | The player found already has, or had, another SofaScore link. Unchanged from before.                                                                                                | Fix the other link through the normal mapping review first. |
| `ambiguous_name`, `partial_name`, `duplicate_name_in_squad` | Old reasons from the name-based matcher. Still valid on the list; they are replaced by a shirt-based reason the next time the player is seen.                                       | As for the new reason once it is replaced.                  |

"Seen in a match" is measured, not assumed: every time a player has exactly one
candidate, the pairing (SofaScore id, BotolaGO player, match) is written to
`app_private.sofascore_player_sightings`. Re-reading the same match adds nothing, so
the same match can never count twice.

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
elsewhere. In that case the existing link has to be fixed first through the normal
mapping review.

If the list still shows a player after the next match, it is because no link
exists yet. Once linked, the player is no longer asked about.

## Who did it, and how to undo it

Every link made here is recorded in `app_private.sofascore_player_match_log`: the
method (`exact-name`, `name-and-shirt` or `staff-resolution`), the match it was
seen in, and for staff links who made it. The link itself carries a marker in
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
reported as `reviewProvenance` `automatic_side_shirt_position`): a log row that
exists and agrees with the link on SofaScore id, BotolaGO player and method, with
the exact marker above. A marker written by hand, or a link moved to another
player afterwards, no longer counts. An automatic link does not count as
evidence for the Flashscore supporting-evidence check, which still needs a
person-approved link.

## For the engineers

- `api.service_sofascore_auto_map_players(p_fixture_id uuid, p_players jsonb)`
  (service role only) returns `{"mapped": [{"sofascorePlayerId", "playerId"}],
"queued": n, "conflicts": n}`. `queued` counts every player put on the list,
  and `conflicts` is the part of those that collided with an existing link.
  `mapped` includes links that already existed.
- Calls are serialised by an advisory lock and use the table's unique constraints,
  so two calls at once cannot create two links. Re-running the same call changes
  nothing except the "times seen" counter on the list.
- Only players with an active membership of the team in the fixture's season and
  valid on the kickoff date, with the lineup's shirt number, a compatible position
  (`app_private.sofascore_position_compatible`) and no active SofaScore mapping are
  candidates. Names are not read by the decision.
- What it costs Fantasy: a new player's first match is not scored on his own link.
  Unless staff confirm him (one click on the pre-filled candidate), a starter who is
  unmapped holds that match until a second match links him; a substitute with
  nothing the score depends on is left out only when the queue says `no_candidate`
  (nobody in the squad has his number), which a first sighting with a candidate is
  not. See `SOFASCORE_FANTASY_SIMPLE.md`.
- The migration writes only when the functions are called. Applying it changes no
  data.
