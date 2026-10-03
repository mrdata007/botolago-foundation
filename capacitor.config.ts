import type { CapacitorConfig } from "@capacitor/cli";

// BotolaGO renders on the server (TanStack Start), so there is no static
// bundle to ship inside the app. The native shell loads the live site instead,
// and `capacitor/www` holds only the page shown when the phone is offline.
//
// CAP_SERVER_URL points the shell at another build (staging, or a dev server
// on your machine's LAN address) without editing this file.
const serverUrl = process.env.CAP_SERVER_URL ?? "https://botolago.com";

const config: CapacitorConfig = {
  appId: "com.botolago.app",
  appName: "BotolaGO",
  webDir: "capacitor/www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    errorPath: "index.html",
    // Pages the app may open inside itself; anything else opens in the browser.
    allowNavigation: ["botolago.com", "*.botolago.com", "*.supabase.co"],
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 800,
      backgroundColor: "#0c3164",
    },
  },
};

export default config;
