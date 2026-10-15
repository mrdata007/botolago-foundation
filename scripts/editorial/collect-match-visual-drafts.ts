import { canonicalVisualSource } from "../../supabase/functions/_shared/match-visual-source";
// Optional feed adapter. This imports originals into private Admin holds only.
// An account name is not Instagram API access: configure a source feed first.
import sharp from "sharp";
import {
  decodeVisualPng,
  visualSourceHash,
} from "../../supabase/functions/_shared/precise-match-visual";
import { z } from "zod";
const feedUrl = process.env.MATCH_VISUAL_FEED_URL,
  base = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_PUBLISHABLE_KEY,
  token = process.env.MATCH_VISUAL_EDITOR_TOKEN;
if (!feedUrl || !base || !key || !token)
  throw Error(
    "Configure MATCH_VISUAL_FEED_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and a current MFA staff MATCH_VISUAL_EDITOR_TOKEN.",
  );
if (new URL(feedUrl).protocol !== "https:") throw Error("Feed must use HTTPS");
const schema = z
  .array(
    z.object({
      account: z.enum(["elbotola", "thebotolapro"]),
      sourceUrl: z
        .string()
        .regex(
          /^https:\/\/(www\.)?(instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/?|elbotola\.com\/\S+)$/,
        ),
      label: z.string().trim().min(1).max(200),
      pngBase64: z.string().min(1).max(13981016),
      fixtureId: z.uuid().optional(),
      storyId: z.uuid().optional(),
    }),
  )
  .max(6);
async function bounded(response: Response, max: number) {
  if (!response.ok) throw Error(`Request failed (${response.status})`);
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > max) throw Error("Feed exceeds batch limit");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
const headers = { apikey: key, Authorization: `Bearer ${token}` };
const listing = await fetch(`${base}/rest/v1/rpc/admin_match_visual_drafts`, {
  method: "POST",
  headers: {
    ...headers,
    "content-type": "application/json",
    "accept-profile": "api",
    "content-profile": "api",
  },
  body: "{}",
  signal: AbortSignal.timeout(15000),
});
const known = z
  .array(z.object({ sourceUrl: z.string(), sourceHash: z.string() }))
  .parse(JSON.parse((await bounded(listing, 1024 * 1024)).toString()));
const seen = new Set(known.map((d) => `${d.sourceUrl}|${d.sourceHash}`));
const items = schema.parse(
  JSON.parse(
    (
      await bounded(
        await fetch(feedUrl, { redirect: "error", signal: AbortSignal.timeout(20000) }),
        90 * 1024 * 1024,
      )
    ).toString(),
  ),
);
let imported = 0,
  skipped = 0;
for (const item of items) {
  item.sourceUrl = canonicalVisualSource(item.sourceUrl);
  const bytes = Buffer.from(item.pngBase64, "base64");
  if (bytes.length > 10 * 1024 * 1024) throw Error("Photo exceeds limit");
  const metadata = await sharp(bytes, { limitInputPixels: 1536 * 1536 }).metadata();
  if (
    metadata.format !== "png" ||
    !metadata.width ||
    !metadata.height ||
    metadata.width > 1536 ||
    metadata.height > 1536
  )
    throw Error("Feed photos must be PNG, at most 1536px per side");
  // Normalize encoding only, retaining decoded pixels and natural dimensions.
  const png = await sharp(bytes)
    .flatten({ background: "#fff" })
    .toColourspace("srgb")
    .ensureAlpha()
    .png()
    .toBuffer();
  if (
    seen.has(
      `${item.sourceUrl}|${await visualSourceHash(await decodeVisualPng(new Uint8Array(png), metadata.width, metadata.height), metadata.width, metadata.height)}`,
    )
  ) {
    skipped++;
    continue;
  }
  const body = new FormData();
  body.set("action", "import");
  body.set("source", new Blob([new Uint8Array(png)], { type: "image/png" }), "original.png");
  body.set("width", String(metadata.width));
  body.set("height", String(metadata.height));
  body.set("sourceUrl", item.sourceUrl);
  body.set("label", item.label);
  body.set("fixtureId", item.fixtureId ?? "");
  body.set("storyId", item.storyId ?? "");
  const result = await fetch(`${base}/functions/v1/match-visual-drafts`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!result.ok)
    throw Error(`Private import failed (${result.status}); inspect Admin before retrying`);
  imported++;
}
console.log(JSON.stringify({ status: "held", imported, skipped, published: 0 }));
