import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * codemagic.yaml is the only description of how the phone apps are built, and it
 * cannot be run here (it needs Codemagic's Macs). These tests hold what can be
 * checked without it: that it parses, that every command it runs exists in this
 * repository, in the order it needs, that it matches the app's own settings, and
 * that nothing in it can release anything or hold a secret.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

interface Step {
  name?: string;
  script?: string;
}
interface Workflow {
  name: string;
  instance_type: string;
  max_build_duration: number;
  integrations?: Record<string, string>;
  environment: {
    android_signing?: string[];
    groups?: string[];
    ios_signing?: { distribution_type: string; bundle_identifier: string };
    vars?: Record<string, string>;
    java?: number | string;
    node?: string;
    xcode?: string;
  };
  scripts: Step[];
  artifacts: string[];
  publishing?: Record<string, unknown>;
  triggering?: unknown;
}

const raw = read("codemagic.yaml");
const config = Bun.YAML.parse(raw) as { workflows: Record<string, Workflow> };
const { android, ios } = config.workflows;
const commands = (workflow: Workflow) => workflow.scripts.map((step) => step.script ?? "");
const indexOfCommand = (workflow: Workflow, needle: string) =>
  commands(workflow).findIndex((script) => script.includes(needle));
const packageScripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> })
  .scripts;
const appId = /appId:\s*"([^"]+)"/.exec(read("capacitor.config.ts"))?.[1];

