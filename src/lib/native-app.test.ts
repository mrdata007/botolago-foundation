import { describe, expect, test } from "bun:test";

import {
  NATIVE_APP_ATTRIBUTE,
  NATIVE_APP_INIT_SCRIPT,
  nativePlatform,
  type NativeScope,
} from "./native-app";

describe("nativePlatform", () => {
  test("is null in a browser or on the server, where there is no bridge", () => {
    expect(nativePlatform({})).toBeNull();
    // Capacitor's object without a native bridge, as a loaded library in a plain browser has.
    expect(nativePlatform({ Capacitor: {} })).toBeNull();
  });

  test("names the phone from the bridge the shell adds before any site code runs", () => {
    expect(nativePlatform({ androidBridge: {} })).toBe("android");
    expect(nativePlatform({ webkit: { messageHandlers: { bridge: {} } } })).toBe("ios");
    // The shell's own object exists, but the library that says "native" has not loaded yet.
    expect(nativePlatform({ androidBridge: {}, Capacitor: {} })).toBe("android");
  });

  test("a webkit page without Capacitor's bridge handler (an ordinary iPhone browser) is not the app", () => {
    expect(nativePlatform({ webkit: { messageHandlers: {} } })).toBeNull();
    expect(nativePlatform({ webkit: {} })).toBeNull();
  });

  test("once the library has loaded, it decides", () => {
    expect(
      nativePlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } }),
    ).toBe("ios");
    expect(
      nativePlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } }),
    ).toBe("android");
    expect(
      nativePlatform({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }),
    ).toBeNull();
  });

  test("a platform the app does not support is null, and nothing here throws", () => {
    expect(
      nativePlatform({
        Capacitor: { isNativePlatform: () => true, getPlatform: () => "electron" },
      }),
    ).toBeNull();
    expect(
      nativePlatform({
        Capacitor: {
          isNativePlatform: () => {
            throw new Error("boom");
          },
        },
      }),
    ).toBeNull();
  });
});

/** Run the head script against a fake page whose window is `scope`. */
function runHeadScript(scope: NativeScope): string | null {
  const attrs = new Map<string, string>();
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => void attrs.set(name, value) },
  };
  new Function("window", "document", NATIVE_APP_INIT_SCRIPT)(scope, document);
  return attrs.get(NATIVE_APP_ATTRIBUTE) ?? null;
}

describe("the native-app head script", () => {
  test("cannot terminate its own <script> element", () => {
    expect(NATIVE_APP_INIT_SCRIPT).not.toContain("</");
  });

  test("decides exactly what nativePlatform decides, case by case", () => {
    const scopes: NativeScope[] = [
      {},
      { Capacitor: {} },
      { androidBridge: {} },
      { webkit: { messageHandlers: { bridge: {} } } },
      { androidBridge: {}, Capacitor: {} },
      { webkit: { messageHandlers: {} } },
      { webkit: {} },
      { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } },
      { Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } },
      { Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } },
      { Capacitor: { isNativePlatform: () => true, getPlatform: () => "electron" } },
      { Capacitor: { isNativePlatform: () => true } },
      // Capacitor's object says "not native" although a bridge is there: it decides.
      { androidBridge: {}, Capacitor: { isNativePlatform: () => false } },
    ];
    for (const scope of scopes) {
      expect(runHeadScript(scope)).toBe(nativePlatform(scope));
    }
  });

  test("marks nothing in a browser, and never throws out of the head", () => {
    expect(runHeadScript({})).toBeNull();
    expect(
      runHeadScript({
        Capacitor: {
          isNativePlatform: () => {
            throw new Error("boom");
          },
        },
      }),
    ).toBeNull();
  });
});
