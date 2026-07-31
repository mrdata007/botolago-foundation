# BotolaGO Preseason Player Rating v1

## Status and boundary

`botolago-preseason-rating-v1` is the immutable first version of the 4.0–10.0
player rating used to seed preseason read models. It does not award Fantasy
points and does not modify `botolago-fantasy-v1.0` live scoring.

The input is the completed 2025/26 SportsMonks season (`26027`). Only canonical
players mapped into that season are rated. Missing statistics produce a neutral
6.0 rating with zero confidence instead of fabricated performance.

## Inputs

- official average player rating;
- appearances, starts, and official minutes;
- goals and official assists;
- clean sheets, goals conceded, and goalkeeper saves;
- penalties saved/missed;
- yellow cards, direct red cards, second-yellow dismissals, and own goals.

SportsMonks statistic type IDs and general position IDs are pinned to the
provider's published v3 definitions. Provider payloads are validated before
they enter the canonical rating table.

## Calculation

1. Calculate last-season Fantasy-equivalent points using the immutable v1.0
   position weights. Aggregate season minutes cannot prove each individual
   60-minute threshold, so full appearances are conservatively estimated as
   `min(appearances, floor(minutes / 60))`.
2. Calculate Fantasy-equivalent points per 90 official minutes.
3. Within each position (`GK`, `DEF`, `MID`, `FWD`), calculate percent ranks for:
   official provider rating, Fantasy-equivalent total, and points per 90.
4. Combine the ranks as `50% provider rating + 30% total + 20% per 90`.
5. Map the result to 4.0–10.0, then shrink samples under 900 minutes toward the
   neutral 6.0 using `confidence = min(1, minutes / 900)`.
6. Round the published rating to one decimal place.

Players are compared only with others in the same position. Ties receive the
same percent rank. A missing provider rating receives a neutral provider
percentile of 0.5.

## Persistence and correction

Every row stores the algorithm version, source version, normalized inputs,
Fantasy-equivalent points, points per 90, confidence, result, and calculation
time. The ingestion is idempotent. A future formula must use a new algorithm
version; v1 rows remain historical evidence.
