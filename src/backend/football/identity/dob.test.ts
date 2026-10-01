import { describe, expect, test } from "bun:test";
import { classifyAppDob, classifyProviderDob, dobSignal } from "./dob";
import { NOW, seconds } from "./test-support";

const provider = (text: string | null | undefined, timestamp?: number | null) =>
  classifyProviderDob({ text, timestamp }, NOW);

describe("provider date of birth", () => {
  test("a plausible date is a valid signal, from a timestamp in seconds or a date string", () => {
    expect(provider(null, seconds("1998-05-14"))).toMatchObject({
      state: "valid",
      birthDate: "1998-05-14",
    });
    expect(provider("1998-05-14T00:00:00+00:00")).toMatchObject({
      state: "valid",
      birthDate: "1998-05-14",
    });
    expect(provider(undefined, seconds("1998-05-14") * 1000)).toMatchObject({ state: "valid" });
  });

  test("missing is missing, never a date", () => {
    expect(provider(undefined, undefined)).toMatchObject({ state: "missing", birthDate: null });
    expect(provider(null, null)).toMatchObject({ state: "missing", birthDate: null });
  });

  test("unparseable, future and implausible ages carry no date at all", () => {
    expect(provider("not a date")).toMatchObject({ state: "unparseable", birthDate: null });
    expect(provider("2031-01-02")).toMatchObject({ state: "future", birthDate: null });
    expect(provider("2020-06-01")).toMatchObject({ state: "age_below_minimum", birthDate: null });
    expect(provider("1900-06-01")).toMatchObject({ state: "age_above_maximum", birthDate: null });
  });

  test("the age limits are 15 and 50, counted by birthday", () => {
    expect(provider("2011-10-02").state).toBe("age_below_minimum"); // 14 until 2 Oct
    expect(provider("2011-10-01").state).toBe("valid"); // turns 15 today
    expect(provider("1976-10-02").state).toBe("valid"); // 50 until 2 Oct
    expect(provider("1975-10-01").state).toBe("age_above_maximum"); // turns 51
  });

  test("a valid 1 January date is flagged as such", () => {
    expect(provider("1999-01-01")).toMatchObject({ state: "valid", january1: true });
  });
});

describe("app date of birth confidence", () => {
  test("a plausible date is valid", () => {
    expect(classifyAppDob("1998-05-14", NOW)).toEqual({ state: "valid", birthDate: "1998-05-14" });
  });

  test("1 January is low confidence, and the stored value is not changed", () => {
    expect(classifyAppDob("1999-01-01", NOW)).toEqual({
      state: "january_first_low_confidence",
      birthDate: "1999-01-01",
    });
  });

  test("missing, unparseable and implausible app dates have no date", () => {
    expect(classifyAppDob(null, NOW).state).toBe("missing");
    expect(classifyAppDob("", NOW).state).toBe("missing");
    expect(classifyAppDob("garbage", NOW).state).toBe("unparseable");
    expect(classifyAppDob("2031-02-02", NOW).state).toBe("future");
    expect(classifyAppDob("2021-02-02", NOW).state).toBe("age_below_minimum");
  });
});

describe("date of birth signal", () => {
  const app = (value: string | null) => classifyAppDob(value, NOW);

  test("two valid equal dates are a match", () => {
    expect(dobSignal(app("1998-05-14"), provider("1998-05-14"))).toEqual({ kind: "match" });
  });

  test("two valid different dates are a conflict (shown, never a rejection)", () => {
    expect(dobSignal(app("1998-05-14"), provider("1997-05-14"))).toEqual({ kind: "conflict" });
  });

  test("a missing app date is no signal", () => {
    expect(dobSignal(app(null), provider("1998-05-14"))).toEqual({
      kind: "no_signal",
      reason: "app_missing",
    });
  });

  test("a 1 January app date is no signal even when the provider date is identical", () => {
    expect(dobSignal(app("1999-01-01"), provider("1999-01-01"))).toMatchObject({
      kind: "no_signal",
    });
  });

  test("a 1 January app date is no conflict signal when the provider date differs", () => {
    expect(dobSignal(app("1999-01-01"), provider("1997-06-06"))).toEqual({
      kind: "no_signal",
      reason: "app_january_first_low_confidence",
    });
  });

  test("a provider date on 1 January is no signal either (a possible placeholder), never a conflict", () => {
    expect(dobSignal(app("1998-05-14"), provider("1999-01-01"))).toEqual({
      kind: "no_signal",
      reason: "provider_january_first_low_confidence",
    });
  });

  test.each([
    ["missing", undefined],
    ["unparseable", "nope"],
    ["future", "2031-01-02"],
    ["implausibly young", "2020-06-01"],
    ["implausibly old", "1900-06-01"],
  ])("a %s provider date is no signal, never a conflict", (_label, value) => {
    expect(dobSignal(app("1998-05-14"), provider(value)).kind).toBe("no_signal");
  });

  test("a provider that carries no date (Flashscore) gives no signal", () => {
    const notProvided = {
      state: "not_provided",
      birthDate: null,
      january1: false,
      representationDisagreement: false,
    } as const;
    expect(dobSignal(app("1998-05-14"), notProvided).kind).toBe("no_signal");
  });
});
