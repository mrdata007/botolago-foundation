import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The pitch demo: the real BotolaGO screens, run on sample data, as one
 * self-contained page (`bun run demo:build`, see demo/README.md).
 *
 * It is a separate Vite app on purpose. It imports the product's own
 * components, tokens, fonts and pictures from `src/`, but it is not a route of
 * the product and nothing in `src/` imports it, so it cannot change what
 * botolago.com serves.
 */
const demoRoot = fileURLToPath(new URL(".", import.meta.url));
const srcRoot = fileURLToPath(new URL("../src", import.meta.url));

// Every data service the imported code could reach is pinned to its local
// mock. The demo never reads or writes a real BotolaGO database.
const env = {
  VITE_AUTH_MODE: "mock",
  VITE_FOOTBALL_DATA_MODE: "mock",
  VITE_NEWS_DATA_MODE: "mock",
  VITE_NOTIFICATIONS_DATA_MODE: "mock",
  VITE_FANTASY_DATA_MODE: "mock",
  VITE_PRIZES_DATA_MODE: "mock",
  VITE_PREDICTIONS_DATA_MODE: "mock",
  VITE_SUPABASE_PROJECT_ID: "demo",
  VITE_SUPABASE_URL: "http://127.0.0.1:9",
  VITE_SUPABASE_PUBLISHABLE_KEY: "demo",
  VITE_APP_URL: "https://botolago.com",
  VITE_RELEASE_SHA: "demo",
};

export default defineConfig({
  root: demoRoot,
  base: "./",
  // `src/fonts.css` asks for `/fonts/…`: serve the product's public folder so
  // those resolve. The build then embeds each font (demo/scripts/build.ts).
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": srcRoot } },
  define: Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  ),
  server: { host: "127.0.0.1", port: 4310, strictPort: true },
  build: {
    outDir: "dist/app",
    emptyOutDir: true,
    // One page, everything inside it: fonts, crests, photos, the Arabic
    // dictionary. `demo/scripts/build.ts` then folds the JS and CSS in too.
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    // One self-contained page is the point; its size is expected.
    chunkSizeWarningLimit: 4096,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
