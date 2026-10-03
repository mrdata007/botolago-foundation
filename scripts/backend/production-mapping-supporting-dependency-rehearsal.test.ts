import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");
const MIGRATION = "supabase/migrations/20261003120000_football_mapping_supporting_dependency.sql";
const MANIFEST = "docs/production/manifests/gw1-flashscore-executable.v2.manifest.json";
const SCRIPT = "scripts/backend/apply-20261003120000-mapping-supporting-dependency.sql";
const runner = read("scripts/backend/production-mapping-supporting-dependency-rehearsal.py");
const workflow = read(".github/workflows/production-mapping-supporting-dependency-rehearsal.yml");
const scriptBytes = readFileSync(SCRIPT);
const script = scriptBytes.toString("utf8");
const migrationBytes = readFileSync(MIGRATION);
const manifestBytes = readFileSync(MANIFEST);
type ManifestRow = {
  candidateId: string;
  externalId: string;
  appPlayerId: string;
  evidenceClass: string;
  expectedFingerprint: string;
  supporting: {
    mappingId: string;
    externalId: string;
    stateDigest: string;
    provenanceProposalId: string;
  };
  fingerprintInputs: { basis: string; evidence: { refs: unknown[] } };
};
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  manifestSha256: string;
  rows: ManifestRow[];
  heldBack: { candidateId: string }[];
  reasons: Record<string, string>;
};
const sha = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");

const between = (text: string, tag: string) => {
  const start = text.indexOf(`$${tag}$`) + tag.length + 2;
  return text.slice(start, text.indexOf(`$${tag}$`, start));
};

describe("supporting-dependency guard: the reviewed script", () => {
  it("embeds the migration byte for byte and pins its digest", () => {
    const tag = "$bg_20261003120000_file$";
    const start = script.indexOf(tag) + tag.length;
    const end = script.indexOf(tag, start);
    expect(script.slice(start, end)).toBe(migrationBytes.toString("utf8"));
    expect(script).toContain(`'${sha(migrationBytes)}'`);
  });

  it("is a rehearsal as shipped: exactly one rollback; and no commit;", () => {
    const lines = script.split("\n");
    expect(lines.filter((line) => line.trim() === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => /^\s*commit\s*;\s*$/.test(line))).toHaveLength(0);
  });

  it("keeps the migration's plain DROP FUNCTION: no cascade, rename, or switched-off trigger", () => {
    expect(script.match(/^\s*drop\s+function\b/gim)).toHaveLength(1);
    expect(script).not.toMatch(/\bcascade\b/i);
    expect(script).not.toMatch(/alter\s+function\b[^;]*\brename\b/i);
    expect(script).not.toMatch(
      /disable\s+trigger|alter\s+event\s+trigger|session_replication_role/i,
    );
  });

  it("refuses to run when production is not the reviewed pre-state", () => {
    for (const guard of [
      "this looks like STAGING",
      "this migration is already recorded (already applied)",
      "a function of this migration already exists (partly applied?)",
      "a column, constraint or index of this migration already exists (partly applied?)",
      "there is not exactly one football_mapping_compute function",
      "is not the reviewed text",
      "an open mapping proposal exists",
      "single-operator mode",
      "another database session is working right now",
      "the mapping tables, constraints, triggers, indexes or grants are not the reviewed schema",
      "the migrations recorded after 20261001161000 are not exactly",
    ]) {
      expect(script).toContain(guard);
    }
  });

  it("proves, before it rolls back, what the owner asked to see", () => {
    for (const proof of [
      "the old nine-argument compute function still exists",
      "the new twelve-argument compute function does not exist",
      "a legacy copy remains?",
      "has unexpected grants",
      "the two proposal columns are not as reviewed",
      "the dependency check constraint is not the reviewed definition",
      "an existing proposal acquired a dependency",
      "a mapping row appeared or changed",
      "a proposal appeared or an existing proposal changed (legacy columns)",
      "a candidate or observation appeared or changed",
      "staff permissions or the mapping settings changed",
      "an audit or idempotency row appeared",
      "app players or memberships changed",
      "Fantasy state, automation or schedules changed",
      "active Sofascore mappings read as reviewed",
      "the server fingerprint differs from the manifest",
      "the supporting Sofascore mapping is not in the expected state",
      "the 11 held rows are not all still unmapped Flashscore candidates",
    ]) {
      expect(script).toContain(proof);
    }
  });

  it("writes no proposal, mapping, candidate, audit event or schedule", () => {
    const body = script.replace(migrationBytes.toString("utf8"), "");
    expect(body).not.toMatch(/insert into app_private\./);
    expect(body).not.toMatch(/insert into app\./);
    expect(body).not.toMatch(/cron\.schedule/);
    // The only insert is the migration history row.
    expect(body.match(/insert into /gi)).toHaveLength(1);
    expect(body).toContain("insert into supabase_migrations.schema_migrations");
    // And it never inserts the proposal it builds in memory.
    expect(body).not.toMatch(/insert into[^;]*football_player_mapping_proposals/);
  });

  it("carries exactly the 42 manifest rows (24 + 18), the 11 held rows and the accepted hash", () => {
    expect(manifest.manifestSha256).toBe(
      "f2eef95dd199244ca6c48e9a2e0595a39a6bc2e534e7455a41467c7dba17a286",
    );
    expect(script).toContain(manifest.manifestSha256);
    const embedded = JSON.parse(between(script, "rows42")) as Array<Record<string, unknown>>;
    expect(embedded).toHaveLength(42);
    expect(embedded.filter((r) => String(r.k).startsWith("F1_"))).toHaveLength(24);
    expect(embedded.filter((r) => String(r.k).startsWith("F2_"))).toHaveLength(18);
    const expected = manifest.rows
      .map((r) => ({
        c: r.candidateId,
        x: r.externalId,
        p: r.appPlayerId,
        b: r.fingerprintInputs.basis,
        k: r.evidenceClass,
        s: r.supporting.mappingId,
        se: r.supporting.externalId,
        sd: r.supporting.stateDigest,
        sp: r.supporting.provenanceProposalId,
        r: r.fingerprintInputs.evidence.refs,
        f: r.expectedFingerprint,
      }))
      .sort((a, b) => (a.c < b.c ? -1 : a.c > b.c ? 1 : 0));
    expect(embedded).toEqual(expected);
    const held = JSON.parse(between(script, "held11")) as string[];
    expect(held).toEqual(manifest.heldBack.map((h) => h.candidateId).sort());
    expect(held).toHaveLength(11);
    expect(held.filter((id) => embedded.some((r) => r.c === id))).toHaveLength(0);
    const reasons = JSON.parse(between(script, "reasons42"));
    expect(reasons).toEqual({
      F1_REVIEWED_SOFASCORE_EVENTS: manifest.reasons.F1_REVIEWED_SOFASCORE_EVENTS,
      F2_REVIEWED_SOFASCORE_SHIRT_DOB: manifest.reasons.F2_REVIEWED_SOFASCORE_SHIRT_DOB,
    });
    const digest = createHash("md5")
      .update(embedded.map((r) => r.f).join(","))
      .digest("hex");
    expect(script).toContain(`'${digest}'`);
  });
});

