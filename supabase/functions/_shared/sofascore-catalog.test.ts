import { describe, expect, test } from "bun:test";
import type { LiveRefreshRpcClient } from "./football-live-refresh.ts";
import { RapidApiError } from "./rapidapi-client.ts";
import {
  createCatalogRapidClient,
  detectImageChange,
  imageStoragePath,
  parseSquad,
  planPlayerUpdates,
  runCatalogWeekly,
  selectImageWork,
  sha256Hex,
  sniffImage,
  squadPath,
  teamLogoPath,
  type CatalogStorage,
  type ImageState,
  type MappedPlayerState,
} from "./sofascore-catalog.ts";

// Synthetic ids, names and bytes only.
const NOW = new Date("2026-10-18T04:17:00Z");
const switches = { names: true, shirts: true, positions: true };

function png(seed: number): Uint8Array {
  const bytes = new Uint8Array(160).fill(seed);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return bytes;
}

const squadReply = (players: Record<string, unknown>[]) => ({
  players: players.map((player) => ({ player })),
});

describe("parseSquad", () => {
  test("reads id, name, position and shirt; ignores rows without an id", () => {
    const squad = parseSquad(
      squadReply([
        { id: 11, name: "Player Eleven", position: "M", shirtNumber: 8 },
        { id: 12, name: " ", position: "X", jerseyNumber: 100 },
        { name: "No Id", position: "G" },
        { id: 11, name: "Duplicate" },
      ]),
    );
    expect(squad).toEqual([
      { sofascoreId: "11", name: "Player Eleven", position: "midfielder", shirtNumber: 8 },
      { sofascoreId: "12", name: null, position: null, shirtNumber: null },
    ]);
  });

  test("a reply that is not a squad is null", () => {
    expect(parseSquad({})).toBeNull();
    expect(parseSquad(null)).toBeNull();
    expect(parseSquad({ players: "x" })).toBeNull();
  });
});

const mapped = (rows: Partial<MappedPlayerState>[]) =>
  new Map(
    rows.map((row, index) => [
      row.sofascoreId ?? String(index),
      {
        playerId: `p${index}`,
        sofascoreId: String(index),
        displayName: "Old Name",
        position: "midfielder",
        teamSofascoreId: "500",
        shirtNumber: 10,
        ...row,
      } satisfies MappedPlayerState,
    ]),
  );

describe("planPlayerUpdates: mapped players only, by id, never by name", () => {
  test("a SofaScore player without a mapping is listed, never updated or created", () => {
    const squad = parseSquad(
      squadReply([
        { id: 21, name: "Same Name", position: "D", shirtNumber: 4 },
        { id: 22, name: "Brand New", position: "F", shirtNumber: 9 },
      ]),
    )!;
    // A mapped player (id 99) carries exactly the name of unmapped id 21.
    const plan = planPlayerUpdates(
      squad,
      "500",
      mapped([{ sofascoreId: "99", displayName: "Same Name" }]),
      switches,
    );
    expect(plan.updates).toEqual([]);
    expect(plan.unmapped.map((player) => player.sofascoreId)).toEqual(["21", "22"]);
    expect(plan.unmapped[0]).toMatchObject({ name: "Same Name", teamSofascoreId: "500" });
  });

  test("a mapped player gets only the fields that differ", () => {
    const squad = parseSquad(
      squadReply([
        { id: 31, name: "New Spelling", position: "M", shirtNumber: 10 },
        { id: 32, name: "Old Name", position: "M", shirtNumber: 10 },
      ]),
    )!;
    const plan = planPlayerUpdates(
      squad,
      "500",
      mapped([{ sofascoreId: "31" }, { sofascoreId: "32" }]),
      switches,
    );
    expect(plan.updates).toEqual([
      { sofascoreId: "31", teamSofascoreId: "500", displayName: "New Spelling" },
    ]);
    expect(plan.unchanged).toBe(1);
  });

  test("position and shirt follow their switches; shirt only at the club the database has", () => {
    const squad = parseSquad(
      squadReply([{ id: 41, name: "Old Name", position: "F", shirtNumber: 7 }]),
    )!;
    const base = mapped([{ sofascoreId: "41" }]);
    expect(
      planPlayerUpdates(squad, "500", base, { ...switches, positions: false }).updates,
    ).toEqual([{ sofascoreId: "41", teamSofascoreId: "500", shirtNumber: 7 }]);
    expect(planPlayerUpdates(squad, "500", base, { ...switches, shirts: false }).updates).toEqual([
      { sofascoreId: "41", teamSofascoreId: "500", position: "forward" },
    ]);
    // The squad is another club's than the one our database has the player at.
    expect(
      planPlayerUpdates(squad, "600", base, { ...switches, positions: false }).updates,
    ).toEqual([]);
  });

  test("a missing value in SofaScore's squad changes nothing", () => {
    const squad = parseSquad(squadReply([{ id: 51 }]))!;
    const plan = planPlayerUpdates(squad, "500", mapped([{ sofascoreId: "51" }]), switches);
    expect(plan.updates).toEqual([]);
  });
});

