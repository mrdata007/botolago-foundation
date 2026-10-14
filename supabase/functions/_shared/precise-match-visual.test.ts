import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { createHash } from "node:crypto";
import {
  decodeVisualPng,
  encodeVisualPng,
  MATCH_VISUAL_SIZES,
  parsePreciseMatchVisual,
  renderProtectedFrame,
  type PreciseMatchVisual,
  type VisualAsset,
} from "./precise-match-visual";
import { handleImageStoryRequest, type ImageStoryDependencies } from "./home-story-generate";

const ID = "10000000-0000-4000-8000-000000000001";
const fixtures = new Map<string, Uint8Array>();
const original = new Map<string, Uint8Array>();
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function asset(name: string, bytes: Uint8Array): Promise<VisualAsset> {
  const path = `news/match-visual-inputs/${ID}/${name}.png`;
  fixtures.set(path, new Uint8Array(bytes));
  return { path, sha256: digest(bytes) };
}
const visual: PreciseMatchVisual = {
  version: 1,
  fixtureId: ID,
  referenceUrl: "https://www.instagram.com/p/reference/",
  approvedAt: "2026-01-01T00:00:00Z",
  rightsUntil: "2099-01-01T00:00:00Z",
  credit: "Photographe autorisé",
  approval: {
    faces: true,
    kits: true,
    crests: true,
    scores: true,
    lettering: true,
    derivatives: true,
    branding: true,
  },
  facts: {
    fixtureId: ID,
    status: "finished",
    home: "FUS",
    away: "RCA",
    homeScore: 1,
    awayScore: 1,
  },
  story: null!,
  article: null!,
};
for (const variant of ["story", "article"] as const) {
  const { width, height } = MATCH_VISUAL_SIZES[variant];
  const source = new Uint8Array(width * height * 4),
    mask = new Uint8Array(source.length),
    brand = new Uint8Array(source.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      source[i] = x % 251;
      source[i + 1] = y % 239;
      source[i + 2] = (x + y) % 233;
      source[i + 3] = 255;
      if (y < height - 100) mask[i + 3] = 255;
      else {
        brand[i] = 31;
        brand[i + 1] = 85;
        brand[i + 2] = 121;
        brand[i + 3] = 255;
      }
    }
  original.set(variant, source);
  const png = (pixels: Uint8Array) =>
    sharp(pixels, { raw: { width, height, channels: 4 } })
      .png({ adaptiveFiltering: true, palette: false })
      .toBuffer();
  visual[variant] = {
    source: await asset(`${variant}-source`, await png(source)),
    protection: await asset(`${variant}-protection`, await png(mask)),
    branding: await asset(`${variant}-branding`, await png(brand)),
  };
}
const read = async (path: string) => fixtures.get(path)!;

describe("protected match details", () => {
  for (const variant of ["story", "article"] as const)
    test(`${variant} preserves every protected channel exactly in a PNG decoded independently by Sharp`, async () => {
      const output = await renderProtectedFrame(visual[variant], variant, read);
      const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
      const { width, height } = MATCH_VISUAL_SIZES[variant];
      expect(info).toMatchObject({ width, height, channels: 4 });
      const protectedLength = width * (height - 100) * 4;
      expect(
        Buffer.compare(
          data.subarray(0, protectedLength),
          Buffer.from(original.get(variant)!.subarray(0, protectedLength)),
        ),
      ).toBe(0);
      expect([...data.subarray(protectedLength, protectedLength + 4)]).toEqual([31, 85, 121, 255]);
    });
  test("wrong hashes cannot turn a replaced source into approved media", async () => {
    await expect(
      renderProtectedFrame(visual.story, "story", async (path) => {
        const bytes = new Uint8Array(fixtures.get(path)!);
        bytes[40] ^= 1;
        return bytes;
      }),
    ).rejects.toThrow("visual_asset_changed");
  });
  test("branding that touches one protected pixel blocks publication", async () => {
    const { width, height } = MATCH_VISUAL_SIZES.story;
    const raster = await decodeVisualPng(fixtures.get(visual.story.branding.path)!, width, height);
    raster[3] = 1;
    const bytes = await encodeVisualPng(raster, width, height);
    const frame = {
      ...visual.story,
      branding: { ...visual.story.branding, sha256: digest(bytes) },
    };
    await expect(
      renderProtectedFrame(frame, "story", async (path) =>
        path === frame.branding.path ? bytes : read(path),
      ),
    ).rejects.toThrow("branding_overlaps_protected_pixels");
  });
  test("expired rights, incomplete approvals, wrong fixture identities and unsafe paths fail before asset reads", () => {
    expect(() => parsePreciseMatchVisual({ ...visual, rightsUntil: "2020-01-01" })).toThrow(
      "visual_approval_expired",
    );
    expect(() =>
      parsePreciseMatchVisual({ ...visual, approval: { ...visual.approval, lettering: false } }),
    ).toThrow("invalid_precise_visual");
    expect(() =>
      parsePreciseMatchVisual({ ...visual, fixtureId: "20000000-0000-4000-8000-000000000002" }),
    ).toThrow("invalid_precise_visual");
    expect(() =>
      parsePreciseMatchVisual({
        ...visual,
        story: { ...visual.story, source: { ...visual.story.source, path: "news/../secret.png" } },
      }),
    ).toThrow("invalid_precise_visual");
  });
  test("wrong canvas sizes and corrupt PNG chunks fail closed", async () => {
    const bytes = fixtures.get(visual.story.source.path)!;
    await expect(decodeVisualPng(bytes, 1536, 1024)).rejects.toThrow("invalid_visual_dimensions");
    const corrupt = bytes.slice();
    corrupt[40] ^= 1;
    await expect(decodeVisualPng(corrupt, 1024, 1536)).rejects.toThrow("invalid_visual_png");
    await expect(decodeVisualPng(bytes.subarray(0, -1), 1024, 1536)).rejects.toThrow(
      "invalid_visual_png",
    );
  });
});