describe("supporting-dependency guard rehearsal runner", () => {
  it("pins the reviewed script, migration and manifest to the repository bytes", () => {
    expect(runner).toContain(`SCRIPT_SHA256 = "${sha(scriptBytes)}"`);
    expect(runner).toContain(`MIGRATION_SHA256 = "${sha(migrationBytes)}"`);
    expect(runner).toContain(`MANIFEST_FILE_SHA256 = "${sha(manifestBytes)}"`);
    expect(runner).toContain(`MANIFEST_IDENTITY_SHA256 = "${manifest.manifestSha256}"`);
  });

  it("builds its snapshot as two joined objects (Postgres allows 50 pairs per jsonb_build_object)", () => {
    expect(runner).toContain(") || jsonb_build_object(");
    const sql = runner.slice(runner.indexOf('SNAPSHOT_SQL = """'), runner.indexOf("COMPARE_KEYS"));
    const keys = sql.match(/^ {2}'[a-z_0-9]+', /gm) ?? [];
    expect(keys.length).toBeGreaterThan(50);
    expect(keys.length).toBeLessThanOrEqual(100);
  });

  it("can only rehearse: no commit path and the script is never edited", () => {
    expect(runner).toContain("rollback;");
    expect(runner).toContain("active commit;");
    expect(runner).not.toMatch(
      /script\.replace\(|re\.sub\(|script_path\.write_text|script\s*=\s*script\./,
    );
  });

  it("refuses CASCADE, a rename, a switched-off trigger and more than one DROP FUNCTION", () => {
    expect(runner).toContain("exactly one DROP FUNCTION");
    expect(runner).toContain("contains CASCADE");
    expect(runner).toContain("renames a function");
    expect(runner).toContain("switches a trigger off");
  });

  it("stops unless production is the reported baseline", () => {
    for (const fact of [
      '"mapping_rows": 1732',
      '"sofascore_active": 191',
      '"flashscore_mappings": 0',
      '"proposals_by_status": {"executed": 191}',
      '"candidates": 1004',
      '"observations": 1006',
      '"single_operator_on": True',
    ]) {
      expect(runner).toContain(fact);
    }
  });

  it("tells a transport failure, a database timeout and a refusal apart, and never infers rollback from one", () => {
    for (const kind of [
      "transport_error_no_answer",
      "database_statement_timeout",
      "database_lock_timeout",
      "api_refused_authorisation",
      "script_stop_guard",
    ]) {
      expect(runner).toContain(kind);
    }
    expect(runner).toContain("the independent after-read below decides");
    expect(runner).not.toMatch(/retry|time\.sleep/i);
  });

  it("is guarded like the other production workflows, with no commit mode", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("environment: production-admin-activation");
    expect(workflow).toContain("REHEARSE_SUPPORTING_DEPENDENCY_PRODUCTION");
    expect(workflow).toContain("tkewgajrljbwgwedqsxn");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("group: botolago-production-v2-mutation");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain('"$EXPECTED_COMMIT" == "$GITHUB_SHA"');
    expect(workflow).toContain("workflow_dispatch");
    const body = workflow
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(body).not.toMatch(/commit;|apply:|--commit|mode:|schedule:|push:|pull_request/i);
  });
});
