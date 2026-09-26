import { describe, expect, it } from "bun:test";
import sharp from "sharp";

import {
  DERIVATIVE_SIZE,
  makePhotoDerivative,
  runPhotoJob,
  supabaseDependencies,
  type PhotoJobDependencies,
} from "./pepites-photo-job";

/** A landscape JPEG carrying camera, date and GPS metadata, as a phone makes. */
async function phonePhoto(width = 1600, height = 1000): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "PhoneMaker", Model: "Phone 15", DateTime: "2026:09:01 18:30:00" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "33/1 35/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "7/1 36/1 0/1",
      },
    })
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("makePhotoDerivative", () => {
  it("makes a 512 px square WebP and keeps no metadata: no camera, no date, no location", async () => {
    const original = await phonePhoto();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const derivative = await makePhotoDerivative(original);
    expect(derivative.mimeType).toBe("image/webp");
    expect([derivative.width, derivative.height]).toEqual([DERIVATIVE_SIZE, DERIVATIVE_SIZE]);
    const out = await sharp(derivative.data).metadata();
    expect(out.format).toBe("webp");
    expect([out.width, out.height]).toEqual([512, 512]);
    expect(out.exif).toBeUndefined();
    expect(out.xmp).toBeUndefined();
    expect(out.iptc).toBeUndefined();
    const text = new TextDecoder("latin1").decode(derivative.data);
    expect(text).not.toContain("PhoneMaker");
    expect(text).not.toContain("GPS");
  });

  it("crops a portrait to a square too", async () => {
    const derivative = await makePhotoDerivative(await phonePhoto(800, 1400));
    expect([derivative.width, derivative.height]).toEqual([512, 512]);
  });

  it("refuses what is not a JPEG, PNG or WebP image", async () => {
    await expect(makePhotoDerivative(new TextEncoder().encode("not an image"))).rejects.toThrow();
    await expect(makePhotoDerivative(new Uint8Array())).rejects.toThrow(
      "photo_original_size_invalid",
    );
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } })
      .gif()
      .toBuffer();
    await expect(makePhotoDerivative(new Uint8Array(gif))).rejects.toThrow(
      "photo_original_format_invalid",
    );
  });
});

function fakeDependencies(options: { refuse?: Set<string>; missing?: Set<string> } = {}) {
  const buckets = new Map<string, Map<string, Uint8Array>>([
    ["player-photo-intake", new Map()],
    ["football-media", new Map()],
  ]);
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let work: unknown = { publish: [], delete: [] };
  const deps: PhotoJobDependencies = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "service_player_photo_work") return work;
      if (
        name === "service_publish_player_photo" &&
        options.refuse?.has(String(args.p_release_id))
      ) {
        throw new Error("PHOTO_RELEASE_PROBLEMS");
      }
      return { ok: true };
    },
    async download(bucket, path) {
      const data = buckets.get(bucket)?.get(path);
      if (!data || options.missing?.has(path)) throw new Error("download_404");
      return data;
    },
    async upload(bucket, path, data) {
      buckets.get(bucket)!.set(path, data);
    },
    async remove(bucket, path) {
      buckets.get(bucket)?.delete(path);
    },
  };
  return {
    deps,
    buckets,
    calls,
    setWork: (value: unknown) => {
      work = value;
    },
  };
}

describe("runPhotoJob", () => {
  it("publishes each approved photo, and removes the file of one whose rights no longer hold", async () => {
    const fake = fakeDependencies({ refuse: new Set(["release-2"]) });
    fake.buckets.get("player-photo-intake")!.set("players/p1/a.jpg", await phonePhoto());
    fake.buckets.get("player-photo-intake")!.set("players/p2/b.jpg", await phonePhoto());
    fake.setWork({
      publish: [
        {
          releaseId: "release-1",
          playerId: "p1",
          intakePath: "players/p1/a.jpg",
          publicPath: "football/players/p1/release-1.webp",
        },
        {
          releaseId: "release-2",
          playerId: "p2",
          intakePath: "players/p2/b.jpg",
          publicPath: "football/players/p2/release-2.webp",
        },
      ],
      delete: [],
    });
    const summary = await runPhotoJob(fake.deps);
    expect(summary.published).toEqual(["release-1"]);
    expect(summary.refused).toEqual([{ releaseId: "release-2", reason: "PHOTO_RELEASE_PROBLEMS" }]);
    expect([...fake.buckets.get("football-media")!.keys()]).toEqual([
      "football/players/p1/release-1.webp",
    ]);
    expect(fake.calls.find((call) => call.name === "service_publish_player_photo")?.args).toEqual({
      p_release_id: "release-1",
      p_public_path: "football/players/p1/release-1.webp",
      p_width: 512,
      p_height: 512,
      p_mime_type: "image/webp",
    });
  });

  it("deletes each queued object and marks it done; a missing original fails alone", async () => {
    const fake = fakeDependencies();
    fake.buckets.get("football-media")!.set("football/players/p1/old.webp", new Uint8Array([1]));
    fake.setWork({
      publish: [
        {
          releaseId: "release-3",
          playerId: "p3",
          intakePath: "players/p3/gone.jpg",
          publicPath: "football/players/p3/release-3.webp",
        },
      ],
      delete: [
        { id: "del-1", bucket: "football-media", path: "football/players/p1/old.webp" },
        { id: "del-2", bucket: "player-photo-intake", path: "players/p1/a.jpg" },
      ],
    });
    const summary = await runPhotoJob(fake.deps);
    expect(summary.deleted).toBe(2);
    expect(fake.buckets.get("football-media")!.size).toBe(0);
    expect(summary.failed).toEqual([{ item: "release-3", reason: "download_404" }]);
    expect(
      fake.calls
        .filter((call) => call.name === "service_complete_photo_deletion")
        .map((call) => call.args),
    ).toEqual([{ p_deletion_id: "del-1" }, { p_deletion_id: "del-2" }]);
  });
});

describe("supabaseDependencies", () => {
  it("calls the api schema with the service key and tolerates an object already gone", async () => {
    const requests: Array<{ url: string; method: string; headers: Headers }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
      });
      if (init?.method === "DELETE") return new Response("", { status: 404 });
      return Response.json({ publish: [], delete: [] });
    }) as typeof fetch;
    const deps = supabaseDependencies("https://project.supabase.co/", "service-key", fetchImpl);
    await deps.rpc("service_player_photo_work", { p_limit: 5 });
    await deps.remove("football-media", "football/players/p/x.webp");
    expect(requests[0]!.url).toBe(
      "https://project.supabase.co/rest/v1/rpc/service_player_photo_work",
    );
    expect(requests[0]!.headers.get("content-profile")).toBe("api");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer service-key");
    expect(requests[1]!.url).toBe("https://project.supabase.co/storage/v1/object/football-media");
  });
});
