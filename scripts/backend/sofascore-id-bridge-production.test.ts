import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import {
  planSofascoreIdBridge,
  type BridgeInput,
  type SofascoreEvent,
} from "../../src/backend/football/sofascore-id-bridge";
import {
  APPLY_CONFIRMATION,
  BASELINE_MARKER,
  MANIFEST_PATH,
  REHEARSAL_MARKER,
  REHEARSE_CONFIRMATION,
  appliedRowsProblems,
  assertApprovedHash,
  buildDoBlock,
  canonicalPlanJson,
  comparePlanToManifest,
  extractRehearsalResult,
  manifestTeams,
  parseManifest,
  planSha256,
  rehearsalResultProblems,
  writerProblems,
  type DbState,
  type Manifest,
} from "./sofascore-id-bridge-production";

const reviewedManifest = parseManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
const NO_MATCH_FIXTURE = "1296b2e5-bb59-4f18-8ef7-dc0b2990bc3a";

const uuid = (prefix: string, n: number) =>
  `${prefix}${n.toString(16).padStart(7, "0")}-0000-4000-8000-000000000000`;

/** A synthetic season shaped like the reviewed dry-run: 32 fixtures, 31 matched. */
function syntheticInput(): BridgeInput {
  const sofaIds = Object.keys(reviewedManifest.teams).map(Number);
  const internal = sofaIds.map((id) => reviewedManifest.teams[String(id)]);
  const rounds = [1, 2, 3, 4].map((n) => ({
    id: uuid("a", n),
    roundNumber: n,
  }));
  const day = Date.UTC(2026, 9, 17, 18, 0, 0);
  const fixtures = [];
  const events: SofascoreEvent[] = [];
  let n = 0;
  for (let r = 0; r < 4; r += 1) {
    for (let k = 0; k < 8; k += 1) {
      const home = k;
      const away = 8 + ((k + r) % 8);
      const id = n === 31 ? NO_MATCH_FIXTURE : uuid("f", n);
      const kickoff = day + (r * 7 + k) * 86_400_000;
      fixtures.push({
        id,
        kickoffAt: new Date(kickoff).toISOString(),
        roundNumber: r + 1,
        homeTeamId: internal[home],
        awayTeamId: internal[away],
      });
      if (n !== 31) {
        events.push({
          id: 9000 + n,
          // Fixture 0: three days off, so only the round matches it.
          startTimestamp: (kickoff + (n === 0 ? 3 * 86_400_000 : 0)) / 1000,
          roundInfo: { round: r + 1 },
          status: { type: n === 1 ? "postponed" : "finished" },
          homeTeam: { id: sofaIds[home] },
          awayTeam: { id: sofaIds[away] },
        });
      }
      n += 1;
    }
  }
  return {
    events,
    competition: {
      externalId: "937",
      internalId: reviewedManifest.competition.internalId,
    },
    season: {
      externalId: "102220",
      internalId: reviewedManifest.season.internalId,
    },
    teams: manifestTeams(reviewedManifest),
    rounds,
    fixtures,
    existing: [],
  };
}

const plan = planSofascoreIdBridge(syntheticInput());

const manifest = {
  ...reviewedManifest,
  planSha256: planSha256(plan, reviewedManifest),
};

describe("manifest", () => {
  it("pins the complete committed read-only production plan", () => {
    const approved = JSON.parse(
      readFileSync("docs/production/manifests/sofascore-id-bridge-2026-10-10.plan.json", "utf8"),
    );
    expect(approved.rows).toHaveLength(53);
    expect(approved.fixturesNoMatch).toEqual([NO_MATCH_FIXTURE]);
    expect(createHash("sha256").update(JSON.stringify(approved)).digest("hex")).toBe(
      reviewedManifest.planSha256,
    );
  });

  it("refuses an unpinned or malformed plan hash", () => {
    for (const planSha256 of [null, undefined, "", "abc"]) {
      expect(() => parseManifest({ ...reviewedManifest, planSha256 })).toThrow("manifest_invalid");
    }
  });

  it("is valid and its totals are the reviewed dry-run's", () => {
    expect(reviewedManifest.planSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.expected.totalRows).toBe(53);
    expect(Object.keys(manifest.teams)).toHaveLength(16);
    expect(manifest.competition.internalId).toBe("3e579087-e5ad-4cb1-babf-6490cf2a8ebe");
    expect(manifest.season.internalId).toBe("d03223b0-8f4a-4309-93e1-2a708d7c3584");
    expect(manifest.expected.fixturesNoMatch).toEqual([NO_MATCH_FIXTURE]);
  });

  it("refuses a manifest whose total is not the sum of its parts", () => {
    const bad = JSON.parse(JSON.stringify(manifest)) as Manifest;
    (bad.expected as { totalRows: number }).totalRows = 54;
    expect(() => parseManifest(bad)).toThrow("manifest_invalid");
  });

  it("refuses non-uuid team targets and the wrong project", () => {
    const badTeam = JSON.parse(JSON.stringify(manifest));
    badTeam.teams["24394"] = "x'; drop table app.fixtures; --";
    expect(() => parseManifest(badTeam)).toThrow("manifest_invalid");
    expect(() => parseManifest({ ...manifest, projectRef: "srdrflfrfpwixsllveid" })).toThrow(
      "manifest_invalid",
    );
  });
});