describe("image helpers", () => {
  const state = (id: string, over: Partial<ImageState> = {}): ImageState => ({
    entityType: "team",
    sofascoreId: id,
    sha256: "a".repeat(64),
    storagePath: `football/sofascore/teams/${id}/crest-aaaaaaaaaaaa.png`,
    status: "stored",
    failureCount: 0,
    checkedAt: "2026-10-01T00:00:00Z",
    ...over,
  });
  const team = (id: string) => ({ entityType: "team" as const, sofascoreId: id });
  const player = (id: string) => ({ entityType: "player" as const, sofascoreId: id });

  test("change detection by hash", () => {
    expect(detectImageChange(null, "x")).toBe("new");
    expect(detectImageChange("a", "a")).toBe("unchanged");
    expect(detectImageChange("a", "b")).toBe("changed");
  });

  test("sha256Hex is the standard digest", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("the type comes from the bytes, and size is bounded", () => {
    expect(sniffImage(png(1))?.mime).toBe("image/png");
    const jpeg = new Uint8Array(200).fill(2);
    jpeg.set([0xff, 0xd8, 0xff]);
    expect(sniffImage(jpeg)).toEqual({ mime: "image/jpeg", extension: "jpg" });
    const webp = new Uint8Array(200).fill(2);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImage(webp)?.extension).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<html>".padEnd(200)))).toBeNull(); // not an image
    expect(sniffImage(png(1).slice(0, 50))).toBeNull(); // too small
    expect(sniffImage(new Uint8Array(2_000_001).fill(0x89))).toBeNull(); // too large
  });

  test("the path carries the hash, so a changed image is a new path", () => {
    expect(imageStoragePath("team", "55035", "abcdef0123456789".padEnd(64, "0"), "png")).toBe(
      "football/sofascore/teams/55035/crest-abcdef012345.png",
    );
    expect(imageStoragePath("player", "880101", "0123456789abcdef".padEnd(64, "0"), "jpg")).toBe(
      "football/sofascore/players/880101/photo-0123456789ab.jpg",
    );
  });

  test("never-fetched first (clubs before players), then the longest unchecked; limit holds", () => {
    const candidates = [player("9"), team("3"), team("1"), team("2"), player("8")];
    const states = [
      state("1", { checkedAt: "2026-09-10T00:00:00Z" }),
      state("2", { checkedAt: "2026-08-01T00:00:00Z" }),
    ];
    expect(selectImageWork(candidates, states, 10, NOW)).toEqual([
      team("3"),
      player("8"),
      player("9"),
      team("2"),
      team("1"),
    ]);
    expect(selectImageWork(candidates, states, 2, NOW)).toEqual([team("3"), player("8")]);
    expect(selectImageWork(candidates, states, 0, NOW)).toEqual([]);
  });

  test("next week continues where this week stopped", () => {
    const candidates = [team("1"), team("2"), team("3"), team("4")];
    const week1 = selectImageWork(candidates, [], 2, NOW);
    expect(week1).toEqual([team("1"), team("2")]);
    const afterWeek1 = week1.map((c) => state(c.sofascoreId, { checkedAt: NOW.toISOString() }));
    const later = new Date(NOW.getTime() + 7 * 86_400_000);
    expect(selectImageWork(candidates, afterWeek1, 2, later)).toEqual([team("3"), team("4")]);
  });

  test("an image already stored is not asked for again within 28 days", () => {
    const fresh = state("1", {
      checkedAt: new Date(NOW.getTime() - 10 * 86_400_000).toISOString(),
    });
    expect(selectImageWork([team("1")], [fresh], 5, NOW)).toEqual([]);
    const later = new Date(NOW.getTime() + 19 * 86_400_000);
    expect(selectImageWork([team("1")], [fresh], 5, later)).toEqual([team("1")]);
  });

  test("an image SofaScore did not have waits 30 days, a failed one a day", () => {
    const missing = state("1", {
      sha256: null,
      storagePath: null,
      status: "missing",
      checkedAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(),
    });
    const failedToday = state("2", {
      sha256: null,
      storagePath: null,
      status: "failed",
      checkedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
    });
    expect(selectImageWork([team("1"), team("2")], [missing, failedToday], 5, NOW)).toEqual([]);
    const later = new Date(NOW.getTime() + 31 * 86_400_000);
    expect(selectImageWork([team("1"), team("2")], [missing, failedToday], 5, later)).toHaveLength(
      2,
    );
  });
});

