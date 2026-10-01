# Squad candidate collector: first live run (1 Oct 2026)

**Read-only evidence.** Produced by the new collector (`src/backend/football/identity`) through the
manual "Provider probe" workflow (`collect_squads`). 32 requests (16 clubs x 2 providers), 0 failed.
No database access, nothing persisted, **no player names, dates of birth or raw payloads**
(the collector fails the run if one reaches the document). Two runs were made (the second added the
"registered elsewhere" detail in section 5); their totals are identical.

## 1. Provider date-of-birth plausibility (aggregate counts)

| Provider   | Players | DOB present | Missing | Not provided by endpoint | Unparseable | Future | Age under 15 | Age over 50 | 1 January | Valid | Players sharing a DOB in their squad |
| ---------- | ------- | ----------- | ------- | ------------------------ | ----------- | ------ | ------------ | ----------- | --------- | ----- | ------------------------------------ |
| Sofascore  | 540     | 488         | 52      | 0                        | 0           | 0      | 0            | 0           | 38        | 488   | 12 (on 6 dates)                      |
| Flashscore | 465     | 0           | 0       | 465                      | 0           | 0      | 0            | 0           | 0         | 0     | 0                                    |

- Every present Sofascore date is plausible (no unparseable, future, under-15 or over-50 value).
- **38 of 488 valid Sofascore dates fall on 1 January** (7.8%; about 1.3 would be expected by chance).
  The provider side shows the same placeholder pattern as the app side, so a provider 1 January date is
  treated as **no signal** too (a deliberate extension of the owner's app-only rule; reversible in one line).
- Flashscore squads carry no date of birth at all, so Flashscore can never supply a DOB signal.

## 2. Per club

| Club              | Sofascore players | Valid DOB | Missing DOB | 1 Jan | Dates shared | Registered elsewhere | Flashscore players | Flashscore squad |
| ----------------- | ----------------- | --------- | ----------- | ----- | ------------ | -------------------- | ------------------ | ---------------- |
| amal-tiznit       | 35                | 33        | 2           | 2     | 0            | 4                    | 26                 | COMPLETE         |
| codm-meknes       | 38                | 32        | 6           | 6     | 1            | 3                    | 27                 | COMPLETE         |
| cr-khemis-zemamra | 36                | 30        | 6           | 1     | 0            | 1                    | 28                 | COMPLETE         |
| difaa-el-jadida   | 37                | 33        | 4           | 4     | 2            | 3                    | 27                 | COMPLETE         |
| far-rabat         | 26                | 26        | 0           | 1     | 0            | 0                    | 28                 | COMPLETE         |
| fus-rabat         | 32                | 25        | 7           | 2     | 0            | 2                    | 35                 | COMPLETE         |
| hassania-agadir   | 39                | 35        | 4           | 4     | 0            | 2                    | 31                 | COMPLETE         |
| ittihad-tanger    | 32                | 28        | 4           | 2     | 1            | 0                    | 30                 | COMPLETE         |
| kawkab-marrakech  | 37                | 35        | 2           | 4     | 0            | 4                    | 33                 | COMPLETE         |
| maghreb-fes       | 31                | 30        | 1           | 1     | 0            | 0                    | 30                 | COMPLETE         |
| moghreb-tetouan   | 43                | 38        | 5           | 6     | 2            | 1                    | 27                 | COMPLETE         |
| rsb-berkane       | 30                | 29        | 1           | 1     | 0            | 0                    | 27                 | COMPLETE         |
| raja-casablanca   | 28                | 28        | 0           | 0     | 0            | 0                    | 29                 | COMPLETE         |
| uts-rabat         | 41                | 32        | 9           | 1     | 0            | 5                    | 35                 | COMPLETE         |
| widad-temara      | 26                | 25        | 1           | 2     | 0            | 8                    | 16                 | INCOMPLETE       |
| wydad-casablanca  | 29                | 29        | 0           | 1     | 0            | 1                    | 36                 | COMPLETE         |

## 3. Incomplete squads

Rule (generic, no club named): fewer than 18 players, or fewer than 0.6 of the other provider's or the app's
squad, or more than 10% malformed entries, or no goalkeeper where positions are known.
**One squad flagged: `widad-temara` on Flashscore (16 players, reason `below_conservative_minimum`).**
Its Sofascore squad (26) and every other squad are complete. Moghreb Tetouan (27 against 43, ratio 0.63) is
not flagged: that gap is inside the normal spread. Players present in an incomplete squad stay positive
evidence; absence from it is no signal, and no "not at club" or ignore suggestion can come from it.

## 4. Sofascore registered-team disagreement

Counts of squad players whose own team id is not the requested club are in the per-club table. They are a
reviewer flag only; the player stays in the squad and in the candidate set.

## 5. Cross-club provider-id check (this snapshot only)

- Flashscore: 465 ids, none repeated within a squad, none in two clubs.
- Sofascore: 538 distinct ids over 540 entries; none repeated within a squad; **two ids appear in two clubs' squads**:
  one in `amal-tiznit` and `codm-meknes` (registered elsewhere in the Amal Tiznit listing), one in `codm-meknes` and
  `difaa-el-jadida` (registered elsewhere in both listings). Every compared attribute (position, date of birth,
  height, nationality, registered team) is identical across the two entries of each id, so this looks like one
  person listed on two squads rather than one id naming two people. That is an inference from the data, not a
  verified fact.
- Conclusion: **`PROVIDER_ID_COLLISION_NEEDS_REVIEW`**. No claim is made about any other season or day.

## 6. Flashscore position field against Sofascore position

101 players were paired from independent evidence (an incident both providers attribute to the same player in
the seven committed round-1 fixtures; no name pairing). 94 have both positions.

- Agree: 71 of 94 (75.5%). Disagree: 23.
- Sofascore M / Flashscore F is the single large disagreement (17 players); Sofascore F against Flashscore M: 3;
  D against M: 3.
- **No goalkeeper is in the paired set**, so goalkeeper agreement is not measured.
- The pairs come from players who figured in incidents, so they lean to attackers and are not a random sample.

Status: `MEASURED_SIGNAL_ONLY`. Flashscore `PLAYER_TYPE_ID` stays a reviewer/ranking signal only.

## 7. Sanitized output schema (synthetic values)

```json
{
  "schema": "player-squad-collector-evidence/1",
  "collectedAt": "2026-10-01T00:00:00.000Z",
  "requests": {
    "sofascore": { "sent": 16, "failed": 0 },
    "flashscore": { "sent": 16, "failed": 0 }
  },
  "squads": [
    {
      "clubKey": "club-slug",
      "provider": "sofascore",
      "status": "ok",
      "errorCode": null,
      "players": 30,
      "excludedCoaches": 0,
      "malformedEntries": 0,
      "duplicateIdCount": 0,
      "completeness": "COMPLETE",
      "completenessReasons": [],
      "dob": {
        "players": 30,
        "present": 27,
        "missing": 3,
        "notProvided": 0,
        "unparseable": 0,
        "future": 0,
        "ageBelowMinimum": 0,
        "ageAboveMaximum": 0,
        "january1": 2,
        "valid": 27,
        "playersSharingDob": 0,
        "duplicateDobValues": 0
      },
      "coverage": {
        "shirtNumber": 25,
        "position": 30,
        "height": 20,
        "nationality": 30,
        "registeredTeamDisagreement": 1
      }
    }
  ],
  "totals": { "sofascore": {}, "flashscore": {} },
  "incompleteSquads": [
    { "clubKey": "club-slug", "provider": "flashscore", "reasons": ["below_conservative_minimum"] }
  ],
  "idChecks": { "byProvider": {}, "conclusion": "NO_CURRENT_SNAPSHOT_COLLISION_OBSERVED" },
  "positionAgreement": {
    "status": "MEASURED_SIGNAL_ONLY",
    "pairsConsidered": 101,
    "bothPositionsKnown": 94,
    "agree": 71,
    "disagree": 23
  }
}
```

In memory only (never in this document): per player `provider`, `externalPlayerId`, `requestedTeamId`,
`squadCompleteness`, `registeredTeamId`, `registeredTeamDisagreement`, `shirtNumber`, `positionSignal`,
`dobSignalState`, `dobJanuary1`, `heightSignal`, `nationalitySignal`, the valid birth date for comparison, and the
display name for a reviewer's screen.
