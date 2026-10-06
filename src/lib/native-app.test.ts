import { describe, expect, test } from "bun:test";

import {
  NATIVE_APP_ATTRIBUTE,
  NATIVE_APP_INIT_SCRIPT,
  nativePlatform,
  nativePluginAvailable,
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

describe("nativePluginAvailable", () => {
  const HEADERS = [{ name: "Share" }, { name: "Filesystem" }];

  test("reads the list of plugins the shell was built with", () => {
    const android = { androidBridge: {}, Capacitor: { PluginHeaders: HEADERS } };
    expect(nativePluginAvailable("Share", android)).toBe(true);
    expect(nativePluginAvailable("Filesystem", android)).toBe(true);
    expect(nativePluginAvailable("Media", android)).toBe(false);
    const ios = {
      webkit: { messageHandlers: { bridge: {} } },
      Capacitor: { PluginHeaders: HEADERS },
    };
    expect(nativePluginAvailable("Share", ios)).toBe(true);
  });

  test("an app built before the plugin was added does not have it", () => {
    const older = { androidBridge: {}, Capacitor: { PluginHeaders: [{ name: "App" }] } };
    expect(nativePluginAvailable("Share", older)).toBe(false);
    expect(nativePluginAvailable("Share", { androidBridge: {} })).toBe(false);
  });

  test("is false in a browser, even where Capacitor's library says a web version exists", () => {
    expect(nativePluginAvailable("Share", {})).toBe(false);
    expect(
      nativePluginAvailable("Share", {
        Capacitor: {
          isNativePlatform: () => false,
          getPlatform: () => "web",
          isPluginAvailable: () => true,
          PluginHeaders: HEADERS,
        },
      }),
    ).toBe(false);
  });

  test("trusts the list over the shell's isPluginAvailable, which says no until the library loads", () => {
    // Capacitor's native bridge answers from `Capacitor.Plugins`, which stays
    // empty until the library registers a plugin.
    const beforeLibrary = {
      androidBridge: {},
      Capacitor: { PluginHeaders: HEADERS, isPluginAvailable: () => false },
    };
    expect(nativePluginAvailable("Share", beforeLibrary)).toBe(true);
    const noList = {
      androidBridge: {},
      Capacitor: { isPluginAvailable: (name: string) => name === "Share" },
    };
    expect(nativePluginAvailable("Share", noList)).toBe(true);
    expect(nativePluginAvailable("Media", noList)).toBe(false);
  });

  test("nothing here throws", () => {
    expect(
      nativePluginAvailable("Share", {
        androidBridge: {},
        Capacitor: {
          isPluginAvailable: () => {
            throw new Error("boom");
          },
        },
      }),
    ).toBe(false);
    expect(
      nativePluginAvailable("Share", {
        androidBridge: {},
        Capacitor: { PluginHeaders: [null as never, { name: "Share" }] },
      }),
    ).toBe(true);
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
