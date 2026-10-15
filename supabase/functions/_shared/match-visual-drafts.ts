import { canonicalVisualSource } from "./match-visual-source.ts";
import {
  decodeVisualPng,
  encodeVisualPng,
  MAX_VISUAL_BYTES,
  visualSourceHash,
} from "./precise-match-visual.ts";
import type { StorageClient, UserScopedClient } from "./news-media-upload.ts";

export const DRAFT_BUCKET = "match-visual-drafts";
export interface EditRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DraftJob {
  id: string;
  attemptId: string;
  width: number;
  height: number;
  rectangle: EditRectangle;
  sourcePath: string;
  brandingPath: string;
}
export interface DraftDependencies {
  environment: Readonly<Record<string, string | undefined>>;
  createUserClient: (token: string) => UserScopedClient;
  storage: {
    from(bucket: string): ReturnType<StorageClient["from"]> & {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
      createSignedUrl(
        path: string,
        seconds: number,
      ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
  serviceRpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  fetchImpl?: typeof fetch;
  waitUntil?: (task: Promise<unknown>) => void;
  randomId?: () => string;
}
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
};
function response(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
  });
}
function rectValid(r: EditRectangle, w: number, h: number) {
  return (
    [r.x, r.y, r.width, r.height].every(Number.isInteger) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.width > 0 &&
    r.height > 0 &&
    r.x + r.width <= w &&
    r.y + r.height <= h &&
    r.width * r.height <= (w * h) / 4
  );
}
function inRect(x: number, y: number, r: EditRectangle) {
  return x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
}
export function validateDraftBrand(
  source: Uint8Array,
  brand: Uint8Array,
  w: number,
  h: number,
  r: EditRectangle,
) {
  if (!rectValid(r, w, h) || source.length !== w * h * 4 || brand.length !== source.length)
    throw Error("draft_invalid_rectangle");
  let changed = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (source[i + 3] !== 255) throw Error("draft_source_not_opaque");
      if (brand[i + 3]) {
        if (!inRect(x, y, r)) throw Error("draft_brand_outside_rectangle");
        changed++;
      }
    }
  if (!changed) throw Error("draft_empty_brand");
}
// Every protected pixel is copied verbatim, even when the provider ignores its mask.
export function composeDraftEdit(
  source: Uint8Array,
  generated: Uint8Array,
  brand: Uint8Array,
  w: number,
  h: number,
  gw: number,
  gh: number,
  r: EditRectangle,
) {
  validateDraftBrand(source, brand, w, h, r);
  if (generated.length !== gw * gh * 4) throw Error("draft_invalid_generated");
  const output = new Uint8Array(source);
  for (let y = r.y; y < r.y + r.height; y++)
    for (let x = r.x; x < r.x + r.width; x++) {
      const i = (y * w + x) * 4,
        j =
          (Math.min(gh - 1, Math.floor((y * gh) / h)) * gw +
            Math.min(gw - 1, Math.floor((x * gw) / w))) *
          4;
      const alpha = brand[i + 3] / 255;
      for (let c = 0; c < 3; c++)
        output[i + c] = Math.round(brand[i + c] * alpha + generated[j + c] * (1 - alpha));
      output[i + 3] = 255;
    }
  return output;
}
async function read(deps: DraftDependencies, path: string) {
  const { data, error } = await deps.storage.from(DRAFT_BUCKET).download(path);
  if (error || !data || data.size > MAX_VISUAL_BYTES) throw Error("draft_asset_unavailable");
  return new Uint8Array(await data.arrayBuffer());
}
async function store(deps: DraftDependencies, path: string, bytes: Uint8Array) {
  const r = await deps.storage.from(DRAFT_BUCKET).upload(path, bytes.buffer as ArrayBuffer, {
    contentType: "image/png",
    cacheControl: "0",
    upsert: false,
  });
  if (r.error) throw Error("draft_storage_failed");
}
export async function runDraftEdit(job: DraftJob, deps: DraftDependencies) {
  const path = `${job.id}/${job.attemptId}/result.png`;
  let uploaded = false,
    completing = false;
  try {
    const sourceBytes = await read(deps, job.sourcePath),
      source = await decodeVisualPng(sourceBytes, job.width, job.height);
    const brand = await decodeVisualPng(await read(deps, job.brandingPath), job.width, job.height);
    validateDraftBrand(source, brand, job.width, job.height, job.rectangle);
    const mask = new Uint8Array(source.length);
    for (let y = 0; y < job.height; y++)
      for (let x = 0; x < job.width; x++)
        mask[(y * job.width + x) * 4 + 3] = inRect(x, y, job.rectangle) ? 0 : 255;
    const body = new FormData();
    body.set("model", deps.environment.MATCH_VISUAL_EDIT_MODEL?.trim() || "gpt-image-2.5-flare");
    body.set("image", new Blob([sourceBytes as BlobPart], { type: "image/png" }), "source.png");
    body.set(
      "mask",
      new Blob([(await encodeVisualPng(mask, job.width, job.height)) as BlobPart], {
        type: "image/png",
      }),
      "mask.png",
    );
    body.set(
      "prompt",
      "Edit only the transparent mask region: remove the existing publisher watermark and reconstruct the background naturally. Preserve the rest of the original photograph, faces, kits, crests, score panels, numbers and lettering exactly. Add no text or logo; exact BotolaGO branding is composited separately.",
    );
    const gw = job.width > job.height ? 1536 : 1024,
      gh = job.width > job.height ? 1024 : 1536;
    body.set("size", `${gw}x${gh}`);
    body.set("quality", "high");
    body.set("output_format", "png");
    body.set("n", "1");
    const result = await (deps.fetchImpl ?? fetch)("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { authorization: `Bearer ${deps.environment.OpenAI_Image_Gen?.trim()}` },
      body,
      signal: AbortSignal.timeout(110000),
    });
    if (!result.ok) throw Error("draft_provider_failed");
    const json = (await result.json()) as { data?: { b64_json?: unknown }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || b64.length > Math.ceil(MAX_VISUAL_BYTES / 3) * 4)
      throw Error("draft_provider_invalid");
    const generated = await decodeVisualPng(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      gw,
      gh,
    );
    await store(
      deps,
      path,
      await encodeVisualPng(
        composeDraftEdit(source, generated, brand, job.width, job.height, gw, gh, job.rectangle),
        job.width,
        job.height,
      ),
    );
    uploaded = true;
    completing = true;
    const completion = await deps.serviceRpc("service_finish_match_visual_edit", {
      p_id: job.id,
      p_attempt: job.attemptId,
      p_error: null,
    });
    if (completion.error) throw Error("draft_completion_unknown");
    if (completion.data === false) {
      await deps.storage.from(DRAFT_BUCKET).remove([path]);
      return { status: "cancelled" };
    }
    if (completion.data !== true) throw Error("draft_completion_unknown");
    return { status: "held" };
  } catch {
    // A lost completion response may have committed. Keep the private result and
    // never overwrite a held success with failure or remove its backing object.
    if (!completing) {
      await deps
        .serviceRpc("service_finish_match_visual_edit", {
          p_id: job.id,
          p_attempt: job.attemptId,
          p_error: "draft_edit_failed",
        })
        .catch(() => undefined);
      if (uploaded)
        await deps.storage
          .from(DRAFT_BUCKET)
          .remove([path])
          .catch(() => undefined);
    }
    return { status: completing ? "unknown" : "failed" };
  }
}
async function handleAuthorizedDraftRequest(
  request: Request,
  deps: DraftDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return response(401, { error: "no_session" });
  const user = deps.createUserClient(token);
  const auth = await user.auth.getUser();
  if (auth.error || !auth.data.user) return response(401, { error: "no_session" });
  const context = await user.schema("api").rpc("get_my_staff_context", {});
  const staff = context.data as { accessAllowed?: boolean; permissions?: string[] } | null;
  if (
    context.error ||
    staff?.accessAllowed !== true ||
    !staff.permissions?.includes("editorial.read")
  )
    return response(403, { error: "permission_missing" });
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await user.schema("api").rpc(name, args);
    if (result.error) throw Error(result.error.message ?? "draft_database_failed");
    return result.data;
  }
  try {
    const reader = request.body?.getReader();
    const max = request.headers.get("content-type")?.includes("application/json")
      ? 16384
      : MAX_VISUAL_BYTES + 65536;
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > max) return response(413, { error: "draft_too_large" });
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    request = new Request(request.url, { method: "POST", headers: request.headers, body: bytes });
    if (request.headers.get("content-type")?.includes("application/json")) {
      const input = (await request.json()) as { action?: string; id?: string; variant?: string };
      if (
        input.action !== "preview" ||
        !input.id ||
        !["source", "result"].includes(input.variant ?? "")
      )
        return response(400, { error: "draft_invalid_action" });
      const draft = (await rpc("admin_get_match_visual_draft", { p_id: input.id })) as {
        sourcePath: string;
        resultPath: string | null;
      };
      const path = input.variant === "source" ? draft.sourcePath : draft.resultPath;
      if (!path) return response(404, { error: "draft_no_result" });
      const signed = await deps.storage.from(DRAFT_BUCKET).createSignedUrl(path, 60);
      if (signed.error || !signed.data) throw Error("draft_preview_failed");
      return response(200, { url: signed.data.signedUrl });
    }
    if (!staff.permissions?.includes("editorial.write"))
      return response(403, { error: "permission_missing" });
    // Multipart request is bounded independently from per-file limits.
    if (Number(request.headers.get("content-length") ?? 0) > MAX_VISUAL_BYTES + 65536)
      return response(413, { error: "draft_too_large" });
    const form = await request.formData();
    const action = form.get("action");
    if (action === "import") {
      const file = form.get("source");
      const width = Number(form.get("width")),
        height = Number(form.get("height"));
      if (!(file instanceof File) || file.size > MAX_VISUAL_BYTES)
        return response(400, { error: "draft_invalid_file" });
      const bytes = new Uint8Array(await file.arrayBuffer()),
        pixels = await decodeVisualPng(bytes, width, height);
      for (let i = 3; i < pixels.length; i += 4)
        if (pixels[i] !== 255) throw Error("draft_source_not_opaque");
      const id = (deps.randomId ?? crypto.randomUUID)();
      const hash = await visualSourceHash(pixels, width, height);
      const sourceUrl = canonicalVisualSource(form.get("sourceUrl"));
      const label = String(form.get("label") ?? "").trim();
      if (
        !/^https:\/\/(www\.)?(instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/?|elbotola\.com\/\S+)$/.test(
          sourceUrl,
        ) ||
        !label ||
        label.length > 200
      )
        throw Error("draft_invalid_source");
      await store(deps, `${id}/source.png`, bytes);
      // Retain a private orphan on ambiguous DB failure. Never delete a committed source.
      const draft = await rpc("admin_import_match_visual_draft", {
        p_data: {
          id,
          sourceHash: hash,
          sourceUrl,
          label,
          width,
          height,
          fixtureId: form.get("fixtureId") || null,
          storyId: form.get("storyId") || null,
        },
      });
      const existing = draft as { id?: string; status?: string };
      if (existing.id && existing.id !== id)
        await deps.storage.from(DRAFT_BUCKET).remove([`${id}/source.png`]);
      if (existing.status === "discarded")
        return response(409, { error: "draft_source_discarded" });
      return response(201, draft);
    }
    if (action === "edit") {
      if ((deps.environment.OpenAI_Image_Gen?.trim().length ?? 0) < 20)
        return response(503, { error: "draft_image_key_missing" });
      const id = String(form.get("id"));
      const draft = (await rpc("admin_get_match_visual_draft", { p_id: id })) as {
        width: number;
        height: number;
        sourcePath: string;
      };
      const rectangle = JSON.parse(String(form.get("rectangle"))) as EditRectangle;
      const file = form.get("branding");
      if (!(file instanceof File) || file.size > MAX_VISUAL_BYTES)
        throw Error("draft_invalid_branding");
      const bytes = new Uint8Array(await file.arrayBuffer());
      validateDraftBrand(
        await decodeVisualPng(await read(deps, draft.sourcePath), draft.width, draft.height),
        await decodeVisualPng(bytes, draft.width, draft.height),
        draft.width,
        draft.height,
        rectangle,
      );
      const attempt = (deps.randomId ?? crypto.randomUUID)();
      await store(deps, `${id}/${attempt}/branding.png`, bytes);
      const job = (await rpc("admin_begin_match_visual_edit", {
        p_id: id,
        p_version: Number(form.get("version")),
        p_attempt: attempt,
        p_rect: rectangle,
      })) as DraftJob;
      const task = runDraftEdit(job, deps);
      if (deps.waitUntil) {
        deps.waitUntil(task);
        return response(202, { status: "processing" });
      }
      return response(200, await task);
    }
    return response(400, { error: "draft_invalid_action" });
  } catch {
    return response(400, { error: "draft_request_failed" });
  }
}

export async function handleDraftRequest(
  request: Request,
  deps: DraftDependencies,
): Promise<Response> {
  try {
    return await handleAuthorizedDraftRequest(request, deps);
  } catch {
    return response(503, { error: "draft_unavailable" });
  }
}
