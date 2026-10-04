// Finishes the native projects `cap add` creates, for push alerts and for a cloud build.
//
// Capacitor generates the iPhone and Android projects from templates that do
// not carry what the BotolaGO push alerts and the cloud build need, and a person
// doing it by hand forgets them (a missing one fails silently: no prompt, no
// alert, an app the store rejects). This adds, and only adds:
//
//   iPhone   AppDelegate.swift passes the token Apple gives the app on to
//            Capacitor (two methods, from the push plugin's own instructions).
//            App.entitlements declares push, and the app target points at it
//            (what Xcode's "+ Capability > Push Notifications" does).
//   Android  AndroidManifest.xml declares POST_NOTIFICATIONS. Without it Android
//            13 and later never show the permission prompt.
//            build.gradle signs the release with the keystore the cloud build
//            provides (CM_KEYSTORE_* variables); on a developer machine, where
//            they are not set, nothing changes.
//
// It is safe to run again: it changes nothing that is already there. It also says
// what it cannot do for you (Firebase's google-services.json).
//
//   bun scripts/mobile/prepare-native.mjs            # patch ios/ and android/
//   bun scripts/mobile/prepare-native.mjs --check    # change nothing, exit 1 if anything is missing
//
// Run it after `cap add ios` / `cap add android`. The cloud build (codemagic.yaml)
// does. See docs/mobile/PHONE_APP.md.

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

const ENTITLEMENTS_PATH = "App/App.entitlements";

// `production`: every iPhone build the cloud makes is an App Store / TestFlight
// one, signed for Apple's production push servers (the sender's default).
const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>production</string>
</dict>
</plist>
`;

/**
 * `source` (project.pbxproj) with the app target's build settings pointing at
 * the entitlements file. The app target is the one that has a bundle id, so the
 * project-level settings are left alone.
 */
export function patchPbxproj(source) {
  let changed = false;
  const text = source.replace(
    /(\t\t[0-9A-F]{24} \/\* \w+ \*\/ = \{\n\t\t\tisa = XCBuildConfiguration;[\s\S]*?\n\t\t\};)/g,
    (block) => {
      if (
        !block.includes("PRODUCT_BUNDLE_IDENTIFIER") ||
        block.includes("CODE_SIGN_ENTITLEMENTS")
      ) {
        return block;
      }
      const at = block.search(/^\t\t\t\tCODE_SIGN_STYLE = /m);
      const insertion = `\t\t\t\tCODE_SIGN_ENTITLEMENTS = ${ENTITLEMENTS_PATH};\n`;
      if (at !== -1) {
        changed = true;
        return `${block.slice(0, at)}${insertion}${block.slice(at)}`;
      }
      const settings = block.indexOf("buildSettings = {\n");
      if (settings === -1) return block;
      changed = true;
      const start = settings + "buildSettings = {\n".length;
      return `${block.slice(0, start)}${insertion}${block.slice(start)}`;
    },
  );
  if (!/CODE_SIGN_ENTITLEMENTS/.test(text)) {
    throw new Error(
      "project.pbxproj is not the shape this expects (no app target with a bundle id)",
    );
  }
  return { text, changed };
}

const SIGNING_CONFIG = `    signingConfigs {
        release {
            // Set by the cloud build (Codemagic provides CM_KEYSTORE_*). Not set on a
            // developer machine, which then builds an unsigned release as before.
            if (System.getenv("CM_KEYSTORE_PATH")) {
                storeFile file(System.getenv("CM_KEYSTORE_PATH"))
                storePassword System.getenv("CM_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CM_KEY_ALIAS")
                keyPassword System.getenv("CM_KEY_PASSWORD")
            }
        }
    }
`;

/** `source` (app/build.gradle) with the release signed by the cloud build's keystore, if it is not. */
export function patchBuildGradle(source) {
  if (source.includes("CM_KEYSTORE_PATH")) return { text: source, changed: false };
  const buildTypes = source.search(/^    buildTypes \{/m);
  const release = /^(\s*)release \{\n/m.exec(source);
  if (buildTypes === -1 || !release || release.index < buildTypes) {
    throw new Error("app/build.gradle is not the shape this expects (no release build type)");
  }
  let text = `${source.slice(0, buildTypes)}${SIGNING_CONFIG}${source.slice(buildTypes)}`;
  const inRelease = /^(\s*)release \{\n(?=[\s\S]*minifyEnabled)/m.exec(
    text.slice(text.search(/^    buildTypes \{/m)),
  );
  if (!inRelease)
    throw new Error("app/build.gradle is not the shape this expects (no release block)");
  const offset = text.search(/^    buildTypes \{/m) + inRelease.index + inRelease[0].length;
  const indent = `${inRelease[1]}    `;
  text = `${text.slice(0, offset)}${indent}if (System.getenv("CM_KEYSTORE_PATH")) {\n${indent}    signingConfig signingConfigs.release\n${indent}}\n${text.slice(offset)}`;
  return { text, changed: true };
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
  const gradle = join(root, "android/app/build.gradle");
  const services = join(root, "android/app/google-services.json");
  const pbxproj = join(root, "ios/App/App.xcodeproj/project.pbxproj");
  const entitlements = join(root, "ios/App", ENTITLEMENTS_PATH);

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
  apply(pbxproj, patchPbxproj, "push entitlements setting in the Xcode project");
  apply(manifest, patchManifest, "POST_NOTIFICATIONS in AndroidManifest.xml");
  apply(
    gradle,
    patchBuildGradle,
    "release signing from the cloud build's keystore in build.gradle",
  );

  if (existsSync(pbxproj)) {
    const present = existsSync(entitlements) && readFileSync(entitlements, "utf8") === ENTITLEMENTS;
    if (present) report.push("ok: App.entitlements already there");
    else if (check) {
      missing += 1;
      report.push("MISSING: App.entitlements (declares push)");
    } else {
      writeFileSync(entitlements, ENTITLEMENTS);
      report.push("added: App.entitlements (declares push)");
    }
  }
  if (existsSync(join(root, "android")) && !existsSync(services)) {
    missing += 1;
    report.push(
      "MISSING: android/app/google-services.json (Firebase console > Project settings > your Android app). Without it Android builds but cannot get a push address.",
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