describe("plan against manifest (drift is refused)", () => {
  it("the synthetic plan has the reviewed shape and no drift", () => {
    expect(plan.rows).toHaveLength(53);
    expect(comparePlanToManifest(plan, manifest)).toEqual([]);
  });

  it("refuses when a count differs", () => {
    const smaller = planSofascoreIdBridge({
      ...syntheticInput(),
      events: syntheticInput().events.slice(0, 20),
    });
    const problems = comparePlanToManifest(smaller, manifest);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toContain("fixturesMatched");
  });

  it("refuses when a row points at another entity, though the counts agree", () => {
    const input = syntheticInput();
    const moved = { ...input, fixtures: input.fixtures.map((f) => ({ ...f })) };
    moved.fixtures[5] = { ...moved.fixtures[5], id: uuid("e", 5) };
    const other = planSofascoreIdBridge(moved);
    expect(other.rows).toHaveLength(53);
    expect(comparePlanToManifest(other, manifest).join("\n")).toContain("planSha256");
    // The required pin catches changed fixture pairings even when counts agree.
    expect(planSha256(other, manifest)).not.toBe(planSha256(plan, manifest));
    const pinned = { ...manifest, planSha256: planSha256(plan, manifest) };
    expect(comparePlanToManifest(other, pinned).join("\n")).toContain("planSha256");
  });

  it("refuses a different approved team pairing and a changed competition", () => {
    const swapped = {
      ...manifest,
      competition: { ...manifest.competition, internalId: uuid("c", 1) },
    };
    expect(comparePlanToManifest(plan, swapped).join("\n")).toContain("competition row");
    const team = {
      ...manifest,
      teams: { ...manifest.teams, "24394": uuid("d", 1) },
    };
    expect(comparePlanToManifest(plan, team).join("\n")).toContain("approved pairing");
  });

  it("refuses an existing mapping, a conflict or a re-point", () => {
    const withExisting = planSofascoreIdBridge({
      ...syntheticInput(),
      existing: [
        {
          entityType: "round",
          externalId: "102220:1",
          internalId: uuid("a", 1),
        },
      ],
    });
    expect(comparePlanToManifest(withExisting, manifest).join("\n")).toContain("alreadyMapped");
  });
});

