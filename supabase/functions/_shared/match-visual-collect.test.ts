import { describe, expect, test } from "bun:test";
import { handleVisualCollect } from "./match-visual-collect";
import { canonicalVisualSource } from "./match-visual-source";
import { encodeVisualPng } from "./precise-match-visual";
import { DRAFT_BUCKET } from "./match-visual-drafts";
const TOKEN = "a".repeat(64);
const makeRequest = (token = TOKEN) =>
  new Request("https://example.com/collector", {
    method: "POST",
    headers: { "x-botolago-scheduler-token": token },
  });
function fixture(enabled = true) {
  const calls: string[] = [],
    buckets: string[] = [],
    removed: string[] = [];
  let fetches = 0;
  let items: unknown = [];
  const deps = {
    environment: {
      BOTOLAGO_SCHEDULER_TOKEN: TOKEN,
      MATCH_VISUAL_FEED_URL: "https://feed.example.com/posts",
    },
    serviceRpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      return {
        data:
          name === "service_match_visual_collection_enabled"
            ? enabled
            : { id: (args.p_data as { id: string }).id, status: "held" },
        error: null,
      };
    },
    storage: {
      from: (bucket: string) => {
        buckets.push(bucket);
        return {
          upload: async () => ({ error: null }),
          remove: async (paths: string[]) => {
            removed.push(...paths);
            return { error: null };
          },
        };
      },
    },
    fetchImpl: async () => {
      fetches++;
      return new Response(JSON.stringify(items));
    },
  };
  return {
    deps,
    calls,
    buckets,
    removed,
    fetches: () => fetches,
    setItems: (value: unknown) => {
      items = value;
    },
  };
}
async function item() {
  const pixels = new Uint8Array(4 * 8 * 8);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([23, 53, 43, 255], i);
  return {
    account: "thebotolapro",
    sourceUrl: "https://www.instagram.com/p/test/?igsh=example",
    label: "FUS – Raja",
    pngBase64: Buffer.from(await encodeVisualPng(pixels, 8, 8)).toString("base64"),
  };
}
describe("private source collection", () => {
  test("checks scheduler token before any database or feed request", async () => {
    const f = fixture();
    expect((await handleVisualCollect(makeRequest("wrong"), f.deps)).status).toBe(401);
    expect(f.calls).toEqual([]);
    expect(f.fetches()).toBe(0);
  });
  test("paused collection never fetches or imports", async () => {
    const f = fixture(false);
    const response = await handleVisualCollect(makeRequest(), f.deps);
    expect(await response.json()).toEqual({ status: "paused", published: 0 });
    expect(f.fetches()).toBe(0);
    expect(f.buckets).toEqual([]);
  });
  test("missing feed fails closed without touching database", async () => {
    const f = fixture();
    f.deps.environment.MATCH_VISUAL_FEED_URL = "";
    expect((await handleVisualCollect(makeRequest(), f.deps)).status).toBe(503);
    expect(f.calls).toEqual([]);
  });
  test("imports originals as held private drafts without using a public media API", async () => {
    const f = fixture();
    f.setItems([await item()]);
    expect(await (await handleVisualCollect(makeRequest(), f.deps)).json()).toEqual({
      status: "held",
      imported: 1,
      skipped: 0,
      published: 0,
    });
    expect(f.calls).toEqual([
      "service_match_visual_collection_enabled",
      "service_match_visual_collection_enabled",
      "service_import_match_visual_draft",
    ]);
    expect(f.buckets.every((bucket) => bucket === DRAFT_BUCKET)).toBe(true);
  });
  test("duplicate or discarded sources are suppressed and redundant private upload removed", async () => {
    const f = fixture();
    f.setItems([await item()]);
    f.deps.serviceRpc = async (name) => ({
      data:
        name === "service_match_visual_collection_enabled"
          ? true
          : { id: "older-draft", status: "discarded" },
      error: null,
    });
    expect(await (await handleVisualCollect(makeRequest(), f.deps)).json()).toEqual({
      status: "held",
      imported: 0,
      skipped: 1,
      published: 0,
    });
    expect(f.removed).toHaveLength(1);
  });
  test("oversized batches and unknown accounts never upload", async () => {
    for (const data of [
      Array(7).fill(await item()),
      [{ ...(await item()), account: "other-account" }],
    ]) {
      const f = fixture();
      f.setItems(data);
      expect((await handleVisualCollect(makeRequest(), f.deps)).status).toBe(502);
      expect(f.buckets).toEqual([]);
    }
  });
  test("canonical source URLs discard tracking and reject untrusted domains", () => {
    expect(canonicalVisualSource("https://www.instagram.com/p/test/?igsh=abc#part")).toBe(
      "https://instagram.com/p/test/",
    );
    expect(() => canonicalVisualSource("https://evil.example.com/p/test")).toThrow();
    expect(() => canonicalVisualSource("https://user:pass@instagram.com/p/test/")).toThrow();
  });
});
