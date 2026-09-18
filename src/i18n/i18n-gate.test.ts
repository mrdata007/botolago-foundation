import { beforeAll, describe, expect, test } from "bun:test";

import {
  ALLOW_LISTS,
  auditI18n,
  BASELINES,
  buildUsageIndex,
  classifyArgument,
  emptyUsageIndex,
  indexSource,
  type AuditResult,
  type GateDictionaries,
  type UsageIndex,
} from "../../scripts/qa/i18n-gate";
import { dictionaries } from "./dictionaries";
import { BROKEN_FIXTURE_BASELINES, brokenDictionaries } from "./__fixtures__/broken-dictionary";

const realDictionaries = dictionaries as unknown as GateDictionaries;

function clone(): GateDictionaries {
  return {
    fr: { ...realDictionaries.fr },
    ar: { ...realDictionaries.ar },
  };
}

function warning(result: AuditResult, code: "W1" | "W2" | "W3" | "W4") {
  const group = result.warnings.find((candidate) => candidate.code === code);
  if (!group) throw new Error(`missing warning group ${code}`);
  return group;
}

/** A key that really does carry a {n} placeholder in both languages. */
function findPlaceholderKey(): string {
  const key = Object.keys(realDictionaries.fr).find(
    (candidate) =>
      /\{n\}/.test(realDictionaries.fr[candidate]) && /\{n\}/.test(realDictionaries.ar[candidate]),
  );
  if (!key) throw new Error("no {n} placeholder key found in the dictionaries");
  return key;
}

/** A key that really does carry an {accent} span in fr. */
function findAccentKey(): string {
  const key = Object.keys(realDictionaries.fr).find((candidate) =>
    realDictionaries.fr[candidate].includes("{/accent}"),
  );
  if (!key) throw new Error("no {accent} key found in the dictionaries");
  return key;
}

describe("current tree", () => {
  let usage: UsageIndex;
  let result: AuditResult;

  beforeAll(async () => {
    usage = await buildUsageIndex("src");
    result = auditI18n(realDictionaries, usage, ALLOW_LISTS);
  });

  test("reports no errors", () => {
    expect(result.errors).toEqual([]);
  });

  test("every warning count equals its committed baseline exactly", () => {
    for (const group of result.warnings) {
      expect({ code: group.code, count: group.count }).toEqual({
        code: group.code,
        count: BASELINES[group.code],
      });
    }
    expect(result.baselineViolations).toEqual([]);
  });

  test("passes the gate", () => {
    expect(result.ok).toBe(true);
  });

  test("profile.title is no longer a named W1 or W2 warning", () => {
    expect(warning(result, "W1").reported.map((f) => f.key)).toEqual([]);
    expect(warning(result, "W2").reported.map((f) => f.key)).toEqual([]);
  });

  test("suppresses each allow-listed key with a justification", () => {
    const suppressed = warning(result, "W1").suppressed;
    expect(suppressed.map((f) => f.key).sort()).toEqual(Object.keys(ALLOW_LISTS.identical).sort());
    for (const finding of suppressed) {
      expect(finding.message.length).toBeGreaterThan(0);
    }
  });

  test("every literal t() key resolves", () => {
    expect(usage.literalKeys.size).toBeGreaterThan(0);
    for (const key of usage.literalKeys.keys()) {
      expect(realDictionaries.fr[key] ?? realDictionaries.ar[key]).toBeDefined();
    }
  });
});

