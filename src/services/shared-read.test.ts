import { afterEach, describe, expect, test } from "bun:test";

import { forgetSharedReads, SHARED_READ_MS, shareRead } from "./shared-read";

afterEach(() => forgetSharedReads());

function counter(result: () => Promise<string> = async () => "value") {
  let calls = 0;
  return {
    load: () => {
      calls += 1;
      return result();
    },
    calls: () => calls,
  };
}

describe("shared public reads", () => {
  test("reads started together share one request", async () => {
    const read = counter();
    const values = await Promise.all([
      shareRead("k", read.load, { now: 0, inBrowser: true }),
      shareRead("k", read.load, { now: 5, inBrowser: true }),
      shareRead("k", read.load, { now: SHARED_READ_MS - 1, inBrowser: true }),
    ]);
    expect(values).toEqual(["value", "value", "value"]);
    expect(read.calls()).toBe(1);
  });

  test("different keys do not share", async () => {
    const read = counter();
    await shareRead("a", read.load, { now: 0, inBrowser: true });
    await shareRead("b", read.load, { now: 0, inBrowser: true });
    expect(read.calls()).toBe(2);
  });

  test("a read after the window asks again", async () => {
    const read = counter();
    await shareRead("k", read.load, { now: 0, inBrowser: true });
    await shareRead("k", read.load, { now: SHARED_READ_MS, inBrowser: true });
    expect(read.calls()).toBe(2);
  });

  test("a failed read is not handed to the next caller", async () => {
    let fail = true;
    const read = counter(async () => {
      if (fail) throw new Error("upstream 500");
      return "value";
    });
    await expect(shareRead("k", read.load, { now: 0, inBrowser: true })).rejects.toThrow();
    fail = false;
    expect(await shareRead("k", read.load, { now: 1, inBrowser: true })).toBe("value");
    expect(read.calls()).toBe(2);
  });

  test("a server process never shares: it serves many visitors", async () => {
    const read = counter();
    await shareRead("k", read.load, { now: 0, inBrowser: false });
    await shareRead("k", read.load, { now: 1, inBrowser: false });
    expect(read.calls()).toBe(2);
  });
});
