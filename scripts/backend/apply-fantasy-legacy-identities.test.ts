import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildRepairs,
  buildSchema,
  buildReleaseAudit,
} from "./build-apply-fantasy-legacy-identities";

test("the schema promoter contains exact canonical bytes and cannot perform identity repairs", () => {
  const source = readFileSync(
    "supabase/migrations/20261019194059_fantasy_legacy_identity_repair_controls.sql",
    "utf8",
  );
  const artifact = readFileSync(
    "scripts/backend/apply-20261019194059-fantasy-legacy-controls.sql",
    "utf8",
  );
  expect(artifact).toBe(buildSchema());
  expect(artifact.split(source)).toHaveLength(2);
  expect(artifact).toContain(createHash("sha256").update(source).digest("hex"));
  expect(artifact).toContain("set_config('bg.legacy_identity_schema_mode','rehearsal',true)");
  expect(artifact).toContain("LEGACY_IDENTITY_SCHEMA_REHEARSAL_PASSED_20261019194059");
  expect(artifact).not.toContain("insert into app_private.football_provider_mappings");
});

test("the one-time repair pins one manifest and preserves ownership, eligibility and sealed history", () => {
  const source = readFileSync(
    "docs/backend/evidence/legacy-identity-repair-manifest-20261019.json",
    "utf8",
  );
  const manifest = JSON.parse(source);
  const artifact = readFileSync(
    "scripts/backend/apply-fantasy-legacy-identity-repairs.sql",
    "utf8",
  );
  expect(artifact).toBe(buildRepairs());
  expect(artifact.split(source)).toHaveLength(2);
  expect(artifact).toContain(createHash("sha256").update(source).digest("hex"));
  expect(manifest.repairs).toHaveLength(21);
  expect(new Set(manifest.repairs.map((p: { apiPlayerId: string }) => p.apiPlayerId)).size).toBe(
    21,
  );
  for (const guard of [
    "legacy_identity_catalog_baseline_changed",
    "legacy_identity_legacy_provider_changed",
    "legacy_identity_existing_mapping_alias_or_repair",
    "legacy_identity_ownership_scope_changed",
    "legacy_identity_finalization_active",
    "legacy_identity_unexpected_state_change",
    "legacy_identity_input_version_scope_changed",
    "legacy_identity_new_purchase_hold_missing",
    "legacy_identity_release_audit_missing",
    "LEGACY_IDENTITY_REPAIR_REHEARSAL_PASSED",
  ])
    expect(artifact).toContain(guard);
  expect(artifact).toContain("set_config('bg.legacy_identity_repair_mode','rehearsal',true)");
  expect(artifact).not.toMatch(/(?:update|delete from) app\.fantasy_squad_memberships/i);
  expect(artifact).not.toMatch(/update app\.fantasy_teams/i);
  expect(artifact).not.toMatch(/update app\.players/i);
});

test("the forward audit promoter pins the null-pairing constraint without changing evidence", () => {
  const source = readFileSync(
    "supabase/migrations/20261020015540_fantasy_legacy_hold_release_audit_pairing.sql",
    "utf8",
  );
  const artifact = readFileSync(
    "scripts/backend/apply-20261020015540-fantasy-legacy-release-audit.sql",
    "utf8",
  );
  expect(artifact).toBe(buildReleaseAudit());
  expect(artifact.split(source)).toHaveLength(2);
  expect(artifact).toContain(createHash("sha256").update(source).digest("hex"));
  expect(artifact).toContain("LEGACY_RELEASE_AUDIT_REHEARSAL_PASSED");
  expect(artifact).toContain("legacy_release_audit_changed_evidence");
  expect(artifact).toContain("'bg.legacy_release_audit_mode','rehearsal'");
});
