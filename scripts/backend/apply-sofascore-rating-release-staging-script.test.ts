import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  build,
  RELEASE_JOBS,
  RELEASE_PATH,
  RELEASE_VERSIONS,
  releaseBody,
  SCRIPT_PATH,
} from "./build-apply-sofascore-rating-release-staging";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const script = read(SCRIPT_PATH);
const release = read(RELEASE_PATH);

describe("staging copy of the SofaScore rating release", () => {
  test("the committed script is what the builder makes", () => {
    expect(script).toBe(build());
  });

  test("the release body is copied word for word from the production script", () => {
    const body = releaseBody(release);
    expect(script.includes(body)).toBe(true);
    expect(body.length).toBeGreaterThan(100_000);
  });

  test("every migration is carried whole and checked against the repository file", () => {
    for (const version of RELEASE_VERSIONS) {
      const match = script.match(
        new RegExp(`\\$bg_${version}_file\\$([\\s\\S]*?)\\$bg_${version}_file\\$`),
      );
      expect(match, version).not.toBeNull();
      const text = match![1];
      const files = new Bun.Glob(`supabase/migrations/${version}_*.sql`).scanSync({ cwd: root });
      const [file] = [...files];
      expect(file, version).toBeDefined();
      expect(text, version).toBe(read(file));
      const sha = createHash("sha256").update(text).digest("hex");
      expect(script.includes(`'${sha}'`), `${version} sha256`).toBe(true);
    }
  });

  test("it is a rehearsal as shipped and refuses production", () => {
    expect(script).toContain("select set_config('bg.staging_release_mode', 'rehearsal', true);");
    expect(script).toContain("raise exception 'REHEARSAL PASSED -- nothing was saved: %'");
    expect(script).toContain("stop: a background switch is on");
    expect(script).toContain("stop: part of this release is already recorded");
    expect(script).not.toMatch(/^rollback;$/m);
  });

  test("it pauses the jobs and restores them with the two release jobs", () => {
    expect(script).toContain("perform app_private.hold_scheduled_jobs();");
    for (const job of RELEASE_JOBS) expect(script).toContain(`'${job}'`);
    expect(script).toContain("the scheduled jobs are not back as they were");
  });
});
