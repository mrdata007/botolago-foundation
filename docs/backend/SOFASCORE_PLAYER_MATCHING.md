# SofaScore player matching

Fantasy points come from SofaScore. For a match to score, every player SofaScore
says took part must be linked to the matching BotolaGO player. Doing that by hand
for every player would stall the points, so the system now links the clear cases
by itself and gives you a short list of the doubtful ones.

## What happens automatically

When a SofaScore match is read, each player on it is checked against the squad of
the right team (home or away) as it was on match day:

1. **Already linked:** nothing changes. A link that exists is never overwritten,
   moved or switched off by this process.
2. **Same full name, only one such player in that squad:** linked at once. Capital
   letters, accents, hyphens and extra spaces are ignored, so `Youssef En-Nesyri`,
   `YOUSSEF EN NESYRI` and `Ismaël Saibari` / `Ismael Saibari` count as the same
   name.
3. **Same last name and same shirt number, only one such player, and the position
   does not disagree:** linked at once.
4. **Anything else goes on your review list.** That means: no one in the squad has
   that name, two players have it, only part of the name matches, the player found
   is already linked to a different SofaScore player, or the position disagrees.

A wrong link would hand a real person's points to someone else, so the system
prefers to ask. It never guesses between two players.

A player who did not play (unused substitute) is linked if the name is clear, but
is never put on your list: it would only be noise.

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
reviewed". Until now that meant a two-person proposal had executed it. It still
does, unchanged. This migration adds one more accepted proof: a log row that
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
  valid on the kickoff date are candidates.
- The migration writes only when the functions are called. Applying it changes no
  data.
