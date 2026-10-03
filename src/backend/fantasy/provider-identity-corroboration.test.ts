import { describe, expect, test } from "bun:test";
import {
  assertNoDates,
  corroborateDob,
  flashscoreBirthdayFromPlayerData,
  flashscoreDobFormat,
  sofascoreBirthdaysFromLineups,
} from "./provider-identity-corroboration";

const NOW = new Date("2026-10-03T00:00:00Z");
const pair = { sofascoreFixtureId: "1", sofascorePlayerId: "10", flashscorePlayerId: "f10" };
// 1995-06-15 as unix seconds, written two ways. SYNTHETIC values.
const SECONDS = 803_174_400;
const JAN1 = 788_918_400; // 1995-01-01

describe("SYNTHETIC: date-of-birth corroboration", () => {
  test("the same day in two formats agrees", () => {
    expect(corroborateDob(pair, SECONDS, String(SECONDS), NOW).dob).toBe("AGREE");
    expect(corroborateDob(pair, SECONDS, "1995-06-15", NOW).dob).toBe("AGREE");
    expect(corroborateDob(pair, SECONDS, SECONDS * 1000, NOW).dob).toBe("AGREE");
  });

  test("different days disagree", () => {
    expect(corroborateDob(pair, SECONDS, "1995-06-16", NOW).dob).toBe("DISAGREE");
  });

  test("a 1 January date is a placeholder: no signal, never agreement", () => {
    const r = corroborateDob(pair, JAN1, "1995-01-01", NOW);
    expect(r.dob).toBe("NO_SIGNAL_BOTH");
    expect(r.sofascoreState).toBe("placeholder_january_1");
  });

  test("a missing or unreadable date is no signal, never a disagreement", () => {
    expect(corroborateDob(pair, SECONDS, undefined, NOW).dob).toBe("NO_SIGNAL_FLASHSCORE");
    expect(corroborateDob(pair, SECONDS, "not a date", NOW).dob).toBe("NO_SIGNAL_FLASHSCORE");
    expect(corroborateDob(pair, undefined, "1995-06-15", NOW).dob).toBe("NO_SIGNAL_SOFASCORE");
    expect(corroborateDob(pair, undefined, undefined, NOW).dob).toBe("NO_SIGNAL_BOTH");
  });

  test("an implausible age is no signal", () => {
    expect(corroborateDob(pair, SECONDS, "2020-06-15", NOW).dob).toBe("NO_SIGNAL_FLASHSCORE");
  });

  test("the result carries states and a format class, never a date", () => {
    const r = corroborateDob(pair, SECONDS, "1995-06-15", NOW);
    const text = JSON.stringify(r);
    expect(() => assertNoDates(text)).not.toThrow();
    expect(r.flashscoreFormat).toBe("iso_date");
  });

  test("format classes", () => {
    expect(flashscoreDobFormat(undefined)).toBe("absent");
    expect(flashscoreDobFormat("803174400")).toBe("unix_seconds");
    expect(flashscoreDobFormat("803174400000")).toBe("unix_milliseconds");
    expect(flashscoreDobFormat("15.06.1995")).toBe("other");
  });

  test("the extractors read the provider shapes and nothing else", () => {
    const sofa = sofascoreBirthdaysFromLineups({
      home: { players: [{ player: { id: 10, dateOfBirthTimestamp: SECONDS } }] },
      away: { players: [{ player: { id: 11 } }] },
    });
    expect(sofa.get("10")).toBe(SECONDS);
    expect(sofa.has("11")).toBe(true);
    expect(
      flashscoreBirthdayFromPlayerData({ DATA: { ID: "f10", BIRTHDAY_TIME: "1995-06-15" } }),
    ).toBe("1995-06-15");
    expect(flashscoreBirthdayFromPlayerData({ DATA: [{ BIRTHDAY_TIME: "1995-06-15" }] })).toBe(
      "1995-06-15",
    );
    expect(flashscoreBirthdayFromPlayerData(null)).toBeUndefined();
  });

  test("the guard refuses text that carries a date or timestamp, and lets ids through", () => {
    expect(() => assertNoDates("born 1995-06-15")).toThrow();
    expect(() => assertNoDates("803174400")).toThrow();
    expect(() => assertNoDates("15.06.1995")).toThrow();
    expect(() =>
      assertNoDates(
        '{"sofascorePlayerId":"1140820","flashscorePlayerId":"8AYnWqxg","fixture":"17132481"}',
      ),
    ).not.toThrow();
  });
});