describe("createCatalogRapidClient: the RapidAPI client, with image bytes", () => {
  const reply = (body: BodyInit, contentType: string, status = 200) =>
    new Response(body, {
      status,
      headers: {
        "content-type": contentType,
        "x-ratelimit-requests-limit": "10000",
        "x-ratelimit-requests-remaining": "5000",
      },
    });

  test("returns the bytes and sends the key in headers only", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const bytes = png(7);
    const client = createCatalogRapidClient({ RAPIDAPI_KEY: "secret-key" }, async (input, init) => {
      seen.push({ url: input, headers: init?.headers as Record<string, string> });
      return reply(bytes, "image/png");
    });
    const image = await client.getImage(teamLogoPath("55035"));
    expect(Array.from(image.bytes)).toEqual(Array.from(bytes));
    expect(image.contentType).toBe("image/png");
    expect(seen[0].url).toBe("https://sofascore.p.rapidapi.com/teams/get-logo?teamId=55035");
    expect(seen[0].url).not.toContain("secret-key");
    expect(seen[0].headers["x-rapidapi-key"]).toBe("secret-key");
  });

  test("JSON endpoints still work through the same client", async () => {
    const client = createCatalogRapidClient({ RAPIDAPI_KEY: "k" }, async () =>
      reply(JSON.stringify({ players: [] }), "application/json"),
    );
    const result = await client.getJson(squadPath("55035"));
    expect(result.data).toEqual({ players: [] });
  });

  test("a JSON body from an image endpoint is an error, a 404 is data_unavailable", async () => {
    const jsonBody = createCatalogRapidClient({ RAPIDAPI_KEY: "k" }, async () =>
      reply(JSON.stringify({ message: "oops" }), "application/json"),
    );
    await expect(jsonBody.getImage(teamLogoPath("1"))).rejects.toBeInstanceOf(RapidApiError);
    const missing = createCatalogRapidClient({ RAPIDAPI_KEY: "k" }, async () =>
      reply("nope", "text/plain", 404),
    );
    await expect(missing.getImage(teamLogoPath("1"))).rejects.toMatchObject({
      code: "data_unavailable",
    });
  });
});

// --- the job -----------------------------------------------------------------

interface World {
  teams: { sofascoreId: string; crestCurated?: boolean }[];
  players: MappedPlayerState[];
  images: ImageState[];
}

function harness(
  world: World,
  squads: Record<string, unknown>,
  images: Record<string, Uint8Array | "missing" | "limited">,
) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const requested: string[] = [];
  const uploads: { path: string; contentType: string }[] = [];
  const removed: string[] = [];
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          rpcCalls.push({ name, args });
          if (name === "football_sofascore_catalog_snapshot") {
            return Promise.resolve({
              data: {
                teams: world.teams.map((team) => ({ crestCurated: false, ...team })),
                players: world.players,
                images: world.images,
              },
              error: null,
            });
          }
          if (name === "service_sofascore_catalog_apply") {
            const updates = args.p_updates as unknown[];
            return Promise.resolve({
              data: { names: updates.length, positions: 0, shirts: 0, notMapped: 0 },
              error: null,
            });
          }
          if (name === "service_sofascore_catalog_record_image") {
            return Promise.resolve({
              data: {
                previousPath: args.p_status === "stored" ? "football/old.png" : null,
                linked: true,
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
        },
      };
    },
  } as unknown as LiveRefreshRpcClient;
  const rapid = {
    async getJson(path: string) {
      requested.push(path);
      const teamId = /teamId=(\d+)/.exec(path)?.[1] ?? "";
      if (!(teamId in squads)) throw new RapidApiError("data_unavailable", "no squad");
      return { data: squads[teamId], quota: { limit: 1000, remaining: 900 }, requestsSent: 1 };
    },
    async getImage(path: string) {
      requested.push(path);
      const id = /(?:teamId|playerId)=(\d+)/.exec(path)?.[1] ?? "";
      const image = images[id];
      if (image === "limited") throw new RapidApiError("provider_rate_limited", "low");
      if (image === undefined || image === "missing") {
        throw new RapidApiError("data_unavailable", "none");
      }
      return { bytes: image, contentType: "image/png" };
    },
  };
  const storage: CatalogStorage = {
    from: () => ({
      upload: async (path, _body, options) => {
        uploads.push({ path, contentType: options.contentType });
        return { error: null };
      },
      remove: async (paths) => {
        removed.push(...paths);
        return { error: null };
      },
    }),
  };
  const run = (
    mode: "sofascore" | "shadow",
    environment: Record<string, string> = {},
  ): ReturnType<typeof runCatalogWeekly> =>
    runCatalogWeekly({ mode, client, rapid, storage, environment, now: NOW, log: () => {} });
  return { run, rpcCalls, requested, uploads, removed };
}

