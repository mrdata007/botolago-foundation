import { describe, expect, test } from "bun:test";
import {
  InMemorySofascorePlayerQueueRepository,
  buildSampleSofascoreQueue,
} from "./sofascore-player-queue-sample";
import {
  SOFASCORE_QUEUE_ERROR_CODES,
  SOFASCORE_QUEUE_REASONS,
  SofascoreQueueError,
  SupabaseSofascorePlayerQueueRepository,
  createPlayerArgs,
  linkOptionAction,
  mapSofascoreQueueError,
  parseAliasResult,
  parseCreateResult,
  parseLinkOptions,
  parseResolveResult,
  parseSofascoreQueue,
} from "./sofascore-player-queue";

const PLAYER = "00000000-0000-4000-8000-000000000001";

const goodRow = (over: Record<string, unknown> = {}) => ({
  sofascorePlayerId: "123",
  name: "Joueur Exemple",
  shortName: null,
  shirtNumber: 7,
  position: "forward",
  side: "home",
  reason: "no_candidate",
  fixtureId: "f1",
  teamId: "t1",
  teamName: "Club",
  firstSeenAt: "2026-10-10T10:00:00Z",
  lastSeenAt: "2026-10-11T10:00:00Z",
  timesSeen: 2,
  candidates: [],
  ...over,
});

describe("parseSofascoreQueue", () => {
  test("reads a well-formed queue", () => {
    const parsed = parseSofascoreQueue([
      goodRow({
        candidates: [
          {
            playerId: PLAYER,
            fullName: "A B",
            displayName: null,
            position: "defender",
            shirtNumber: 4,
            mappedToSofascoreId: "99",
          },
        ],
      }),
    ]);
    expect(parsed.skipped).toBe(0);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.candidates[0]).toMatchObject({
      playerId: PLAYER,
      position: "defender",
      mappedToSofascoreId: "99",
    });
  });

  test("null and empty give an empty queue", () => {
    expect(parseSofascoreQueue(null)).toEqual({ entries: [], skipped: 0 });
    expect(parseSofascoreQueue([])).toEqual({ entries: [], skipped: 0 });
  });

  test("a result that is not a list is an unavailable service, not a crash", () => {
    expect(() => parseSofascoreQueue({ not: "a list" })).toThrow(SofascoreQueueError);
    expect(() => parseSofascoreQueue("nope")).toThrow(SofascoreQueueError);
  });

  test("malformed rows are skipped and counted, good rows survive", () => {
    const parsed = parseSofascoreQueue([
      goodRow(),
      null,
      "text",
      42,
      [],
      {},
      goodRow({ sofascorePlayerId: "" }),
      goodRow({ sofascorePlayerId: "   " }),
      goodRow({ sofascorePlayerId: undefined }),
      goodRow({ sofascorePlayerId: "5", name: "" }),
      goodRow({ sofascorePlayerId: "6", reason: undefined }),
      goodRow({ sofascorePlayerId: "7", candidates: "oops" }),
      goodRow({ sofascorePlayerId: "8", candidates: null }),
    ]);
    expect(parsed.entries.map((e) => e.sofascorePlayerId)).toEqual(["123"]);
    expect(parsed.skipped).toBe(12);
  });

  test("a duplicate SofaScore id is shown once", () => {
    const parsed = parseSofascoreQueue([goodRow(), goodRow({ name: "Autre" })]);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });

  test("a numeric SofaScore id is read as text", () => {
    expect(parseSofascoreQueue([goodRow({ sofascorePlayerId: 4455 })]).entries[0]).toMatchObject({
      sofascorePlayerId: "4455",
    });
  });

  test("odd optional fields fall back to null instead of rejecting the row", () => {
    const [entry] = parseSofascoreQueue([
      goodRow({
        position: "striker",
        side: "middle",
        shirtNumber: "abc",
        firstSeenAt: "not a date",
        timesSeen: -3,
      }),
    ]).entries;
    expect(entry).toMatchObject({
      position: null,
      side: null,
      shirtNumber: null,
      firstSeenAt: null,
      timesSeen: 1,
    });
  });

  test("an unknown reason is kept so the page can say it is unknown", () => {
    expect(parseSofascoreQueue([goodRow({ reason: "brand_new_reason" })]).entries[0]?.reason).toBe(
      "brand_new_reason",
    );
  });

  test("a candidate without an id is not offered; the others stay", () => {
    const [entry] = parseSofascoreQueue([
      goodRow({
        candidates: [
          { fullName: "sans id" },
          null,
          7,
          { playerId: PLAYER, fullName: "Ok" },
          { playerId: PLAYER, fullName: "doublon" },
        ],
      }),
    ]).entries;
    expect(entry?.candidates.map((c) => c.playerId)).toEqual([PLAYER]);
    expect(entry?.candidates[0]?.mappedToSofascoreId).toBeNull();
  });

  test("the sample queue is well-formed and counts its one malformed row", () => {
    const sample = buildSampleSofascoreQueue();
    expect(sample.entries.length).toBe(12);
    expect(sample.skipped).toBe(1);
  });
});

