import { expect, test } from "bun:test";
import {
  collectRecoveryDiagnostic,
  DIAGNOSTIC_PATHS,
  serializeDiagnostic,
} from "./sofascore-recovery-diagnostic";

test("a malformed upstream schedule is retained as evidence without a fabricated empty schedule", async () => {
  const seen: string[] = [];
  const report = await collectRecoveryDiagnostic({
    getJson: async (path) => {
      seen.push(path);
      return { error: "No upcoming matches", providerField: true };
    },
  });
  expect(seen).toEqual([...DIAGNOSTIC_PATHS]);
  expect(report.results[0]?.inspection).toEqual({
    parsed: false,
    error: "invalid_provider_payload",
  });
  expect(report.results[0]?.raw).toEqual({ error: "No upcoming matches", providerField: true });
});
test("failed reads stay failed and do not leak error messages or retry", async () => {
  let requests = 0;
  const report = await collectRecoveryDiagnostic({
    getJson: async () => {
      requests++;
      throw new Error("sensitive-header-value");
    },
  });
  expect(requests).toBe(4);
  expect(report.results.every((r) => r.fetched === false)).toBe(true);
  expect(JSON.stringify(report)).not.toContain("sensitive-header-value");
});
test("credential echoes are redacted from the artifact", () => {
  expect(serializeDiagnostic({ raw: "secret-example-key" }, "secret-example-key")).not.toContain(
    "secret-example-key",
  );
});
