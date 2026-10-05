import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  patchAppDelegate,
  patchBuildGradle,
  patchManifest,
  patchPbxproj,
  prepareNative,
} from "./prepare-native.mjs";

// The files as Capacitor 8's templates write them (the Xcode project cut down to its
// build-settings section), cut down to what matters.
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

const BUILD_GRADLE = `apply plugin: 'com.android.application'

android {
    namespace = "botolago.com"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "botolago.com"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
             // Files and dirs to omit from the packaged assets dir, modified to accommodate modern web apps.
             // Default: https://android.googlesource.com/platform/frameworks/base/+/282e181b58cf72b6ca770dc7ca5f91f135444502/tools/aapt/AaptAssets.cpp#61
            ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

repositories {
    flatDir{
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
    implementation project(':capacitor-android')
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
    androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"
    implementation project(':capacitor-cordova-android-plugins')
}

apply from: 'capacitor.build.gradle'

try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
`;
const PBXPROJ = `/* Begin XCBuildConfiguration section */
		504EC3141FED79650016851F /* Debug */ = {
			isa = XCBuildConfiguration;
			baseConfigurationReference = 958DCC722DB07C7200EA8C5F /* debug.xcconfig */;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ANALYZER_NONNULL = YES;
				CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
				CLANG_CXX_LANGUAGE_STANDARD = "gnu++14";
				CLANG_CXX_LIBRARY = "libc++";
				CLANG_ENABLE_MODULES = YES;
				CLANG_ENABLE_OBJC_ARC = YES;
				CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
				CLANG_WARN_BOOL_CONVERSION = YES;
				CLANG_WARN_COMMA = YES;
				CLANG_WARN_CONSTANT_CONVERSION = YES;
				CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
				CLANG_WARN_DOCUMENTATION_COMMENTS = YES;
				CLANG_WARN_EMPTY_BODY = YES;
				CLANG_WARN_ENUM_CONVERSION = YES;
				CLANG_WARN_INFINITE_RECURSION = YES;
				CLANG_WARN_INT_CONVERSION = YES;
				CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
				CLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
				CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
				CLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
				CLANG_WARN_STRICT_PROTOTYPES = YES;
				CLANG_WARN_SUSPICIOUS_MOVE = YES;
				CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
				CLANG_WARN_UNREACHABLE_CODE = YES;
				CLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
				CODE_SIGN_IDENTITY = "iPhone Developer";
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = dwarf;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				ENABLE_TESTABILITY = YES;
				GCC_C_LANGUAGE_STANDARD = gnu11;
				GCC_DYNAMIC_NO_PIC = NO;
				GCC_NO_COMMON_BLOCKS = YES;
				GCC_OPTIMIZATION_LEVEL = 0;
				GCC_PREPROCESSOR_DEFINITIONS = (
					"DEBUG=1",
					"$(inherited)",
				);
				GCC_WARN_64_TO_32_BIT_CONVERSION = YES;
				GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
				GCC_WARN_UNDECLARED_SELECTOR = YES;
				GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
				GCC_WARN_UNUSED_FUNCTION = YES;
				GCC_WARN_UNUSED_VARIABLE = YES;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				MTL_ENABLE_DEBUG_INFO = YES;
				ONLY_ACTIVE_ARCH = YES;
				SDKROOT = iphoneos;
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			};
			name = Debug;
		};
		504EC3151FED79650016851F /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ANALYZER_NONNULL = YES;
				CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
				CLANG_CXX_LANGUAGE_STANDARD = "gnu++14";
				CLANG_CXX_LIBRARY = "libc++";
				CLANG_ENABLE_MODULES = YES;
				CLANG_ENABLE_OBJC_ARC = YES;
				CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
				CLANG_WARN_BOOL_CONVERSION = YES;
				CLANG_WARN_COMMA = YES;
				CLANG_WARN_CONSTANT_CONVERSION = YES;
				CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
				CLANG_WARN_DOCUMENTATION_COMMENTS = YES;
				CLANG_WARN_EMPTY_BODY = YES;
				CLANG_WARN_ENUM_CONVERSION = YES;
				CLANG_WARN_INFINITE_RECURSION = YES;
				CLANG_WARN_INT_CONVERSION = YES;
				CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
				CLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
				CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
				CLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
				CLANG_WARN_STRICT_PROTOTYPES = YES;
				CLANG_WARN_SUSPICIOUS_MOVE = YES;
				CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
				CLANG_WARN_UNREACHABLE_CODE = YES;
				CLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
				CODE_SIGN_IDENTITY = "iPhone Developer";
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
				ENABLE_NS_ASSERTIONS = NO;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				GCC_C_LANGUAGE_STANDARD = gnu11;
				GCC_NO_COMMON_BLOCKS = YES;
				GCC_WARN_64_TO_32_BIT_CONVERSION = YES;
				GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
				GCC_WARN_UNDECLARED_SELECTOR = YES;
				GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
				GCC_WARN_UNUSED_FUNCTION = YES;
				GCC_WARN_UNUSED_VARIABLE = YES;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				MTL_ENABLE_DEBUG_INFO = NO;
				SDKROOT = iphoneos;
				SWIFT_COMPILATION_MODE = wholemodule;
				SWIFT_OPTIMIZATION_LEVEL = "-O";
				VALIDATE_PRODUCT = YES;
			};
			name = Release;
		};
		504EC3171FED79650016851F /* Debug */ = {
			isa = XCBuildConfiguration;
			baseConfigurationReference = 958DCC722DB07C7200EA8C5F /* debug.xcconfig */;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				INFOPLIST_FILE = App/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.0;
				OTHER_SWIFT_FLAGS = "$(inherited) \\"-D\\" \\"COCOAPODS\\" \\"-DDEBUG\\"";
				PRODUCT_BUNDLE_IDENTIFIER = botolago.com;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			};
			name = Debug;
		};
		504EC3181FED79650016851F /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				INFOPLIST_FILE = App/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = botolago.com;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = "";
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			};
			name = Release;
		};
/* End XCBuildConfiguration section */`;

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