describe("shirt-based reasons (migration 20261013150000)", () => {
  test("the new reasons are known and the name-based ones stay valid", () => {
    for (const reason of [
      "no_shirt_on_file",
      "weak_match",
      "ambiguous_shirt",
      "no_shirt",
      "shirt_conflict",
      "no_candidate",
      "ambiguous_name",
      "partial_name",
      "duplicate_name_in_squad",
    ]) {
      expect((SOFASCORE_QUEUE_REASONS as readonly string[]).includes(reason)).toBe(true);
    }
  });

  test("a leftover arrives with its candidate pre-filled and is confirmed in one call", async () => {
    const repo = new InMemorySofascorePlayerQueueRepository();
    const entry = (await repo.listQueue()).entries.find((e) => e.reason === "no_shirt_on_file")!;
    expect(entry.candidates).toHaveLength(1);
    // The candidate's name differs from the SofaScore name; the pairing is by shirt, not name.
    expect(entry.candidates[0]!.fullName).not.toBe(entry.name);
    await repo.resolve(entry.sofascorePlayerId, entry.candidates[0]!.playerId);
    expect(repo.resolved).toHaveLength(1);
  });

  test("awaiting_second_match is gone from the known reasons", () => {
    expect((SOFASCORE_QUEUE_REASONS as readonly string[]).includes("awaiting_second_match")).toBe(
      false,
    );
  });

  test("a row with a reason this build does not know is kept, not dropped", () => {
    const parsed = parseSofascoreQueue([goodRow({ reason: "shirt_conflict_v2" })]);
    expect(parsed.entries[0]?.reason).toBe("shirt_conflict_v2");
  });
});

describe("parseResolveResult", () => {
  const asked = { sofascorePlayerId: "123", playerId: PLAYER };
  test("accepts the answer for the pair that was asked", () => {
    expect(
      parseResolveResult(
        { sofascorePlayerId: "123", playerId: PLAYER, mappingId: "m", alreadyResolved: false },
        asked,
      ),
    ).toEqual({
      sofascorePlayerId: "123",
      playerId: PLAYER,
      mappingId: "m",
      alreadyResolved: false,
    });
    expect(
      parseResolveResult(
        { sofascorePlayerId: "123", playerId: PLAYER, alreadyResolved: true },
        asked,
      ).mappingId,
    ).toBeNull();
  });

  test.each([
    null,
    undefined,
    "ok",
    {},
    { sofascorePlayerId: "123", playerId: PLAYER },
    { sofascorePlayerId: "123", playerId: PLAYER, alreadyResolved: "false" },
    { sofascorePlayerId: "999", playerId: PLAYER, alreadyResolved: false },
    {
      sofascorePlayerId: "123",
      playerId: "00000000-0000-4000-8000-0000000000ff",
      alreadyResolved: false,
    },
  ])("refuses a malformed or mismatched answer: %p", (raw) => {
    expect(() => parseResolveResult(raw, asked)).toThrow(SofascoreQueueError);
  });
});

describe("mapSofascoreQueueError", () => {
  test.each(SOFASCORE_QUEUE_ERROR_CODES)("recognises %s in the message", (code) => {
    expect(mapSofascoreQueueError({ message: `boom ${code}` }).code).toBe(code);
  });
  test("401 and 42501 mean staff access denied", () => {
    expect(mapSofascoreQueueError({ code: "PT401", message: "x" }).code).toBe(
      "staff_access_denied",
    );
    expect(mapSofascoreQueueError({ code: "42501", message: "x" }).code).toBe(
      "staff_access_denied",
    );
  });
  test("anything else is unavailable", () => {
    expect(mapSofascoreQueueError({ message: "kaboom" }).code).toBe("queue_unavailable");
    expect(mapSofascoreQueueError(null).code).toBe("queue_unavailable");
    expect(mapSofascoreQueueError(undefined).code).toBe("queue_unavailable");
  });
});

