import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  APP_ID,
  androidAssetLinks,
  androidFingerprints,
  appleAppSiteAssociation,
  appleTeamId,
  associationResponse,
} from "./app-links";

const FINGERPRINT = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join(":");

describe("the configuration", () => {
  test("the app id is the one in capacitor.config.ts", () => {
    const config = readFileSync(join(process.cwd(), "capacitor.config.ts"), "utf8");
    expect(config).toContain(`appId: "${APP_ID}"`);
  });

  test("a Team ID is ten capitals or digits; anything else counts as unset", () => {
    expect(appleTeamId("abcde12345")).toBe("ABCDE12345");
    expect(appleTeamId(" ABCDE12345 ")).toBe("ABCDE12345");
    expect(appleTeamId("ABCDE1234")).toBeNull();
    expect(appleTeamId("TEAMID")).toBeNull();
    expect(appleTeamId(null)).toBeNull();
  });

  test("only well-formed SHA-256 fingerprints are kept", () => {
    expect(androidFingerprints([FINGERPRINT, "AA:BB", ""])).toEqual([FINGERPRINT.toUpperCase()]);
  });
});

describe("apple-app-site-association", () => {
  test("none while there is no Team ID", () => {
    expect(appleAppSiteAssociation(null)).toBeNull();
  });

  test("claims only the e-mail links' landing page for TEAM.botolago.com", () => {
    expect(appleAppSiteAssociation("ABCDE12345")).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["ABCDE12345.botolago.com"],
            components: [
              {
                "/": "/auth/callback",
                comment: "E-mail links (confirmation, password reset) open the app",
              },
            ],
          },
        ],
      },
    });
  });
});

describe("assetlinks.json", () => {
  test("none while there is no fingerprint", () => {
    expect(androidAssetLinks([])).toBeNull();
  });

  test("delegates links to the botolago.com package with its fingerprints", () => {
    expect(androidAssetLinks([FINGERPRINT])).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "botolago.com",
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });
});

describe("associationResponse", () => {
  test("404 while unset, so no phone trusts a half-made file", async () => {
    const response = associationResponse(null);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("JSON, without a redirect, once set", async () => {
    const response = associationResponse({ a: 1 });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ a: 1 });
  });
});
