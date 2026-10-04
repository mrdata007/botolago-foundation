import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { patchAppDelegate, patchManifest, prepareNative } from "./prepare-native.mjs";

// The two files as Capacitor 8's templates write them, cut down to what matters.
const APP_DELEGATE = `import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }
}
`;
const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application android:label="@string/app_name">
    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`;

describe("patchAppDelegate", () => {
  test("adds both token methods inside the class, and keeps what was there", () => {
    const { text, changed } = patchAppDelegate(APP_DELEGATE);
    expect(changed).toBe(true);
    expect(text).toContain("didRegisterForRemoteNotificationsWithDeviceToken");
    expect(text).toContain(".capacitorDidRegisterForRemoteNotifications");
    expect(text).toContain("didFailToRegisterForRemoteNotificationsWithError");
    expect(text).toContain(".capacitorDidFailToRegisterForRemoteNotifications");
    expect(text).toContain("func applicationWillTerminate");
    // inside the class: the file still ends with the class's closing brace
    expect(text.trimEnd().endsWith("}")).toBe(true);
    expect(text.indexOf("didRegisterForRemoteNotifications")).toBeLessThan(text.lastIndexOf("}"));
    const braces = (value: string) => [value.split("{").length, value.split("}").length];
    const [open, close] = braces(text);
    expect(open).toBe(close);
  });

  test("changes nothing the second time", () => {
    const once = patchAppDelegate(APP_DELEGATE).text;
    const again = patchAppDelegate(once);
    expect(again.changed).toBe(false);
    expect(again.text).toBe(once);
  });

  test("leaves a file that already hands the token over alone", () => {
    const already = APP_DELEGATE.replace(
      /\}\n$/,
      `    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}
`,
    );
    expect(patchAppDelegate(already)).toEqual({ text: already, changed: false });
  });

  test("refuses a file that is not an AppDelegate", () => {
    expect(() => patchAppDelegate("print('hello')\n")).toThrow();
  });
});

describe("patchManifest", () => {
  test("declares the notification permission next to the internet one", () => {
    const { text, changed } = patchManifest(MANIFEST);
    expect(changed).toBe(true);
    expect(text).toContain(
      '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    );
    expect(text.indexOf("INTERNET")).toBeLessThan(text.indexOf("POST_NOTIFICATIONS"));
    expect(text).toContain("</manifest>");
    expect(text.split("POST_NOTIFICATIONS")).toHaveLength(2);
  });

  test("changes nothing the second time", () => {
    const once = patchManifest(MANIFEST).text;
    expect(patchManifest(once)).toEqual({ text: once, changed: false });
  });

  test("still works when the internet permission is not there", () => {
    const bare = MANIFEST.replace(/ *<uses-permission[^>]*\/>\n/, "");
    const { text } = patchManifest(bare);
    expect(text).toContain("POST_NOTIFICATIONS");
    expect(text.trimEnd().endsWith("</manifest>")).toBe(true);
  });
});

describe("prepareNative", () => {
  function project(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), "botolago-native-"));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  }
  const FILES = {
    "ios/App/App/AppDelegate.swift": APP_DELEGATE,
    "ios/App/App.xcodeproj/project.pbxproj": "PRODUCT_BUNDLE_IDENTIFIER = com.botolago.app;",
    "android/app/src/main/AndroidManifest.xml": MANIFEST,
  };

  test("patches both projects, then reports them as already done", () => {
    const root = project(FILES);
    const first = prepareNative(root);
    expect(first.report.filter((line) => line.startsWith("added:"))).toHaveLength(2);
    expect(readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8")).toContain(
      "POST_NOTIFICATIONS",
    );
    const second = prepareNative(root);
    expect(second.report.filter((line) => line.startsWith("ok:"))).toHaveLength(2);
  });

  test("tells you about what only a person can do", () => {
    const { report, missing } = prepareNative(project(FILES));
    expect(missing).toBe(2);
    expect(report.join("\n")).toContain("google-services.json");
    expect(report.join("\n")).toContain("Push Notifications capability");
  });

  test("is satisfied once those are done", () => {
    const root = project({
      ...FILES,
      "ios/App/App.xcodeproj/project.pbxproj":
        "CODE_SIGN_ENTITLEMENTS = App/App.entitlements; PRODUCT_BUNDLE_IDENTIFIER = com.botolago.app;",
      "android/app/google-services.json": "{}",
    });
    expect(prepareNative(root).missing).toBe(0);
  });

  test("--check changes nothing and counts what is missing", () => {
    const root = project(FILES);
    const { report, missing } = prepareNative(root, { check: true });
    expect(report.filter((line) => line.startsWith("MISSING:")).length).toBe(missing);
    expect(missing).toBe(4);
    expect(readFileSync(join(root, "ios/App/App/AppDelegate.swift"), "utf8")).toBe(APP_DELEGATE);
    expect(readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8")).toBe(
      MANIFEST,
    );
  });

  test("a project that was never created is skipped, not an error", () => {
    const { report, missing } = prepareNative(project({}));
    expect(missing).toBe(0);
    expect(report.every((line) => line.startsWith("skipped:"))).toBe(true);
  });
});
