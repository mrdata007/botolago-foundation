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
  appId: "botolago.com",
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
    // Android only (Capacitor 8's built-in SystemBars). The site's viewport
    // meta says `viewport-fit=cover` (BG-0151), so on a WebView 140 or later
    // the page is drawn edge to edge and pads itself by `env(safe-area-*)`.
    // This hint tells the shell to expect `cover` from the first frame, so
    // the page does not jump from padded to edge-to-edge as it loads. The
    // default `insetsHandling` ("css") is kept: on an older WebView it keeps
    // the page boxed in, with the insets at 0. Takes effect at the next
    // native build.
    SystemBars: {
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