describe("broken fixture", () => {
  const result = auditI18n(
    brokenDictionaries,
    emptyUsageIndex(),
    { identical: {}, noArabicScript: {} },
    BROKEN_FIXTURE_BASELINES,
  );

  test("fails the gate", () => {
    expect(result.ok).toBe(false);
  });

  test("reports exactly the injected E1..E4 with their keys", () => {
    expect(
      result.errors
        .map((finding) => ({ code: finding.code, key: finding.key }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    ).toEqual([
      { code: "E1", key: "fixture.only_fr" },
      { code: "E2", key: "fixture.empty" },
      { code: "E3", key: "fixture.placeholder" },
      { code: "E4", key: "fixture.accent" },
    ]);
  });

  test("reports exactly one W1", () => {
    const w1 = warning(result, "W1");
    expect(w1.count).toBe(1);
    expect(w1.reported.map((f) => f.key)).toEqual(["fixture.identical"]);
  });
});

describe("negative controls", () => {
  test("deleting an ar key raises E1", () => {
    const dicts = clone();
    delete dicts.ar["nav.home"];
    const result = auditI18n(dicts, emptyUsageIndex(), ALLOW_LISTS, {
      ...BASELINES,
      W3: 0,
      W4: 0,
    });
    expect(result.errors.filter((f) => f.code === "E1").map((f) => f.key)).toEqual(["nav.home"]);
    expect(result.ok).toBe(false);
  });

  test("emptying an ar value raises E2", () => {
    const dicts = clone();
    dicts.ar["nav.home"] = "   ";
    const result = auditI18n(dicts, emptyUsageIndex(), ALLOW_LISTS, BASELINES);
    expect(result.errors.filter((f) => f.code === "E2").map((f) => f.key)).toEqual(["nav.home"]);
  });

  test("stripping a placeholder raises E3", () => {
    const key = findPlaceholderKey();
    const dicts = clone();
    dicts.ar[key] = dicts.ar[key].replace("{n}", "");
    const result = auditI18n(dicts, emptyUsageIndex(), ALLOW_LISTS, BASELINES);
    expect(result.errors.filter((f) => f.code === "E3").map((f) => f.key)).toEqual([key]);
  });

  test("removing a {/accent} close raises E4", () => {
    const key = findAccentKey();
    const dicts = clone();
    dicts.fr[key] = dicts.fr[key].replace("{/accent}", "");
    const result = auditI18n(dicts, emptyUsageIndex(), ALLOW_LISTS, BASELINES);
    expect(result.errors.filter((f) => f.code === "E4").map((f) => f.key)).toEqual([key]);
  });

  test("a second {accent} span raises E4", () => {
    const key = findAccentKey();
    const dicts = clone();
    dicts.fr[key] = `${dicts.fr[key]} {accent}encore{/accent}`;
    const result = auditI18n(dicts, emptyUsageIndex(), ALLOW_LISTS, BASELINES);
    expect(result.errors.filter((f) => f.code === "E4").map((f) => f.key)).toEqual([key]);
  });

  test("a literal t() key with no dictionary entry raises E5", () => {
    const usage = emptyUsageIndex();
    usage.literalKeys.set("nope.not.a.key", ["src/components/Imaginary.tsx:1"]);
    const result = auditI18n(clone(), usage, ALLOW_LISTS, BASELINES);
    expect(result.errors.filter((f) => f.code === "E5").map((f) => f.key)).toEqual([
      "nope.not.a.key",
    ]);
  });

  test("a fabricated allow-list entry raises E6", () => {
    const result = auditI18n(
      clone(),
      emptyUsageIndex(),
      {
        identical: { ...ALLOW_LISTS.identical, "made.up.key": "no such key" },
        noArabicScript: ALLOW_LISTS.noArabicScript,
      },
      BASELINES,
    );
    expect(result.errors.filter((f) => f.code === "E6").map((f) => f.key)).toEqual(["made.up.key"]);
    expect(result.ok).toBe(false);
  });

  test("making an allow-listed key differ moves W1 off its baseline and fails the gate", () => {
    const dicts = clone();
    dicts.ar["notfound.code"] = "not-identical-anymore";
    const result = auditI18n(dicts, emptyUsageIndex(), ALLOW_LISTS, BASELINES);
    expect(warning(result, "W1").count).toBe(BASELINES.W1 - 1);
    expect(result.baselineViolations.some((f) => f.code === "W1")).toBe(true);
    expect(result.ok).toBe(false);
  });

  test("a W3 count above baseline fails the gate", () => {
    const result = auditI18n(clone(), emptyUsageIndex(), ALLOW_LISTS, BASELINES);
    expect(warning(result, "W3").count).toBeGreaterThan(BASELINES.W3);
    expect(result.baselineViolations.some((f) => f.code === "W3")).toBe(true);
    expect(result.ok).toBe(false);
  });

  // The BG-0014 brief's acceptance list expects "app.name removed from the
  // allow-list -> W1=7". That cannot hold: W1 counts identical fr/ar pairs and
  // the committed baselines (W1=5 with five entries allow-listed, W2=4 with four
  // of those five entries counted) are raw counts, so the allow-list annotates a
  // finding rather than removing it from the count. What removing an entry does
  // change is visibility, which is what this test pins.
  test("removing an allow-list entry makes that key a named W1 warning", () => {
    const identical = { ...ALLOW_LISTS.identical } as Record<string, string>;
    delete identical["app.name"];
    const result = auditI18n(
      clone(),
      emptyUsageIndex(),
      { identical, noArabicScript: ALLOW_LISTS.noArabicScript },
      BASELINES,
    );
    const w1 = warning(result, "W1");
    expect(w1.count).toBe(BASELINES.W1);
    expect(w1.reported.map((f) => f.key).sort()).toEqual(["app.name"]);
  });
});

describe("usage classification", () => {
  test("classifies literal, enumerable-prefix and opaque arguments", () => {
    expect(classifyArgument('"nav.home"')).toEqual({ kind: "literal", value: "nav.home" });
    expect(classifyArgument("'nav.home'")).toEqual({ kind: "literal", value: "nav.home" });
    expect(classifyArgument("`nav.home`")).toEqual({ kind: "literal", value: "nav.home" });
    expect(classifyArgument("`player.pos.${pos}`")).toEqual({
      kind: "prefix",
      value: "player.pos.",
    });
    expect(classifyArgument("`matches.a11y.status_${s}`")).toEqual({
      kind: "prefix",
      value: "matches.a11y.status_",
    });
    expect(classifyArgument("`${ns}.title`")).toEqual({ kind: "opaque" });
    expect(classifyArgument("key")).toEqual({ kind: "opaque" });
    expect(classifyArgument("flag ? a : b")).toEqual({ kind: "opaque" });
  });

  test("indexes literal keys, prefixes and opaque sites from source text", () => {
    const index = emptyUsageIndex();
    indexSource(
      index,
      "src/components/Demo.tsx",
      [
        'const a = t("nav.home");',
        "const b = t(`player.pos.${pos}`);",
        "const c = t(someKey);",
        'const d = { key: "common.close" };',
      ].join("\n"),
    );
    expect([...index.literalKeys.keys()]).toEqual(["nav.home"]);
    expect([...index.templatePrefixes.keys()]).toEqual(["player.pos."]);
    expect(index.opaqueSites).toEqual(["src/components/Demo.tsx:3"]);
    expect(index.quotedStrings.has("common.close")).toBe(true);
  });
});
