import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The BotolaGO phone app: a native shell around the live site.
 *
 * The site is server-rendered, so there is no static copy of it to put inside
 * the app. The shell opens it from the web (a site fix reaches the app at once)
 * and adds what a web page cannot do on a phone: push alerts first. Everything
 * is documented in docs/mobile/PHONE_APP.md, including the steps that need a
 * Mac (iOS) or Android Studio.
 *
 * `appId` is the app's bundle id on Apple and its application id on Google. It
 * MUST be the one registered with Apple (the push key's app) and in Firebase
 * (the Android app), and it is written into the native projects when they are
 * created, so check it before running `cap add`.
 */
const PRODUCTION_URL = "https://botolago.com";

// A staging or local copy of the site for a test build, never for a store build.
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || PRODUCTION_URL;

const config: CapacitorConfig = {
  appId: "com.botolago.app",
  appName: "BotolaGO",
  // Only holds the page shown when the site cannot be reached (see errorPath).
  webDir: "mobile/www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    errorPath: "offline.html",
  },
  plugins: {
    PushNotifications: {
      // An alert that arrives while the app is open is still shown, as a
      // banner and in the notification list, with its sound.
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
};

export default config;