describe("codemagic.yaml", () => {
  test("has the two workflows, each with its shared setup resolved", () => {
    expect(Object.keys(config.workflows).sort()).toEqual(["android", "ios"]);
    for (const workflow of [android, ios]) {
      expect(workflow.scripts[0]?.name).toBe("Install dependencies");
      expect(workflow.environment.vars?.APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
      expect(workflow.environment.node).toMatch(/^22\./);
      expect(workflow.max_build_duration).toBeLessThanOrEqual(120);
      expect(workflow.artifacts.length).toBeGreaterThan(0);
    }
  });

  test("installs exactly what the lockfile says", () => {
    expect(commands(android)[0]).toContain("bun install --frozen-lockfile");
    expect(existsSync(join(root, "bun.lock"))).toBe(true);
  });

  test("the iPhone app id is the one the app is configured with", () => {
    expect(appId).toBeTruthy();
    expect(ios.environment.ios_signing?.bundle_identifier).toBe(appId);
    expect(ios.environment.ios_signing?.distribution_type).toBe("app_store");
  });

  test("every repository command it runs exists", () => {
    for (const workflow of [android, ios]) {
      for (const script of commands(workflow)) {
        for (const match of script.matchAll(/bun run ([\w:-]+)/g)) {
          expect({ command: match[1], exists: match[1]! in packageScripts }).toEqual({
            command: match[1],
            exists: true,
          });
        }
        for (const match of script.matchAll(/bun (scripts\/[\w/.-]+)/g)) {
          expect({ file: match[1], exists: existsSync(join(root, match[1]!)) }).toEqual({
            file: match[1],
            exists: true,
          });
        }
      }
    }
    expect(packageScripts["mobile:prepare"]).toContain("scripts/mobile/prepare-native.mjs");
    expect(packageScripts["mobile:check"]).toContain("--check");
  });

  test("creates the project, finishes it, numbers it, then syncs, in that order", () => {
    for (const [workflow, platform] of [
      [android, "android"],
      [ios, "ios"],
    ] as const) {
      const steps = [
        indexOfCommand(workflow, `cap add ${platform}`),
        indexOfCommand(workflow, "mobile:prepare"),
        indexOfCommand(workflow, "set-build-number.mjs"),
        indexOfCommand(workflow, `cap sync ${platform}`),
      ];
      expect(steps.every((step) => step >= 0)).toBe(true);
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
      // "create" and "finish" may share one step, but never the other way round
      expect(steps[0]).toBeLessThanOrEqual(steps[1]!);
      expect(steps[1]).toBeLessThan(steps[2]!);
      expect(steps[2]).toBeLessThan(steps[3]!);
    }
  });

  test("Android: Firebase's file is written before the check that needs it", () => {
    const script = commands(android).find((entry) => entry.includes("cap add android")) ?? "";
    expect(script.indexOf("GOOGLE_SERVICES_JSON_BASE64:?")).toBeGreaterThanOrEqual(0);
    expect(script.indexOf("google-services.json")).toBeLessThan(script.indexOf("mobile:check"));
    expect(script.indexOf("mobile:prepare")).toBeLessThan(script.indexOf("mobile:check"));
    expect(android.environment.groups).toEqual(["botolago_mobile"]);
    expect(String(android.environment.java)).toBe("21");
  });

  test("Android: signs with the botolago_keystore and builds the Google Play bundle and an apk", () => {
    expect(android.environment.android_signing).toEqual(["botolago_keystore"]);
    const build = indexOfCommand(android, "./gradlew");
    expect(build).toBeGreaterThan(indexOfCommand(android, "cap sync android"));
    const script = commands(android)[build]!;
    // the release tasks, not the debug ones (a debug build is signed with a throwaway key)
    expect(script).toMatch(
      /\.\/gradlew (bundleRelease assembleRelease|assembleRelease bundleRelease)\b/,
    );
    expect(script).not.toContain("Debug");
    // a missing keystore stops the build with a message, before Gradle makes an unsigned one
    expect(script.indexOf('"${CM_KEYSTORE_PATH:?')).toBeGreaterThanOrEqual(0);
    expect(script.indexOf("CM_KEYSTORE_PATH:?")).toBeLessThan(script.indexOf("./gradlew"));
    expect(android.artifacts).toContain("android/app/build/outputs/**/*.aab");
    expect(android.artifacts).toContain("android/app/build/outputs/**/*.apk");
    // the signing build.gradle reads is the one Codemagic provides for that keystore
    const prepare = read("scripts/mobile/prepare-native.mjs");
    for (const variable of [
      "CM_KEYSTORE_PATH",
      "CM_KEYSTORE_PASSWORD",
      "CM_KEY_ALIAS",
      "CM_KEY_PASSWORD",
    ]) {
      expect(prepare).toContain(`System.getenv("${variable}")`);
    }
  });

  test("iPhone: checks the finished project before building it", () => {
    const script = commands(ios).find((entry) => entry.includes("cap add ios")) ?? "";
    expect(script.indexOf("mobile:prepare")).toBeGreaterThanOrEqual(0);
    expect(script.indexOf("mobile:prepare")).toBeLessThan(script.indexOf("mobile:check"));
  });

  test("iPhone: signs with the App Store Connect key, then builds the ipa from the project", () => {
    expect(ios.integrations?.app_store_connect).toBe("botolago_app_store_connect");
    const use = indexOfCommand(ios, "xcode-project use-profiles");
    const build = indexOfCommand(ios, "xcode-project build-ipa");
    expect(use).toBeGreaterThan(indexOfCommand(ios, "cap sync ios"));
    expect(build).toBeGreaterThan(use);
    expect(ios.environment.vars?.XCODE_PROJECT).toBe("ios/App/App.xcodeproj");
    expect(commands(ios)[build]).toContain('--project "$XCODE_PROJECT"');
    expect(ios.artifacts.join(" ")).toContain(".ipa");
  });

  test("never releases anything: no triggers, no review, no store, no Google Play", () => {
    // Google Play publishing would be a publishing.google_play block; the .aab is uploaded by hand.
    expect(raw).not.toMatch(/^\s*triggering:/m);
    for (const workflow of [android, ios]) expect(workflow.triggering).toBeUndefined();
    expect(android.publishing).toBeUndefined();
    const store = ios.publishing?.app_store_connect as Record<string, unknown>;
    expect(store.auth).toBe("integration");
    expect(store.submit_to_testflight).toBe(false);
    expect(store.submit_to_app_store).toBe(false);
    expect(store.beta_groups).toBeUndefined();
    expect(raw).not.toContain("google_play");
  });

  test("holds no secret: everything sensitive is a name Codemagic fills in", () => {
    expect(raw).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(raw).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(raw).not.toMatch(/\.p8\b/);
    for (const variable of Object.values(android.environment.vars ?? {})) {
      expect(variable).toMatch(/^[\d.]+$/);
    }
    // the build number and keystore come from Codemagic, never from this file
    expect(raw).toContain('"$BUILD_NUMBER"');
    expect(raw).not.toMatch(/CM_KEYSTORE_PASSWORD\s*[:=]/);
  });

  test("the names it asks Codemagic for are the names the guide tells you to create", () => {
    const guide = read("docs/mobile/PHONE_APP.md");
    for (const name of [
      "botolago_keystore",
      "botolago_mobile",
      "botolago_app_store_connect",
      "GOOGLE_SERVICES_JSON_BASE64",
    ]) {
      expect({ name, inGuide: guide.includes(name) }).toEqual({ name, inGuide: true });
    }
  });
});
