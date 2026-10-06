// Finishes the native projects `cap add` creates, for push alerts, the stores and a cloud build.
//
// Capacitor generates the iPhone and Android projects from templates that do
// not carry what BotolaGO needs, and a person doing it by hand forgets something
// (a missing one fails silently: no prompt, no alert, an app the store rejects).
// This adds:
//
//   iPhone   AppDelegate.swift passes the token Apple gives the app on to
//            Capacitor (two methods, from the push plugin's own instructions).
//            App.entitlements declares push, and the app target points at it
//            (what Xcode's "+ Capability > Push Notifications" does).
//            iPhone only (no iPad), held upright. Info.plist: French first,
//            Arabic second, and the camera and photo permission texts (also
//            translated, in fr.lproj and ar.lproj InfoPlist.strings).
//            PrivacyInfo.xcprivacy, Apple's privacy manifest, in the app.
//   Android  AndroidManifest.xml declares POST_NOTIFICATIONS. Without it Android
//            13 and later never show the permission prompt. It also names the
//            push alerts' small icon and colour, and holds the screen upright.
//            styles.xml: the launch screen's colour and icon.
//            build.gradle signs the release with the keystore the cloud build
//            provides (CM_KEYSTORE_* variables); on a developer machine, where
//            they are not set, nothing changes.
//   Both     The BotolaGO icons and launch screens in place of Capacitor's,
//            copied as they are from store-assets/app-icon/native (made by
//            scripts/brand/make-app-icons.py, so no Python is needed here).
//
// It is safe to run again: it changes nothing that is already there. It also says
// what it cannot do for you (Firebase's google-services.json).
//
//   bun scripts/mobile/prepare-native.mjs            # patch ios/ and android/
//   bun scripts/mobile/prepare-native.mjs --check    # change nothing, exit 1 if anything is missing
//
// Run it after `cap add ios` / `cap add android`. The cloud build (codemagic.yaml)
// does. See docs/mobile/PHONE_APP.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

// ---------------------------------------------------------------------------
// iPhone: Info.plist (languages, photo permissions, iPhone portrait only)

// Shown by iOS when the profile photo picker (<input type="file" accept="image/*">)
// asks for the camera or the photo library. Without the camera one, the app is
// closed by iOS the moment someone picks "Take Photo".
const CAMERA_USAGE = "BotolaGO utilise l’appareil photo pour prendre votre photo de profil.";
const PHOTOS_USAGE =
  "BotolaGO accède à vos photos pour que vous choisissiez votre photo de profil.";
const INFO_PLIST_STRINGS = {
  fr: { camera: CAMERA_USAGE, photos: PHOTOS_USAGE },
  ar: {
    camera: "يستخدم BotolaGO الكاميرا لالتقاط صورة ملفك الشخصي.",
    photos: "يصل BotolaGO إلى صورك لتختار منها صورة ملفك الشخصي.",
  },
};

const escapeXml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plistString = (value) => `<string>${escapeXml(value)}</string>`;
const plistArray = (values) => (indent) =>
  `<array>\n${values.map((value) => `${indent}\t${plistString(value)}\n`).join("")}${indent}</array>`;

function plistEntry(key) {
  return new RegExp(
    `^([ \\t]*)<key>${escapeRegExp(key)}</key>\\s*(?:<string>[^<]*</string>|<array>[\\s\\S]*?</array>|<array\\s*/>|<true\\s*/>|<false\\s*/>)`,
    "m",
  );
}

/** `source` with `key` set to `value` (a string, or a function of the indent for an array). */
function setPlistValue(source, key, value) {
  const render = (indent) => (typeof value === "function" ? value(indent) : plistString(value));
  const found = plistEntry(key).exec(source);
  if (found) {
    const indent = found[1];
    const entry = `${indent}<key>${key}</key>\n${indent}${render(indent)}`;
    return `${source.slice(0, found.index)}${entry}${source.slice(found.index + found[0].length)}`;
  }
  const close = source.lastIndexOf("</dict>");
  if (close === -1 || source.indexOf("</plist>", close) === -1) {
    throw new Error("Info.plist is not the shape this expects (no top-level dict)");
  }
  const lineStart = source.lastIndexOf("\n", close - 1) + 1;
  return `${source.slice(0, lineStart)}\t<key>${key}</key>\n\t${render("\t")}\n${source.slice(lineStart)}`;
}

