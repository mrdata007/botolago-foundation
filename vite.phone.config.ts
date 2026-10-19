import { readFileSync } from "node:fs";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const ref = "srdrflfrfpwixsllveid";
if (
  process.env.VITE_SUPABASE_URL !== `https://${ref}.supabase.co` ||
  process.env.SUPABASE_URL !== `https://${ref}.supabase.co` ||
  process.env.VITE_SUPABASE_PROJECT_ID !== ref ||
  !process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_") ||
  process.env.SUPABASE_PUBLISHABLE_KEY !== process.env.VITE_SUPABASE_PUBLISHABLE_KEY
) {
  throw new Error("Start with node scripts/qa/staging-phone-dev.mjs");
}

export default defineConfig({
  // The helper otherwise loads .env files itself, independently of Vite.
  envDefine: false,
  tanstackStart: {
    server: { entry: "server" },
    router: { routeFileIgnorePattern: "\\.test\\." },
  },
  vite: {
    envDir: false,
    server: {
      host: process.env.PHONE_LAN_IP,
      port: 8443,
      strictPort: true,
      https: {
        cert: readFileSync(process.env.PHONE_TLS_CERT!),
        key: readFileSync(process.env.PHONE_TLS_KEY!),
      },
    },
  },
});
