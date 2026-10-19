# Why the 21 legacy identities were missed

Read-only investigation, 19 October 2026. This document records evidence and
repair decisions still to execute; it does not claim that production identities
have been repaired. Owner instruction: find why verification failed before
considering replacement compensation. No free replacements were approved.

## Findings

The earlier description "cannot verify" was premature. All 21 legacy names now
have a plausible SofaScore profile candidate. Candidate discovery is not identity
approval: birth-date conflicts, spelling differences and duplicate provider
profiles remain explicitly flagged below.

The failure has three layers:

1. **Stale cross-provider catalog.** Production still assigns several players to
   former clubs. SofaScore transfer histories explain why they are absent from
   those clubs' current squads. Some moved within Morocco; others left the
   competition. An ID repair cannot by itself repair current club eligibility.
2. **A narrow matcher, not a global identity investigation.**
   `src/backend/football/sofascore-squad-link.ts` searches only the same club,
   identical non-null shirt and compatible position. Names are never compared.
   Its `no_squad_entry` means no accepted pairing under that rule, not no provider
   profile. Missing shirts and transferred players cannot pass this rule.
3. **Recovery cannot close this gap automatically.** The weekly catalog refresh
   updates already-mapped players' display names and current-club shirts. It
   deliberately creates no player, membership or identity mapping. The native
   rating importer also deliberately creates no catalog identity. Retrying these
   jobs cannot establish an absent legacy identity.

