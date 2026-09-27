import { afterEach, describe, expect, test } from "bun:test";

import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import {
  forgetSharedFantasyHub,
  HUB_SHARE_MS,
  readSharedFantasyHub,
  shareFantasyHub,
} from "./fantasy-hub-share";

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

/** A clock the tests move by hand. */
function clock(start = 1_000_000) {
  let time = start;
  return { now: () => time, advance: (ms: number) => void (time += ms) };
}

afterEach(() => forgetSharedFantasyHub());

describe("one Fantasy hub read per screen", () => {
  test("reads a screen starts together share one request", async () => {
    const hub = counter();
    const { now } = clock();
    const reads = await Promise.all([
      shareFantasyHub(hub.load, { identity: "u1", now, inBrowser: true }),
      shareFantasyHub(hub.load, { identity: "u1", now, inBrowser: true }),
      shareFantasyHub(hub.load, { identity: "u1", now, inBrowser: true }),
    ]);
    expect(reads).toEqual([hubValue, hubValue, hubValue]);
    expect(hub.calls()).toBe(1);
  });

  test("a read in flight is joined however long it has been on its way", async () => {
    let answer: (hub: FantasyHubDto) => void = () => {};
    const hub = counter(() => new Promise((resolve) => (answer = resolve)));
    const time = clock();
    const first = shareFantasyHub(hub.load, { identity: "u1", now: time.now, inBrowser: true });
    time.advance(HUB_SHARE_MS * 2);
    const second = shareFantasyHub(hub.load, { identity: "u1", now: time.now, inBrowser: true });
    answer(hubValue);
    expect(await Promise.all([first, second])).toEqual([hubValue, hubValue]);
    expect(hub.calls()).toBe(1);
  });

  test("a resolved read is handed out for the window after it arrived, then asked again", async () => {
    const hub = counter();
    const time = clock();
    await shareFantasyHub(hub.load, { identity: "u1", now: time.now, inBrowser: true });
    time.advance(HUB_SHARE_MS - 1);
    await shareFantasyHub(hub.load, { identity: "u1", now: time.now, inBrowser: true });
    expect(hub.calls()).toBe(1);
    time.advance(1);
    await shareFantasyHub(hub.load, { identity: "u1", now: time.now, inBrowser: true });
    expect(hub.calls()).toBe(2);
  });

  test("a save or a sign-in forgets the shared read", async () => {
    const hub = counter();
    const { now } = clock();
    await shareFantasyHub(hub.load, { identity: "u1", now, inBrowser: true });
    forgetSharedFantasyHub();
    await shareFantasyHub(hub.load, { identity: "u1", now, inBrowser: true });
    expect(hub.calls()).toBe(2);
  });

  test("a failed read is not handed to the next caller", async () => {
    let fail = true;
    const hub = counter(async () => {
      if (fail) throw new Error("upstream 500");
      return hubValue;
    });
    const { now } = clock();
    await expect(
      shareFantasyHub(hub.load, { identity: "u1", now, inBrowser: true }),
    ).rejects.toThrow();
    fail = false;
    expect(await shareFantasyHub(hub.load, { identity: "u1", now, inBrowser: true })).toBe(
      hubValue,
    );
    expect(hub.calls()).toBe(2);
  });

  test("on the server every caller reads for themselves", async () => {
    const hub = counter();
    await shareFantasyHub(hub.load, { identity: "u1", inBrowser: false });
    await shareFantasyHub(hub.load, { identity: "u1", inBrowser: false });
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
    const { now } = clock();
    expect(await shareFantasyHub(hub.load, { identity: "a", now, inBrowser: true })).toBe(managerA);
    signedIn = managerB; // B signs in; no cleanup has run yet
    expect(await shareFantasyHub(hub.load, { identity: "b", now, inBrowser: true })).toBe(managerB);
    expect(
      await shareFantasyHub(hub.load, { identity: "anonymous", now, inBrowser: true }),
    ).not.toBe(managerA);
    expect(hub.calls()).toBe(3);
  });

  test("the same account inside the window still shares", async () => {
    const hub = counter();
    const time = clock();
    await shareFantasyHub(hub.load, { identity: "b", now: time.now, inBrowser: true });
    time.advance(10);
    await shareFantasyHub(hub.load, { identity: "b", now: time.now, inBrowser: true });
    expect(hub.calls()).toBe(1);
  });
});

describe("the owned snapshot shares the screen's read, for its own account only", () => {
  test("the runtime's read and the owned read for the same session are one request", async () => {
    const hub = counter();
    const readIdentity = async () => "user-1";
    await readSharedFantasyHub(hub.load, { readIdentity, inBrowser: true });
    await readSharedFantasyHub(hub.load, { owner: "user-1", readIdentity, inBrowser: true });
    expect(hub.calls()).toBe(1);
  });

  test("a session that is no longer the owner's reads on its own, and is not shared", async () => {
    const hub = counter();
    let session = "user-1";
    const readIdentity = async () => session;
    await readSharedFantasyHub(hub.load, { readIdentity, inBrowser: true });
    session = "user-2"; // another tab signed user-2 in; this provider still says user-1
    await readSharedFantasyHub(hub.load, { owner: "user-1", readIdentity, inBrowser: true });
    expect(hub.calls()).toBe(2);
    // user-2's own read does not get user-1's entry, nor the unshared one.
    await readSharedFantasyHub(hub.load, { owner: "user-2", readIdentity, inBrowser: true });
    expect(hub.calls()).toBe(3);
  });

  test("an unreadable session never shares", async () => {
    const hub = counter();
    let n = 0;
    const readIdentity = async () => `unknown:${++n}`;
    await readSharedFantasyHub(hub.load, { readIdentity, inBrowser: true });
    await readSharedFantasyHub(hub.load, { readIdentity, inBrowser: true });
    expect(hub.calls()).toBe(2);
  });
});
