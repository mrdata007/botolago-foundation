import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  evaluateSignals,
  rankAppCandidates,
  rankScore,
  SIGNAL_WEIGHTS,
  type AppPlayerAttributes,
} from "./candidate-signals";
import { NOW, providerPlayer } from "./test-support";

const app = (overrides: Partial<AppPlayerAttributes> = {}): AppPlayerAttributes => ({
  appPlayerId: "app-1",
  teamId: "team-1",
  birthDate: "1998-05-14",
  shirtNumber: 9,
  position: "F",
  ...overrides,
});

describe("date of birth ranking", () => {
  test("valid DOB on both sides is the strongest signal", () => {
    const signals = evaluateSignals(providerPlayer(), app(), NOW);
    expect(signals.dob).toEqual({ kind: "match" });
    expect(rankScore(signals)).toBeGreaterThanOrEqual(SIGNAL_WEIGHTS.dobMatch);
  });

  test("a valid conflict is shown and lowers the rank a little, never removes the candidate", () => {
    const conflicting = app({ birthDate: "1990-02-02" });
    const ranked = rankAppCandidates(providerPlayer(), [conflicting], NOW);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.signals.flags).toContain("DOB_CONFLICT");
    expect(ranked[0]!.score).toBe(
      SIGNAL_WEIGHTS.dobConflict + SIGNAL_WEIGHTS.shirtMatch + SIGNAL_WEIGHTS.positionMatch,
    );
  });

  test("a missing app DOB is no signal and costs no rank", () => {
    const withMissing = evaluateSignals(providerPlayer(), app({ birthDate: null }), NOW);
    expect(withMissing.dob.kind).toBe("no_signal");
    expect(rankScore(withMissing)).toBe(SIGNAL_WEIGHTS.shirtMatch + SIGNAL_WEIGHTS.positionMatch);
    expect(withMissing.flags).not.toContain("DOB_CONFLICT");
  });

  test("a 1 January app DOB is no match and no conflict, whatever the provider says", () => {
    for (const providerDate of ["1999-01-01", "1995-07-07"]) {
      const signals = evaluateSignals(
        providerPlayer({
          signalValues: { birthDate: providerDate },
          dobJanuary1: providerDate.endsWith("-01-01"),
        }),
        app({ birthDate: "1999-01-01" }),
        NOW,
      );
      expect(signals.dob.kind).toBe("no_signal");
      expect(signals.flags).not.toContain("DOB_CONFLICT");
    }
  });

  test.each([
    ["future", "future"],
    ["age_below_minimum", "age_below_minimum"],
    ["age_above_maximum", "age_above_maximum"],
    ["unparseable", "unparseable"],
    ["missing", "missing"],
    ["not_provided", "not_provided"],
  ] as const)("an invalid provider DOB (%s) is no signal and never a conflict", (state) => {
    const signals = evaluateSignals(
      providerPlayer({ dobSignalState: state, signalValues: { birthDate: null } }),
      app(),
      NOW,
    );
    expect(signals.dob.kind).toBe("no_signal");
    expect(signals.flags).not.toContain("DOB_CONFLICT");
  });

  test("a sparse-coverage club does not penalise its players: a player without an app DOB ranks no lower than the same player would with no DOB data on either side", () => {
    const noDob = rankScore(
      evaluateSignals(
        providerPlayer({ dobSignalState: "missing", signalValues: { birthDate: null } }),
        app({ birthDate: null }),
        NOW,
      ),
    );
    const appMissingOnly = rankScore(
      evaluateSignals(providerPlayer(), app({ birthDate: null }), NOW),
    );
    expect(appMissingOnly).toBe(noDob);
    // A missing value never lowers any rank: every weight below zero needs a conflict.
    const missingEverything = rankScore(
      evaluateSignals(
        providerPlayer({
          shirtNumber: null,
          positionSignal: null,
          dobSignalState: "missing",
          signalValues: { birthDate: null },
        }),
        app({ birthDate: null, shirtNumber: null, position: null }),
        NOW,
      ),
    );
    expect(missingEverything).toBe(0);
  });
});