describe("SupabaseSofascorePlayerQueueRepository", () => {
  const client = (data: unknown, error: unknown = null) => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    return {
      calls,
      api: {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          return Promise.resolve({ data, error }) as never;
        },
      },
    };
  };

  test("lists through the queue function and parses", async () => {
    const c = client([goodRow()]);
    const repo = new SupabaseSofascorePlayerQueueRepository(c.api);
    expect((await repo.listQueue()).entries).toHaveLength(1);
    expect(c.calls[0]).toEqual({ name: "admin_sofascore_player_match_queue", args: {} });
  });

  test("a refusal from the database becomes a coded error", async () => {
    const repo = new SupabaseSofascorePlayerQueueRepository(
      client(null, { message: "permission_missing" }).api,
    );
    await expect(repo.listQueue()).rejects.toMatchObject({ code: "permission_missing" });
  });

  test("resolve sends the two arguments and checks the answer", async () => {
    const c = client({
      sofascorePlayerId: "123",
      playerId: PLAYER,
      mappingId: "m",
      alreadyResolved: false,
    });
    const result = await new SupabaseSofascorePlayerQueueRepository(c.api).resolve("123", PLAYER);
    expect(result.alreadyResolved).toBe(false);
    expect(c.calls[0]).toEqual({
      name: "admin_resolve_sofascore_player_match",
      args: { p_sofascore_player_id: "123", p_player_id: PLAYER },
    });
  });

  test("resolve never calls the database with a malformed request", async () => {
    const c = client({});
    const repo = new SupabaseSofascorePlayerQueueRepository(c.api);
    await expect(repo.resolve("123", "not-a-uuid")).rejects.toMatchObject({
      code: "invalid_resolution",
    });
    await expect(repo.resolve(" 123", PLAYER)).rejects.toMatchObject({
      code: "invalid_resolution",
    });
    await expect(repo.resolve("", PLAYER)).rejects.toMatchObject({ code: "invalid_resolution" });
    expect(c.calls).toHaveLength(0);
  });

  test("resolve with a garbage answer is not reported as success", async () => {
    const repo = new SupabaseSofascorePlayerQueueRepository(client({ ok: true }).api);
    await expect(repo.resolve("123", PLAYER)).rejects.toMatchObject({ code: "queue_unavailable" });
  });
});

describe("InMemorySofascorePlayerQueueRepository", () => {
  test("a confirmation removes the entry; a mapped candidate is a conflict", async () => {
    const repo = new InMemorySofascorePlayerQueueRepository();
    const before = (await repo.listQueue()).entries;
    const pick = before.find((e) => e.reason === "ambiguous_name")!;
    await repo.resolve(pick.sofascorePlayerId, pick.candidates[0]!.playerId);
    expect((await repo.listQueue()).entries).toHaveLength(before.length - 1);
    const mapped = before.find((e) => e.reason === "candidate_already_mapped")!;
    await expect(
      repo.resolve(mapped.sofascorePlayerId, mapped.candidates[0]!.playerId),
    ).rejects.toMatchObject({
      code: "sofascore_mapping_conflict",
    });
  });
});

