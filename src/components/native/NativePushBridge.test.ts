import { expect, test } from "bun:test";
import { join } from "node:path";

// Isolate module mocks from the other tests. The real component and its effect
// dependencies run with a small hook host and stand-ins for the native plugins.
test("push registration refreshes immediately after sign-in or an account switch", () => {
  const root = join(import.meta.dir, "../../..");

  const result = Bun.spawnSync([process.execPath, "tests/fixtures/native-push-bridge.mjs"], {
    cwd: root,
  });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({
    counts: [1, 1, 2, 3, 4, 5],
    registrations: ["A", "A", "B", "B", "B"],
    listeners: 1,
  });
});
