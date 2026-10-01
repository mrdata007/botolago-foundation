import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ALLOWLIST_PATH,
  ALLOWLIST_SCHEMA,
  declarationFor,
  evidenceDigest,
  loadAllowlist,
  parseAllowlist,
  reviewedPreflightDigest,
  unusedShortfalls,
  type UnusedFacts,
  type VerifiedUnusedException,
} from "./verified-unused-exceptions";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const entry = (patch: Record<string, unknown> = {}) => ({
  fixtureExternalId: "9001",
  externalPlayerId: "200",
  status: "proposed",
  preflightRecord: "docs/production/preflight.md",
  preflightSha256: sha("reviewed"),
  approvedBy: null,
  approvedAt: null,
  ...patch,
});
const document = (...entries: unknown[]) => ({ schema: ALLOWLIST_SCHEMA, exceptions: entries });
const approved = { status: "approved", approvedBy: "owner", approvedAt: "2026-10-01T15:00:00Z" };
const facts = (patch: Partial<UnusedFacts> = {}): UnusedFacts => ({
  externalPlayerId: "200",
  externalTeamId: "10",
  role: "substitute",
  officialMinutes: null,
  scoringStatisticTypeIds: [],
  unknownStatisticTypeIds: [],
  zeroStatisticTypeIds: [],
  eventTypeIds: [],
  ...patch,
});

