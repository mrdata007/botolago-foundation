// Fantasy points from the SofaScore match rating (owner decision of 2026-10-13,
// docs/backend/FANTASY_RATING_POINTS.md). From the gameweek the owner switches
// on, a player's points for one match are:
//
//   * his SofaScore rating for that match, rounded to the nearest whole number,
//     halves up (7.5 -> 8, 7.49 -> 7, 6.5 -> 7);
//   * pending when he appeared (minutes > 0) and SofaScore gave him no rating;
//   * 0 when he did not appear (no event at all).
//
// That single `rating` event replaces every other category for those
// gameweeks. Captain, vice-captain, chips, automatic substitutions and transfer
// hits are applied afterwards exactly as before (fantasy-lifecycle-worker.ts).
//
// The database recomputes the same figure from the same snapshot before it
// saves an event (api.service_persist_fantasy_scoring_results, migration
// 20261018153305): floor(rating + 0.5), refusing a missing rating. Ratings are stored
// with at most two decimals, so the arithmetic below is exact in both places.
//
// Dependency free: Bun (tests) and Deno (the Edge Function).

import type { PointEvent } from "./fantasy-scoring-core.ts";

/** The ruleset version (app.fantasy_rulesets.version) of the rating rule. */
export const RATING_RULESET_VERSION = 3;
/** The scoring version the input document carries for a rating gameweek. */
export const RATING_SCORING_VERSION = 3;
/** The one category a rating gameweek writes. */
export const RATING_CATEGORY = "rating";
/** The range a stored rating may take (SofaScore rates from 3.0 to 10.0). */
export const RATING_MIN = 0;
export const RATING_MAX = 10;

/** True for a number SofaScore could have given: 0..10 with at most two decimals. */
export function isValidRating(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value < RATING_MIN || value > RATING_MAX) return false;
  const cents = Math.round(value * 100);
  return Math.abs(cents - value * 100) < 1e-6;
}

/**
 * A SofaScore rating as it is stored in an observation: rounded to two
 * decimals, or null when there is none or it is not a usable number.
 */
export function storedRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < RATING_MIN || value > RATING_MAX) return null;
  return Math.round(value * 100) / 100;
}

/**
 * The points for one appearance: the actual rating rounded half up. A missing
 * rating leaves scoring pending. Computed in hundredths so 7.5 and 6.5 never meet a binary rounding
 * error (both are 750 and 650 hundredths exactly).
 */
export function ratingPoints(rating: number | null | undefined): number {
  if (rating === null || rating === undefined) throw new Error("fantasy_ratings_pending");
  if (!isValidRating(rating)) throw new Error("fantasy_rating_invalid");
  const cents = Math.round(rating * 100);
  return Math.floor((cents + 50) / 100);
}

/**
 * The events of one player in one fixture under the rating rule: one `rating`
 * event when he appeared, none when he did not (his points are then 0, and an
 * earlier event for the fixture is superseded by the save, as for any rescore).
 */
export function scoreRatingPlayerFixture(
  playerId: string,
  fixtureId: string,
  appeared: boolean,
  rating: number | null | undefined,
): readonly PointEvent[] {
  if (!appeared) return [];
  return [
    {
      category: RATING_CATEGORY,
      points: ratingPoints(rating),
      sourceKey: `fixture-stats:${fixtureId}:${playerId}:${RATING_CATEGORY}`,
    },
  ];
}
