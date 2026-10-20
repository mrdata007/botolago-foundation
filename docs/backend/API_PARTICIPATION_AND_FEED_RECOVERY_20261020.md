# Native participation and fixture-feed recovery

## Direct evidence

Read-only run `39361261157`, exact main `d9d0e4192cfffda575435385981b21a7e9a80583`,
captured the four original API responses at 02:52:50–52 UTC on 20 October.

- Upcoming season fixtures return HTTP 200 with `{"error":{"code":404,"message":"Not Found"}}`.
  This is unavailable data, not proof that the calendar is empty.
- Completed season fixtures return 30 valid events, zero malformed entries,
  for Botola Pro D1 26/27, season 102220. The current all-or-nothing fetch drops
  this usable response when the upcoming endpoint fails first.
- Event 17256972's confirmed lineup lists Yahya Jabrane (919712) on the bench,
  no minutes/rating, and only zero-shot/statistics-type metadata. Its full-time
  timeline names **Yassine Jabrane (2265493)** at minute 79, not Yahya. All nine
  substitute entrants exactly match the lineup's positive-minute bench players.
  The older stored timeline naming Yahya is stale and is not native evidence.

Original response body hashes:

- next: `61b6f2399d5cd9251af376fddf2243e9ea802fbcda179698437c344ef6db8b32`
- last: `6e53c55e83401852082ba07d6db9472794bf800947f3b411c0ff81d6440c89ce`
- lineups: `1d95ce2ff2526a7d68527a62bb15526454dd2455baf2d000720dbf5f5ddfd6df`
- incidents: `791a6b1cf0e5983f9df954df20055a0ceada581b1d95d787a30e0760f42ea86e`

## Exact scope and preserved rules

Certify an otherwise uncertain, metadata-only bench row as unused only when a
confirmed lineup, 22 unique starters, a finished timeline, valid substitution
graph and every appearing player's positive minutes agree by native API ID.
An appearance, positive/unknown meaningful statistics, missing incident,
contradiction or incomplete reply retains uncertainty. Fetch supplemental
incidents only for a native payload with uncertain participation; reuse fresh
replies when already available. Add no canonical matching or identity writes.
Keep real ratings and minutes unchanged. An unused player follows the existing
DNP rule; this is not an extension of the approved short-appearance rule.

Read the two season endpoints independently. Preserve validated updates from
the working endpoint, record the unavailable endpoint and mark the run partial.
Never turn the 404 envelope into an empty schedule or claim complete freshness.
Keep quota stops, per-fixture validation, protected final states and all scoring
guards intact. Future gameweeks still require actual provider fixtures.

## Objective acceptance

- The trimmed real response fixture resolves only Yahya's false uncertainty;
  Yassine's actual appearance and every rating/minute remain unchanged.
- Missing FT, unconfirmed lineup, incomplete/mismatched substitutions, unknown
  player IDs, meaningful stats or an actual appearance cannot certify a DNP.
- Polling requests incidents only when needed and stays pending if that read
  fails. Native paths never call canonical linking or legacy ingestion.
- A failed upcoming endpoint cannot suppress valid completed fixtures; the
  run remains explicitly partial and the existing freshness alert stays honest.
- Required CI and staged function deployment pass before production release.
  Independently verify the normalized live source, historical owner points and
  unchanged original seals/manager state after the normal recorder/publication.