describe("the owner-reviewed allowlist", () => {
  test("the committed file parses and holds one PROPOSED entry: 711 and 38227322 only", () => {
    const entries = loadAllowlist();
    expect(entries).toEqual([
      {
        fixtureExternalId: "19874711",
        externalPlayerId: "38227322",
        status: "proposed",
        preflightRecord: "docs/production/GW1_711_38227322_UNUSED_PREFLIGHT_2026_10_01.md",
        preflightSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        approvedBy: null,
        approvedAt: null,
      },
    ]);
  });

  test("the committed preflight record is exactly the one the entry pins", () => {
    const [committed] = loadAllowlist() as [VerifiedUnusedException];
    expect(reviewedPreflightDigest(committed)).toBe(committed.preflightSha256);
  });

  test("a valid approved entry is accepted, and a proposed one carries no approver", () => {
    expect(parseAllowlist(document(entry(approved)))[0]?.status).toBe("approved");
    expect(parseAllowlist(document(entry()))[0]?.approvedBy).toBeNull();
  });

  for (const [label, raw, code] of [
    ["not an object", [], "allowlist_not_an_object"],
    ["another schema", { schema: "x", exceptions: [] }, "allowlist_shape_invalid"],
    ["an extra top-level key", { ...document(), extra: 1 }, "allowlist_shape_invalid"],
    ["an extra entry key", document(entry({ extra: 1 })), "allowlist_entry_keys_invalid"],
    [
      "a missing entry key",
      document(
        (() => {
          const withoutKey: Record<string, unknown> = entry();
          delete withoutKey.approvedAt;
          return withoutKey;
        })(),
      ),
      "allowlist_entry_keys_invalid",
    ],
    [
      "a non-numeric player",
      document(entry({ externalPlayerId: "abc" })),
      "allowlist_entry_invalid",
    ],
    [
      "a non-numeric fixture",
      document(entry({ fixtureExternalId: "0" })),
      "allowlist_entry_invalid",
    ],
    ["an unknown status", document(entry({ status: "maybe" })), "allowlist_entry_invalid"],
    [
      "a record outside docs/production",
      document(entry({ preflightRecord: "../x.md" })),
      "allowlist_entry_invalid",
    ],
    [
      "a record that is not markdown",
      document(entry({ preflightRecord: "docs/production/x.sh" })),
      "allowlist_entry_invalid",
    ],
    ["a malformed digest", document(entry({ preflightSha256: "abc" })), "allowlist_entry_invalid"],
    [
      "an approval with no approver",
      document(entry({ ...approved, approvedBy: null })),
      "allowlist_approval_invalid",
    ],
    [
      "an approval with no date",
      document(entry({ ...approved, approvedAt: null })),
      "allowlist_approval_invalid",
    ],
    [
      "an approval with a bad date",
      document(entry({ ...approved, approvedAt: "soon" })),
      "allowlist_approval_invalid",
    ],
    [
      "a proposal that names an approver",
      document(entry({ approvedBy: "owner" })),
      "allowlist_approval_invalid",
    ],
    ["the same player twice", document(entry(), entry()), "allowlist_duplicate_entry"],
    [
      "three players for one fixture",
      document(
        entry({ externalPlayerId: "1" }),
        entry({ externalPlayerId: "2" }),
        entry({ externalPlayerId: "3" }),
      ),
      "allowlist_too_many_for_one_fixture",
    ],
  ] as const)
    test(`refuses ${label}`, () => {
      expect(() => parseAllowlist(raw)).toThrow(code);
    });

  test("two players for one fixture are allowed, and so is one each for two fixtures", () => {
    expect(
      parseAllowlist(document(entry({ externalPlayerId: "1" }), entry({ externalPlayerId: "2" }))),
    ).toHaveLength(2);
    expect(
      parseAllowlist(
        document(
          entry({ externalPlayerId: "1" }),
          entry({ externalPlayerId: "2" }),
          entry({ fixtureExternalId: "9002", externalPlayerId: "1" }),
        ),
      ),
    ).toHaveLength(3);
  });

  test("an unreadable or malformed file is refused with a stable code", () => {
    expect(() => loadAllowlist(() => "{not json")).toThrow("allowlist_unreadable");
    expect(() =>
      loadAllowlist(() => {
        throw new Error("no such file");
      }),
    ).toThrow("allowlist_unreadable");
    expect(() => loadAllowlist((path) => (path === ALLOWLIST_PATH ? "[]" : ""))).toThrow(
      "allowlist_not_an_object",
    );
  });

  test("the committed file on disk is the one loadAllowlist reads", () => {
    expect(JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")).schema).toBe(ALLOWLIST_SCHEMA);
  });
});

describe("the preflight record pin", () => {
  const pinned = parseAllowlist(document(entry()))[0]!;
  test("the reviewed bytes are accepted", () => {
    expect(reviewedPreflightDigest(pinned, () => Buffer.from("reviewed"))).toBe(sha("reviewed"));
  });
  test("a changed record is refused until it is re-reviewed", () => {
    expect(() =>
      reviewedPreflightDigest(pinned, () => Buffer.from("reviewed, then edited")),
    ).toThrow("preflight_record_changed_since_review");
  });
  test("a missing record is refused", () => {
    expect(() =>
      reviewedPreflightDigest(pinned, () => {
        throw new Error("ENOENT");
      }),
    ).toThrow("preflight_record_unreadable");
  });
});

describe("what shows a player as unused", () => {
  test("a substitute with no minutes, no statistic, no unknown and no event is unused", () => {
    expect(unusedShortfalls(facts())).toEqual([]);
    expect(unusedShortfalls(facts({ officialMinutes: 0, zeroStatisticTypeIds: [119] }))).toEqual(
      [],
    );
  });
  test("every other case names why not, by reason and never by value", () => {
    expect(unusedShortfalls(undefined)).toEqual(["not_in_the_lineup"]);
    expect(unusedShortfalls(facts({ role: "starter" }))).toEqual(["not_a_substitute"]);
    expect(unusedShortfalls(facts({ role: "unknown" }))).toEqual(["not_a_substitute"]);
    expect(unusedShortfalls(facts({ officialMinutes: 1 }))).toEqual([
      "official_minutes_above_zero",
    ]);
    for (const typeId of [52, 57, 79, 83, 84, 85, 88, 112, 113, 118, 324])
      expect(unusedShortfalls(facts({ scoringStatisticTypeIds: [typeId] }))).toEqual([
        "scoring_statistic_with_a_value",
      ]);
    for (const typeId of [57, 113])
      expect(unusedShortfalls(facts({ unknownStatisticTypeIds: [typeId] }))).toEqual([
        "unknown_statistic",
      ]);
    expect(unusedShortfalls(facts({ eventTypeIds: [19] }))).toEqual(["named_by_a_match_event"]);
  });
});

describe("the evidence digest the database recomputes", () => {
  // The same text and hash are built in SQL (20261001130000); this vector is the one the
  // database test asserts for the same facts, so the two languages cannot drift apart.
  test("matches the database's digest for the same facts", () => {
    expect(
      evidenceDigest(
        "19891001",
        facts({ externalPlayerId: "88901", externalTeamId: "68911", zeroStatisticTypeIds: [119] }),
      ),
    ).toBe("c47774629d2fb31ff88760ff67eb01b11739c856b7613d6b7cfb32e56c65e82f");
  });
  test("the facts the exception would declare for 38227322 have a fixed digest", () => {
    expect(
      evidenceDigest("19874711", facts({ externalPlayerId: "38227322", externalTeamId: "227263" })),
    ).toBe("4925a0043f0d546e5b397f7e7c8d8d4659abd65adce54b8fbb958b63c3253979");
  });
  test("any change to the facts changes the digest", () => {
    const base = evidenceDigest("9001", facts());
    expect(evidenceDigest("9002", facts())).not.toBe(base);
    expect(evidenceDigest("9001", facts({ externalPlayerId: "201" }))).not.toBe(base);
    expect(evidenceDigest("9001", facts({ externalTeamId: "20" }))).not.toBe(base);
    expect(evidenceDigest("9001", facts({ officialMinutes: 0 }))).not.toBe(base);
    expect(evidenceDigest("9001", facts({ zeroStatisticTypeIds: [119] }))).not.toBe(base);
    expect(evidenceDigest("9001", facts({ eventTypeIds: [19] }))).not.toBe(base);
    expect(evidenceDigest("9001", facts({ scoringStatisticTypeIds: [84] }))).not.toBe(base);
    expect(evidenceDigest("9001", facts({ unknownStatisticTypeIds: [57] }))).not.toBe(base);
  });
  test("the order the provider listed the type ids in does not matter", () => {
    expect(evidenceDigest("9001", facts({ zeroStatisticTypeIds: [119, 52] }))).toBe(
      evidenceDigest("9001", facts({ zeroStatisticTypeIds: [52, 119] })),
    );
  });
  test("the declaration carries the digest and the shape the database requires", () => {
    const declared = declarationFor(
      "9001",
      facts({ zeroStatisticTypeIds: [119, 52] }),
      sha("preflight"),
    );
    expect(declared).toEqual({
      fixtureExternalId: "9001",
      externalPlayerId: "200",
      externalTeamId: "10",
      role: "substitute",
      officialMinutes: null,
      scoringStatisticTypeIds: [],
      unknownStatisticTypeIds: [],
      eventTypeIds: [],
      zeroStatisticTypeIds: [52, 119],
      evidenceDigest: evidenceDigest("9001", facts({ zeroStatisticTypeIds: [119, 52] })),
      preflightDigest: sha("preflight"),
    });
  });
});