describe("patchPbxproj", () => {
  test("points the app target's Debug and Release settings at the entitlements, and no others", () => {
    const { text, changed } = patchPbxproj(PBXPROJ);
    expect(changed).toBe(true);
    expect(text.split("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;")).toHaveLength(3);
    // each one sits in a block that has the bundle id, i.e. the app target's
    for (const block of text.split("isa = XCBuildConfiguration;").slice(1)) {
      const has = block.includes("CODE_SIGN_ENTITLEMENTS");
      expect(has).toBe(block.includes("PRODUCT_BUNDLE_IDENTIFIER"));
    }
    expect(text.replace(/\t\t\t\tCODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;\n/g, "")).toBe(
      PBXPROJ,
    );
  });

  test("changes nothing the second time", () => {
    const once = patchPbxproj(PBXPROJ).text;
    expect(patchPbxproj(once)).toEqual({ text: once, changed: false });
  });

  test("refuses a project with no app target", () => {
    expect(() => patchPbxproj("/* nothing here */")).toThrow();
  });
});

describe("patchBuildGradle", () => {
  test("signs the release with the cloud build's keystore, inside the android block", () => {
    const { text, changed } = patchBuildGradle(BUILD_GRADLE);
    expect(changed).toBe(true);
    for (const variable of [
      "CM_KEYSTORE_PATH",
      "CM_KEYSTORE_PASSWORD",
      "CM_KEY_ALIAS",
      "CM_KEY_PASSWORD",
    ]) {
      expect(text).toContain(`System.getenv("${variable}")`);
    }
    expect(text.indexOf("signingConfigs {")).toBeLessThan(text.indexOf("buildTypes {"));
    expect(text.indexOf("signingConfig signingConfigs.release")).toBeGreaterThan(
      text.indexOf("buildTypes {"),
    );
    // braces still balance, and nothing else moved
    expect(text.split("{").length).toBe(text.split("}").length);
    expect(text).toContain("minifyEnabled false");
    expect(text).toContain("apply from: 'capacitor.build.gradle'");
  });

  test("only signs when the keystore is provided, so a developer build is unchanged", () => {
    const { text } = patchBuildGradle(BUILD_GRADLE);
    expect(text.split('if (System.getenv("CM_KEYSTORE_PATH"))')).toHaveLength(3);
  });

  test("changes nothing the second time", () => {
    const once = patchBuildGradle(BUILD_GRADLE).text;
    expect(patchBuildGradle(once)).toEqual({ text: once, changed: false });
  });

  test("refuses a file with no release build type", () => {
    expect(() => patchBuildGradle("android {\n}\n")).toThrow();
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
    "ios/App/App.xcodeproj/project.pbxproj": PBXPROJ,
    "android/app/src/main/AndroidManifest.xml": MANIFEST,
    "android/app/build.gradle": BUILD_GRADLE,
  };

  test("patches both projects, then reports them as already done", () => {
    const root = project(FILES);
    const first = prepareNative(root);
    expect(first.report.filter((line) => line.startsWith("added:"))).toHaveLength(5);
    expect(readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8")).toContain(
      "POST_NOTIFICATIONS",
    );
    expect(readFileSync(join(root, "ios/App/App/App.entitlements"), "utf8")).toContain(
      "<key>aps-environment</key>",
    );
    expect(readFileSync(join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8")).toContain(
      "CODE_SIGN_ENTITLEMENTS",
    );
    const second = prepareNative(root);
    expect(second.report.filter((line) => line.startsWith("ok:"))).toHaveLength(5);
    expect(second.report.filter((line) => line.startsWith("added:"))).toHaveLength(0);
  });

  test("tells you about the one thing only a person can supply", () => {
    const { report, missing } = prepareNative(project(FILES));
    expect(missing).toBe(1);
    expect(report.join("\n")).toContain("google-services.json");
  });

  test("is satisfied once that file is there", () => {
    const root = project({ ...FILES, "android/app/google-services.json": "{}" });
    expect(prepareNative(root).missing).toBe(0);
  });

  test("--check changes nothing and counts what is missing", () => {
    const root = project(FILES);
    const { report, missing } = prepareNative(root, { check: true });
    expect(report.filter((line) => line.startsWith("MISSING:")).length).toBe(missing);
    expect(missing).toBe(6);
    expect(readFileSync(join(root, "ios/App/App/AppDelegate.swift"), "utf8")).toBe(APP_DELEGATE);
    expect(readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8")).toBe(
      MANIFEST,
    );
    expect(readFileSync(join(root, "android/app/build.gradle"), "utf8")).toBe(BUILD_GRADLE);
    expect(readFileSync(join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8")).toBe(PBXPROJ);
  });

  test("a project that was never created is skipped, not an error", () => {
    const { report, missing } = prepareNative(project({}));
    expect(missing).toBe(0);
    expect(report.every((line) => line.startsWith("skipped:"))).toBe(true);
  });
});
