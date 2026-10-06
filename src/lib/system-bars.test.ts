import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { nativePlatform, type NativeScope } from "./native-app";
import {
  createSystemBarsSync,
  iconsForTheme,
  type SystemBarsModule,
  type SystemBarsSync,
} from "./system-bars";

const ROOT = join(import.meta.dir, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/**
 * A stand-in for Capacitor: the page's bridge markers (read by the real
 * `nativePlatform`) and a `@capacitor/core` whose `SystemBars.setStyle`
 * records what it is sent. The enum values are Capacitor 8's own; the test at
 * the bottom pins them, and what the native sides do with them, against the
 * installed sources. The real library is not imported here: evaluating it puts
 * a `Capacitor` object on `globalThis` for every test that runs after.
 */
const SCOPES: Record<"web" | "ios" | "android", NativeScope> = {
  web: {},
  ios: { webkit: { messageHandlers: { bridge: {} } } },
  android: { androidBridge: {} },
};

type Sent = { style: string; bar?: string };

function harness(where: keyof typeof SCOPES, failures = 0) {
  const sent: Sent[] = [];
  let loads = 0;
  let failing = failures;
  const module = {
    SystemBars: {
      setStyle: async (options: Sent) => {
        if (failing > 0) {
          failing -= 1;
          throw new Error("bridge said no");
        }
        sent.push(options);
      },
    },
    SystemBarsStyle: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" },
    SystemBarType: { StatusBar: "StatusBar", NavigationBar: "NavigationBar" },
  } as unknown as SystemBarsModule;
  const bars: SystemBarsSync = createSystemBarsSync({
    platform: () => nativePlatform(SCOPES[where]),
    load: async () => {
      loads += 1;
      return module;
    },
  });
  return { bars, sent, loads: () => loads };
}

/** Let the queued calls run (each is a few promise hops). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("system bars: which icons", () => {
  test("dark icons on the light theme, light icons on the dark theme", () => {
    expect(iconsForTheme("light")).toBe("dark");
    expect(iconsForTheme("dark")).toBe("light");
  });
});

describe("system bars: in a browser", () => {
  test("nothing is loaded and nothing is called, whatever happens", async () => {
    const { bars, sent, loads } = harness("web");
    bars.setTheme("light");
    bars.setTheme("dark");
    const release = bars.holdDarkBand();
    bars.setTheme("light");
    release();
    await settle();
    expect(loads()).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe("system bars: on an iPhone", () => {
  test("start-up, a choice and a system change each send the theme's style, once", async () => {
    const { bars, sent } = harness("ios");
    bars.setTheme("light"); // start-up: the theme the head script applied
    await settle();
    expect(sent).toEqual([{ style: "LIGHT" }]);
    bars.setTheme("dark"); // Profile > Apparence > Sombre
    await settle();
    bars.setTheme("light"); // the phone turned light while Système is chosen
    await settle();
    // Light icons are Capacitor's `Dark`, dark icons its `Light`. No `bar`:
    // the iPhone's setStyle ignores it and styles the status bar.
    expect(sent).toEqual([{ style: "LIGHT" }, { style: "DARK" }, { style: "LIGHT" }]);
  });

  test("the same theme again sends nothing", async () => {
    const { bars, sent } = harness("ios");
    bars.setTheme("dark");
    bars.setTheme("dark");
    await settle();
    bars.setTheme("dark");
    await settle();
    expect(sent).toEqual([{ style: "DARK" }]);
  });

  test("nothing is sent before the theme on screen is known", async () => {
    const { bars, sent, loads } = harness("ios");
    await settle();
    expect(loads()).toBe(0);
    expect(sent).toEqual([]);
  });

  test("a dark band keeps light icons whatever the theme, and letting go restores the theme's", async () => {
    const { bars, sent } = harness("ios");
    bars.setTheme("light");
    await settle();
    const release = bars.holdDarkBand(); // the sign-in screen opens
    await settle();
    bars.setTheme("dark"); // still light icons: nothing new to send
    await settle();
    bars.setTheme("light");
    await settle();
    expect(sent).toEqual([{ style: "LIGHT" }, { style: "DARK" }]);
    release();
    await settle();
    expect(sent.at(-1)).toEqual({ style: "LIGHT" });
    expect(sent).toHaveLength(3);
  });

  test("bands nest, and releasing one twice changes nothing", async () => {
    const { bars, sent } = harness("ios");
    bars.setTheme("light");
    await settle();
    const splash = bars.holdDarkBand();
    const landing = bars.holdDarkBand();
    splash();
    splash();
    await settle();
    expect(sent).toEqual([{ style: "LIGHT" }, { style: "DARK" }]);
    landing();
    await settle();
    expect(sent).toEqual([{ style: "LIGHT" }, { style: "DARK" }, { style: "LIGHT" }]);
  });

  test("a band held before the theme is known (a screen mounts first) is sent at once", async () => {
    const { bars, sent } = harness("ios");
    const release = bars.holdDarkBand();
    await settle();
    expect(sent).toEqual([{ style: "DARK" }]);
    bars.setTheme("light");
    await settle();
    expect(sent).toEqual([{ style: "DARK" }]);
    release();
    await settle();
    expect(sent).toEqual([{ style: "DARK" }, { style: "LIGHT" }]);
  });

  test("changes apart arrive in order, the last one last", async () => {
    const { bars, sent } = harness("ios");
    for (const theme of ["light", "dark", "light", "dark"] as const) {
      bars.setTheme(theme);
      await settle();
    }
    expect(sent.map((s) => s.style)).toEqual(["LIGHT", "DARK", "LIGHT", "DARK"]);
  });

  test("changes made in one go are settled together: only where they end up is sent", async () => {
    const { bars, sent } = harness("ios");
    bars.setTheme("light");
    bars.setTheme("dark");
    bars.setTheme("light");
    bars.setTheme("dark");
    await settle();
    expect(sent).toEqual([{ style: "DARK" }]);
  });

  test("one sign-in screen to the next (a release and a hold together) sends nothing", async () => {
    const { bars, sent } = harness("ios");
    bars.setTheme("light");
    await settle();
    const login = bars.holdDarkBand();
    await settle();
    expect(sent).toEqual([{ style: "LIGHT" }, { style: "DARK" }]);
    // React unmounts the old AuthShell and mounts the new one in one commit;
    // StrictMode does the same to every mount in development.
    login();
    const register = bars.holdDarkBand();
    await settle();
    expect(sent).toEqual([{ style: "LIGHT" }, { style: "DARK" }]);
    register();
    await settle();
    expect(sent.at(-1)).toEqual({ style: "LIGHT" });
  });

  test("a failed call is tried again on the next change, and never throws", async () => {
    const { bars, sent } = harness("ios", 1);
    bars.setTheme("dark");
    await settle();
    expect(sent).toEqual([]);
    bars.setTheme("dark"); // not a new theme, but the last one never arrived
    await settle();
    expect(sent).toEqual([{ style: "DARK" }]);
  });

  test("a library that will not load is tried again on the next change", async () => {
    const sent: Sent[] = [];
    let attempts = 0;
    const bars = createSystemBarsSync({
      platform: () => "ios",
      load: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("chunk failed");
        return {
          SystemBars: { setStyle: async (o: Sent) => void sent.push(o) },
          SystemBarsStyle: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" },
          SystemBarType: { StatusBar: "StatusBar", NavigationBar: "NavigationBar" },
        } as unknown as SystemBarsModule;
      },
    });
    bars.setTheme("light");
    await settle();
    bars.setTheme("light");
    await settle();
    expect(attempts).toBe(2);
    expect(sent).toEqual([{ style: "LIGHT" }]);
  });
});

describe("system bars: on Android", () => {
  test("the status and navigation bars each get the theme's style", async () => {
    const { bars, sent } = harness("android");
    bars.setTheme("dark");
    await settle();
    expect(sent).toEqual([
      { style: "DARK", bar: "StatusBar" },
      { style: "DARK", bar: "NavigationBar" },
    ]);
    bars.setTheme("light");
    await settle();
    expect(sent.slice(2)).toEqual([
      { style: "LIGHT", bar: "StatusBar" },
      { style: "LIGHT", bar: "NavigationBar" },
    ]);
  });

  test("a dark band reaches only the status bar; the navigation bar stays on the theme", async () => {
    const { bars, sent } = harness("android");
    bars.setTheme("light");
    await settle();
    const release = bars.holdDarkBand();
    await settle();
    expect(sent.slice(2)).toEqual([
      { style: "DARK", bar: "StatusBar" },
      { style: "LIGHT", bar: "NavigationBar" },
    ]);
    release();
    await settle();
    expect(sent.slice(4)).toEqual([
      { style: "LIGHT", bar: "StatusBar" },
      { style: "LIGHT", bar: "NavigationBar" },
    ]);
  });

  test("before the theme is known, a band sends the status bar alone", async () => {
    const { bars, sent } = harness("android");
    bars.holdDarkBand();
    await settle();
    expect(sent).toEqual([{ style: "DARK", bar: "StatusBar" }]);
  });
});

describe("system bars: Capacitor's naming, read from the installed sources", () => {
  // The whole mapping rests on `Dark` meaning light icons. Pinned against the
  // library and both native implementations, so an upgrade that changed any
  // of them fails here rather than on a phone.
  const core = read("node_modules/@capacitor/core/types/core-plugins.d.ts");
  const ios = read("node_modules/@capacitor/ios/Capacitor/Capacitor/Plugins/SystemBars.swift");
  const android = read(
    "node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java",
  );

  test("the enum: Dark is light content on a dark background, Light the reverse", () => {
    expect(core).toMatch(/Light system bar content on a dark background\.[\s\S]*?Dark = "DARK"/);
    expect(core).toMatch(/dark system bar content on a light background\.[\s\S]*?Light = "LIGHT"/);
    expect(core).toMatch(/StatusBar = "StatusBar"/);
    expect(core).toMatch(/NavigationBar = "NavigationBar"/);
  });

  test("iOS draws DARK as light content, LIGHT as dark content, and ignores bar", () => {
    expect(ios).toMatch(/case \.dark:\s*newStyle = \.lightContent/);
    expect(ios).toMatch(/case \.light:\s*newStyle = \.darkContent/);
    expect(ios).toMatch(
      /@objc func setStyle\(_ call: CAPPluginCall\) \{\s*setStyle\(style: call\.getString\("style"\)/,
    );
  });

  test("Android draws DARK with light icons, per bar when one is named", () => {
    expect(android).toContain("setAppearanceLightStatusBars(!style.equals(STYLE_DARK))");
    expect(android).toContain("setAppearanceLightNavigationBars(!style.equals(STYLE_DARK))");
    expect(android).toContain('BAR_STATUS_BAR = "StatusBar"');
    expect(android).toContain('BAR_GESTURE_BAR = "NavigationBar"');
  });
});

describe("system bars: wired into the app", () => {
  test("the theme provider sends the resolved theme on every change", () => {
    const provider = read("src/theme/provider.tsx");
    // One effect on `resolved`, which start-up, a choice and a system change
    // under "system" all set.
    expect(provider).toMatch(
      /useEffect\(\(\) => \{\s*if \(!DARK_MODE_ENABLED\) systemBars\.setTheme\("light"\);\s*else if \(isHydrated\) systemBars\.setTheme\(resolved\);\s*\}, \[resolved, isHydrated\]\);/,
    );
    expect(provider.match(/setResolved\(/g)).toHaveLength(3);
    expect(provider).toContain("setResolved(readAppliedTheme())");
    expect(provider.match(/applyResolvedTheme\(next\);\s*setResolved\(next\);/g)).toHaveLength(2);
  });

  test.each([
    ["src/components/auth/AuthShell.tsx", "useDarkStatusBand();"],
    ["src/components/landing/LandingPage.tsx", "useDarkStatusBand();"],
    ["src/components/splash/SplashScreen.tsx", "const releaseBand = systemBars.holdDarkBand();"],
  ])("%s holds light icons over its dark top", (file, call) => {
    expect(read(file)).toContain(call);
  });

  test("the splash lets go when it leaves, and holds nothing on a load without it", () => {
    const splash = read("src/components/splash/SplashScreen.tsx");
    const hold = splash.indexOf("systemBars.holdDarkBand()");
    expect(splash.indexOf("if (shownAt === null)")).toBeLessThan(hold);
    expect(splash.slice(hold)).toMatch(/return \(\) => \{[^}]*releaseBand\(\);/);
  });

  test("nothing in src imports a Capacitor library up front, so a browser never loads one", () => {
    const SRC = join(ROOT, "src");
    const eager = [...new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: SRC })]
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .flatMap((file) =>
        [
          ...readFileSync(join(SRC, file), "utf8").matchAll(
            /^import\s+(?!type\b)[^;]*?from\s+["']@capacitor\/[^"']+["']/gm,
          ),
        ].map((m) => `${file}: ${m[0]}`),
      );
    expect(eager).toEqual([]);
  });
});
