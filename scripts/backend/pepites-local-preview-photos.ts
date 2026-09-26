// Pépites local preview: two player photos through the real pipeline, so the
// preview shows photos next to silhouettes (docs/engineering/PEPITES_ARCHITECTURE.md
// §3.3). LOCAL ONLY: it refuses any URL that is not localhost.
//
// The "photos" are synthetic pictures (a gradient and a shirt shape), never a
// real person. For each of two ranked players it stores the original and a
// signed-release placeholder in the private buckets, records the release
// (one for in-app use only, one also for share images), approves it, and then
// runs the photo job, which makes the public derivative and publishes it.
//
//   SUPABASE_URL=http://127.0.0.1:55321 SUPABASE_SERVICE_ROLE_KEY=… \
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
//     bun scripts/backend/pepites-local-preview-photos.ts
//
// Run after pepites-local-preview-seed.sql. It writes: the one-writer rule
// applies (AGENTS.md).

import { SQL } from "bun";
import sharp from "sharp";

import { runPhotoJob, supabaseDependencies } from "./pepites-photo-job";

const url = process.env.SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const local = (value: string) =>
  /^(https?|postgres(ql)?):\/\/[^/]*(127\.0\.0\.1|localhost)[:/]/.test(value);
if (!local(url) || !local(databaseUrl) || !key) {
  console.error("pepites-local-preview-photos: local SUPABASE_URL, DATABASE_URL and a key only");
  process.exit(2);
}

async function syntheticPhoto(hue: number): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue},55%,62%)"/><stop offset="1" stop-color="hsl(${hue},60%,28%)"/>
    </linearGradient></defs>
    <rect width="900" height="900" fill="url(#g)"/>
    <circle cx="450" cy="360" r="150" fill="hsl(${hue},25%,86%)"/>
    <path d="M170 900 C170 640 300 560 450 560 C600 560 730 640 730 900 Z" fill="hsl(${hue + 180},55%,40%)"/>
  </svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer());
}

async function put(bucket: string, path: string, body: Uint8Array, contentType: string) {
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  if (!response.ok)
    throw new Error(`upload ${bucket}: ${response.status} ${await response.text()}`);
}

const sql = new SQL(databaseUrl);
const [actor] = await sql`
  select principal.id from app_private.staff_principals principal
  join auth.users account on account.id = principal.auth_user_id
  where account.email = 'staff@pepites.local'`;
if (!actor) throw new Error("run pepites-local-preview-seed.sql first");

// Two players of the current Top 10: the leader (in-app and share images) and
// the fourth (in-app only). Everyone else keeps the silhouette.
const players = await sql`
  select entry.player_id, entry.editorial_rank
  from app.pepites_editions edition
  join app.pepites_edition_entries entry on entry.edition_id = edition.id
  where edition.status = 'published'
  order by edition.week_number desc, entry.editorial_rank
  limit 4`;
const chosen = [
  { playerId: players[0].player_id as string, scope: "in_app_and_social", hue: 150 },
  { playerId: players[3].player_id as string, scope: "in_app", hue: 20 },
];

for (const photo of chosen) {
  const [paths] = await sql`
    select 'players/' || ${photo.playerId} || '/' || gen_random_uuid() || '.jpg' as intake,
      'players/' || ${photo.playerId} || '/release-preview.pdf' as document`;
  await put("player-photo-intake", paths.intake, await syntheticPhoto(photo.hue), "image/jpeg");
  await put(
    "player-photo-releases",
    paths.document,
    new TextEncoder().encode("%PDF-1.4\n% Local preview placeholder, not a real release.\n"),
    "application/pdf",
  );
  const [release] = await sql`
    select app_private.submit_player_photo_release(${photo.playerId}::uuid, ${paths.intake},
      ${paths.document}, date '2026-09-01', date '2026-09-02', 'player', ${photo.scope},
      'botolago_release', 'BotolaGO (aperçu local)', 'BotolaGO', null, ${actor.id}::uuid) as id`;
  await sql`select app_private.approve_player_photo_release(${release.id}::uuid, ${actor.id}::uuid)`;
  console.log(`release ${release.id} approved (${photo.scope})`);
}

const summary = await runPhotoJob(supabaseDependencies(url, key));
console.log(
  JSON.stringify({
    published: summary.published.length,
    refused: summary.refused,
    failed: summary.failed,
  }),
);
await sql.close();
process.exit(summary.failed.length + summary.refused.length > 0 ? 1 : 0);
