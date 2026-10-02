// Upload the club crests BotolaGO supplies (docs: see the migration
// 20261001170000_curated_team_crests.sql).
//
// For each crest in the folder it makes a 256 px PNG (so a JPEG saved as .png
// becomes a real PNG), uploads it to `football-media` at
// football/teams/<provider id>/crest-curated.png, and links it to the team
// with api.service_set_curated_team_crest. The provider sync writes
// `crest.<ext>` and never touches this path.
//
// It writes to the database and to storage, so the one-writer rule applies
// (AGENTS.md) and it never runs on a schedule. It changes nothing unless
// `--apply` is passed; without it, it only checks the files and lists what it
// would do:
//
//   bun scripts/backend/upload-curated-crests.ts <folder-of-pngs>
//   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
//     bun scripts/backend/upload-curated-crests.ts <folder-of-pngs> --apply
//
// It logs file names and counts only; never a key.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

/** File name (without extension) to the provider's team id. */
export const CREST_PROVIDER_IDS: Readonly<Record<string, string>> = {
  "raja-casablanca": "306",
  "wydad-casablanca": "2846",
  "fus-rabat": "6856",
  "kawkab-marrakech": "9369",
  "moghreb-tetouan": "9511",
  "rsb-berkane": "9535",
  "difaa-el-jadida": "16845",
  "uts-rabat": "16847",
  "hassania-agadir": "16850",
  "far-rabat": "16851",
  "ittihad-tanger": "16853",
  "maghreb-fes": "16858",
  "widad-temara": "16938",
  "cr-khemis-zemamra": "227263",
  "amal-tiznit": "228516",
  "codm-meknes": "270260",
};

export const ATTRIBUTION = "Supplied by BotolaGO";
const BUCKET = "football-media";
const SIZE = 256;
const MAX_BYTES = 2_000_000;

export const curatedCrestPath = (providerId: string) =>
  `football/teams/${providerId}/crest-curated.png`;

/** A 256 px PNG on a transparent square, whatever format the original is. */
export async function makeCrest(original: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(original, { failOn: "error", limitInputPixels: 50_000_000 })
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (out.byteLength < 1 || out.byteLength > MAX_BYTES) throw new Error("crest_size_invalid");
  return new Uint8Array(out);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const folder = args.find((a) => !a.startsWith("--"));
  if (!folder) {
    console.error("usage: bun scripts/backend/upload-curated-crests.ts <folder> [--apply]");
    process.exit(2);
  }

  const crests: { name: string; providerId: string; data: Uint8Array }[] = [];
  for (const [name, providerId] of Object.entries(CREST_PROVIDER_IDS)) {
    const data = await makeCrest(await readFile(join(folder, `${name}.png`)));
    crests.push({ name, providerId, data });
  }
  console.log(`checked ${crests.length} crests`);
  if (!apply) {
    for (const c of crests)
      console.log(`would upload ${c.name} -> ${curatedCrestPath(c.providerId)}`);
    console.log("dry run: nothing was changed. Pass --apply to upload.");
    return;
  }

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --apply");
    process.exit(2);
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  let done = 0;
  for (const c of crests) {
    const path = curatedCrestPath(c.providerId);
    const upload = await client.storage.from(BUCKET).upload(path, c.data, {
      contentType: "image/png",
      cacheControl: "86400",
      upsert: true,
    });
    if (upload.error) throw new Error(`upload failed for ${c.name}`);
    const linked = await client.schema("api").rpc("service_set_curated_team_crest", {
      p_external_team_id: c.providerId,
      p_storage_path: path,
      p_mime_type: "image/png",
      p_attribution: ATTRIBUTION,
    });
    if (linked.error) throw new Error(`linking failed for ${c.name}: ${linked.error.message}`);
    done += 1;
    console.log(`linked ${c.name}`);
  }
  console.log(`done: ${done} of ${crests.length}`);
}

if (import.meta.main) await main();