const player = (id: string, over: Partial<MappedPlayerState> = {}): MappedPlayerState => ({
  playerId: `uuid-${id}`,
  sofascoreId: id,
  displayName: "Old Name",
  position: "midfielder",
  teamSofascoreId: "500",
  shirtNumber: 10,
  ...over,
});

describe("runCatalogWeekly", () => {
  test("updates mapped players, lists unmapped ones, and never calls anything that creates", async () => {
    const h = harness(
      {
        teams: [{ sofascoreId: "500" }],
        players: [player("31")],
        images: [],
      },
      {
        "500": squadReply([
          { id: 31, name: "New Spelling", position: "M", shirtNumber: 10 },
          { id: 32, name: "Old Name", position: "M", shirtNumber: 11 },
        ]),
      },
      {},
    );
    const outcome = await h.run("sofascore", { SOFASCORE_CATALOG_IMAGE_LIMIT: "0" });
    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({
      requests: 1,
      planned: 1,
      unmappedPlayersTotal: 1,
      applied: { names: 1 },
    });
    expect((outcome.body.unmappedPlayers as { sofascoreId: string }[])[0].sofascoreId).toBe("32");
    const names = h.rpcCalls.map((call) => call.name);
    expect(names).toEqual([
      "football_sofascore_catalog_snapshot",
      "service_sofascore_catalog_apply",
    ]);
    // Only the mapped player is sent, by SofaScore id.
    const sent = h.rpcCalls[1].args.p_updates as { sofascoreId: string }[];
    expect(sent.map((update) => update.sofascoreId)).toEqual(["31"]);
    // No create, no mapping call of any kind.
    expect(names.some((name) => /create|insert|ingest|resolve|map/i.test(name))).toBe(false);
  });

  test("position changes are off unless the owner switches them on", async () => {
    const world = {
      teams: [{ sofascoreId: "500" }],
      players: [player("31", { displayName: "Same" })],
      images: [],
    };
    const squads = { "500": squadReply([{ id: 31, name: "Same", position: "F" }]) };
    const off = harness(world, squads, {});
    await off.run("sofascore", { SOFASCORE_CATALOG_IMAGE_LIMIT: "0" });
    expect(off.rpcCalls.map((call) => call.name)).toEqual(["football_sofascore_catalog_snapshot"]);
    const on = harness(world, squads, {});
    await on.run("sofascore", {
      SOFASCORE_CATALOG_IMAGE_LIMIT: "0",
      SOFASCORE_CATALOG_UPDATE_POSITION: "true",
    });
    expect(on.rpcCalls[1].args.p_allow_position).toBe(true);
    expect((on.rpcCalls[1].args.p_updates as { position: string }[])[0].position).toBe("forward");
  });

  test("images: bounded by the limit, clubs only by default, stored through the record RPC", async () => {
    const h = harness(
      {
        teams: [{ sofascoreId: "1" }, { sofascoreId: "2" }, { sofascoreId: "3" }],
        players: [player("31")],
        images: [],
      },
      { "1": squadReply([]), "2": squadReply([]), "3": squadReply([]) },
      { "1": png(1), "2": png(2), "3": png(3), "31": png(31) },
    );
    const outcome = await h.run("sofascore", { SOFASCORE_CATALOG_IMAGE_LIMIT: "2" });
    expect(outcome.status).toBe(200);
    expect(outcome.body.images).toMatchObject({ candidates: 3, attempted: 2, stored: 2 });
    const imageRequests = h.requested.filter((path) => path.includes("get-logo"));
    expect(imageRequests).toHaveLength(2);
    expect(h.requested.some((path) => path.includes("players/get-image"))).toBe(false);
    expect(h.uploads).toHaveLength(2);
    expect(h.uploads[0].path).toMatch(/^football\/sofascore\/teams\/1\/crest-[0-9a-f]{12}\.png$/);
    expect(h.uploads[0].contentType).toBe("image/png");
    // The old object is removed once the new one is recorded.
    expect(h.removed).toEqual(["football/old.png", "football/old.png"]);
    const recorded = h.rpcCalls.filter(
      (call) => call.name === "service_sofascore_catalog_record_image",
    );
    expect(recorded.map((call) => call.args.p_status)).toEqual(["stored", "stored"]);
    expect(recorded[0].args.p_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("player images only when the owner switches them on", async () => {
    const h = harness({ teams: [], players: [player("31")], images: [] }, {}, { "31": png(31) });
    await h.run("sofascore", { SOFASCORE_CATALOG_PLAYER_PHOTOS: "true" });
    expect(h.uploads[0].path).toMatch(
      /^football\/sofascore\/players\/31\/photo-[0-9a-f]{12}\.png$/,
    );
  });

  test("an unchanged image (same hash) is not uploaded again", async () => {
    const bytes = png(5);
    const sha = await sha256Hex(bytes);
    const h = harness(
      {
        teams: [{ sofascoreId: "1" }],
        players: [],
        images: [
          {
            entityType: "team",
            sofascoreId: "1",
            sha256: sha,
            storagePath: imageStoragePath("team", "1", sha, "png"),
            status: "stored",
            failureCount: 0,
            checkedAt: "2026-09-01T00:00:00Z",
          },
        ],
      },
      { "1": squadReply([]) },
      { "1": bytes },
    );
    const outcome = await h.run("sofascore");
    expect(outcome.body.images).toMatchObject({ attempted: 1, unchanged: 1, stored: 0 });
    expect(h.uploads).toHaveLength(0);
    const recorded = h.rpcCalls.filter(
      (call) => call.name === "service_sofascore_catalog_record_image",
    );
    expect(recorded.map((call) => call.args.p_status)).toEqual(["unchanged"]);
  });

  test("a club with a BotolaGO-supplied crest is not fetched", async () => {
    const h = harness(
      { teams: [{ sofascoreId: "1", crestCurated: true }], players: [], images: [] },
      { "1": squadReply([]) },
      { "1": png(1) },
    );
    await h.run("sofascore");
    expect(h.requested.some((path) => path.includes("get-logo"))).toBe(false);
  });

  test("no image from SofaScore is recorded as missing; garbage is recorded as failed", async () => {
    const h = harness(
      { teams: [{ sofascoreId: "1" }, { sofascoreId: "2" }], players: [], images: [] },
      { "1": squadReply([]), "2": squadReply([]) },
      { "1": "missing", "2": new TextEncoder().encode("<html>".padEnd(300)) },
    );
    const outcome = await h.run("sofascore");
    expect(outcome.body.images).toMatchObject({ missing: 1, failed: 1, stored: 0 });
    expect(h.uploads).toHaveLength(0);
    const recorded = h.rpcCalls.filter(
      (call) => call.name === "service_sofascore_catalog_record_image",
    );
    expect(recorded.map((call) => call.args.p_status).sort()).toEqual(["failed", "missing"]);
  });

  test("a quota refusal stops the run with 429 and the rest waits for next week", async () => {
    const h = harness(
      { teams: [{ sofascoreId: "1" }, { sofascoreId: "2" }], players: [], images: [] },
      { "1": squadReply([]), "2": squadReply([]) },
      { "1": "limited", "2": png(2) },
    );
    const outcome = await h.run("sofascore");
    expect(outcome.body.images).toMatchObject({ attempted: 1, stoppedBy: "rate_limited" });
    expect(h.uploads).toHaveLength(0);
  });

  test("shadow reads the squads, downloads and writes nothing", async () => {
    const h = harness(
      {
        teams: [{ sofascoreId: "1" }],
        players: [player("31")],
        images: [],
      },
      { "1": squadReply([{ id: 31, name: "New Spelling" }]) },
      { "1": png(1) },
    );
    const outcome = await h.run("shadow");
    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ mode: "shadow", planned: 1, applied: null });
    expect(h.requested.every((path) => path.startsWith("teams/get-squad"))).toBe(true);
    expect(h.uploads).toHaveLength(0);
    expect(h.rpcCalls.map((call) => call.name)).toEqual(["football_sofascore_catalog_snapshot"]);
  });
});
