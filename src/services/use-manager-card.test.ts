import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { ManagerCardError } from "@/backend/manager-card/errors";
import { FIXTURES } from "@/backend/manager-card/fixtures";
import { readAckedMoments } from "@/components/manager-card/storage";
import type { MyCardDto } from "@/backend/manager-card/contracts";

import { STATUS_OFF, managerCardStatusKey } from "./manager-card-status";
import {
  acknowledgeMoments,
  fetchMyCard,
  invalidateMyManagerCard,
  managerCardKeys,
} from "./use-manager-card";

// Test files share one process: give this one its own `window`, and put the process back as found.
const globals = globalThis as { window?: unknown };
const previous = globals.window;
const store = new Map<string, string>();
beforeEach(() => {
  globals.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
});
afterEach(() => {
  store.clear();
  if (previous === undefined) delete globals.window;
  else globals.window = previous;
});

const ON = { enabled: true, minRated: 3, minConfirmed: 5 };
const card = FIXTURES.launchArrival.card as MyCardDto;
const keys = card.moments.map((moment) => moment.key);

function service(
  answer: Awaited<ReturnType<typeof import("./manager-card").managerCardService.myCard>>,
) {
  const acks: string[][] = [];
  return {
    acks,
    service: {
      myCard: async () => answer,
      ackMoments: async (list: readonly string[]) => {
        acks.push([...list]);
        return { acknowledged: [...list], ignored: [] };
      },
    },
  };
}

describe("the query keys", () => {
  it("are the plan's, with the team ids sorted", () => {
    expect(managerCardKeys.status).toEqual(managerCardStatusKey);
    expect(managerCardKeys.me("u")).toEqual(["manager-card", "me", "u"]);
    expect(managerCardKeys.cards(["b", "a"])).toEqual(["manager-card", "cards", "a,b"]);
    expect(managerCardKeys.history("u", null)).toEqual(["manager-card", "history", "u", null]);
    // An account's id is in its keys, so signing out forgets them (`forgetAccountQueries`).
    expect(managerCardKeys.me("u")).toContain("u");
    expect(managerCardKeys.history("u", "s")).toContain("u");
  });
});

describe("fetchMyCard", () => {
  it("returns the card, or null for an account with none", async () => {
    const queryClient = new QueryClient();
    expect(
      (await fetchMyCard(queryClient, "u", undefined, service({ available: true, card }).service))
        ?.ovr,
    ).toBe(84);
    expect(
      await fetchMyCard(
        queryClient,
        "u",
        undefined,
        service({ available: true, card: null }).service,
      ),
    ).toBeNull();
  });

  it("flips the cached status off, and fails as unavailable, when the answer is 'switched off'", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(managerCardStatusKey, ON);
    await expect(
      fetchMyCard(queryClient, "u", undefined, service({ available: false }).service),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(queryClient.getQueryData(managerCardStatusKey)).toEqual(STATUS_OFF);
  });

  it("maps a failed read to a ManagerCardError", async () => {
    const queryClient = new QueryClient();
    const failing = {
      myCard: async () => {
        throw new TypeError("Failed to fetch");
      },
      ackMoments: async () => ({ acknowledged: [], ignored: [] }),
    };
    const error = await fetchMyCard(queryClient, "u", undefined, failing).catch((e) => e);
    expect(error).toBeInstanceOf(ManagerCardError);
    expect(error.code).toBe("network");
  });

  it("sends again an acknowledgement the phone made and the server never got", async () => {
    const queryClient = new QueryClient();
    store.set("botolago.card.moments.v1", JSON.stringify([`u|${keys[0]}`]));
    const { service: svc, acks } = service({ available: true, card });
    await fetchMyCard(queryClient, "u", undefined, svc);
    await Promise.resolve();
    expect(acks).toEqual([[keys[0]!]]);
    // Another account's acknowledgement is not this one's.
    acks.length = 0;
    await fetchMyCard(queryClient, "someone-else", undefined, svc);
    await Promise.resolve();
    expect(acks).toEqual([]);
  });
});

describe("acknowledgeMoments", () => {
  it("writes the phone first, empties the cached card's moments, then makes one call", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(managerCardKeys.me("u"), card);
    const { service: svc, acks } = service({ available: true, card });
    let phoneHadThemWhenSent: string[] = [];
    const watching = {
      ackMoments: async (list: readonly string[]) => {
        phoneHadThemWhenSent = readAckedMoments("u");
        return svc.ackMoments(list);
      },
    };
    await acknowledgeMoments(queryClient, "u", keys, watching);
    expect(phoneHadThemWhenSent).toEqual(keys);
    expect(acks).toEqual([keys]);
    expect(queryClient.getQueryData<MyCardDto>(managerCardKeys.me("u"))?.moments).toEqual([]);
    expect(readAckedMoments("u")).toEqual(keys);
  });

  it("acknowledges a coalesced hero's every key in one call", async () => {
    const queryClient = new QueryClient();
    const { service: svc, acks } = service({ available: true, card });
    await acknowledgeMoments(
      queryClient,
      "u",
      ["card_created", "first_rating:s", "provisional_cleared:s"],
      svc,
    );
    expect(acks).toHaveLength(1);
    expect(acks[0]).toHaveLength(3);
  });

  it("never throws, keeps what the phone wrote, and sends nothing for no keys", async () => {
    const queryClient = new QueryClient();
    const failing = {
      ackMoments: async () => {
        throw new Error("down");
      },
    };
    await acknowledgeMoments(queryClient, "u", ["card_created"], failing);
    expect(readAckedMoments("u")).toEqual(["card_created"]);
    const { service: svc, acks } = service({ available: true, card });
    await acknowledgeMoments(queryClient, "u", [], svc);
    expect(acks).toEqual([]);
  });

  it("splits more keys than the server takes, in order", async () => {
    const queryClient = new QueryClient();
    const { service: svc, acks } = service({ available: true, card });
    const many = Array.from({ length: 20 }, (_, i) => `first_rating:${i}`);
    await acknowledgeMoments(queryClient, "u", many, svc);
    expect(acks.map((list) => list.length)).toEqual([16, 4]);
    expect(acks.flat()).toEqual(many);
  });
});

describe("invalidateMyManagerCard", () => {
  it("marks the card and history stale and touches nothing else", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(managerCardKeys.me("u"), card);
    queryClient.setQueryData(managerCardStatusKey, ON);
    invalidateMyManagerCard(queryClient);
    expect(queryClient.getQueryState(managerCardKeys.me("u"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(managerCardStatusKey)?.isInvalidated).toBe(false);
  });
});