describe("second ids, search and creation (20261014170000)", () => {
  const option = (over: Record<string, unknown> = {}) => ({
    playerId: PLAYER,
    fullName: "Joueur Exemple",
    displayName: null,
    position: "defender",
    teamId: "t1",
    teamName: "Club",
    shirtNumber: 4,
    inClub: true,
    sofascoreId: "811111",
    sofascoreActive: true,
    sofascoreAliasIds: ["822222"],
    ...over,
  });

  test("a queue row reads canCreate strictly, and a candidate's main-link state and second ids", () => {
    const parsed = parseSofascoreQueue([
      goodRow({
        canCreate: true,
        candidates: [
          {
            playerId: PLAYER,
            mappedToSofascoreId: "1",
            mappedActive: true,
            sofascoreAliasIds: ["2", 3, "", "2"],
          },
        ],
      }),
      goodRow({ sofascorePlayerId: "124", canCreate: "yes" }),
    ]);
    expect(parsed.entries[0]!.canCreate).toBe(true);
    expect(parsed.entries[0]!.candidates[0]!.mappedActive).toBe(true);
    expect(parsed.entries[0]!.candidates[0]!.sofascoreAliasIds).toEqual(["2", "3"]);
    expect(parsed.entries[1]!.canCreate).toBe(false);
  });

  test("an old answer without the new fields still parses: nothing new is offered", () => {
    const parsed = parseSofascoreQueue([
      goodRow({ candidates: [{ playerId: PLAYER, mappedToSofascoreId: "1" }] }),
    ]);
    expect(parsed.entries[0]!.canCreate).toBe(false);
    expect(parsed.entries[0]!.candidates[0]!.mappedActive).toBeNull();
    expect(parsed.entries[0]!.candidates[0]!.sofascoreAliasIds).toEqual([]);
  });

  test("each option offers the one action that fits", () => {
    expect(linkOptionAction({ sofascoreId: null, sofascoreActive: null })).toBe("link");
    expect(linkOptionAction({ sofascoreId: "1", sofascoreActive: true })).toBe("alias");
    expect(linkOptionAction({ sofascoreId: "1", sofascoreActive: false })).toBe("none");
    expect(linkOptionAction({ sofascoreId: "1", sofascoreActive: null })).toBe("none");
  });

  test("options are read for the entry asked about only; bad rows are counted", () => {
    const parsed = parseLinkOptions(
      { sofascorePlayerId: "123", query: null, players: [option(), option(), { nope: 1 }] },
      "123",
    );
    expect(parsed.players).toHaveLength(1);
    expect(parsed.skipped).toBe(2);
    expect(parsed.players[0]!.sofascoreAliasIds).toEqual(["822222"]);
    expect(() =>
      parseLinkOptions({ sofascorePlayerId: "999", query: null, players: [] }, "123"),
    ).toThrow(SofascoreQueueError);
    expect(() => parseLinkOptions(null, "123")).toThrow(SofascoreQueueError);
  });

  test("a link or creation answer must name what was asked", () => {
    expect(
      parseAliasResult(
        {
          sofascorePlayerId: "123",
          playerId: PLAYER,
          primarySofascoreId: "1",
          alreadyLinked: false,
        },
        { sofascorePlayerId: "123", playerId: PLAYER },
      ).primarySofascoreId,
    ).toBe("1");
    expect(() =>
      parseAliasResult(
        { sofascorePlayerId: "123", playerId: PLAYER, alreadyLinked: false },
        { sofascorePlayerId: "124", playerId: PLAYER },
      ),
    ).toThrow(SofascoreQueueError);
    expect(
      parseCreateResult({ sofascorePlayerId: "123", playerId: PLAYER, created: true }, "123")
        .playerId,
    ).toBe(PLAYER);
    expect(() =>
      parseCreateResult({ sofascorePlayerId: "123", playerId: PLAYER, created: false }, "123"),
    ).toThrow(SofascoreQueueError);
    expect(() =>
      parseCreateResult({ sofascorePlayerId: "123", playerId: "x", created: true }, "123"),
    ).toThrow(SofascoreQueueError);
  });

  test("a creation request is checked before it leaves the browser; only corrections are sent", () => {
    expect(createPlayerArgs("123", {})).toEqual({ p_sofascore_player_id: "123" });
    expect(
      createPlayerArgs("123", { name: "  Felipinho ", shirtNumber: 0, position: "forward" }),
    ).toEqual({
      p_sofascore_player_id: "123",
      p_name: "Felipinho",
      p_shirt_number: 0,
      p_position: "forward",
    });
    for (const bad of [
      { name: "x" },
      { shirtNumber: 100 },
      { shirtNumber: 1.5 },
      { position: "striker" },
    ]) {
      expect(() => createPlayerArgs("123", bad as never)).toThrow(SofascoreQueueError);
    }
    expect(() => createPlayerArgs(" 123", {})).toThrow(SofascoreQueueError);
  });

  test("the new refusals map to their own codes", () => {
    for (const code of [
      "sofascore_alias_needs_primary",
      "sofascore_alias_conflict",
      "sofascore_create_no_club",
      "sofascore_create_season_not_current",
      "sofascore_create_position_required",
    ] as const) {
      expect(SOFASCORE_QUEUE_ERROR_CODES).toContain(code);
      expect(mapSofascoreQueueError({ message: code }).code).toBe(code);
    }
  });

  const client = (data: unknown, error: unknown = null) => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    return {
      calls,
      api: {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          return Promise.resolve({ data, error }) as never;
        },
      },
    };
  };

  test("the repository calls the three RPCs with their arguments", async () => {
    const opts = client({ sofascorePlayerId: "123", query: "fel", players: [option()] });
    expect(
      (await new SupabaseSofascorePlayerQueueRepository(opts.api).listOptions("123", " fel "))
        .players,
    ).toHaveLength(1);
    expect(opts.calls[0]).toEqual({
      name: "admin_sofascore_player_link_options",
      args: { p_sofascore_player_id: "123", p_query: "fel" },
    });
    const squad = client({ sofascorePlayerId: "123", query: null, players: [] });
    await new SupabaseSofascorePlayerQueueRepository(squad.api).listOptions("123");
    expect(squad.calls[0]!.args).toEqual({ p_sofascore_player_id: "123", p_query: null });

    const alias = client({
      sofascorePlayerId: "123",
      playerId: PLAYER,
      primarySofascoreId: "1",
      alreadyLinked: false,
    });
    await new SupabaseSofascorePlayerQueueRepository(alias.api).linkAlias("123", PLAYER);
    expect(alias.calls[0]).toEqual({
      name: "admin_sofascore_link_alias",
      args: { p_sofascore_player_id: "123", p_player_id: PLAYER },
    });

    const created = client({ sofascorePlayerId: "123", playerId: PLAYER, created: true });
    await new SupabaseSofascorePlayerQueueRepository(created.api).createPlayer("123", {
      shirtNumber: 9,
    });
    expect(created.calls[0]).toEqual({
      name: "admin_sofascore_create_player",
      args: { p_sofascore_player_id: "123", p_shirt_number: 9 },
    });
  });

  test("malformed requests never reach the database", async () => {
    const c = client({});
    const repo = new SupabaseSofascorePlayerQueueRepository(c.api);
    await expect(repo.listOptions("123", "x")).rejects.toMatchObject({
      code: "invalid_resolution",
    });
    await expect(repo.linkAlias("123", "not-a-uuid")).rejects.toMatchObject({
      code: "invalid_resolution",
    });
    await expect(repo.createPlayer("", {})).rejects.toMatchObject({ code: "invalid_resolution" });
    expect(c.calls).toHaveLength(0);
  });

  test("the sample: link as second id, create, search; refusals change nothing", async () => {
    const repo = new InMemorySofascorePlayerQueueRepository();
    const before = (await repo.listQueue()).entries;
    const mapped = before.find((e) => e.reason === "candidate_already_mapped")!;
    const result = await repo.linkAlias(mapped.sofascorePlayerId, mapped.candidates[0]!.playerId);
    expect(result.primarySofascoreId).toBe("811111");
    expect(repo.aliased).toHaveLength(1);
    const gamma = before.find((e) => e.sofascorePlayerId === "900004")!;
    const squad = await repo.listOptions(gamma.sofascorePlayerId);
    expect(squad.players.every((p) => p.inClub)).toBe(true);
    expect(squad.players.map((p) => linkOptionAction(p))).toEqual(["link", "alias"]);
    const found = await repo.listOptions(gamma.sofascorePlayerId, "سابع");
    expect(found.players.map((p) => linkOptionAction(p))).toEqual(["none"]);
    await expect(
      repo.linkAlias(gamma.sofascorePlayerId, found.players[0]!.playerId),
    ).rejects.toMatchObject({
      code: "sofascore_alias_needs_primary",
    });
    await repo.createPlayer(gamma.sofascorePlayerId, { name: "Gamma Corrigé" });
    expect(repo.created).toEqual([
      { sofascorePlayerId: "900004", input: { name: "Gamma Corrigé" } },
    ]);
    const alpha = before.find((e) => e.sofascorePlayerId === "900001")!;
    await expect(repo.createPlayer(alpha.sofascorePlayerId, {})).rejects.toMatchObject({
      code: "sofascore_create_no_club",
    });
    expect((await repo.listQueue()).entries).toHaveLength(before.length - 2);
  });
});
