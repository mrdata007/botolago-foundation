/**
 * Server against browser, under old and new time-zone data.
 *
 *   bun tests/timezone-parity/run.ts            check
 *   bun tests/timezone-parity/run.ts --update   rewrite expected.json (review the diff)
 *
 * The same bundle (the app's own formatters, the competition-day arithmetic,
 * the admin scheduler, quiet hours and the email renderer) runs in
 *   - Node 22.23.2 (IANA tz 2026a: Morocco still UTC+1 after 2026-09-20),
 *   - Node 22.23.3 (IANA tz 2026c: Morocco UTC+0 from 2026-09-20),
 *   - the Chromium that Playwright installs (older data: UTC+1).
 * What it prints must be identical in all three and equal to expected.json,
 * which is the rule written down: Morocco is UTC+0 from 2026-09-20T01:00:00Z.
 *
 * The `meta` block is excluded from the comparison: it records what each
 * runtime's own `Intl` says, and is printed so the run shows the runtimes
 * really do disagree (otherwise the test would prove nothing).
 *
 * Reads no secret, calls no provider, touches no database. The Node binaries
 * are fetched from the npm registry with `npx node@<version>`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// A temporary directory outside the repository: the bundle is generated code.
const out = mkdtempSync(join(tmpdir(), "timezone-parity-"));
const expectedPath = join(here, "expected.json");
const NODE_VERSIONS = (process.env.PARITY_NODE_VERSIONS ?? "22.23.2,22.23.3").split(",");

type Output = { meta: Record<string, unknown>; results: Record<string, unknown> };

const built = await Bun.build({
  entrypoints: [join(here, "harness.ts")],
  target: "browser",
  format: "iife",
  minify: false,
});
if (!built.success) {
  console.error(built.logs.join("\n"));
  process.exit(2);
}
const bundlePath = join(out, "harness.js");
writeFileSync(bundlePath, await built.outputs[0]!.text());

const runtimes: { name: string; output: Output }[] = [];

for (const version of NODE_VERSIONS) {
  const proc = spawnSync("npx", ["--yes", `node@${version}`, bundlePath], {
    encoding: "utf8",
    maxBuffer: 20_000_000,
  });
  if (proc.status !== 0) {
    console.error(`Node ${version} failed:\n${proc.stderr}`);
    process.exit(2);
  }
  runtimes.push({ name: `Node ${version}`, output: JSON.parse(proc.stdout) as Output });
}

const { chromium } = await import("@playwright/test");
const browser = await chromium.launch(
  existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {},
);
try {
  const page = await browser.newPage();
  await page.goto("about:blank");
  await page.addScriptTag({ path: bundlePath });
  const output = (await page.evaluate(
    () => (globalThis as unknown as { __PARITY__: unknown }).__PARITY__,
  )) as Output;
  runtimes.push({ name: `Chromium ${browser.version()}`, output });
} finally {
  await browser.close();
}

console.log("Runtime                what its own Intl says for 16:00Z on 2026-10-02 (Morocco)");
for (const { name, output } of runtimes) {
  const meta = output.meta;
  console.log(
    `${name.padEnd(22)} ${String(meta.runtimeIntlSays16hZAs)}  (tz data ${String(meta.tzData ?? "n/a")})`,
  );
}

const runtimeAnswers = new Set(runtimes.map((r) => String(r.output.meta.runtimeIntlSays16hZAs)));
if (runtimeAnswers.size < 2) {
  console.error(
    "\nThe runtimes all agree with each other about Morocco, so this run cannot show that the app is " +
      "independent of time-zone data. Use runtimes with older and newer data (PARITY_NODE_VERSIONS).",
  );
  process.exit(3);
}

const newest = runtimes.find((r) => r.name.endsWith("22.23.3")) ?? runtimes[0]!;
if (process.argv.includes("--update")) {
  writeFileSync(expectedPath, `${JSON.stringify(newest.output.results, null, 2)}\n`);
  console.log(`\nWrote ${expectedPath} from ${newest.name}. Review the diff.`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Record<string, unknown>;
let failed = false;
for (const { name, output } of runtimes) {
  const mismatches: string[] = [];
  for (const [instant, want] of Object.entries(expected)) {
    const got = (output.results as Record<string, Record<string, unknown>>)[instant] ?? {};
    for (const [field, value] of Object.entries(want as Record<string, unknown>)) {
      if (JSON.stringify(got[field]) !== JSON.stringify(value)) {
        mismatches.push(
          `${instant} ${field}: expected ${JSON.stringify(value)}, got ${JSON.stringify(got[field])}`,
        );
      }
    }
  }
  if (mismatches.length > 0) {
    failed = true;
    console.error(`\n${name}: ${mismatches.length} differences from the expected output`);
    for (const line of mismatches.slice(0, 12)) console.error(`  ${line}`);
  } else {
    console.log(
      `\n${name}: identical to the expected output (${Object.keys(expected).length} instants)`,
    );
  }
}
process.exit(failed ? 1 : 0);
