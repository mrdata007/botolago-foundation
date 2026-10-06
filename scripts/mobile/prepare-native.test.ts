import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import {
  infoPlistStrings,
  NATIVE_ASSETS,
  patchAppDelegate,
  patchBuildGradle,
  patchInfoPlist,
  patchManifest,
  patchManifestNotificationIcon,
  patchManifestPortrait,
  patchPbxproj,
  patchPbxprojIphoneOnly,
  patchPbxprojResources,
  patchSplashTheme,
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

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
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

// The rest of Capacitor 8's Xcode project, cut down to the objects the privacy
// manifest and the translated permission texts are added to.
const PBXPROJ_OBJECTS = `// !$*UTF8*$!
{
	archiveVersion = 1;
	objects = {

/* Begin PBXBuildFile section */
		2FAD9763203C412B000D30F8 /* config.xml in Resources */ = {isa = PBXBuildFile; fileRef = 2FAD9762203C412B000D30F8 /* config.xml */; };
		504EC30D1FED79650016851F /* Main.storyboard in Resources */ = {isa = PBXBuildFile; fileRef = 504EC30B1FED79650016851F /* Main.storyboard */; };
		504EC30F1FED79650016851F /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = 504EC30E1FED79650016851F /* Assets.xcassets */; };
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		2FAD9762203C412B000D30F8 /* config.xml */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = config.xml; sourceTree = "<group>"; };
		504EC30C1FED79650016851F /* Base */ = {isa = PBXFileReference; lastKnownFileType = file.storyboard; name = Base; path = Base.lproj/Main.storyboard; sourceTree = "<group>"; };
		504EC30E1FED79650016851F /* Assets.xcassets */ = {isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXGroup section */
		504EC3051FED79650016851F /* Products */ = {
			isa = PBXGroup;
			children = (
			);
			name = Products;
			sourceTree = "<group>";
		};
		504EC3061FED79650016851F /* App */ = {
			isa = PBXGroup;
			children = (
				504EC30B1FED79650016851F /* Main.storyboard */,
				504EC30E1FED79650016851F /* Assets.xcassets */,
				2FAD9762203C412B000D30F8 /* config.xml */,
			);
			path = App;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXProject section */
		504EC2FC1FED79650016851F /* Project object */ = {
			isa = PBXProject;
			compatibilityVersion = "Xcode 8.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
		};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		504EC3021FED79650016851F /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				504EC30F1FED79650016851F /* Assets.xcassets in Resources */,
				504EC30D1FED79650016851F /* Main.storyboard in Resources */,
				2FAD9763203C412B000D30F8 /* config.xml in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXResourcesBuildPhase section */

/* Begin PBXVariantGroup section */
		504EC30B1FED79650016851F /* Main.storyboard */ = {
			isa = PBXVariantGroup;
			children = (
				504EC30C1FED79650016851F /* Base */,
			);
			name = Main.storyboard;
			sourceTree = "<group>";
		};
/* End PBXVariantGroup section */

`;
const PBXPROJ_FULL = `${PBXPROJ_OBJECTS}${PBXPROJ}\n\t};\n}\n`;

// Capacitor 8's Info.plist, as its template writes it (uneven indents included).
const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CAPACITOR_DEBUG</key>
	<string>$(CAPACITOR_DEBUG)</string>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
        <string>BotolaGO</string>
	<key>LSRequiresIPhoneOS</key>
	<true/>
	<key>UIApplicationSceneManifest</key>
	<dict>
		<key>UIApplicationSupportsMultipleScenes</key>
    <false/>
    <key>UISceneConfigurations</key>
    <dict>
      <key>UIWindowSceneSessionRoleApplication</key>
      <array>
        <dict>
            <key>UISceneConfigurationName</key>
            <string>Default Configuration</string>
        </dict>
      </array>
    </dict>
	</dict>
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>armv7</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UISupportedInterfaceOrientations~ipad</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationPortraitUpsideDown</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<true/>
</dict>
</plist>
`;

const STYLES = `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <!-- Base application theme. -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="android:background">@null</item>
    </style>


    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>`;

/** The value of `key` in a plist's top-level dict, as text (enough for these files). */
function plistValue(text: string, key: string) {
  const found = new RegExp(
    `<key>${key.replace(/[~.]/g, "\\$&")}</key>\\s*(<string>[^<]*</string>|<array>[\\s\\S]*?</array>|<true/>|<false/>)`,
  ).exec(text);
  return found?.[1];
}

/** Every object id the project mentions, and the ones it defines. */
function pbxIds(text: string) {
  const mentioned = new Set(text.match(/\b[0-9A-F]{24}\b/g));
  const defined = new Set(
    [...text.matchAll(/^\t\t([0-9A-F]{24}) (?:\/\* [^*]+ \*\/ )?= \{/gm)].map((m) => m[1]),
  );
  return { mentioned, defined };
}

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

describe("patchInfoPlist", () => {
  test("French first and Arabic, the two photo permission texts, iPhone upright only", () => {
    const { text, changed } = patchInfoPlist(INFO_PLIST);
    expect(changed).toBe(true);
    expect(plistValue(text, "CFBundleDevelopmentRegion")).toBe("<string>fr</string>");
    expect(plistValue(text, "CFBundleLocalizations")).toBe(
      "<array>\n\t\t<string>fr</string>\n\t\t<string>ar</string>\n\t</array>",
    );
    expect(plistValue(text, "NSCameraUsageDescription")).toContain("appareil photo");
    expect(plistValue(text, "NSPhotoLibraryUsageDescription")).toContain("vos photos");
    expect(plistValue(text, "UISupportedInterfaceOrientations")).toBe(
      "<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>",
    );
    expect(text).not.toContain("UISupportedInterfaceOrientations~ipad");
    expect(text).not.toContain("Landscape");
    expect(text).not.toContain("PortraitUpsideDown");
  });

  test("keeps everything else, and the file stays one top-level dict", () => {
    const { text } = patchInfoPlist(INFO_PLIST);
    for (const kept of [
      "<key>CAPACITOR_DEBUG</key>",
      "<string>BotolaGO</string>",
      "<key>UIApplicationSceneManifest</key>",
      "<string>Default Configuration</string>",
      "<string>armv7</string>",
      "<key>UIViewControllerBasedStatusBarAppearance</key>",
    ]) {
      expect(text).toContain(kept);
    }
    expect(text.split("<dict>").length).toBe(text.split("</dict>").length);
    expect(text.split("<array>").length).toBe(text.split("</array>").length);
    expect(text.trimEnd().endsWith("</dict>\n</plist>")).toBe(true);
  });

  test("replaces a permission text that is already there instead of adding a second", () => {
    const english = INFO_PLIST.replace(
      "</dict>\n</plist>",
      "\t<key>NSCameraUsageDescription</key>\n\t<string>Camera</string>\n</dict>\n</plist>",
    );
    const { text } = patchInfoPlist(english);
    expect(text.split("<key>NSCameraUsageDescription</key>")).toHaveLength(2);
    expect(text).not.toContain("<string>Camera</string>");
  });

  test("changes nothing the second time", () => {
    const once = patchInfoPlist(INFO_PLIST).text;
    expect(patchInfoPlist(once)).toEqual({ text: once, changed: false });
  });

  test("refuses a file that is not a plist", () => {
    expect(() => patchInfoPlist("not a plist")).toThrow();
  });
});

describe("infoPlistStrings", () => {
  test("translates both permission texts, in French and Arabic", () => {
    for (const language of ["fr", "ar"]) {
      const text = infoPlistStrings(language);
      expect(text).toMatch(/^"NSCameraUsageDescription" = "[^"\n]+";$/m);
      expect(text).toMatch(/^"NSPhotoLibraryUsageDescription" = "[^"\n]+";$/m);
    }
    expect(infoPlistStrings("ar")).toMatch(/[؀-ۿ]/);
    expect(infoPlistStrings("fr")).toContain(
      plistValue(patchInfoPlist(INFO_PLIST).text, "NSCameraUsageDescription")!.slice(8, -9),
    );
  });
});

describe("patchPbxprojIphoneOnly", () => {
  test("sets the app target's Debug and Release to iPhone only, and nothing else", () => {
    const { text, changed } = patchPbxprojIphoneOnly(PBXPROJ);
    expect(changed).toBe(true);
    expect(text).not.toContain('TARGETED_DEVICE_FAMILY = "1,2";');
    expect(text.split("TARGETED_DEVICE_FAMILY = 1;")).toHaveLength(3);
    expect(text.replaceAll("TARGETED_DEVICE_FAMILY = 1;", 'TARGETED_DEVICE_FAMILY = "1,2";')).toBe(
      PBXPROJ,
    );
  });

  test("adds the setting when the template has none", () => {
    const none = PBXPROJ.replaceAll('\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";\n', "");
    const { text } = patchPbxprojIphoneOnly(none);
    for (const block of text.split("isa = XCBuildConfiguration;").slice(1)) {
      expect(block.includes("TARGETED_DEVICE_FAMILY = 1;")).toBe(
        block.includes("PRODUCT_BUNDLE_IDENTIFIER"),
      );
    }
  });

  test("changes nothing the second time", () => {
    const once = patchPbxprojIphoneOnly(PBXPROJ).text;
    expect(patchPbxprojIphoneOnly(once)).toEqual({ text: once, changed: false });
  });

  test("refuses a project with no app target", () => {
    expect(() => patchPbxprojIphoneOnly("/* nothing here */")).toThrow();
  });
});

describe("patchPbxprojResources", () => {
  const resources = (text: string) =>
    /isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/.exec(text)![1]!;
  const appGroup = (text: string) =>
    /\/\* App \*\/ = \{[\s\S]*?children = \(([\s\S]*?)\);/.exec(text)![1]!;

  test("ships the privacy manifest: a file of the App group, in the Resources build phase", () => {
    const { text, changed } = patchPbxprojResources(PBXPROJ_FULL);
    expect(changed).toBe(true);
    expect(text).toMatch(
      /\/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference; lastKnownFileType = text\.xml; path = PrivacyInfo\.xcprivacy; sourceTree = "<group>"; \};/,
    );
    expect(resources(text)).toContain("/* PrivacyInfo.xcprivacy in Resources */");
    expect(appGroup(text)).toContain("/* PrivacyInfo.xcprivacy */");
    // what was in the build phase is still there
    expect(resources(text)).toContain("/* Assets.xcassets in Resources */");
  });

  test("ships the French and Arabic permission texts as one localised file", () => {
    const { text } = patchPbxprojResources(PBXPROJ_FULL);
    expect(text).toContain("path = fr.lproj/InfoPlist.strings;");
    expect(text).toContain("path = ar.lproj/InfoPlist.strings;");
    expect(text).toMatch(
      /isa = PBXVariantGroup;\n\t\t\tchildren = \(\n\t\t\t\t\w{24} \/\* fr \*\/,\n\t\t\t\t\w{24} \/\* ar \*\/,\n\t\t\t\);\n\t\t\tname = InfoPlist\.strings;/,
    );
    expect(resources(text)).toContain("/* InfoPlist.strings in Resources */");
    expect(appGroup(text)).toContain("/* InfoPlist.strings */");
    expect(text).toContain("developmentRegion = fr;");
    expect(/knownRegions = \(([\s\S]*?)\);/.exec(text)![1]!.replace(/\s/g, "")).toBe(
      "en,Base,fr,ar,",
    );
  });

  test("every object it mentions is defined, once", () => {
    const { text } = patchPbxprojResources(PBXPROJ_FULL);
    const { mentioned, defined } = pbxIds(text);
    const before = pbxIds(PBXPROJ_FULL);
    // the cut-down fixture leaves some of Capacitor's objects out; nothing new may dangle
    const dangling = [...mentioned].filter((id) => !defined.has(id));
    const danglingBefore = [...before.mentioned].filter((id) => !before.defined.has(id));
    expect(dangling).toEqual(danglingBefore);
    expect(defined.size).toBe(before.defined.size + 6);
  });

  test("changes nothing the second time", () => {
    const once = patchPbxprojResources(PBXPROJ_FULL).text;
    expect(patchPbxprojResources(once)).toEqual({ text: once, changed: false });
  });

  test("refuses a project without the sections it adds to", () => {
    expect(() => patchPbxprojResources(PBXPROJ)).toThrow();
  });
});

describe("patchManifestNotificationIcon", () => {
  test("names the alert icon and its colour inside <application>", () => {
    const { text, changed } = patchManifestNotificationIcon(MANIFEST);
    expect(changed).toBe(true);
    const application = text.slice(text.indexOf("<application"), text.indexOf("</application>"));
    expect(application).toContain(
      'android:name="com.google.firebase.messaging.default_notification_icon"\n            android:resource="@drawable/ic_stat_notify" />',
    );
    expect(application).toContain(
      'android:name="com.google.firebase.messaging.default_notification_color"\n            android:resource="@color/botolago_notification" />',
    );
  });

  test("changes nothing the second time", () => {
    const once = patchManifestNotificationIcon(MANIFEST).text;
    expect(patchManifestNotificationIcon(once)).toEqual({ text: once, changed: false });
  });
});

describe("patchManifestPortrait", () => {
  test("holds the app's activity upright", () => {
    const { text, changed } = patchManifestPortrait(MANIFEST);
    expect(changed).toBe(true);
    expect(text).toContain(
      'android:name=".MainActivity"\n            android:screenOrientation="portrait"\n',
    );
    expect(text.replace('            android:screenOrientation="portrait"\n', "")).toBe(MANIFEST);
  });

  test("replaces another orientation, and changes nothing the second time", () => {
    const sensor = MANIFEST.replace(
      'android:name=".MainActivity"',
      'android:name=".MainActivity"\n            android:screenOrientation="sensor"',
    );
    const { text } = patchManifestPortrait(sensor);
    expect(text).not.toContain('"sensor"');
    expect(text.split("android:screenOrientation")).toHaveLength(2);
    expect(patchManifestPortrait(text)).toEqual({ text, changed: false });
  });

  test("refuses a manifest with no MainActivity", () => {
    expect(() => patchManifestPortrait("<manifest></manifest>")).toThrow();
  });
});

describe("patchSplashTheme", () => {
  test("gives the launch theme the plate colour and the icon's mark, and no other theme", () => {
    const { text, changed } = patchSplashTheme(STYLES);
    expect(changed).toBe(true);
    const launch = /<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/.exec(text)![0];
    expect(launch).toContain(
      '<item name="windowSplashScreenBackground">@color/botolago_splash_background</item>',
    );
    expect(launch).toContain(
      '<item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>',
    );
    expect(launch).toContain('<item name="android:background">@drawable/splash</item>');
    expect(text.split("windowSplashScreen")).toHaveLength(3);
  });

  test("changes nothing the second time", () => {
    const once = patchSplashTheme(STYLES).text;
    expect(patchSplashTheme(once)).toEqual({ text: once, changed: false });
  });

  test("refuses a styles file with no launch theme", () => {
    expect(() => patchSplashTheme("<resources></resources>")).toThrow();
  });
});

describe("the committed icons and launch screens (store-assets/app-icon/native)", () => {
  const png = (path: string) => {
    const bytes = readFileSync(join(NATIVE_ASSETS, path));
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    // width, height and colour type from the IHDR chunk (2 = RGB, 6 = RGBA)
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), type: bytes[25] };
  };
  const filesUnder = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? filesUnder(join(dir, entry.name))
        : [relative(NATIVE_ASSETS, join(dir, entry.name))],
    );
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

  test("iPhone: a 1024 icon with no transparency, and the launch image the storyboard names", () => {
    expect(png("ios/AppIcon.appiconset/AppIcon-512@2x.png")).toEqual({
      width: 1024,
      height: 1024,
      type: 2,
    });
    expect(readFileSync(join(NATIVE_ASSETS, "ios/AppIcon.appiconset/AppIcon-512@2x.png"))).toEqual(
      readFileSync(join(NATIVE_ASSETS, "../ios/AppIcon-1024.png")),
    );
    for (const set of ["AppIcon.appiconset", "Splash.imageset"]) {
      const contents = JSON.parse(
        readFileSync(join(NATIVE_ASSETS, "ios", set, "Contents.json"), "utf8"),
      ) as { images: { filename: string }[] };
      for (const image of contents.images) {
        expect(existsSync(join(NATIVE_ASSETS, "ios", set, image.filename))).toBe(true);
      }
    }
    for (const name of [
      "splash-2732x2732.png",
      "splash-2732x2732-1.png",
      "splash-2732x2732-2.png",
    ]) {
      expect(png(`ios/Splash.imageset/${name}`)).toMatchObject({ width: 2732, height: 2732 });
    }
  });

  test("Android: every launcher layer and the notification icon at every density", () => {
    for (const [name, k] of Object.entries(densities)) {
      for (const [file, dp] of [
        ["ic_launcher.png", 48],
        ["ic_launcher_round.png", 48],
        ["ic_launcher_foreground.png", 108],
        ["ic_launcher_background.png", 108],
        ["ic_launcher_monochrome.png", 108],
      ] as const) {
        const { width, height } = png(`android/res/mipmap-${name}/${file}`);
        expect({ file: `${name}/${file}`, width, height }).toEqual({
          file: `${name}/${file}`,
          width: dp * k,
          height: dp * k,
        });
      }
      expect(png(`android/res/drawable-${name}/ic_stat_notify.png`)).toEqual({
        width: 24 * k,
        height: 24 * k,
        type: 6,
      });
    }
  });

  test("Android: replaces every launch image Capacitor's template has, at its size", () => {
    const template = {
      drawable: [480, 320],
      "drawable-port-mdpi": [320, 480],
      "drawable-port-hdpi": [480, 800],
      "drawable-port-xhdpi": [720, 1280],
      "drawable-port-xxhdpi": [960, 1600],
      "drawable-port-xxxhdpi": [1280, 1920],
      "drawable-land-mdpi": [480, 320],
      "drawable-land-hdpi": [800, 480],
      "drawable-land-xhdpi": [1280, 720],
      "drawable-land-xxhdpi": [1600, 960],
      "drawable-land-xxxhdpi": [1920, 1280],
    };
    for (const [folder, [width, height]] of Object.entries(template)) {
      expect({ folder, ...png(`android/res/${folder}/splash.png`) }).toMatchObject({
        folder,
        width,
        height,
      });
    }
  });

  test("Android: every resource the patches point at is one of these files", () => {
    const files = filesUnder(join(NATIVE_ASSETS, "android/res")).join("\n");
    const colours = readFileSync(
      join(NATIVE_ASSETS, "android/res/values/botolago_colors.xml"),
      "utf8",
    );
    expect(colours).toContain('<color name="botolago_notification">#0151FC</color>');
    expect(colours).toContain('<color name="botolago_splash_background">#F2F5FA</color>');
    const patched = `${patchManifestNotificationIcon(MANIFEST).text}${patchSplashTheme(STYLES).text}`;
    for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
      const xml = readFileSync(join(NATIVE_ASSETS, "android/res/mipmap-anydpi-v26", name), "utf8");
      expect(xml).toContain("<monochrome ");
      for (const [, layer] of xml.matchAll(/@mipmap\/(\w+)/g)) {
        for (const density of Object.keys(densities)) {
          expect(files).toContain(`mipmap-${density}/${layer}.png`);
        }
      }
    }
    for (const [, kind, name] of patched.matchAll(
      /@(drawable|mipmap|color)\/(ic_stat_notify|ic_launcher_foreground|botolago_\w+)/g,
    )) {
      if (kind === "color") expect(colours).toContain(`<color name="${name}">`);
      else expect(files).toContain(`-xxxhdpi/${name}.png`);
    }
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
    "ios/App/App/Info.plist": INFO_PLIST,
    "ios/App/App.xcodeproj/project.pbxproj": PBXPROJ_FULL,
    "android/app/src/main/AndroidManifest.xml": MANIFEST,
    "android/app/src/main/res/values/styles.xml": STYLES,
    "android/app/src/main/res/drawable/splash.png": "Capacitor's logo",
    "android/app/build.gradle": BUILD_GRADLE,
  };
  // 10 patched files, 4 written ones (entitlements, privacy manifest, 2 translations), 3 sets of images
  const STEPS = 17;

  test("finishes both projects, then reports them as already done", () => {
    const root = project(FILES);
    const first = prepareNative(root);
    expect(first.report.filter((line) => line.startsWith("added:"))).toHaveLength(STEPS);
    expect(readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8")).toContain(
      "POST_NOTIFICATIONS",
    );
    expect(readFileSync(join(root, "ios/App/App/App.entitlements"), "utf8")).toContain(
      "<key>aps-environment</key>",
    );
    const pbxproj = readFileSync(join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    expect(pbxproj).toContain("CODE_SIGN_ENTITLEMENTS");
    expect(pbxproj).toContain("PrivacyInfo.xcprivacy in Resources");
    expect(pbxproj).toContain("TARGETED_DEVICE_FAMILY = 1;");
    expect(readFileSync(join(root, "ios/App/App/Info.plist"), "utf8")).toContain(
      "NSCameraUsageDescription",
    );
    const second = prepareNative(root);
    expect(second.report.filter((line) => line.startsWith("ok:"))).toHaveLength(STEPS);
    expect(second.report.filter((line) => line.startsWith("added:"))).toHaveLength(0);
  });

  test("writes the privacy manifest Apple asks for", () => {
    const root = project(FILES);
    prepareNative(root);
    const manifest = readFileSync(join(root, "ios/App/App/PrivacyInfo.xcprivacy"), "utf8");
    expect(plistValue(manifest, "NSPrivacyTracking")).toBe("<false/>");
    expect(manifest).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
    expect(manifest).toContain("<string>NSPrivacyAccessedAPICategoryUserDefaults</string>");
    expect(manifest).toMatch(
      /<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>CA92\.1<\/string>/,
    );
    expect(readFileSync(join(root, "ios/App/App/ar.lproj/InfoPlist.strings"), "utf8")).toBe(
      infoPlistStrings("ar"),
    );
  });

  test("puts the committed icons and launch screens in place, byte for byte", () => {
    const root = project(FILES);
    prepareNative(root);
    const pairs = [
      [
        "ios/AppIcon.appiconset/AppIcon-512@2x.png",
        "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
      ],
      [
        "ios/Splash.imageset/splash-2732x2732.png",
        "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png",
      ],
      [
        "ios/Splash.imageset/Contents.json",
        "ios/App/App/Assets.xcassets/Splash.imageset/Contents.json",
      ],
      ["android/res/drawable/splash.png", "android/app/src/main/res/drawable/splash.png"],
      [
        "android/res/mipmap-anydpi-v26/ic_launcher.xml",
        "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
      ],
      [
        "android/res/mipmap-xxxhdpi/ic_launcher.png",
        "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
      ],
      [
        "android/res/drawable-mdpi/ic_stat_notify.png",
        "android/app/src/main/res/drawable-mdpi/ic_stat_notify.png",
      ],
    ];
    for (const [from, to] of pairs) {
      expect({
        to,
        same: readFileSync(join(NATIVE_ASSETS, from!)).equals(readFileSync(join(root, to!))),
      }).toEqual({ to, same: true });
    }
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
    expect(missing).toBe(STEPS + 1);
    for (const [path, content] of Object.entries(FILES)) {
      expect(readFileSync(join(root, path), "utf8")).toBe(content);
    }
    expect(existsSync(join(root, "ios/App/App/PrivacyInfo.xcprivacy"))).toBe(false);
    expect(
      existsSync(join(root, "android/app/src/main/res/drawable-mdpi/ic_stat_notify.png")),
    ).toBe(false);
  });

  test("--check notices an icon that is not the committed one", () => {
    const root = project({ ...FILES, "android/app/google-services.json": "{}" });
    prepareNative(root);
    expect(prepareNative(root, { check: true }).missing).toBe(0);
    writeFileSync(
      join(root, "android/app/src/main/res/mipmap-hdpi/ic_launcher.png"),
      "Capacitor's X",
    );
    const { report, missing } = prepareNative(root, { check: true });
    expect(missing).toBe(1);
    expect(report.join("\n")).toContain("MISSING: Android icons");
  });

  test("a Capacitor launch image it has no replacement for fails the check", () => {
    const root = project({
      ...FILES,
      "android/app/google-services.json": "{}",
      "android/app/src/main/res/drawable-port-ldpi/splash.png": "Capacitor's logo",
    });
    prepareNative(root);
    const { report, missing } = prepareNative(root, { check: true });
    expect(missing).toBe(1);
    expect(report.join("\n")).toContain("res/drawable-port-ldpi/splash.png");
  });

  test("a project that was never created is skipped, not an error", () => {
    const { report, missing } = prepareNative(project({}));
    expect(missing).toBe(0);
    expect(report.length).toBeGreaterThan(0);
    expect(report.every((line) => line.startsWith("skipped:"))).toBe(true);
  });
});
