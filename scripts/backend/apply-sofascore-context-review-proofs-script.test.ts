import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const script = readFileSync(
  join(root, "scripts/backend/apply-sofascore-context-review-proofs.sql"),
  "utf8",
);
const migration = readFileSync(
  join(root, "supabase/migrations/20261011191737_sofascore_fantasy_context_review_proofs.sql"),
  "utf8",
);

describe("production context review proof installation", () => {
  test("pins the exact reviewed migration bytes before executing them", () => {
    const embedded = script.split("$migration$")[1];
    expect(embedded).toBe(migration);
    const expected = script.match(/encode\(sha256[\s\S]*?is distinct from '([a-f0-9]{64})'/)?.[1];
    expect(expected).toBe(createHash("sha256").update(migration).digest("hex"));
    expect(script.indexOf("migration differs from reviewed repository bytes")).toBeLessThan(
      script.indexOf("execute source;"),
    );
  });

  test("keeps the body, permission and rehearsal guards", () => {
    const body = migration.match(/create or replace function[\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1];
    expect(body).toBeDefined();
    expect(script).toContain(createHash("md5").update(body!).digest("hex"));
    expect(script).toContain("has_function_privilege('anon'");
    expect(script).toContain("has_function_privilege('authenticated'");
    expect(script).toContain("has_function_privilege('service_role'");
    expect(script.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
