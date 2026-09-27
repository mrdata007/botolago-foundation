import { describe, expect, it } from "bun:test";
import { extractIdentityHints, runIdentityReport } from "./pepites-historical-identity-report";

function fixture(fixtureId = 19596474) {
  return {
    data: {
      id: fixtureId,
      season_id: 26027,
      league_id: 860,
      lineups: Array.from({ length: 24 }, (_, n) => ({
        id: n + 1,
        team_id: (n % 2) + 100,
        type_id: n < 22 ? 11 : 12,
        player_id: n < 7 ? null : n + 1000,
        player_name: `Player ${n}`,
        jersey_number: n + 1,
        details: [{ privateField: "not exported" }],
      })),
    },
  };
}
describe("historical identity report", () => {
  it("preserves anonymous rows without inventing identities or statistics", () => {
    const report = extractIdentityHints(fixture(), 19596474);
    expect(report.anonymousStarters).toBe(7);
    expect(report.rows[0]).toEqual({
      rowIndex: 0,
      lineupId: 1,
      teamId: 100,
      playerId: null,
      playerName: "Player 0",
      jerseyNumber: 1,
      participation: "starter",
    });
    expect(JSON.stringify(report)).not.toContain("privateField");
    expect(report.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("retains missing hints as null; jersey alone never supplies an ID", () => {
    const payload = fixture();
    Object.assign(payload.data.lineups[0], { player_name: null, player_id: 0 });
    expect(extractIdentityHints(payload, 19596474).rows[0]).toMatchObject({
      playerName: null,
      playerId: null,
    });
  });
  it("rejects any fixture outside the two reviewed matches", () => {
    expect(() => extractIdentityHints(fixture(123), 123)).toThrow();
  });
  it("rejects wrong fixture, season or competition", () => {
    for (const field of ["id", "season_id", "league_id"] as const) {
      const payload = fixture();
      payload.data[field] = 999;
      expect(() => extractIdentityHints(payload, 19596474)).toThrow();
    }
  });
  it("rejects duplicate lineup IDs", () => {
    const payload = fixture();
    payload.data.lineups[1].id = 1;
    expect(() => extractIdentityHints(payload, 19596474)).toThrow();
  });
  it("rejects malformed participation and missing teams", () => {
    for (const change of [{ type_id: 99 }, { team_id: 0 }]) {
      const payload = fixture();
      Object.assign(payload.data.lineups[0], change);
      expect(() => extractIdentityHints(payload, 19596474)).toThrow();
    }
  });
  it("rejects incomplete starter counts", () => {
    const payload = fixture();
    payload.data.lineups[0].type_id = 12;
    expect(() => extractIdentityHints(payload, 19596474)).toThrow();
  });
  it("rejects control characters in identity hints", () => {
    const payload = fixture();
    payload.data.lineups[0].player_name = "Name\nSECRET";
    expect(() => extractIdentityHints(payload, 19596474)).toThrow();
  });
  it("changes evidence fingerprint when provider identity changes", () => {
    const before = extractIdentityHints(fixture(), 19596474).payloadSha256;
    const payload = fixture();
    payload.data.lineups[0].player_name = "Corrected";
    expect(extractIdentityHints(payload, 19596474).payloadSha256).not.toBe(before);
  });
  it("only GETs the two fixed provider endpoints and never exports credentials", async () => {
    const seen: string[] = [];
    const token = "sportsmonks-test-token-1234567890";
    const report = await runIdentityReport(
      { SPORTSMONKS_API_TOKEN: token },
      {
        fetch: async (url, init) => {
          const parsed = new URL(String(url));
          seen.push(parsed.pathname);
          expect(parsed.origin).toBe("https://api.sportmonks.com");
          expect(init?.method).toBe("GET");
          expect(init?.redirect).toBe("error");
          expect(parsed.href).not.toContain(token);
          return Response.json(fixture(Number(parsed.pathname.split("/").at(-1))));
        },
      },
    );
    expect(seen).toEqual(["/v3/football/fixtures/19596474", "/v3/football/fixtures/19596475"]);
    expect(report.databaseWrites).toBe(false);
    expect(JSON.stringify(report)).not.toContain(token);
  });
  it("refuses provider content containing the credential", async () => {
    const token = "sportsmonks-test-token-1234567890";
    await expect(
      runIdentityReport(
        { SPORTSMONKS_API_TOKEN: token },
        {
          fetch: async (url) => {
            const payload = fixture(Number(new URL(String(url)).pathname.split("/").at(-1)));
            payload.data.lineups[0].player_name = token;
            return Response.json(payload);
          },
        },
      ),
    ).rejects.toThrow("PEPITES_IDENTITY_REPORT_CREDENTIAL_IN_EVIDENCE");
  });
});
