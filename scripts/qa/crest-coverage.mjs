/**
 * Crest coverage — does every active club actually have its OWN badge?
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   node scripts/qa/crest-coverage.mjs
 *
 * Read-only: one public RPC call and one public HEAD/GET per crest. It needs no
 * service key and writes nothing.
 *
 * WHY THIS EXISTS, AND WHY THE OBVIOUS CHECK IS NOT ENOUGH
 * --------------------------------------------------------
 * Every check the product already had said the crests were fine. All 21 active
 * clubs have a `crest_asset_id`; every one of those assets has a
 * `storage_path`, `mime_type = image/png` and `validation_status =
 * 'validated'`; every URL returns 200. Twenty-one of twenty-one, on four
 * separate measures.
 *
 * Two of them are the provider's generic grey shield — the same 2,555 bytes
 * stored twice, once as "Amal Tiznit crest" and once as "Yacoub El Mansour
 * crest". A placeholder is a perfectly valid PNG: it passes validation, it
 * fetches, it decodes, it draws. `ClubCrest` paints it over the club's initials
 * plate exactly as it would a real badge, so the fallback that would have shown
 * the club's letters never gets a chance, and the screen looks complete.
 *
 * So the test is not "is there an image" but "is this image this club's". Two
 * clubs sharing a byte-identical crest is the signature, and it is the only one
 * available without a human looking: a placeholder carries no marker that says
 * so. A club whose crest is unique can still be wrong (the provider could ship
 * the wrong badge) — that needs eyes, and this script does not pretend
 * otherwise.
 *
 * The threshold is "shared with any other club", not "smaller than N bytes":
 * file size varies with how detailed a badge is, and a placeholder that grew a
 * gradient would slip a size rule on its first day.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error(
    "crest-coverage: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.\n" +
      "  Both are public values; this script never needs a service key.",
  );
  process.exit(2);
}

const origin = new URL(SUPABASE_URL).origin;

async function rpc(name, body) {
  const res = await fetch(`${origin}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} -> ${res.status} ${await res.text()}`);
  return res.json();
}

/** The same mapping `src/lib/media.ts` uses, kept deliberately tiny and local. */
function publicUrl(storagePath) {
  const [namespace, ...rest] = storagePath.split("/");
  const bucket = { football: "football-media", news: "news-media" }[namespace];
  if (!bucket || !rest.length) return null;
  return `${origin}/storage/v1/object/public/${bucket}/${storagePath}`;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const teams = await rpc("football_team_catalog", { p_language: "fr", p_limit: 100 }).catch(
  (err) => {
    console.error(`crest-coverage: could not list teams (${err.message}).`);
    process.exit(2);
  },
);

const rows = [];
for (const team of teams.filter((t) => t.active !== false)) {
  const label = team.shortName || team.name || team.slug;
  const path = team.crestPath ?? null;
  if (!path) {
    rows.push({ label, state: "missing", detail: "no validated crest asset" });
    continue;
  }
  const url = publicUrl(path);
  if (!url) {
    rows.push({ label, state: "missing", detail: `crestPath outside a known bucket: ${path}` });
    continue;
  }
  const res = await fetch(url);
  if (!res.ok) {
    rows.push({ label, state: "missing", detail: `${url} -> ${res.status}` });
    continue;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  rows.push({ label, state: "ok", hash: await sha256(bytes), bytes: bytes.length, path });
}

const byHash = new Map();
for (const row of rows) {
  if (row.state !== "ok") continue;
  byHash.set(row.hash, [...(byHash.get(row.hash) ?? []), row]);
}
const shared = [...byHash.values()].filter((group) => group.length > 1);
const missing = rows.filter((row) => row.state !== "ok");

console.log(`${rows.length} active clubs`);
console.log(
  `own crest ${rows.length - missing.length - shared.flat().length} · ` +
    `shared image ${shared.flat().length} · no crest ${missing.length}\n`,
);

for (const group of shared) {
  console.log(`### ${group.length} clubs share one image (${group[0].bytes} bytes)`);
  for (const row of group) console.log(`     ${row.label} — ${row.path}`);
  console.log("     A shared crest is a provider placeholder, not a badge.\n");
}
for (const row of missing) console.log(`### no crest: ${row.label} — ${row.detail}`);

if (!shared.length && !missing.length) console.log("Every active club has its own crest.");

// Reports; does not gate. The two placeholders are a known owner action, and a
// non-zero exit here would block CI on something no code change can fix.
process.exit(0);
