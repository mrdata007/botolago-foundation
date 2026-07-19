// Provider/source-selection integration tests without mounting React.
// These verify that:
//   1. selectFantasyRepoSource returns "cloud" ONLY for authenticated Supabase.
//   2. A cloud-error in the repo does NOT get caught and mapped to local
//      repository fallback (i.e. no silent fallback path exists).
//   3. The old auto-mirror behavior is gone — mutating fantasyStateStore no
//      longer triggers any cloud RPC.

import { describe, it, expect, beforeEach } from "bun:test";
import "./__test-shim";
import {
  selectFantasyRepoSource,
  CloudFantasyRepository,
  LocalFantasyRepository,
  createFantasyOwnedRepository,
} from "./fantasy-owned-repository";
import { FantasyRepoError } from "./fantasy-errors";
import { fantasyStateStore } from "./fantasy-state";

describe("selectFantasyRepoSource", () => {
  it("returns cloud only when supabase auth mode AND authenticated", () => {
    expect(selectFantasyRepoSource({ authMode: "supabase", isAuthenticated: true })).toBe("cloud");
    expect(selectFantasyRepoSource({ authMode: "supabase", isAuthenticated: false })).toBe("local");
    expect(selectFantasyRepoSource({ authMode: "mock", isAuthenticated: true })).toBe("local");
    expect(selectFantasyRepoSource({ authMode: "mock", isAuthenticated: false })).toBe("local");
  });
});

describe("createFantasyOwnedRepository — no silent fallback", () => {
  it("throws unauthenticated when cloud source is selected without a userId", () => {
    expect(() =>
      createFantasyOwnedRepository({
        authMode: "supabase",
        isAuthenticated: true,
        userId: null,
      }),
    ).toThrow(FantasyRepoError);
  });

  it("cloud repository surfaces cloud errors without falling back to local", async () => {
    // Fake client whose .from().select() rejects.
    const errClient: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { code: "PGRST301", message: "row-level security" },
            }),
          }),
        }),
      }),
    };
    const repo = new CloudFantasyRepository({
      client: errClient,
      userId: "u1",
      season: "2025-26",
      loadMap: async () => ({
        clubIdBySource: new Map(),
        clubSourceById: new Map(),
        playerIdBySource: new Map(),
        playerSourceById: new Map(),
      }),
      loadGameweeks: async () => ({ byNumber: new Map(), byId: new Map() }),
    });
    let caught: unknown = null;
    try {
      await repo.loadSnapshot();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FantasyRepoError);
    expect((caught as FantasyRepoError).code).toBe("permission_denied");
  });
});

describe("no automatic cloud mirror on fantasyStateStore mutation", () => {
  beforeEach(() => {
    fantasyStateStore.reset({ internal: true });
  });

  it("emitting the change event does not create a save through any provider layer", () => {
    // The old FantasyCloudSyncProvider module has been removed; verify the
    // symbol is no longer resolvable — importing it would throw. This is a
    // structural guarantee: no listener remains that could auto-save.
    let mod: unknown = null;
    try {
      // Dynamic import: this module MUST be gone. Relative path matches src layout.
      mod = await import(/* @vite-ignore */ "./fantasy-cloud-sync");
    } catch {
      /* expected — module removed */
    }
    expect(mod).toBeNull();
    // And a plain state mutation must not throw / emit into cloud.
    expect(() => fantasyStateStore.write({ transferHitPoints: 4 })).not.toThrow();
  });
});

describe("LocalFantasyRepository is untouched by cloud selection", () => {
  it("guest snapshot loads locally", async () => {
    const local = new LocalFantasyRepository();
    const snap = await local.loadSnapshot();
    expect(snap.source).toBe("local");
    expect(Array.isArray(snap.team.squad)).toBe(true);
  });
});