The fresh read-only squad report
[39242576018](https://github.com/mrdata007/botolago-foundation/actions/runs/39242576018)
read all 16 clubs and 576 API squad players. Its artifact distinguishes 449
already-linked players, one proposed confirmed pairing, 16 suggestions and 110
unmatched API players. None of its proposed changes was applied. A proposed
Abdoulaye Kanou/Y. Lamine pairing is a concrete reason not to bulk-apply
shirt-based suggestions as verified identities.

Production queries independently confirmed that none of the 21 candidate API
IDs listed below currently has a primary player mapping. The alternate Assane
Beye ID was also checked. None of the 21 legacy internal players has a matching
SofaScore identity audit or provider attribute observation. Thus this is not a
case of a verified mapping being lost by the new rating scorer.

## Per-player evidence and required resolution

Links below point to the rating provider itself. Current profile details are
provider assertions; a historical transfer timeline or a club announcement is
stronger evidence than a search snippet. Cached language variants sometimes
show different club states, so resolve using a timestamped API snapshot before
applying a repair. Do not rewrite a birth date just to make a match pass.

| Legacy selection / club         | SofaScore candidate                                                                | Evidence explaining the miss / remaining check                                                                                                                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nadir Lougmani / Kawkab         | [1170665](https://www.sofascore.com/football/player/nadir-lougmani/1170665)        | FAR transfer 28 July 2026; catalog still Kawkab and forward, provider defender. Provider DOB 22 August 2002 versus catalog 26 August. Fresh FAR squad has ID 1170665, shirt 77. Verify the DOB disagreement through club/registration history.                                                                           |
| Mohammad El Fakih / Zemamra     | [919342](https://www.sofascore.com/football/player/mohammad-el-fakih/919342)       | Provider records Olympique Dcheira transfer 5 September 2026. Provider January 1, 1990 versus catalog February 7; January 1 is weak evidence. Verify the cross-provider identity before applying.                                                                                                                        |
| Youssef Lahouizi / Amal Tiznit  | [1525362](https://www.sofascore.com/football/player/youssef-lahouizi/1525362)      | Provider goalkeeper, DOB 16 July 1995, Amal transfer August 2025. Catalog has no DOB; current provider club roster no longer lists him in the inspected page. Verify departure/current registration and exact API profile.                                                                                               |
| Marouane Oujeddou / Zemamra     | [1994372](https://www.sofascore.com/football/player/marouane-oujeddou/1994372)     | Exact name and DOB 21 January 2004; provider FAR transfer 22 July 2026. Fresh FAR squad and stored October 2 observation agree on ID and shirt 16. Old catalog club excludes him. Strong identity evidence; current club and historical scope must be reconciled separately.                                             |
| Takha Majni / UTS               | [2077076](https://www.sofascore.com/football/player/taha-majni/2077076)            | Spelling is Taha. Provider Crystal Palace U21, DOB 11 October 2007. [Crystal Palace announced the signing on 7 September 2026](https://www.cpfc.co.uk/news/announcement/crystal-palace-academy-sign-taha-majni/). Confirm legacy SportsMonks 37950002 corresponds to this player; do not retain current UTS eligibility. |
| Ayoub Tine / Zemamra            | [1546502](https://www.sofascore.com/football/player/ayoub-tine/1546502)            | Exact DOB 3 June 1992; provider MC Oujda transfer 17 September 2026. Former-club lookup misses him.                                                                                                                                                                                                                      |
| Mehdi Lemzaouri / Difaâ         | [1004256](https://www.sofascore.com/football/player/marouane-lemzaouri/1004256)    | Provider first name Marouane; exact DOB 7 July 1993, height 176 cm and matching Difaâ/Oujda/Zemamra history. Timeline records Stade Everois 21 August 2026 while header says no team. Resolve first-name and current-registration discrepancies explicitly.                                                              |
| Issa Sioudi / Zemamra           | [919632](https://www.sofascore.com/football/player/sioudi-aissa/919632)            | Aissa spelling, exact DOB 20 September 1997 and goalkeeper; provider move to Wydad Fès 13 January 2026. Catalog retained former club.                                                                                                                                                                                    |
| Reda Slim / FAR                 | [1004433](https://www.sofascore.com/football/player/slim-reda/1004433)             | Exact DOB 25 October 1999; FAR loan ended 9 July 2026, returned to Al Ahly. Current FAR squad lookup cannot find him.                                                                                                                                                                                                    |
| Mamadou Lamine Camara / Berkane | [1155596](https://www.sofascore.com/football/player/camara-mamadou-lamine/1155596) | Exact DOB 5 January 2003; Al Ahli Tripoli transfer 22 February 2026. Reject namesake 1406985, whose DOB is 22 November 1997.                                                                                                                                                                                             |
| Dylan Saint-Louis / Tanger      | [788833](https://www.sofascore.com/football/player/dylan-saint-louis/788833)       | Exact DOB 26 April 1995; provider records departure from Tanger 8 August 2026, no team.                                                                                                                                                                                                                                  |
| Yassine Fatine / Difaâ          | [1919273](https://www.sofascore.com/football/player/yassine-fatine/1919273)        | Exact DOB 5 December 1996, defender, shirt 20; current provider header Olympic Safi, older cached variants Difaâ. Obtain transfer/API snapshot before changing eligibility.                                                                                                                                              |
| Assane Beye / HUSA              | [1592863](https://www.sofascore.com/football/player/assane-beye/1592863)           | Exact DOB 8 January 2000, defender; provider transfer to Union Military 5 August 2026. Alternate profile [1604919](https://www.sofascore.com/football/player/assane-beye/1604919) still says HUSA and lacks DOB. Do not select the stale duplicate merely because the club matches.                                      |
| Youssef Limouri / CODM          | [1009758](https://www.sofascore.com/football/player/youssef-limouri/1009758)       | Exact DOB 20 February 1999; moved to Petrojet 4 February then Yacoub El Mansour 22 August 2026. Old CODM lookup misses him.                                                                                                                                                                                              |
| Youssef Tafay / Amal            | [1525336](https://www.sofascore.com/football/player/youssef-tafay/1525336)         | Fresh authorized Amal squad contains this exact name/ID with no shirt; matcher reports `no_shirt`. Catalog shirt 1. Public profile instead says JS Massira since August 2025 and January 1 DOB. The identity is discoverable, but contradictory registration sources need reconciliation.                                |
| Amine Dghoughi / CODM           | [919951](https://www.sofascore.com/de/football/player/amine-dghoughi/919951)       | Exact DOB 16 January 1992; provider records Raja Beni Mellal 1 September 2026 after leaving CODM.                                                                                                                                                                                                                        |
| Ange-Freddy Plumain / HUSA      | [372340](https://www.sofascore.com/football/player/ange-freddy-plumain/372340)     | Exact DOB 2 March 1995; Omonia Aradippou transfer 8 September 2026.                                                                                                                                                                                                                                                      |
| Moises Paniagua / Wydad         | [1424737](https://www.sofascore.com/football/player/paniagua-moises/1424737)       | Fresh Wydad squad ID 1424737, shirt 40, midfielder; catalog shirt 20, forward. Provider DOB 15 August 2007 versus catalog 16 August. Shirt mismatch independently explains the failed squad match. Verify birth-date discrepancy rather than altering either date to force acceptance.                                   |
| Yassine Belfada / Témara        | [1140915](https://www.sofascore.com/football/player/yassine-belfadla/1140915)      | Belfadla spelling; provider history has Widad Témara 24 July 2025 then Rapide Oued Zem 11 September 2026. Provider DOB 4 July 2000, forward; catalog January 1 placeholder, midfielder, no provider ID. Strong candidate, needs registration confirmation because both spelling and DOB differ.                          |
| Yahia El Filali / Tétouan       | [919551](https://www.sofascore.com/fr/football/player/yahia-el-filali/919551)      | Exact DOB 13 November 1989 and goalkeeper; timeline includes Zemamra January 2025, Mohammédia August 2025, Kénitra January 2026. Catalog Tétouan is outdated.                                                                                                                                                            |
| Aymane Khatmi / Difaâ           | [2625215](https://www.sofascore.com/football/player/aymane-khatmi/2625215)         | Fresh authorized Difaâ squad contains exact name/ID, shirt 72, forward; catalog shirt 91, midfielder, no DOB. The provider's club page independently lists him. Shirt mismatch blocks the matcher. Confirm the legacy source identity without relying on January 1 placeholder birth data.                               |

## Direct provenance checks

The latest stored SportsMonks season-squad observation is 4 October 2026,
09:10:08 UTC, digest
`fbac6a06d6884da0e65ff0c75916046828b657b38e9a11d5498fbe40d133f9aa`.
Across all stored SportsMonks squad observations, only four of these 21 IDs were
found: Nadir still Kawkab/forward/shirt 77; Paniagua Wydad/forward/shirt 20;
Dghoughi CODM/shirt 8; Tafay Amal/no shirt. The other 17 have no matching player
entry in these stored observations. Absence here does not establish absence
from SportsMonks globally, or prove who originally entered each catalog row.

For Nadir and Paniagua, the outdated/conflicting attributes are already present
in the stored SportsMonks source payload. They were not created by the API-rating
scorer. The 19 legacy players with SportsMonks IDs and two with no old provider
ID require a one-time audited identity repair; future ratings remain native-ID
based and must never depend on repeating fuzzy name matching.

## Repair acceptance criteria

- Store primary-source evidence and resolve duplicate IDs and conflicting
  attributes explicitly. One verified provider ID per legacy identity; no
  existing primary/alias collision in either direction.
- Separate identity, current club eligibility and historical membership dates.
  A transfer changes neither a manager's locked selection nor historical prices.
- Apply only through a guarded, rollback-rehearsed production operation with
  current writer/lease checks. Mapping inserts do not automatically bump scoring
  inputs (verified against production triggers); version/invalidation must be
  explicit. Never quietly recalculate against an old scoring digest.
- Native GW4+ must re-score on fresh inputs; historical sealed calculations stay
  immutable, with reviewed publication revisions if a historical recovery
  changes visible points. Check each selected API ID against every relevant
  fixture, including appearances after a transfer to another league club.
- Prove independent rating arithmetic and unchanged locked lineups, transfer
  costs, bank, sale values and historical seals. A verified non-appearance is
  distinct from a missing identity or an appearance without a rating.
- Do not enable purchase of a stale-club player merely by adding an API ID.
  Preserve owned selections while deciding any future roster correction.
  Compensation remains unapproved; no automatic sale or free replacement.

Email work continues separately. Automatic rating recovery remains enabled;
the 13:30 UTC / 17:30 Dubai worker pass succeeded and released its lease.
