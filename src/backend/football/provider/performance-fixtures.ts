import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** Reads a committed Phase 0 trimmed fixture (tests/fixtures/providers). */
export function providerFixture(provider: "sofascore" | "flashscore", name: string): unknown {
  const root = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../tests/fixtures/providers",
  );
  return JSON.parse(readFileSync(resolve(root, provider, `${name}.json`), "utf8"));
}
