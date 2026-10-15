import { schedulerTokenRefusal } from "./scheduler-token.ts";
import { canonicalVisualSource } from "./match-visual-source.ts";
import {
  decodeVisualPng,
  encodeVisualPng,
  MAX_VISUAL_BYTES,
  visualSourceHash,
} from "./precise-match-visual.ts";
import { DRAFT_BUCKET } from "./match-visual-drafts.ts";
import type { StorageClient } from "./news-media-upload.ts";
interface CollectorDependencies {
  environment: Readonly<Record<string, string | undefined>>;
  serviceRpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  storage: StorageClient;
  fetchImpl?: typeof fetch;
  waitUntil?: (task: Promise<unknown>) => void;
}
function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
async function collect(deps: CollectorDependencies, url: string) {
  let imported = 0,
    skipped = 0;
  try {
    const headers: Record<string, string> = {};
    if (deps.environment.MATCH_VISUAL_FEED_TOKEN)
      headers.authorization = `Bearer ${deps.environment.MATCH_VISUAL_FEED_TOKEN}`;
    const response = await (deps.fetchImpl ?? fetch)(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok || !response.body) throw Error("feed_unavailable");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > 15 * 1024 * 1024) throw Error("feed_too_large");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    const items = JSON.parse(new TextDecoder().decode(data)) as unknown;
    if (!Array.isArray(items) || items.length > 6) throw Error("feed_invalid");
    for (const item of items) {
      if (
        !item ||
        !["elbotola", "thebotolapro"].includes(item.account) ||
        typeof item.label !== "string" ||
        !item.label.trim() ||
        item.label.length > 200 ||
        typeof item.pngBase64 !== "string" ||
        item.pngBase64.length > Math.ceil(MAX_VISUAL_BYTES / 3) * 4
      )
        throw Error("feed_invalid");
      const sourceUrl = canonicalVisualSource(item.sourceUrl),
        bytes = Uint8Array.from(atob(item.pngBase64), (c) => c.charCodeAt(0));
      if (bytes.length < 24 || bytes.length > MAX_VISUAL_BYTES) throw Error("feed_invalid");
      const view = new DataView(bytes.buffer),
        width = view.getUint32(16),
        height = view.getUint32(20);
      const rgba = await decodeVisualPng(bytes, width, height);
      for (let i = 3; i < rgba.length; i += 4)
        if (rgba[i] !== 255) throw Error("feed_transparent_source");
      // Re-encode losslessly to strip metadata and make feed retries deterministic.
      const source = await encodeVisualPng(rgba, width, height),
        id = crypto.randomUUID(),
        path = `${id}/source.png`;
      const hash = await visualSourceHash(rgba, width, height);
      const stillEnabled = await deps.serviceRpc("service_match_visual_collection_enabled", {});
      if (stillEnabled.error || stillEnabled.data !== true) break;
      const uploaded = await deps.storage
        .from(DRAFT_BUCKET)
        .upload(path, source.buffer as ArrayBuffer, {
          contentType: "image/png",
          cacheControl: "0",
          upsert: false,
        });
      if (uploaded.error) throw Error("storage_failed");
      const registered = await deps.serviceRpc("service_import_match_visual_draft", {
        p_data: {
          id,
          sourceHash: hash,
          sourceUrl,
          label: item.label.trim(),
          width,
          height,
          fixtureId: item.fixtureId ?? null,
          storyId: item.storyId ?? null,
        },
      });
      // Keep private bytes on an ambiguous registration response, never delete a
      // source which might already be registered. A duplicate explicitly uses an
      // older ID, so the newly uploaded redundant file is safe to remove.
      if (registered.error) throw Error("import_failed");
      const existing = registered.data as { id?: string };
      if (existing.id === id) imported++;
      else if (existing.id) {
        skipped++;
        await deps.storage.from(DRAFT_BUCKET).remove([path]);
      } else throw Error("import_unknown");
    }
    return { status: "held", imported, skipped, published: 0 };
  } catch {
    return { status: "failed", imported, skipped, published: 0 };
  }
}
export async function handleVisualCollect(
  request: Request,
  deps: CollectorDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const refused = schedulerTokenRefusal(request, deps.environment);
  if (refused) return refused;
  const configured = deps.environment.MATCH_VISUAL_FEED_URL;
  if (!configured) return json(503, { error: "source_feed_not_configured" });
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password)
      return json(503, { error: "source_feed_invalid" });
    const enabled = await deps.serviceRpc("service_match_visual_collection_enabled", {});
    if (enabled.error) return json(503, { error: "collection_unavailable" });
    if (enabled.data !== true) return json(200, { status: "paused", published: 0 });
    const task = collect(deps, url.href);
    if (deps.waitUntil) {
      deps.waitUntil(
        task.then((result) => {
          console.info(JSON.stringify({ worker: "match-visual-collect", ...result }));
          return result;
        }),
      );
      return json(202, { status: "collecting", published: 0 });
    }
    const result = await task;
    return json(result.status === "failed" ? 502 : 200, result);
  } catch {
    return json(503, { error: "collection_unavailable" });
  }
}
