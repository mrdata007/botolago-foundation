import { describe, expect, test } from "bun:test";

import { nativePlatform } from "./native-app";

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
