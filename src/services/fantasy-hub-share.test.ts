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
      shareFantasyHub(hub.load, { now: at, inBrowser: true }),
      shareFantasyHub(hub.load, { now: at + 5, inBrowser: true }),
      shareFantasyHub(hub.load, { now: at + HUB_SHARE_MS - 1, inBrowser: true }),
    ]);
    expect(reads).toEqual([hubValue, hubValue, hubValue]);
    expect(hub.calls()).toBe(1);
  });

  test("a read after the window asks again", async () => {
    const hub = counter();
    await shareFantasyHub(hub.load, { now: 0, inBrowser: true });
    await shareFantasyHub(hub.load, { now: HUB_SHARE_MS, inBrowser: true });
    expect(hub.calls()).toBe(2);
  });

  test("a save or a sign-in forgets the shared read", async () => {
    const hub = counter();
    await shareFantasyHub(hub.load, { now: 0, inBrowser: true });
    forgetSharedFantasyHub();
    await shareFantasyHub(hub.load, { now: 1, inBrowser: true });
    expect(hub.calls()).toBe(2);
  });

  test("a failed read is not handed to the next caller", async () => {
    let fail = true;
    const hub = counter(async () => {
      if (fail) throw new Error("upstream 500");
      return hubValue;
    });
    await expect(shareFantasyHub(hub.load, { now: 0, inBrowser: true })).rejects.toThrow();
    fail = false;
    expect(await shareFantasyHub(hub.load, { now: 1, inBrowser: true })).toBe(hubValue);
    expect(hub.calls()).toBe(2);
  });

  test("on the server every caller reads for themselves", async () => {
    const hub = counter();
    await shareFantasyHub(hub.load, { now: 0, inBrowser: false });
    await shareFantasyHub(hub.load, { now: 0, inBrowser: false });
    expect(hub.calls()).toBe(2);
  });
});
