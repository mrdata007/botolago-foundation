// Gives a cloud build its version numbers, in the native projects `cap add` created.
//
// Both stores refuse an upload whose build number they have already seen, and
// Capacitor's templates always say 1. The cloud build (codemagic.yaml) passes its
// own increasing build number:
//
//   bun scripts/mobile/set-build-number.mjs 42                  # build number only
//   bun scripts/mobile/set-build-number.mjs 42 --version 1.2.0  # and the version people see
//   bun scripts/mobile/set-build-number.mjs 42 --root some/dir
//
// iPhone: CURRENT_PROJECT_VERSION (the build number) and MARKETING_VERSION in the
// Xcode project. Android: versionCode and versionName in app/build.gradle.
// Safe to run again with the same numbers.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const VERSION_SHAPE = /^[0-9]+(\.[0-9]+){0,2}$/;

export function checkNumbers(buildNumber, version) {
  if (!/^[1-9][0-9]{0,8}$/.test(String(buildNumber))) {
    throw new Error(
      `the build number must be a whole number from 1 (Android caps it at 2100000000), got "${buildNumber}"`,
    );
  }
  if (version !== undefined && !VERSION_SHAPE.test(version)) {
    throw new Error(`the version must look like 1, 1.2 or 1.2.3, got "${version}"`);
  }
}

/** `source` (project.pbxproj) with the build number, and the version when given. */
export function setPbxprojVersion(source, buildNumber, version) {
  const count = (source.match(/CURRENT_PROJECT_VERSION = /g) ?? []).length;
  if (count === 0) throw new Error("project.pbxproj has no CURRENT_PROJECT_VERSION to set");
  let text = source.replace(
    /CURRENT_PROJECT_VERSION = [^;]+;/g,
    `CURRENT_PROJECT_VERSION = ${buildNumber};`,
  );
  if (version !== undefined) {
    if (!/MARKETING_VERSION = /.test(text))
      throw new Error("project.pbxproj has no MARKETING_VERSION to set");
    text = text.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
  }
  return text;
}

/** `source` (app/build.gradle) with versionCode, and versionName when given. */
export function setGradleVersion(source, buildNumber, version) {
  if (!/^\s*versionCode\s+\d+\s*$/m.test(source))
    throw new Error("build.gradle has no versionCode to set");
  let text = source.replace(/^(\s*versionCode\s+)\d+(\s*)$/m, `$1${buildNumber}$2`);
  if (version !== undefined) {
    if (!/^\s*versionName\s+"[^"]*"\s*$/m.test(text))
      throw new Error("build.gradle has no versionName to set");
    text = text.replace(/^(\s*versionName\s+)"[^"]*"(\s*)$/m, `$1"${version}"$2`);
  }
  return text;
}

/** Sets the numbers in whichever native projects exist under `root`; returns what it did. */
export function setBuildNumber(root, buildNumber, version) {
  checkNumbers(buildNumber, version);
  const report = [];
  const targets = [
    [join(root, "ios/App/App.xcodeproj/project.pbxproj"), setPbxprojVersion, "iPhone project"],
    [join(root, "android/app/build.gradle"), setGradleVersion, "Android project"],
  ];
  for (const [path, set, what] of targets) {
    if (!existsSync(path)) {
      report.push(`skipped: ${what} (no ${path})`);
      continue;
    }
    writeFileSync(path, set(readFileSync(path, "utf8"), buildNumber, version));
    report.push(`set: ${what} to build ${buildNumber}${version ? `, version ${version}` : ""}`);
  }
  return report;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const buildNumber = args.find(
    (arg, i) => !arg.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")),
  );
  try {
    for (const line of setBuildNumber(
      resolve(flag("--root") ?? "."),
      buildNumber,
      flag("--version"),
    )) {
      console.log(line);
    }
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}
