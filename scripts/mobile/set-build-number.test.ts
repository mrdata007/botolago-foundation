import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  checkNumbers,
  setBuildNumber,
  setGradleVersion,
  setPbxprojVersion,
} from "./set-build-number.mjs";

const PBXPROJ = `\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = botolago.com;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tMARKETING_VERSION = 1.0;
`;
const GRADLE = `android {
    defaultConfig {
        applicationId "botolago.com"
        versionCode 1
        versionName "1.0"
    }
}
`;

describe("the numbers", () => {
  test("a build number is a whole number from 1 that Android can hold", () => {
    expect(() => checkNumbers("42")).not.toThrow();
    expect(() => checkNumbers(7)).not.toThrow();
    for (const bad of ["0", "-1", "1.5", "abc", "", undefined, "2100000000000"]) {
      expect(() => checkNumbers(bad as never)).toThrow();
    }
  });

  test("a version looks like 1, 1.2 or 1.2.3, and nothing that could carry a command", () => {
    for (const good of ["1", "1.2", "1.2.3"]) expect(() => checkNumbers(1, good)).not.toThrow();
    for (const bad of ["1.2.3.4", "v1", "1.2;rm", '1"', "1 2"]) {
      expect(() => checkNumbers(1, bad)).toThrow();
    }
  });
});

describe("the iPhone project", () => {
  test("sets every build number, and the version only when asked", () => {
    const built = setPbxprojVersion(PBXPROJ, "42");
    expect(built.match(/CURRENT_PROJECT_VERSION = 42;/g)).toHaveLength(2);
    expect(built.match(/MARKETING_VERSION = 1\.0;/g)).toHaveLength(2);
    const versioned = setPbxprojVersion(PBXPROJ, "42", "1.2.0");
    expect(versioned.match(/MARKETING_VERSION = 1\.2\.0;/g)).toHaveLength(2);
    expect(versioned).toContain("PRODUCT_BUNDLE_IDENTIFIER = botolago.com;");
  });

  test("is the same when run again with the same numbers", () => {
    const once = setPbxprojVersion(PBXPROJ, "42", "1.2.0");
    expect(setPbxprojVersion(once, "42", "1.2.0")).toBe(once);
  });

  test("refuses a project it cannot read the numbers of", () => {
    expect(() => setPbxprojVersion("nothing", "1")).toThrow();
    expect(() => setPbxprojVersion("CURRENT_PROJECT_VERSION = 1;", "1", "1.0")).toThrow();
  });
});

describe("the Android project", () => {
  test("sets the version code, and the name only when asked", () => {
    expect(setGradleVersion(GRADLE, "42")).toContain("versionCode 42\n");
    expect(setGradleVersion(GRADLE, "42")).toContain('versionName "1.0"');
    expect(setGradleVersion(GRADLE, "42", "1.2.0")).toContain('versionName "1.2.0"');
    expect(setGradleVersion(GRADLE, "42", "1.2.0")).toContain('applicationId "botolago.com"');
  });

  test("is the same when run again", () => {
    const once = setGradleVersion(GRADLE, "42", "1.2.0");
    expect(setGradleVersion(once, "42", "1.2.0")).toBe(once);
  });

  test("refuses a file it cannot read the numbers of", () => {
    expect(() => setGradleVersion("android {}", "1")).toThrow();
  });
});

describe("setBuildNumber", () => {
  function project(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), "botolago-build-number-"));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  }

  test("sets both projects", () => {
    const root = project({
      "ios/App/App.xcodeproj/project.pbxproj": PBXPROJ,
      "android/app/build.gradle": GRADLE,
    });
    const report = setBuildNumber(root, "42", "1.2.0");
    expect(report.every((line) => line.startsWith("set:"))).toBe(true);
    expect(readFileSync(join(root, "android/app/build.gradle"), "utf8")).toContain(
      "versionCode 42",
    );
    expect(readFileSync(join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8")).toContain(
      "CURRENT_PROJECT_VERSION = 42;",
    );
  });

  test("a project that does not exist is skipped (each workflow builds only one)", () => {
    const root = project({ "android/app/build.gradle": GRADLE });
    const report = setBuildNumber(root, "7");
    expect(report[0]).toStartWith("skipped:");
    expect(report[1]).toStartWith("set:");
  });

  test("a bad number changes nothing", () => {
    const root = project({ "android/app/build.gradle": GRADLE });
    expect(() => setBuildNumber(root, "nope")).toThrow();
    expect(readFileSync(join(root, "android/app/build.gradle"), "utf8")).toBe(GRADLE);
  });
});
