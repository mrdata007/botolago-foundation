import { describe, expect, it } from "bun:test";
import { calculateAutomaticSubstitutions, type SubstitutionPlayer } from "./substitutions";

const limits = [
  { position: "GK" as const, minimum: 1, maximum: 1 },
  { position: "DEF" as const, minimum: 3, maximum: 5 },
  { position: "MID" as const, minimum: 2, maximum: 5 },
  { position: "FWD" as const, minimum: 1, maximum: 3 },
];

function players(): SubstitutionPlayer[] {
  return [
    {
      id: "gk1",
      position: "GK",
      starter: true,
      benchOrder: null,
      didPlay: false,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "d1",
      position: "DEF",
      starter: true,
      benchOrder: null,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "d2",
      position: "DEF",
      starter: true,
      benchOrder: null,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "d3",
      position: "DEF",
      starter: true,
      benchOrder: null,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "d4",
      position: "DEF",
      starter: true,
      benchOrder: null,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "m1",
      position: "MID",
      starter: true,
      benchOrder: null,
      didPlay: false,
      captain: true,
      viceCaptain: false,
    },
    {
      id: "m2",
      position: "MID",
      starter: true,
      benchOrder: null,
      didPlay: true,
      captain: false,
      viceCaptain: true,
    },
    {
      id: "m3",
      position: "MID",
      starter: true,
      benchOrder: null,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "m4",
      position: "MID",
      starter: true,
      benchOrder: null,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "f1",
      position: "FWD",
      starter: true,
      benchOrder: null,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "f2",
      position: "FWD",
      starter: true,
      benchOrder: null,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "gk2",
      position: "GK",
      starter: false,
      benchOrder: 4,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "f3",
      position: "FWD",
      starter: false,
      benchOrder: 1,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "d5",
      position: "DEF",
      starter: false,
      benchOrder: 2,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
    {
      id: "m5",
      position: "MID",
      starter: false,
      benchOrder: 3,
      didPlay: true,
      captain: false,
      viceCaptain: false,
    },
  ];
}

describe("automatic substitutions", () => {
  it("uses a goalkeeper replacement, preserves formation, and promotes vice captain", () => {
    const result = calculateAutomaticSubstitutions(players(), limits, false);
    expect(result.substitutions).toEqual([
      { playerOutId: "gk1", playerInId: "gk2", reason: "goalkeeper_did_not_play" },
      { playerOutId: "m1", playerInId: "f3", reason: "outfield_did_not_play" },
    ]);
    expect(result.effectiveCaptainId).toBe("m2");
  });

  it("does not auto-substitute during Bench Boost", () => {
    expect(calculateAutomaticSubstitutions(players(), limits, true).substitutions).toEqual([]);
  });
});
