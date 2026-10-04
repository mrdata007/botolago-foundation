// Finishes the native projects `cap add` creates, for push alerts.
//
// Capacitor generates the iPhone and Android projects from templates that do
// not carry two things the BotolaGO push alerts need, and a person doing it by
// hand forgets them (a missing one fails silently: no prompt, no alert):
//
//   iPhone   AppDelegate.swift must pass the token Apple gives the app on to
//            Capacitor (two methods, from the push plugin's own instructions).
//   Android  AndroidManifest.xml must declare POST_NOTIFICATIONS. Without it
//            Android 13 and later never show the permission prompt.
//
// This adds both, and only both, and is safe to run again: it changes nothing
// that is already there. It also says what it cannot do for you (the push
// capability in Xcode, Firebase's google-services.json).
//
//   bun scripts/mobile/prepare-native.mjs            # patch ios/ and android/
//   bun scripts/mobile/prepare-native.mjs --check    # change nothing, exit 1 if anything is missing
//
// Run it after `bunx cap add ios` / `bunx cap add android`. See docs/mobile/PHONE_APP.md.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP_DELEGATE_METHODS = `
    // Push alerts: hands Apple's token (or its failure) to Capacitor's push plugin.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;

const POST_NOTIFICATIONS =
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />';

/** `source` with the two token methods added to the AppDelegate class, if they are not there. */
export function patchAppDelegate(source) {
  if (
    source.includes(".capacitorDidRegisterForRemoteNotifications") &&
    source.includes(".capacitorDidFailToRegisterForRemoteNotifications")
  ) {
    return { text: source, changed: false };
  }
  const end = source.lastIndexOf("}");
  if (end === -1 || !/class\s+AppDelegate\b/.test(source)) {
    throw new Error("AppDelegate.swift is not the shape this expects (no AppDelegate class)");
  }
  const text = `${source.slice(0, end).replace(/\s*$/, "\n")}${APP_DELEGATE_METHODS}${source.slice(end)}`;
  return { text, changed: true };
}

/** `source` with the notification permission declared, if it is not. */
export function patchManifest(source) {
  if (source.includes("android.permission.POST_NOTIFICATIONS")) {
    return { text: source, changed: false };
  }
  const internet = /^([ \t]*)<uses-permission android:name="android\.permission\.INTERNET"\s*\/>/m;
  const match = internet.exec(source);
  if (match) {
    const at = match.index + match[0].length;
    return {
      text: `${source.slice(0, at)}\n${match[1]}${POST_NOTIFICATIONS}${source.slice(at)}`,
      changed: true,
    };
  }
  const close = source.lastIndexOf("</manifest>");
  if (close === -1) throw new Error("AndroidManifest.xml is not the shape this expects");
  return {
    text: `${source.slice(0, close)}    ${POST_NOTIFICATIONS}\n${source.slice(close)}`,
    changed: true,
  };
}

/**
 * Applies the patches under `root`. Returns what it found, one line each; with
 * `check` it writes nothing.
 */
export function prepareNative(root, { check = false } = {}) {
  const report = [];
  let missing = 0;
  const delegate = join(root, "ios/App/App/AppDelegate.swift");
  const manifest = join(root, "android/app/src/main/AndroidManifest.xml");
  const services = join(root, "android/app/google-services.json");
  const pbxproj = join(root, "ios/App/App.xcodeproj/project.pbxproj");

  const apply = (path, patch, what) => {
    if (!existsSync(path)) {
      report.push(`skipped: ${what} (no ${path}; run cap add first)`);
      return;
    }
    const { text, changed } = patch(readFileSync(path, "utf8"));
    if (!changed) report.push(`ok: ${what} already there`);
    else if (check) {
      missing += 1;
      report.push(`MISSING: ${what}`);
    } else {
      writeFileSync(path, text);
      report.push(`added: ${what}`);
    }
  };
  apply(delegate, patchAppDelegate, "iPhone token hand-off in AppDelegate.swift");
  apply(manifest, patchManifest, "POST_NOTIFICATIONS in AndroidManifest.xml");

  if (existsSync(join(root, "android")) && !existsSync(services)) {
    missing += 1;
    report.push(
      "MISSING: android/app/google-services.json (Firebase console > Project settings > your Android app). Without it Android builds but cannot get a push address.",
    );
  }
  if (existsSync(pbxproj) && !readFileSync(pbxproj, "utf8").includes("CODE_SIGN_ENTITLEMENTS")) {
    missing += 1;
    report.push(
      "MISSING: the Push Notifications capability. In Xcode: App target > Signing & Capabilities > + Capability > Push Notifications.",
    );
  }
  return { report, missing };
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const rootFlag = process.argv.indexOf("--root");
  const root = resolve(rootFlag > -1 ? process.argv[rootFlag + 1] : ".");
  const { report, missing } = prepareNative(root, { check });
  for (const line of report) console.log(line);
  if (check && missing > 0) process.exit(1);
}
