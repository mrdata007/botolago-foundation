// Local preflight only: no credentials, network, database or Storage writes.
// The owner supplies original-resolution canvases, reviewed protection masks,
// BotolaGO branding and an approval.json with the canonical fixture snapshot.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import {
  parsePreciseMatchVisual,
  renderProtectedFrame,
  type ProtectedFrame,
} from "../../supabase/functions/_shared/precise-match-visual";

const [inputDirectory, outputDirectory] = process.argv.slice(2);
if (!inputDirectory || !outputDirectory) {
  throw new Error(
    "Usage: bun scripts/editorial/prepare-precise-match-visual.ts <input-directory> <output-directory>",
  );
}
const input = resolve(inputDirectory),
  output = resolve(outputDirectory);
const manifest = JSON.parse(await readFile(join(input, "approval.json"), "utf8"));
if (typeof manifest.fixtureId !== "string" || !/^[0-9a-f-]{36}$/.test(manifest.fixtureId))
  throw new Error("approval.json must contain the canonical fixtureId");
const assets = new Map<string, Uint8Array>();
for (const variant of ["story", "article"] as const) {
  const frame = {} as ProtectedFrame;
  for (const role of ["source", "protection", "branding"] as const) {
    const bytes = new Uint8Array(await readFile(join(input, `${variant}-${role}.png`)));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const path = `news/match-visual-inputs/${manifest.fixtureId}/${variant}-${role}-${sha256.slice(0, 16)}.png`;
    assets.set(path, bytes);
    frame[role] = { path, sha256 };
  }
  manifest[variant] = frame;
}
const approved = parsePreciseMatchVisual(manifest);
// Validate AND render both sizes before writing any review artifact.
const previews = new Map<string, Uint8Array>();
for (const variant of ["story", "article"] as const)
  previews.set(
    variant,
    await renderProtectedFrame(approved[variant], variant, async (path) => assets.get(path)!),
  );
await mkdir(output, { recursive: true });
for (const [path, bytes] of assets) {
  const target = join(output, path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}
for (const [variant, bytes] of previews)
  await writeFile(join(output, `${variant}-preview.png`), bytes, { flag: "wx" });
await writeFile(join(output, "manifest.json"), JSON.stringify(approved, null, 2) + "\n", {
  flag: "wx",
});
console.log(
  JSON.stringify({
    status: "ready_for_review",
    outputDirectory: output,
    protectedPixels: "unchanged",
    uploaded: false,
  }),
);
