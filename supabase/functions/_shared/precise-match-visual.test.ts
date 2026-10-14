import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { decodeVisualPng, encodeVisualPng } from "./precise-match-visual";
import {
  composeDraftEdit,
  validateDraftBrand,
  runDraftEdit,
  handleDraftRequest,
  DRAFT_BUCKET,
  type DraftDependencies,
  type DraftJob,
} from "./match-visual-drafts";
const ID = "10000000-0000-4000-8000-000000000001",
  ATTEMPT = "20000000-0000-4000-8000-000000000001";
const w = 120,
  h = 100,
  r = { x: 0, y: 0, width: 20, height: 10 };
function raster(width: number, height: number, color: number[]) {
  const result = new Uint8Array(width * height * 4);
  for (let i = 0; i < result.length; i += 4) result.set(color, i);
  return result;
}
const source = raster(w, h, [25, 50, 75, 255]),
  brand = raster(w, h, [0, 0, 0, 0]);
brand.set([255, 255, 255, 255], 0);
const generated = raster(1536, 1024, [200, 100, 150, 255]);
const job: DraftJob = {
  id: ID,
  attemptId: ATTEMPT,
  width: w,
  height: h,
  rectangle: r,
  sourcePath: `${ID}/source.png`,
  brandingPath: `${ID}/${ATTEMPT}/branding.png`,
};
function fixture(completion: unknown = true, completionError: unknown = null) {
  const objects = new Map<string, Uint8Array>();
  const calls: { name: string; args: Record<string, unknown> }[] = [],
    removed: string[] = [],
    buckets: string[] = [];
  let requests = 0;
  const deps: DraftDependencies = {
    environment: { OpenAI_Image_Gen: "test-key-is-not-a-real-secret" },
    createUserClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: ID } }, error: null }) },
      schema: () => ({
        rpc: async (name) => ({
          data:
            name === "get_my_staff_context"
              ? { accessAllowed: true, permissions: ["editorial.read", "editorial.write"] }
              : null,
          error: null,
        }),
      }),
    }),
    storage: {
      from: (bucket) => {
        buckets.push(bucket);
        return {
          upload: async (path, body) => {
            objects.set(path, new Uint8Array(body));
            return { error: null };
          },
          remove: async (paths) => {
            for (const path of paths) {
              removed.push(path);
              objects.delete(path);
            }
            return { error: null };
          },
          download: async (path) => ({
            data: objects.has(path) ? new Blob([objects.get(path)! as BlobPart]) : null,
            error: null,
          }),
          createSignedUrl: async () => ({
            data: { signedUrl: "https://example.com/private-preview" },
            error: null,
          }),
        };
      },
    },
    serviceRpc: async (name, args) => {
      calls.push({ name, args });
      return { data: completion, error: completionError };
    },
    fetchImpl: async (input, init) => {
      requests++;
      expect(String(input)).toBe("https://api.openai.com/v1/images/edits");
      const form = init!.body as FormData;
      expect(form.get("image")).toBeInstanceOf(File);
      expect(form.get("mask")).toBeInstanceOf(File);
      const mask = await decodeVisualPng(
        new Uint8Array(await (form.get("mask") as File).arrayBuffer()),
        w,
        h,
      );
      expect(mask[3]).toBe(0);
      expect(mask[(h * w - 1) * 4 + 3]).toBe(255);
      return new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from(await encodeVisualPng(generated, 1536, 1024)).toString(
                "base64",
              ),
            },
          ],
        }),
      );
    },
  };
  async function prepare() {
    objects.set(job.sourcePath, await encodeVisualPng(source, w, h));
    objects.set(job.brandingPath, await encodeVisualPng(brand, w, h));
  }
  return { deps, objects, calls, removed, buckets, prepare, requests: () => requests };
}
describe("private match draft pixels", () => {
  test("copies every protected RGBA channel exactly even if AI redraws the whole image", async () => {
    const output = composeDraftEdit(source, generated, brand, w, h, 1536, 1024, r);
    const png = await encodeVisualPng(output, w, h);
    const independentlyDecoded = await sharp(png).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (x >= 20 || y >= 10)
          expect([...independentlyDecoded.subarray(i, i + 4)]).toEqual([
            ...source.subarray(i, i + 4),
          ]);
      }
    expect([...independentlyDecoded.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...independentlyDecoded.subarray(4, 8)]).toEqual([200, 100, 150, 255]);
  });
  test("rejects branding that touches a protected player, score, crest or text pixel", () => {
    const bad = new Uint8Array(brand);
    bad[bad.length - 1] = 255;
    expect(() => validateDraftBrand(source, bad, w, h, r)).toThrow("draft_brand_outside_rectangle");
  });
  test("rejects oversized, fractional and out-of-bounds editing areas", () => {
    for (const bad of [
      { ...r, x: -1 },
      { ...r, width: w, height: h },
      { ...r, x: 0.5 },
      { ...r, x: w },
    ])
      expect(() => validateDraftBrand(source, brand, w, h, bad)).toThrow("draft_invalid_rectangle");
  });
  test("lossless PNG decoder rejects wrong dimensions and corrupted payloads", async () => {
    const png = await encodeVisualPng(source, w, h);
    await expect(decodeVisualPng(png, w + 1, h)).rejects.toThrow("invalid_visual_dimensions");
    const bad = new Uint8Array(png);
    bad[40] ^= 1;
    await expect(decodeVisualPng(bad, w, h)).rejects.toThrow("invalid_visual_png");
  });
});
describe("private edit workflow", () => {
  test("uses existing image key, edits originals and completes only to held private storage", async () => {
    const f = fixture();
    await f.prepare();
    expect(await runDraftEdit(job, f.deps)).toEqual({ status: "held" });
    expect(f.requests()).toBe(1);
    expect(f.buckets.every((b) => b === DRAFT_BUCKET)).toBe(true);
    expect(f.calls).toEqual([
      {
        name: "service_finish_match_visual_edit",
        args: { p_id: ID, p_attempt: ATTEMPT, p_error: null },
      },
    ]);
    expect(f.objects.has(`${ID}/${ATTEMPT}/result.png`)).toBe(true);
  });
  test("provider failure records retryable failure and retains original", async () => {
    const f = fixture();
    await f.prepare();
    f.deps.fetchImpl = async () => new Response("", { status: 500 });
    expect(await runDraftEdit(job, f.deps)).toEqual({ status: "failed" });
    expect(f.objects.has(job.sourcePath)).toBe(true);
    expect(f.calls[0].args.p_error).toBe("draft_edit_failed");
  });
  test("discarded draft cannot complete; cancelled output is removed privately", async () => {
    const f = fixture(false);
    await f.prepare();
    expect(await runDraftEdit(job, f.deps)).toEqual({ status: "cancelled" });
    expect(f.removed).toEqual([`${ID}/${ATTEMPT}/result.png`]);
  });
  test("ambiguous completion preserves private output and does not override possible success", async () => {
    const f = fixture(null, { message: "network" });
    await f.prepare();
    expect(await runDraftEdit(job, f.deps)).toEqual({ status: "unknown" });
    expect(f.calls).toHaveLength(1);
    expect(f.removed).toEqual([]);
  });
  test("refuses unauthenticated and non-staff requests before any storage/provider calls", async () => {
    const f = fixture();
    expect(
      (await handleDraftRequest(new Request("https://example.com", { method: "POST" }), f.deps))
        .status,
    ).toBe(401);
    f.deps.createUserClient = () => ({
      auth: { getUser: async () => ({ data: { user: { id: ID } }, error: null }) },
      schema: () => ({ rpc: async () => ({ data: { accessAllowed: false }, error: null }) }),
    });
    expect(
      (
        await handleDraftRequest(
          new Request("https://example.com", {
            method: "POST",
            headers: { authorization: "Bearer test" },
          }),
          f.deps,
        )
      ).status,
    ).toBe(403);
    expect(f.buckets).toEqual([]);
    expect(f.requests()).toBe(0);
  });
  test("read-only editor cannot import or edit", async () => {
    const f = fixture();
    f.deps.createUserClient = () => ({
      auth: { getUser: async () => ({ data: { user: { id: ID } }, error: null }) },
      schema: () => ({
        rpc: async () => ({
          data: { accessAllowed: true, permissions: ["editorial.read"] },
          error: null,
        }),
      }),
    });
    const form = new FormData();
    form.set("action", "import");
    expect(
      (
        await handleDraftRequest(
          new Request("https://example.com", {
            method: "POST",
            headers: { authorization: "Bearer test" },
            body: form,
          }),
          f.deps,
        )
      ).status,
    ).toBe(403);
    expect(f.buckets).toEqual([]);
  });
});