function worker(
  options: {
    manifest?: unknown;
    absent?: boolean;
    completion?: "cancelled" | "lost";
    failArticleUpload?: boolean;
  } = {},
) {
  const calls: string[] = [],
    uploads: string[] = [],
    removals: string[] = [];
  let providerCalls = 0;
  const deps: ImageStoryDependencies = {
    environment: {
      BOTOLAGO_SCHEDULER_TOKEN: "a".repeat(64),
      OpenAI_Image_Gen: "existing-test-key-not-a-real-secret",
    },
    client: {
      schema: () => ({
        rpc: async (name) => {
          calls.push(name);
          if (name === "service_claim_ai_home_story")
            return {
              data: {
                id: ID,
                titleFr: "FUS — RCA",
                titleAr: "الفتح — الرجاء",
                summaryFr: "Match nul, un but partout.",
                visualContext: {
                  match: { home: "FUS", away: "RCA" },
                  ...(options.absent ? {} : { preciseMatchVisual: options.manifest ?? visual }),
                },
              },
              error: null,
            };
          if (name === "service_complete_precise_home_story")
            return {
              data: { status: options.completion === "cancelled" ? "failed" : "published" },
              error: options.completion === "lost" ? { message: "lost response" } : null,
            };
          return { data: null, error: null };
        },
      }),
    },
    storage: {
      from: () => ({
        upload: async (path) => {
          uploads.push(path);
          return { error: options.failArticleUpload && path.includes("match-covers") ? {} : null };
        },
        remove: async (paths) => {
          removals.push(...paths);
          return { error: null };
        },
      }),
    },
    readVisualAsset: read,
    fetchImpl: (async () => {
      providerCalls++;
      throw new Error("protected content must not reach a model");
    }) as typeof fetch,
  };
  return {
    calls,
    uploads,
    removals,
    providerCalls: () => providerCalls,
    run: async () => {
      const response = await handleImageStoryRequest(
        new Request("https://local.invalid", {
          method: "POST",
          headers: { "x-botolago-scheduler-token": "a".repeat(64) },
        }),
        deps,
      );
      return response.json();
    },
  };
}
describe("precise story and article publication", () => {
  test("uploads both dimensions before the single publication RPC, without sending protected content to OpenAI", async () => {
    const f = worker();
    expect(await f.run()).toEqual({ status: "published" });
    expect(f.uploads).toEqual([`news/ai-stories/${ID}.png`, `news/match-covers/${ID}.png`]);
    expect(f.calls.at(-1)).toBe("service_complete_precise_home_story");
    expect(f.providerCalls()).toBe(0);
  });
  test("missing match assets never fall back to generic generation", async () => {
    const f = worker({ absent: true });
    expect(await f.run()).toMatchObject({ error: "precise_assets_required" });
    expect(f.providerCalls()).toBe(0);
    expect(f.uploads).toHaveLength(0);
  });
  test("failed article upload removes the unused story and publishes neither", async () => {
    const f = worker({ failArticleUpload: true });
    expect(await f.run()).toMatchObject({ error: "storage_failed" });
    expect(f.removals).toEqual([`news/ai-stories/${ID}.png`]);
    expect(f.calls).not.toContain("service_complete_precise_home_story");
  });
  test("explicit cancellation removes both artifacts", async () => {
    const f = worker({ completion: "cancelled" });
    expect(await f.run()).toEqual({ status: "failed" });
    expect(f.removals).toEqual(f.uploads);
  });
  test("an ambiguous database response retains both possibly published artifacts", async () => {
    const f = worker({ completion: "lost" });
    expect(await f.run()).toMatchObject({ error: "database_unavailable" });
    expect(f.removals).toHaveLength(0);
  });
});
