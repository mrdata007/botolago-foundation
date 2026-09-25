import { describe, expect, it } from "bun:test";
import { IdentityError, mapIdentityError } from "@/backend/identity/errors";
import { accountReadFailure, MFA_REQUIRED_TEXT } from "./account-read";
import {
  FANTASY_UNAVAILABLE_TEXT,
  fantasyTeamResult,
  NO_FANTASY_SEASON_TEXT,
  NO_FANTASY_TEAM_TEXT,
} from "./tools/get-fantasy-team";
import { PROFILE_UNAVAILABLE_TEXT, profileResult } from "./tools/get-profile";

// The MCP tools read the account's own data with an OAuth access token, which
// Supabase Auth always issues at aal1. Since 20260925210100 the database
// refuses that data to an aal1 session of an account with a verified factor
// (`PT403 mfa_required`): the tools must say so, not crash or pass on the
// database's text.
const stepUp = { code: "PT403", message: "mfa_required", details: null, hint: null };

const SEASON = "a3c30000-0000-4000-8000-000000000001";
const TEAM = "a3c30000-0000-4000-8000-000000000002";
const GAMEWEEK = "a3c30000-0000-4000-8000-000000000003";
const player = (n: number) => `a3c30000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`;

function hub(team: unknown) {
  // Two goalkeepers, five defenders, five midfielders, three forwards; the
  // starters play 4-4-2.
  const positions = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID"].concat([
    "MID",
    "MID",
    "FWD",
    "FWD",
    "FWD",
  ]);
  const starters = new Set([0, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13]);
  return {
    season: { id: SEASON, name: "Botola Pro 2026-27", status: "active" },
    gameweek: {
      id: GAMEWEEK,
      sequence: 3,
      name: "Journée 3",
      deadlineAt: "2026-09-27T18:00:00+00:00",
      status: "open",
      pointsState: "provisional",
    },
    team:
      team === undefined
        ? {
            id: TEAM,
            seasonId: SEASON,
            currentGameweekId: GAMEWEEK,
            name: "Les Lions",
            bank: 1.5,
            teamValue: 100.5,
            freeTransfers: 1,
            version: 4,
            status: "active",
            createdAt: "2026-09-01T00:00:00+00:00",
            updatedAt: "2026-09-20T00:00:00+00:00",
            squad: positions.map((position, i) => ({
              membershipId: player(50 + i),
              fantasyPlayerId: player(i),
              footballPlayerId: player(20 + i),
              footballTeamId: player(80),
              position,
              price: 6,
              purchasePrice: 6,
              salePrice: 6,
              status: "active",
            })),
            lineup: positions.map((_, i) => ({
              fantasyPlayerId: player(i),
              slot: starters.has(i) ? "starter" : "bench",
              slotOrder: i + 1,
              captain: i === 12,
              viceCaptain: i === 7,
              multiplier: i === 12 ? 2 : 1,
            })),
          }
        : team,
    rankingAvailable: false,
  };
}

describe("accountReadFailure", () => {
  it("names the two-step sign-in refusal, raw or wrapped", () => {
    for (const error of [stepUp, mapIdentityError(stepUp), new Error("outer", { cause: stepUp })]) {
      expect(accountReadFailure(error, "unavailable")).toEqual({
        content: [{ type: "text", text: MFA_REQUIRED_TEXT }],
        isError: true,
      });
    }
  });

  it("passes on no database text for anything else", () => {
    const failure = accountReadFailure(
      { code: "PGRST205", message: "Could not find the table 'public.profiles'" },
      "unavailable",
    );
    expect(failure).toEqual({ content: [{ type: "text", text: "unavailable" }], isError: true });
    expect(accountReadFailure(new IdentityError("internal", "boom"), "x").content[0].text).toBe(
      "x",
    );
  });
});

describe("get_profile", () => {
  it("answers an account with two-step sign-in with the refusal, as an error", () => {
    expect(profileResult({ data: null, error: stepUp })).toEqual({
      content: [{ type: "text", text: MFA_REQUIRED_TEXT }],
      isError: true,
    });
  });

  it("returns the account's profile otherwise", () => {
    const profile = {
      username: "fan",
      display_name: "Fan",
      favorite_club_id: null,
      preferred_language: "fr",
    };
    expect(profileResult({ data: profile, error: null })).toEqual({
      content: [{ type: "text", text: JSON.stringify(profile) }],
      structuredContent: { profile },
    });
    expect(profileResult({ data: null, error: null }).structuredContent).toEqual({ profile: null });
    expect(profileResult({ data: null, error: { code: "57014", message: "timeout" } })).toEqual({
      content: [{ type: "text", text: PROFILE_UNAVAILABLE_TEXT }],
      isError: true,
    });
  });
});

describe("get_fantasy_team", () => {
  it("answers an account with two-step sign-in with the refusal, as an error", () => {
    expect(fantasyTeamResult({ data: null, error: stepUp })).toEqual({
      content: [{ type: "text", text: MFA_REQUIRED_TEXT }],
      isError: true,
    });
  });

  it("summarises the manager's team in the current season", () => {
    const result = fantasyTeamResult({ data: hub(undefined), error: null });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      team: {
        teamName: "Les Lions",
        season: "Botola Pro 2026-27",
        formation: "4-4-2",
        bank: 1.5,
        teamValue: 100.5,
        freeTransfers: 1,
        currentGameweek: {
          number: 3,
          name: "Journée 3",
          deadlineAt: "2026-09-27T18:00:00+00:00",
        },
        updatedAt: "2026-09-20T00:00:00+00:00",
      },
    });
  });

  it("says so when there is no team, no open season, or no answer it can read", () => {
    expect(fantasyTeamResult({ data: hub(null), error: null })).toEqual({
      content: [{ type: "text", text: NO_FANTASY_TEAM_TEXT }],
    });
    expect(
      fantasyTeamResult({ data: null, error: { code: "PT404", message: "fantasy_season_closed" } }),
    ).toEqual({ content: [{ type: "text", text: NO_FANTASY_SEASON_TEXT }] });
    expect(fantasyTeamResult({ data: { unexpected: true }, error: null })).toEqual({
      content: [{ type: "text", text: FANTASY_UNAVAILABLE_TEXT }],
      isError: true,
    });
  });
});