function removePlistKey(source, key) {
  const found = plistEntry(key).exec(source);
  if (!found) return source;
  let start = found.index;
  if (start > 0 && source[start - 1] === "\n") start -= 1;
  return `${source.slice(0, start)}${source.slice(found.index + found[0].length)}`;
}

/**
 * `source` (Info.plist) with French as the app's own language and Arabic as a
 * second one, the two photo permission texts, and the iPhone held upright.
 * The site handles only the top and bottom safe areas, so landscape (with the
 * notch on the side) is turned off. The iPad keys go: the app is iPhone only.
 */
export function patchInfoPlist(source) {
  let text = source;
  text = setPlistValue(text, "CFBundleDevelopmentRegion", "fr");
  text = setPlistValue(text, "CFBundleLocalizations", plistArray(["fr", "ar"]));
  text = setPlistValue(text, "NSCameraUsageDescription", CAMERA_USAGE);
  text = setPlistValue(text, "NSPhotoLibraryUsageDescription", PHOTOS_USAGE);
  text = setPlistValue(
    text,
    "UISupportedInterfaceOrientations",
    plistArray(["UIInterfaceOrientationPortrait"]),
  );
  text = removePlistKey(text, "UISupportedInterfaceOrientations~ipad");
  return { text, changed: text !== source };
}