describe("hash", () => {
  it("is stable across runs and independent of row order", () => {
    const again = planSofascoreIdBridge(syntheticInput());
    expect(planSha256(again, manifest)).toBe(planSha256(plan, manifest));
    const reversed = { ...plan, rows: [...plan.rows].reverse() };
    expect(planSha256(reversed, manifest)).toBe(planSha256(plan, manifest));
    expect(planSha256(plan, manifest)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when any row changes", () => {
    const rows = plan.rows.map((r, i) => (i === 7 ? { ...r, internalId: uuid("b", 7) } : r));
    expect(planSha256({ ...plan, rows }, manifest)).not.toBe(planSha256(plan, manifest));
    expect(canonicalPlanJson(plan, manifest)).not.toContain(" ");
  });

  it("the apply accepts only the approved hash", () => {
    const hash = planSha256(plan, manifest);
    expect(() => assertApprovedHash(hash, hash)).not.toThrow();
    expect(() => assertApprovedHash(undefined, hash)).toThrow("hash_missing");
    expect(() => assertApprovedHash("abc", hash)).toThrow("hash_missing");
    expect(() => assertApprovedHash("0".repeat(64), hash)).toThrow("hash_mismatch");
  });
});

describe("DO block", () => {
  const rehearsal = buildDoBlock("rehearse", plan, manifest);
  const apply = buildDoBlock("apply", plan, manifest);

  it("is one dollar-quoted DO block with no other statement", () => {
    for (const sql of [rehearsal, apply]) {
      expect(sql.startsWith("do $sofascore_bridge$\n")).toBe(true);
      expect(sql.endsWith("end\n$sofascore_bridge$")).toBe(true);
      expect(sql.match(/\$sofascore_bridge\$/g)).toHaveLength(2);
      expect(sql).not.toMatch(/\b(commit|rollback)\s*;/i);
      expect(sql).not.toMatch(/\b(delete|drop|truncate|alter)\b/i);
    }
  });

  it("calls the resolver once per planned row, parents first, with only validated literals", () => {
    const calls = rehearsal.match(/perform api\.resolve_football_mapping\([^;]*\);/g) ?? [];
    expect(calls).toHaveLength(53);
    const order = calls.map((c) => c.split("'")[3]);
    const rank = ["competition", "season", "round", "team", "fixture"];
    expect(order.map((t) => rank.indexOf(t))).toEqual(
      [...order.map((t) => rank.indexOf(t))].sort((a, b) => a - b),
    );
    expect(calls[0]).toBe(
      "perform api.resolve_football_mapping('sofascore', 'competition', '937', " +
        "'3e579087-e5ad-4cb1-babf-6490cf2a8ebe'::uuid, 'sofascore-id-bridge');",
    );
    for (const call of calls)
      expect(call).toMatch(
        /^perform api\.resolve_football_mapping\('sofascore', '(competition|season|round|team|fixture)', '[A-Za-z0-9:_.-]{1,64}', '[0-9a-f-]{36}'::uuid, 'sofascore-id-bridge'\);$/,
      );
  });

  it("checks the baseline and the internal rows before writing", () => {
    const firstWrite = rehearsal.indexOf("perform api.resolve_football_mapping");
    expect(rehearsal.indexOf(BASELINE_MARKER)).toBeGreaterThan(0);
    expect(rehearsal.indexOf(BASELINE_MARKER)).toBeLessThan(firstWrite);
    expect(rehearsal.indexOf("SOFASCORE_BRIDGE_INTERNAL_ROW_MISSING")).toBeLessThan(firstWrite);
    expect(rehearsal).toContain("v_n <> 0");
    expect(rehearsal).toContain("v_n <> 16");
    expect(rehearsal).toContain("v_n <> 31");
    expect(rehearsal).toContain("v_active <> 53 or v_matching <> 53");
  });

  it("only the rehearsal ends in the deliberate raise; the apply ends normally", () => {
    expect(rehearsal).toContain(`raise exception '${REHEARSAL_MARKER} %'`);
    expect(apply).not.toContain(REHEARSAL_MARKER);
    expect(rehearsal.trimEnd().split("\n").slice(-3)).toEqual([
      "  raise exception 'SOFASCORE_BRIDGE_REHEARSAL_ROLLBACK %', v_result::text using errcode = 'P0001';",
      "end",
      "$sofascore_bridge$",
    ]);
    // Same body apart from the ending.
    expect(apply.replace(/ {2}-- Apply:[^\n]*\n/, "")).not.toContain(
      "raise exception 'SOFASCORE_BRIDGE_REHEARSAL",
    );
  });

  it("refuses to build SQL from an unvalidated value", () => {
    const evil = {
      ...plan,
      rows: plan.rows.map((r, i) => (i === 0 ? { ...r, externalId: "1'); drop table x; --" } : r)),
    };
    expect(() => buildDoBlock("rehearse", evil, manifest)).toThrow("literal_invalid");
    const evilId = {
      ...plan,
      rows: plan.rows.map((r, i) => (i === 3 ? { ...r, internalId: "not-a-uuid" } : r)),
    };
    expect(() => buildDoBlock("apply", evilId, manifest)).toThrow("literal_invalid");
  });
});

describe("results", () => {
  const good = {
    baselineRows: 0,
    planned: 53,
    activeAfter: 53,
    matchingPlan: 53,
    byType: { competition: 1, season: 1, round: 4, team: 16, fixture: 31 },
  };

  it("reads the computed state out of a Management API error body", () => {
    const body = JSON.stringify({
      message: `Failed to run sql query: ERROR: P0001: ${REHEARSAL_MARKER} ${JSON.stringify(good)}\nCONTEXT: PL/pgSQL`,
    });
    const result = extractRehearsalResult(body);
    expect(result).toEqual(good);
    expect(rehearsalResultProblems(result, manifest)).toEqual([]);
  });

  it("flags a missing or wrong rehearsal result", () => {
    expect(extractRehearsalResult('{"message":"boom"}')).toBeNull();
    expect(rehearsalResultProblems(null, manifest)).toHaveLength(1);
    expect(rehearsalResultProblems({ ...good, activeAfter: 52 }, manifest)).toHaveLength(1);
    expect(
      rehearsalResultProblems({ ...good, byType: { ...good.byType, round: 3 } }, manifest),
    ).toHaveLength(1);
  });

  it("the post-apply read must equal the plan exactly", () => {
    const detail = plan.rows.map((r) => ({
      entityType: r.entityType,
      externalId: r.externalId,
      internalId: r.internalId,
    }));
    expect(appliedRowsProblems(detail, plan, manifest)).toEqual([]);
    expect(appliedRowsProblems(detail.slice(1), plan, manifest).length).toBeGreaterThan(0);
    expect(
      appliedRowsProblems(
        detail.map((d, i) => (i === 2 ? { ...d, internalId: uuid("9", 1) } : d)),
        plan,
        manifest,
      ),
    ).toHaveLength(1);
  });

  it("one-writer checks demand the crons paused and no busy session", () => {
    const quiet: DbState = {
      sofascore_rows: 0,
      sofascore_active_rows: 0,
      other_mapping_rows: 10,
      other_mapping_digest: "x",
      sofascore_rows_detail: [],
      email_mode: "off",
      live_refresh_enabled: false,
      lifecycle_tick_enabled: false,
      finalizing_gameweeks: 0,
      busy_sessions: 0,
    };
    expect(writerProblems(quiet)).toEqual([]);
    expect(writerProblems({ ...quiet, live_refresh_enabled: true })).toHaveLength(1);
    expect(
      writerProblems({
        ...quiet,
        email_mode: "live",
        lifecycle_tick_enabled: true,
      }),
    ).toHaveLength(2);
    expect(writerProblems({ ...quiet, busy_sessions: 2 })).toHaveLength(1);
  });
});

describe("workflows", () => {
  const rehearsalYaml = readFileSync(
    ".github/workflows/sofascore-id-bridge-production-rehearsal.yml",
    "utf8",
  );
  const applyYaml = readFileSync(
    ".github/workflows/sofascore-id-bridge-production-apply.yml",
    "utf8",
  );

  for (const [name, yaml, phrase, mode] of [
    ["rehearsal", rehearsalYaml, REHEARSE_CONFIRMATION, "rehearse"],
    ["apply", applyYaml, APPLY_CONFIRMATION, "apply"],
  ] as const) {
    it(`${name} carries the production pins`, () => {
      expect(yaml).toContain("environment: production-admin-activation");
      expect(yaml).toContain("group: botolago-production-v2-mutation");
      expect(yaml).toContain("cancel-in-progress: false");
      expect(yaml).toContain("github.ref == 'refs/heads/main'");
      expect(yaml).toContain("github.actor == 'mrdata007'");
      expect(yaml).toContain("github.triggering_actor == 'mrdata007'");
      expect(yaml).toContain('"${GITHUB_RUN_ATTEMPT:-}" == "1"');
      expect(yaml).toContain('"$EXPECTED_COMMIT" == "$GITHUB_SHA"');
      expect(yaml).toContain(`"$CONFIRMATION" == "${phrase}"`);
      expect(yaml).toContain("tkewgajrljbwgwedqsxn");
      expect(yaml).toContain("::add-mask::");
      expect(yaml).toContain(`--mode ${mode}`);
      expect(yaml).toContain("Refuse if another workflow run is active");
      expect(yaml).toContain("--read-production");
    });
  }

  it("the apply needs the approved hash; the rehearsal does not", () => {
    expect(applyYaml).toMatch(/plan_sha256:\n\s+description:[^\n]*\n\s+required: true/);
    expect(rehearsalYaml).toMatch(/plan_sha256:\n\s+description:[^\n]*\n\s+required: false/);
  });
});
