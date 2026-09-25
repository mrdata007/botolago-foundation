import { afterEach, describe, expect, test } from "bun:test";

import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { forgetSharedFantasyHub, HUB_SHARE_MS, shareFantasyHub } from "./fantasy-hub-share";

const hubValue = { season: { id: "season" } } as unknown as FantasyHubDto;

function counter(result: () => Promise<FantasyHubDto> = async () => hubValue) {
  let calls = 0;
  return {
    load: () => {
      calls += 1;
      return result();
    },
    calls: () => calls,
  };
}

afterEach(() => forgetSharedFantasyHub());

describe("one Fantasy hub read per screen", () => {
  test("reads a screen starts together share one request", async () => {
    const hub = counter();
    const at = 1_000_000;
    const reads = await Promise.all([
      shareFantasyHub(hub.load, { identity: "u1", now: at, inBrowser: true }),
      shareFantasyHub(hub.load, { identity: "u1", now: at + 5, inBrowser: true }),
      shareFantasyHub(hub.load, { identity: "u1", now: at + HUB_SHARE_MS - 1, inBrowser: true }),
    ]);
    expect(reads).toEqual([hubValue, hubValue, hubValue]);
    expect(hub.calls()).toBe(1);
  });

  test("a read after the window asks again", async () => {
    const hub = counter();
    await shareFantasyHub(hub.load, { identity: "u1", now: 0, inBrowser: true });
    await shareFantasyHub(hub.load, { identity: "u1", now: HUB_SHARE_MS, inBrowser: true });
    expect(hub.calls()).toBe(2);
  });

  test("a save or a sign-in forgets the shared read", async () => {
    const hub = counter();
    await shareFantasyHub(hub.load, { identity: "u1", now: 0, inBrowser: true });
    forgetSharedFantasyHub();
    await shareFantasyHub(hub.load, { identity: "u1", now: 1, inBrowser: true });
    expect(hub.calls()).toBe(2);
  });

  test("a failed read is not handed to the next caller", async () => {
    let fail = true;
    const hub = counter(async () => {
      if (fail) throw new Error("upstream 500");
      return hubValue;
    });
    await expect(
      shareFantasyHub(hub.load, { identity: "u1", now: 0, inBrowser: true }),
    ).rejects.toThrow();
    fail = false;
    expect(await shareFantasyHub(hub.load, { identity: "u1", now: 1, inBrowser: true })).toBe(
      hubValue,
    );
    expect(hub.calls()).toBe(2);
  });

  test("on the server every caller reads for themselves", async () => {
    const hub = counter();
    await shareFantasyHub(hub.load, { identity: "u1", now: 0, inBrowser: false });
    await shareFantasyHub(hub.load, { identity: "u1", now: 0, inBrowser: false });
    expect(hub.calls()).toBe(2);
  });

  // PR #199 review: a read for another account inside the window must never
  // receive the previous account's hub (it carries that manager's team),
  // whether or not anything has forgotten the shared read yet.
  test("an account switch inside the window reads afresh, never the other account's hub", async () => {
    const managerA = {
      season: { id: "season" },
      team: { id: "team-a" },
    } as unknown as FantasyHubDto;
    const managerB = {
      season: { id: "season" },
      team: { id: "team-b" },
    } as unknown as FantasyHubDto;
    let signedIn = managerA;
    const hub = counter(async () => signedIn);
    expect(await shareFantasyHub(hub.load, { identity: "a", now: 0, inBrowser: true })).toBe(
      managerA,
    );
    signedIn = managerB; // B signs in; no cleanup has run yet
    expect(await shareFantasyHub(hub.load, { identity: "b", now: 1, inBrowser: true })).toBe(
      managerB,
    );
    expect(
      await shareFantasyHub(hub.load, { identity: "anonymous", now: 2, inBrowser: true }),
    ).not.toBe(managerA);
    expect(hub.calls()).toBe(3);
  });

  test("the same account inside the window still shares", async () => {
    const hub = counter();
    await shareFantasyHub(hub.load, { identity: "b", now: 0, inBrowser: true });
    await shareFantasyHub(hub.load, { identity: "b", now: 10, inBrowser: true });
    expect(hub.calls()).toBe(1);
  });
});
