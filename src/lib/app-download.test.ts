import { describe, expect, test } from "bun:test";

import {
  APP_SHORT_URL,
  DOWNLOAD_PAGE_PATH,
  appRedirectTarget,
  storeForUserAgent,
} from "./app-download";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPAD_OLD =
  "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const BOTH = {
  ios: "https://apps.apple.com/app/id1234567890",
  android: "https://play.google.com/store/apps/details?id=botolago.com",
};

describe("storeForUserAgent", () => {
  test("an iPhone or an iPad that says so belongs to the App Store", () => {
    expect(storeForUserAgent(IPHONE)).toBe("ios");
    expect(storeForUserAgent(IPAD_OLD)).toBe("ios");
  });

  test("an Android phone belongs to Google Play", () => {
    expect(storeForUserAgent(ANDROID)).toBe("android");
  });

  test("a computer, an empty header or no header belongs to neither", () => {
    expect(storeForUserAgent(MAC)).toBeNull();
    expect(storeForUserAgent(WINDOWS)).toBeNull();
    expect(storeForUserAgent("")).toBeNull();
    expect(storeForUserAgent(null)).toBeNull();
    expect(storeForUserAgent(undefined)).toBeNull();
  });
});

describe("appRedirectTarget", () => {
  test("sends each phone to its own store when both are set", () => {
    expect(appRedirectTarget(IPHONE, BOTH)).toBe(BOTH.ios);
    expect(appRedirectTarget(ANDROID, BOTH)).toBe(BOTH.android);
  });

  test("sends a computer to the download page, which shows the code and both badges", () => {
    expect(appRedirectTarget(WINDOWS, BOTH)).toBe(DOWNLOAD_PAGE_PATH);
    expect(appRedirectTarget(MAC, BOTH)).toBe(DOWNLOAD_PAGE_PATH);
  });

  test("never sends a phone to a store whose address is not set yet", () => {
    const iosOnly = { ios: BOTH.ios, android: null };
    expect(appRedirectTarget(ANDROID, iosOnly)).toBe(DOWNLOAD_PAGE_PATH);
    expect(appRedirectTarget(IPHONE, iosOnly)).toBe(BOTH.ios);
    expect(appRedirectTarget(IPHONE, { ios: null, android: null })).toBe(DOWNLOAD_PAGE_PATH);
  });

  test("the QR code holds the site's own short address, not a store page", () => {
    expect(APP_SHORT_URL).toBe("https://botolago.com/app");
  });
});
