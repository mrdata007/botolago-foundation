// The Pépites photo storage job (docs/engineering/PEPITES_ARCHITECTURE.md §3.3).
//
// For each approved player photo release it downloads the original from the
// private `player-photo-intake` bucket, makes the public derivative (a 512 px
// square WebP; re-encoding drops every metadata block, so no camera, date or
// GPS data survives), uploads it to `football-media` at the release's one
// path, and publishes it with api.service_publish_player_photo, which checks
// the rights again. When publication refuses, the job deletes the file it
// uploaded. Then it deletes every object queued in
// app_private.player_photo_storage_deletions (revoked, expired, replaced)
// through the Storage API and marks each done.
//
// It writes to the database and to storage, so the one-writer rule applies
// (AGENTS.md). It never runs on a schedule: an operator runs it after
// approving photos, against the database its variables name:
//
//   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
//     bun scripts/backend/pepites-photo-job.ts
//
// It logs counts and release ids only; never a key, a URL with a token, or
// image data.

import sharp from "sharp";

export const DERIVATIVE_SIZE = 512;
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

export interface PhotoDerivative {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/webp";
}

/**
 * A square WebP from any JPEG, PNG or WebP original: turned upright from its
 * EXIF orientation, cropped around what matters, and re-encoded without any
 * metadata.
 */
export async function makePhotoDerivative(original: Uint8Array): Promise<PhotoDerivative> {
  if (original.byteLength === 0 || original.byteLength > MAX_ORIGINAL_BYTES) {
    throw new Error("photo_original_size_invalid");
  }
  const image = sharp(original, { failOn: "error", limitInputPixels: 50_000_000 });
  const metadata = await image.metadata();
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error("photo_original_format_invalid");
  }
  const { data, info } = await image
    .rotate()
    .resize(DERIVATIVE_SIZE, DERIVATIVE_SIZE, { fit: "cover", position: sharp.strategy.attention })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (info.width !== DERIVATIVE_SIZE || info.height !== DERIVATIVE_SIZE) {
    throw new Error("photo_derivative_size_invalid");
  }
  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    mimeType: "image/webp",
  };
}

export interface PhotoJobDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  download(bucket: string, path: string): Promise<Uint8Array>;
  upload(bucket: string, path: string, data: Uint8Array, contentType: string): Promise<void>;
  /** Deletes one object; an object that is already gone is not an error. */
  remove(bucket: string, path: string): Promise<void>;
}

export interface PhotoJobSummary {
  readonly published: string[];
  readonly refused: Array<{ readonly releaseId: string; readonly reason: string }>;
  readonly deleted: number;
  readonly failed: Array<{ readonly item: string; readonly reason: string }>;
}

interface PublishItem {
  readonly releaseId: string;
  readonly playerId: string;
  readonly intakePath: string;
  readonly publicPath: string;
}

interface DeleteItem {
  readonly id: string;
  readonly bucket: string;
  readonly path: string;
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^A-Za-z0-9_:. -]/g, "").slice(0, 120);
}

export async function runPhotoJob(
  deps: PhotoJobDependencies,
  limit = 20,
): Promise<PhotoJobSummary> {
  const work = (await deps.rpc("service_player_photo_work", { p_limit: limit })) as {
    publish: PublishItem[];
    delete: DeleteItem[];
  };
  const summary: PhotoJobSummary = { published: [], refused: [], deleted: 0, failed: [] };

  for (const item of work.publish ?? []) {
    let derivative: PhotoDerivative;
    try {
      derivative = await makePhotoDerivative(
        await deps.download("player-photo-intake", item.intakePath),
      );
      await deps.upload("football-media", item.publicPath, derivative.data, derivative.mimeType);
    } catch (error) {
      summary.failed.push({ item: item.releaseId, reason: reasonOf(error) });
      continue;
    }
    try {
      await deps.rpc("service_publish_player_photo", {
        p_release_id: item.releaseId,
        p_public_path: item.publicPath,
        p_width: derivative.width,
        p_height: derivative.height,
        p_mime_type: derivative.mimeType,
      });
      summary.published.push(item.releaseId);
    } catch (error) {
      // Not published: the file must not stay in the public bucket.
      await deps.remove("football-media", item.publicPath);
      summary.refused.push({ releaseId: item.releaseId, reason: reasonOf(error) });
    }
  }

  for (const item of work.delete ?? []) {
    try {
      await deps.remove(item.bucket, item.path);
      await deps.rpc("service_complete_photo_deletion", { p_deletion_id: item.id });
      summary.deleted += 1;
    } catch (error) {
      summary.failed.push({ item: item.id, reason: reasonOf(error) });
    }
  }
  return summary;
}

/** Dependencies over the Supabase REST and Storage APIs, with the service key. */
export function supabaseDependencies(
  url: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
): PhotoJobDependencies {
  const base = url.replace(/\/+$/, "");
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };
  const objectUrl = (bucket: string, path: string) =>
    `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  return {
    async rpc(name, args) {
      const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json", "content-profile": "api" },
        body: JSON.stringify(args),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? `rpc_${response.status}`);
      return body;
    },
    async download(bucket, path) {
      const response = await fetchImpl(objectUrl(bucket, path), { headers });
      if (!response.ok) throw new Error(`download_${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
    async upload(bucket, path, data, contentType) {
      const response = await fetchImpl(objectUrl(bucket, path), {
        method: "POST",
        headers: {
          ...headers,
          "content-type": contentType,
          "x-upsert": "true",
          "cache-control": "3600",
        },
        body: data,
      });
      if (!response.ok) throw new Error(`upload_${response.status}`);
    },
    async remove(bucket, path) {
      const response = await fetchImpl(`${base}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: "DELETE",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
      });
      if (!response.ok && response.status !== 404) throw new Error(`remove_${response.status}`);
    },
  };
}

if (import.meta.main) {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error(
      "usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… bun scripts/backend/pepites-photo-job.ts",
    );
    process.exit(2);
  }
  const summary = await runPhotoJob(supabaseDependencies(url, key));
  console.log(
    JSON.stringify({
      published: summary.published.length,
      refused: summary.refused,
      deleted: summary.deleted,
      failed: summary.failed,
    }),
  );
  process.exit(summary.failed.length > 0 ? 1 : 0);
}
