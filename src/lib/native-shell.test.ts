import { afterEach, describe, expect, test } from "bun:test";
import { installNativeShell, isNativeShell } from "./native-shell";

const g = globalThis as unknown as { window?: unknown };
const original = g.window;

afterEach(() => {
  g.window = original;
});

describe("native shell", () => {
  test("is off on the web", () => {
    g.window = {};
    expect(isNativeShell()).toBe(false);
    expect(() => installNativeShell()()).not.toThrow();
  });

  test("is off when Capacitor reports a web platform", () => {
    g.window = { Capacitor: { isNativePlatform: () => false } };
    expect(isNativeShell()).toBe(false);
  });

  test("is on inside the phone app", () => {
    g.window = { Capacitor: { isNativePlatform: () => true } };
    expect(isNativeShell()).toBe(true);
  });
});