describe("reviewer flags", () => {
  test("a registered-team disagreement is a flag only: no rank change, candidate kept", () => {
    const plain = rankAppCandidates(providerPlayer(), [app()], NOW)[0]!;
    const flagged = rankAppCandidates(
      providerPlayer({ registeredTeamId: "999", registeredTeamDisagreement: true }),
      [app()],
      NOW,
    )[0]!;
    expect(flagged.signals.flags).toContain("REGISTERED_TEAM_DISAGREEMENT");
    expect(flagged.score).toBe(plain.score);
  });

  test("a position disagreement is a reviewer flag and a small penalty, not a filter", () => {
    const ranked = rankAppCandidates(
      providerPlayer({ positionSignal: "G" }),
      [app({ position: "F" })],
      NOW,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.signals.flags).toContain("POSITION_DISAGREEMENT");
    expect(ranked[0]!.signals.position).toBe("conflict");
  });

  test("an incomplete provider squad is flagged but changes no rank", () => {
    const complete = rankAppCandidates(providerPlayer(), [app()], NOW)[0]!;
    const incomplete = rankAppCandidates(
      providerPlayer({ squadCompleteness: "INCOMPLETE_PROVIDER_SQUAD" }),
      [app()],
      NOW,
    )[0]!;
    expect(incomplete.signals.flags).toContain("INCOMPLETE_PROVIDER_SQUAD");
    expect(incomplete.score).toBe(complete.score);
  });
});

describe("names", () => {
  test("names cannot affect ranking: swapping every name leaves order and scores unchanged", () => {
    const candidates = [
      app({ appPlayerId: "a", birthDate: "1998-05-14", displayName: "Aaaa Aaaa" }),
      app({ appPlayerId: "b", birthDate: "1990-01-02", displayName: "Test Display Name" }),
      app({ appPlayerId: "c", birthDate: null, shirtNumber: 3, displayName: "Zzzz Zzzz" }),
    ];
    const renamed = candidates.map((c, i) => ({
      ...c,
      displayName: ["Qqqq", "Wwww", "Eeee"][(i + 1) % 3]!,
    }));
    const base = rankAppCandidates(providerPlayer(), candidates, NOW);
    const swapped = rankAppCandidates(
      providerPlayer({ private: { displayName: "Completely Different" } }),
      renamed,
      NOW,
    );
    expect(swapped.map((r) => [r.app.appPlayerId, r.score])).toEqual(
      base.map((r) => [r.app.appPlayerId, r.score]),
    );
    const noNames = rankAppCandidates(
      providerPlayer({ private: { displayName: null } }),
      candidates.map(({ displayName: _n, ...rest }) => rest),
      NOW,
    );
    expect(noNames.map((r) => r.score)).toEqual(base.map((r) => r.score));
  });

  test("the ranking source never reads a name", () => {
    const source = readFileSync(new URL("./candidate-signals.ts", import.meta.url), "utf8")
      .split("\n")
      .filter(
        (line) =>
          !line.trim().startsWith("*") &&
          !line.trim().startsWith("//") &&
          !line.trim().startsWith("/*"),
      )
      .join("\n");
    expect(source).not.toMatch(/\.displayName|\.private\b|shortName|\.name\b/);
  });
});

describe("ranking", () => {
  test("never drops a candidate and breaks ties by app player id", () => {
    const apps = [
      app({ appPlayerId: "z" }),
      app({ appPlayerId: "a" }),
      app({ appPlayerId: "m", birthDate: "1980-03-03", shirtNumber: 1, position: "G" }),
    ];
    const ranked = rankAppCandidates(providerPlayer(), apps, NOW);
    expect(ranked).toHaveLength(3);
    expect(ranked.map((r) => r.app.appPlayerId)).toEqual(["a", "z", "m"]);
  });

  test("no single signal approves anything: a ranked result has no approval field", () => {
    const ranked = rankAppCandidates(providerPlayer(), [app()], NOW)[0]!;
    expect(Object.keys(ranked).sort()).toEqual(["app", "score", "signals"]);
  });
});