describe("staff HTTP draft boundaries", () => {
  test("imports an original as a private held record, retaining canonical source link and natural size", async () => {
    const f = fixture();
    f.deps.randomId = () => ID;
    const names: string[] = [];
    f.deps.createUserClient = () => ({
      auth: { getUser: async () => ({ data: { user: { id: ID } }, error: null }) },
      schema: () => ({
        rpc: async (name, args) => {
          names.push(name);
          return {
            data:
              name === "get_my_staff_context"
                ? { accessAllowed: true, permissions: ["editorial.read", "editorial.write"] }
                : { ...(args.p_data as object), status: "held", rightsStatus: "unverified" },
            error: null,
          };
        },
      }),
    });
    const form = new FormData();
    form.set("action", "import");
    form.set(
      "source",
      new File([(await encodeVisualPng(source, w, h)) as BlobPart], "photo.png", {
        type: "image/png",
      }),
    );
    form.set("width", String(w));
    form.set("height", String(h));
    form.set("label", "FUS – Raja");
    form.set("sourceUrl", "https://www.instagram.com/p/test/?igsh=tracking");
    const response = await handleDraftRequest(
      new Request("https://example.com", {
        method: "POST",
        headers: { authorization: "Bearer test" },
        body: form,
      }),
      f.deps,
    );
    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data).toMatchObject({
      id: ID,
      width: w,
      height: h,
      sourceUrl: "https://instagram.com/p/test/",
      status: "held",
      rightsStatus: "unverified",
    });
    expect(f.objects.has(`${ID}/source.png`)).toBe(true);
    expect(f.requests()).toBe(0);
    expect(names).toEqual(["get_my_staff_context", "admin_import_match_visual_draft"]);
    expect(f.buckets.every((bucket) => bucket === DRAFT_BUCKET)).toBe(true);
  });
  test("bounds multipart bodies even when Content-Length is absent", async () => {
    const f = fixture();
    const body = new Uint8Array(10 * 1024 * 1024 + 65537);
    const response = await handleDraftRequest(
      new Request("https://example.com", {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "multipart/form-data; boundary=test",
        },
        body,
      }),
      f.deps,
    );
    expect(response.status).toBe(413);
    expect(f.buckets).toEqual([]);
    expect(f.requests()).toBe(0);
  });
  test("preview accepts only a draft ID and known variant, never a user-supplied storage path", async () => {
    const f = fixture();
    const request = new Request("https://example.com", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ action: "preview", id: ID, variant: "../../other-private-image" }),
    });
    expect((await handleDraftRequest(request, f.deps)).status).toBe(400);
    expect(f.buckets).toEqual([]);
  });
});
