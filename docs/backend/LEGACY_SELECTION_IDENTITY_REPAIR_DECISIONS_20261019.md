# One-time legacy selection repair decisions

This supplements the source-by-source investigation in
[the identity audit](LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md). The exact,
checksummed operational scope is the
[21-player evidence manifest](evidence/legacy-identity-repair-manifest-20261019.json).
The reviewed repair was applied on 20 October 2026. See the
[production receipt](FANTASY_RECOVERY_RECEIPT_20261020.md) for the exact release,
preservation checks and remaining provider gaps.

The earlier blocker combined two questions: who a player is, and whether the
old club/position listing is suitable for a new purchase. Those require separate
decisions. Twelve identities have exact non-placeholder DOB/name corroboration.
Nine require explicit adjudication of spelling, missing information, conflicting
attributes or provider duplicates. The manifest states the evidence and dispute
for each; it does not pretend that every DOB agrees.

Direct match evidence identifies Nadir Lougmani as API 1170665 in FAR–Témara and
Youssef Tafay as API 1525336 in Wydad–Amal, both confirmed unused. Fresh authorized
API squads and earlier observations corroborate the Khatmi, Tafay, Paniagua and
Lougmani IDs. The official Crystal Palace notice and provider Touarga history
resolve Takha/Taha Majni. The exact legacy SportsMonks ID, DOB and career resolve
the Mehdi/Marouane Lemzaouri variant. The Belfada/Belfadla variant is corroborated
by Temara history and the reported September move to Oued Zem. A January 1 date
is never treated as an exact DOB match.

The reviewed Assane Beye identity uses the DOB-matching 1592863 profile, rather
than stale duplicate 1604919. El Fakih uses the current career-continuous 919342
profile; older 2829014 is not silently made an alias. No name matching is added
to the scoring runtime. These are compatibility decisions for existing owned
selections; subsequent ratings continue to use native API IDs.

The repair operation must prove all of the following:

- Every canonical/Fantasy identity and original provider ID still matches the
  manifest, with no primary-ID or alias collision in either direction.
- Current ownership scope still matches 48 slots across seven teams.
- Every new identity has immutable evidence and a private new-purchase hold.
  This preserves the restriction that already applied while the IDs were
  absent. Existing owners can still read and retain their selections.
- Club, birth date, height, fixed Fantasy position and price are not edited to
  force agreement. Registration and any prospective catalog correction remain
  separate. No manager is sold out, compensated or given free transfers.
- Locked lineups, squads, bank, sale values, transfer hits, all original
  results, source ratings, aliases and sealed historical inputs remain
  byte-for-byte unchanged by the identity operation.
- Unfinished native gameweeks receive an explicit input-version increment.
  The ordinary leased worker recalculates them. GW1–3 use reviewed publication
  revisions; their original competition seals are never rewritten.

The current data contains no numeric GW1–4 rating for these 21 selected profile
IDs. Repairing identity therefore does not fabricate points. Confirmed
non-appearance is scored separately from an unrated appearance; the latter can
settle only under the independently approved Not rated rule and evidence gates.
