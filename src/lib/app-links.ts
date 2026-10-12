/**
 * The files that let botolago.com links open the phone app instead of the
 * browser: Apple's `apple-app-site-association` (Universal Links) and
 * Android's `assetlinks.json` (App Links), both served from
 * `https://botolago.com/.well-known/`. Only the e-mail links' landing page,
 * `/auth/callback`, is claimed (`APP_LINK_PATHS`), so a confirmation or
 * password-reset link tapped in Mail or Gmail signs the reader in inside the
 * app. Every other page of the site keeps opening in the browser.
 *
 * Both need a value only the owner has, so both are empty until it is written
 * here (docs/mobile/PHONE_APP.md, "Signing in inside the app", owner steps):
 *
 *  - `APPLE_TEAM_ID`: the 10-character Team ID of the Apple Developer account
 *    (developer.apple.com, Membership details). It is public: every app the
 *    account signs carries it. Setting it also makes
 *    `scripts/mobile/prepare-native.mjs` add the Associated Domains
 *    entitlement to the iPhone app, which the App ID at Apple must allow
 *    first, or the build's signing fails.
 *  - `ANDROID_CERT_SHA256`: the SHA-256 fingerprints of the certificates the
 *    Android app is signed with, as Google Play Console shows them (Test and
 *    release, App integrity, App signing: the "App signing key" one, and the
 *    "Upload key" one for the Codemagic `.apk`). Setting them also makes
 *    `prepare-native.mjs` add the verified link filter to the Android app.
 *
 * While a value is missing, its file answers 404 and the native side is left
 * without the link: the e-mail links open in the browser, as before.
 */

import { APP_LINK_PATHS } from "./native-oauth";

/** The app id at Apple and on Google Play (`capacitor.config.ts`). */
export const APP_ID = "botolago.com";

/** e.g. "ABCDE12345". `null` until the owner gives it. */
export const APPLE_TEAM_ID: string | null = null;

/** e.g. "14:6D:E9:…" (32 pairs). Empty until the owner gives them. */
export const ANDROID_CERT_SHA256: readonly string[] = [];

const TEAM_ID_SHAPE = /^[A-Z0-9]{10}$/;
const SHA256_SHAPE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** The Team ID if it is set and well-formed, else `null`. */
export function appleTeamId(value: string | null = APPLE_TEAM_ID): string | null {
  const id = value?.trim().toUpperCase() ?? "";
  return TEAM_ID_SHAPE.test(id) ? id : null;
}

/** The fingerprints that are well-formed, upper case. */
export function androidFingerprints(values: readonly string[] = ANDROID_CERT_SHA256): string[] {
  return values.map((value) => value.trim().toUpperCase()).filter((v) => SHA256_SHAPE.test(v));
}

/**
 * `apple-app-site-association`, or `null` while there is no Team ID. Apple's
 * current format (`components`, iOS 13 and later; the app needs iOS 15).
 */
export function appleAppSiteAssociation(teamId: string | null = appleTeamId()): object | null {
  if (!teamId) return null;
  return {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${APP_ID}`],
          components: APP_LINK_PATHS.map((path) => ({
            "/": path,
            comment: "E-mail links (confirmation, password reset) open the app",
          })),
        },
      ],
    },
  };
}

/** `assetlinks.json`, or `null` while there is no fingerprint. */
export function androidAssetLinks(
  fingerprints: readonly string[] = androidFingerprints(),
): object[] | null {
  if (fingerprints.length === 0) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_ID,
        sha256_cert_fingerprints: [...fingerprints],
      },
    },
  ];
}

/** The answer for one of the two files: the JSON, or 404 while it is not configured. */
export function associationResponse(body: object | null): Response {
  if (!body) {
    return new Response("Not configured", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response(JSON.stringify(body), {
    headers: {
      // Apple reads it without a file extension: it must say JSON.
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