/** The InfoPlist.strings of one language: the same permission texts, translated. */
export function infoPlistStrings(language) {
  const { camera, photos } = INFO_PLIST_STRINGS[language];
  const quote = (value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  return `/* The texts iOS shows when the profile photo picker asks for the camera or the photos. */
"NSCameraUsageDescription" = ${quote(camera)};
"NSPhotoLibraryUsageDescription" = ${quote(photos)};
`;
}

// ---------------------------------------------------------------------------
// iPhone: privacy manifest

const PRIVACY_PATH = "App/PrivacyInfo.xcprivacy";

// Apple requires every app to give a reason for the "required reason" APIs it,
// or a library in it, uses. @capacitor/preferences keeps its values in
// UserDefaults and ships no manifest of its own; CA92.1 is "read and write
// information that only the app itself can access". Capacitor's own frameworks
// ship their manifests (with nothing to declare), and @capacitor/app and
// @capacitor/push-notifications use none of these APIs.
// NSPrivacyCollectedDataTypes is left empty: what the app collects is what the
// website collects, and that is declared in App Store Connect's privacy form,
// which follows the privacy policy.
const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>NSPrivacyTracking</key>
\t<false/>
\t<key>NSPrivacyTrackingDomains</key>
\t<array/>
\t<key>NSPrivacyCollectedDataTypes</key>
\t<array/>
\t<key>NSPrivacyAccessedAPITypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>NSPrivacyAccessedAPIType</key>
\t\t\t<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>
\t\t\t<array>
\t\t\t\t<string>CA92.1</string>
\t\t\t</array>
\t\t</dict>
\t</array>
</dict>
</plist>
`;

// ---------------------------------------------------------------------------
// iPhone: the Xcode project

const APP_TARGET_CONFIG =
  /(\t\t[0-9A-F]{24} \/\* \w+ \*\/ = \{\n\t\t\tisa = XCBuildConfiguration;[\s\S]*?\n\t\t\};)/g;

/**
 * `source` (project.pbxproj) with the app target built for iPhone only
 * (TARGETED_DEVICE_FAMILY = 1, in its Debug and Release settings). Without it
 * App Store Connect asks for iPad screenshots too.
 */
export function patchPbxprojIphoneOnly(source) {
  let targets = 0;
  const text = source.replace(APP_TARGET_CONFIG, (block) => {
    if (!block.includes("PRODUCT_BUNDLE_IDENTIFIER")) return block;
    targets += 1;
    if (/^\t\t\t\tTARGETED_DEVICE_FAMILY = /m.test(block)) {
      return block.replace(/^(\t\t\t\tTARGETED_DEVICE_FAMILY = )[^;\n]+;/m, "$11;");
    }
    const settings = block.indexOf("buildSettings = {\n");
    if (settings === -1) return block;
    const start = settings + "buildSettings = {\n".length;
    return `${block.slice(0, start)}\t\t\t\tTARGETED_DEVICE_FAMILY = 1;\n${block.slice(start)}`;
  });
  if (targets === 0) {
    throw new Error(
      "project.pbxproj is not the shape this expects (no app target with a bundle id)",
    );
  }
  return { text, changed: text !== source };
}

// Fixed object ids for what this adds to the Xcode project, so a second run
// recognises its own entries. "B07060A0C0DE" does not occur in Capacitor's template.
const PBX = {
  privacyBuild: "B07060A0C0DE000000000001",
  privacyFile: "B07060A0C0DE000000000002",
  stringsBuild: "B07060A0C0DE000000000003",
  stringsGroup: "B07060A0C0DE000000000004",
  stringsFr: "B07060A0C0DE000000000005",
  stringsAr: "B07060A0C0DE000000000006",
};

function addToSection(source, section, id, entry) {
  if (source.includes(`\t\t${id} `)) return source;
  const end = source.indexOf(`/* End ${section} section */`);
  if (end === -1) {
    throw new Error(`project.pbxproj is not the shape this expects (no ${section} section)`);
  }
  return `${source.slice(0, end)}${entry}\n${source.slice(end)}`;
}

/** Adds `item` to the `list = ( ... );` of the first object `isa` whose body `matches`. */
function addToList(source, isa, matches, list, id, item) {
  const objects = new RegExp(
    `\\t\\t[0-9A-F]{24}(?: /\\* [^*]+ \\*/)? = \\{\\n\\t\\t\\tisa = ${isa};[\\s\\S]*?\\n\\t\\t\\};`,
    "g",
  );
  for (const found of source.matchAll(objects)) {
    const block = found[0];
    if (!matches(block)) continue;
    const open = block.indexOf(`\t\t\t${list} = (\n`);
    if (open === -1) break;
    const close = block.indexOf("\n\t\t\t);", open);
    const items = block.slice(open, close);
    if (items.includes(id)) return source;
    const at = found.index + close + 1;
    return `${source.slice(0, at)}\t\t\t\t${item},\n${source.slice(at)}`;
  }
  throw new Error(`project.pbxproj is not the shape this expects (no ${isa} with ${list})`);
}

/**
 * `source` (project.pbxproj) with the privacy manifest and the translated
 * permission texts (fr.lproj and ar.lproj InfoPlist.strings) in the app: each
 * as a file of the App group and in the Resources build phase (a file that is
 * not in the build phase is not shipped). The project's languages become French
 * first, plus Arabic, which is also what the App Store lists.
 */
export function patchPbxprojResources(source) {
  let text = source;
  text = addToSection(
    text,
    "PBXBuildFile",
    PBX.privacyBuild,
    `\t\t${PBX.privacyBuild} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${PBX.privacyFile} /* PrivacyInfo.xcprivacy */; };`,
  );
  text = addToSection(
    text,
    "PBXBuildFile",
    PBX.stringsBuild,
    `\t\t${PBX.stringsBuild} /* InfoPlist.strings in Resources */ = {isa = PBXBuildFile; fileRef = ${PBX.stringsGroup} /* InfoPlist.strings */; };`,
  );
  text = addToSection(
    text,
    "PBXFileReference",
    PBX.privacyFile,
    `\t\t${PBX.privacyFile} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };`,
  );
  for (const [id, language] of [
    [PBX.stringsFr, "fr"],
    [PBX.stringsAr, "ar"],
  ]) {
    text = addToSection(
      text,
      "PBXFileReference",
      id,
      `\t\t${id} /* ${language} */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = ${language}; path = ${language}.lproj/InfoPlist.strings; sourceTree = "<group>"; };`,
    );
  }
  text = addToSection(
    text,
    "PBXVariantGroup",
    PBX.stringsGroup,
    `\t\t${PBX.stringsGroup} /* InfoPlist.strings */ = {
\t\t\tisa = PBXVariantGroup;
\t\t\tchildren = (
\t\t\t\t${PBX.stringsFr} /* fr */,
\t\t\t\t${PBX.stringsAr} /* ar */,
\t\t\t);
\t\t\tname = InfoPlist.strings;
\t\t\tsourceTree = "<group>";
\t\t};`,
  );
  const appGroup = (block) => /\n\t\t\tpath = App;\n/.test(block);
  text = addToList(
    text,
    "PBXGroup",
    appGroup,
    "children",
    PBX.privacyFile,
    `${PBX.privacyFile} /* PrivacyInfo.xcprivacy */`,
  );
  text = addToList(
    text,
    "PBXGroup",
    appGroup,
    "children",
    PBX.stringsGroup,
    `${PBX.stringsGroup} /* InfoPlist.strings */`,
  );
  const appResources = (block) => block.includes("Assets.xcassets in Resources");
  text = addToList(
    text,
    "PBXResourcesBuildPhase",
    appResources,
    "files",
    PBX.privacyBuild,
    `${PBX.privacyBuild} /* PrivacyInfo.xcprivacy in Resources */`,
  );
  text = addToList(
    text,
    "PBXResourcesBuildPhase",
    appResources,
    "files",
    PBX.stringsBuild,
    `${PBX.stringsBuild} /* InfoPlist.strings in Resources */`,
  );
  text = text.replace(/^(\t\t\tdevelopmentRegion = )[^;\n]+;/m, "$1fr;");
  const regions = /^\t\t\tknownRegions = \(\n([\s\S]*?)\t\t\t\);/m.exec(text);
  if (regions) {
    const present = regions[1].split(",").map((entry) => entry.trim());
    const added = ["fr", "ar"].filter((region) => !present.includes(region));
    if (added.length > 0) {
      const at = regions.index + regions[0].length - "\t\t\t);".length;
      text = `${text.slice(0, at)}${added.map((region) => `\t\t\t\t${region},\n`).join("")}${text.slice(at)}`;
    }
  }
  return { text, changed: text !== source };
}

// ---------------------------------------------------------------------------
// Android: the manifest and the launch theme

const NOTIFICATION_META = [
  ["com.google.firebase.messaging.default_notification_icon", "@drawable/ic_stat_notify"],
  ["com.google.firebase.messaging.default_notification_color", "@color/botolago_notification"],
];

/**
 * `source` (AndroidManifest.xml) with the push alerts' small icon and its colour.
 * Firebase draws every alert with these, both the ones that arrive while the app
 * is closed and the ones the push plugin shows while it is open (it hands the
 * app's meta-data to Firebase's builder). Without them Android draws the app
 * icon in one colour, a plain white disc or square.
 */
export function patchManifestNotificationIcon(source) {
  let text = source;
  for (const [name, resource] of NOTIFICATION_META) {
    if (text.includes(`android:name="${name}"`)) continue;
    const close = text.lastIndexOf("</application>");
    if (close === -1) throw new Error("AndroidManifest.xml is not the shape this expects");
    const lineStart = text.lastIndexOf("\n", close - 1) + 1;
    text = `${text.slice(0, lineStart)}        <meta-data\n            android:name="${name}"\n            android:resource="${resource}" />\n${text.slice(lineStart)}`;
  }
  return { text, changed: text !== source };
}

/** `source` (AndroidManifest.xml) with the app's screen held upright, like the iPhone app. */
export function patchManifestPortrait(source) {
  const activity = /<activity\b[^>]*android:name="\.MainActivity"[^>]*>/.exec(source);
  if (!activity)
    throw new Error("AndroidManifest.xml is not the shape this expects (no MainActivity)");
  const tag = activity[0];
  let patched;
  if (/android:screenOrientation="[^"]*"/.test(tag)) {
    patched = tag.replace(
      /android:screenOrientation="[^"]*"/,
      'android:screenOrientation="portrait"',
    );
  } else {
    const name = /^([ \t]*)android:name="\.MainActivity"/m.exec(tag);
    patched = name
      ? `${tag.slice(0, name.index + name[0].length)}\n${name[1]}android:screenOrientation="portrait"${tag.slice(name.index + name[0].length)}`
      : tag.replace(/<activity\b/, '<activity android:screenOrientation="portrait"');
  }
  const text = `${source.slice(0, activity.index)}${patched}${source.slice(activity.index + tag.length)}`;
  return { text, changed: text !== source };
}

const SPLASH_ITEMS = [
  ["windowSplashScreenBackground", "@color/botolago_splash_background"],
  ["windowSplashScreenAnimatedIcon", "@mipmap/ic_launcher_foreground"],
];

/**
 * `source` (res/values/styles.xml) with the launch screen set to the icon's
 * mark on the icon plate's light colour. The launch theme (Theme.SplashScreen)
 * otherwise falls back to the phone's default background and Android's generic
 * app icon; it draws these on every Android version (12 and later natively).
 */
export function patchSplashTheme(source) {
  const style = /<style name="AppTheme\.NoActionBarLaunch"[^>]*>([\s\S]*?)<\/style>/.exec(source);
  if (!style) throw new Error("styles.xml is not the shape this expects (no launch theme)");
  let body = style[1];
  for (const [name, value] of SPLASH_ITEMS) {
    const item = new RegExp(`<item name="${name}">[^<]*</item>`);
    if (item.test(body)) body = body.replace(item, `<item name="${name}">${value}</item>`);
    else body = `${body.replace(/\s*$/, "")}\n        <item name="${name}">${value}</item>\n    `;
  }
  const start = style.index + style[0].indexOf(">") + 1;
  const text = `${source.slice(0, start)}${body}${source.slice(start + style[1].length)}`;
  return { text, changed: text !== source };
}

// ---------------------------------------------------------------------------
// The icons and launch screens: committed files, copied in as they are

/** Generated by scripts/brand/make-app-icons.py, laid out as they go into the projects. */
export const NATIVE_ASSETS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../store-assets/app-icon/native",
);

function filesUnder(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesUnder(join(dir, entry.name), base)
        : [relative(base, join(dir, entry.name))],
    )
    .sort();
}

/** What goes where: [what, folder in store-assets/app-icon/native, folder in the project]. */
const ASSET_GROUPS = [
  ["iPhone app icon", "ios/AppIcon.appiconset", "ios/App/App/Assets.xcassets/AppIcon.appiconset"],
  [
    "iPhone launch screen image",
    "ios/Splash.imageset",
    "ios/App/App/Assets.xcassets/Splash.imageset",
  ],
  ["Android icons, launch images and notification icon", "android/res", "android/app/src/main/res"],
];

/**
 * Applies the patches under `root`. Returns what it found, one line each; with
 * `check` it writes nothing.
 */
export function prepareNative(root, { check = false, assets = NATIVE_ASSETS } = {}) {
  const report = [];
  let missing = 0;
  const ios = join(root, "ios/App");
  const res = join(root, "android/app/src/main/res");
  const delegate = join(ios, "App/AppDelegate.swift");
  const pbxproj = join(ios, "App.xcodeproj/project.pbxproj");
  const infoPlist = join(ios, "App/Info.plist");
  const manifest = join(root, "android/app/src/main/AndroidManifest.xml");
  const gradle = join(root, "android/app/build.gradle");
  const styles = join(res, "values/styles.xml");
  const services = join(root, "android/app/google-services.json");

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
  /** Writes `content` at `path` unless it is already exactly that. */
  const ensureFile = (path, content, what) => {
    const same = existsSync(path) && readFileSync(path).equals(Buffer.from(content));
    if (same) report.push(`ok: ${what} already there`);
    else if (check) {
      missing += 1;
      report.push(`MISSING: ${what}`);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      report.push(`added: ${what}`);
    }
  };

  apply(delegate, patchAppDelegate, "iPhone token hand-off in AppDelegate.swift");
  apply(pbxproj, patchPbxproj, "push entitlements setting in the Xcode project");
  apply(
    pbxproj,
    patchPbxprojIphoneOnly,
    "iPhone only (TARGETED_DEVICE_FAMILY = 1) in the Xcode project",
  );
  apply(
    pbxproj,
    patchPbxprojResources,
    "privacy manifest and French/Arabic permission texts in the Xcode project",
  );
  apply(infoPlist, patchInfoPlist, "languages, photo permissions and portrait only in Info.plist");
  apply(manifest, patchManifest, "POST_NOTIFICATIONS in AndroidManifest.xml");
  apply(
    manifest,
    patchManifestNotificationIcon,
    "push alert icon and colour in AndroidManifest.xml",
  );
  apply(manifest, patchManifestPortrait, "portrait only in AndroidManifest.xml");
  apply(styles, patchSplashTheme, "launch screen colour and icon in styles.xml");
  apply(
    gradle,
    patchBuildGradle,
    "release signing from the cloud build's keystore in build.gradle",
  );

  if (existsSync(pbxproj)) {
    ensureFile(join(ios, ENTITLEMENTS_PATH), ENTITLEMENTS, "App.entitlements (declares push)");
    ensureFile(
      join(ios, PRIVACY_PATH),
      PRIVACY_MANIFEST,
      "PrivacyInfo.xcprivacy (UserDefaults, reason CA92.1)",
    );
    for (const language of Object.keys(INFO_PLIST_STRINGS)) {
      ensureFile(
        join(ios, `App/${language}.lproj/InfoPlist.strings`),
        infoPlistStrings(language),
        `${language}.lproj/InfoPlist.strings (permission texts)`,
      );
    }
  }

  for (const [what, from, to] of ASSET_GROUPS) {
    const platform = join(root, to.split("/")[0]);
    if (!existsSync(platform)) continue;
    const files = filesUnder(join(assets, from));
    if (files.length === 0) throw new Error(`no committed files in ${join(assets, from)}`);
    const stale = files.filter((file) => {
      const target = join(root, to, file);
      return (
        !existsSync(target) || !readFileSync(target).equals(readFileSync(join(assets, from, file)))
      );
    });
    if (stale.length === 0) report.push(`ok: ${what} already there (${files.length} files)`);
    else if (check) {
      missing += 1;
      report.push(`MISSING: ${what} (${stale.length} of ${files.length} files differ)`);
    } else {
      for (const file of stale) {
        mkdirSync(dirname(join(root, to, file)), { recursive: true });
        writeFileSync(join(root, to, file), readFileSync(join(assets, from, file)));
      }
      report.push(`added: ${what} (${stale.length} of ${files.length} files)`);
    }
  }
  // A Capacitor launch image this does not replace would still show Capacitor's logo.
  if (existsSync(res)) {
    const ours = new Set(filesUnder(join(assets, "android/res")));
    const theirs = filesUnder(res).filter(
      (file) => /(^|\/)splash\.png$/.test(file) && !ours.has(file),
    );
    for (const file of theirs) {
      missing += 1;
      report.push(
        `MISSING: a BotolaGO image for res/${file} (add it in scripts/brand/make-app-icons.py)`,
      );
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
