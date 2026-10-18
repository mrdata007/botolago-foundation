import { describe, expect, test } from "bun:test";
import {
  isValidRating,
  ratingPoints,
  scoreRatingPlayerFixture,
  storedRating,
} from "./fantasy-rating-scoring.ts";

describe("rating points (docs/backend/FANTASY_RATING_POINTS.md)", () => {
  test("rounds the SofaScore rating to the nearest whole number, halves up", () => {
    expect(ratingPoints(7.5)).toBe(8);
    expect(ratingPoints(7.49)).toBe(7);
    expect(ratingPoints(7.4)).toBe(7);
    expect(ratingPoints(6.5)).toBe(7);
    expect(ratingPoints(6.45)).toBe(6);
    expect(ratingPoints(5.55)).toBe(6);
    expect(ratingPoints(8.26)).toBe(8);
    expect(ratingPoints(9.5)).toBe(10);
    expect(ratingPoints(10)).toBe(10);
    expect(ratingPoints(3)).toBe(3);
    expect(ratingPoints(0)).toBe(0);
  });

  test("waits for an actual rating instead of supplying points", () => {
    expect(() => ratingPoints(null)).toThrow("fantasy_ratings_pending");
    expect(() => ratingPoints(undefined)).toThrow("fantasy_ratings_pending");
  });

  test("refuses a rating the database would refuse", () => {
    expect(() => ratingPoints(10.5)).toThrow("fantasy_rating_invalid");
    expect(() => ratingPoints(-1)).toThrow("fantasy_rating_invalid");
    expect(() => ratingPoints(7.555)).toThrow("fantasy_rating_invalid");
    expect(() => ratingPoints(Number.NaN)).toThrow("fantasy_rating_invalid");
    expect(isValidRating(7.55)).toBeTrue();
    expect(isValidRating(7.555)).toBeFalse();
    expect(isValidRating("7.5")).toBeFalse();
  });

  test("stores a rating with two decimals at most, null when unusable", () => {
    expect(storedRating(7.3)).toBe(7.3);
    expect(storedRating(7.456)).toBe(7.46);
    expect(storedRating(null)).toBeNull();
    expect(storedRating(undefined)).toBeNull();
    expect(storedRating(11)).toBeNull();
    expect(storedRating("7")).toBeNull();
  });

  test("one `rating` event for an appearance, none without one", () => {
    expect(scoreRatingPlayerFixture("p", "f", true, 7.5)).toEqual([
      { category: "rating", points: 8, sourceKey: "fixture-stats:f:p:rating" },
    ]);
    expect(() => scoreRatingPlayerFixture("p", "f", true, null)).toThrow("fantasy_ratings_pending");
    expect(scoreRatingPlayerFixture("p", "f", false, null)).toEqual([]);
    expect(scoreRatingPlayerFixture("p", "f", false, 9.1)).toEqual([]);
  });
});
