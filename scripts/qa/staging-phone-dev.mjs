import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

// A public-key-only, LAN-bound staging server. Never inherit a production .env.
const ref = "srdrflfrfpwixsllveid";
const root = process.cwd();
const settings = parseEnv(readFileSync(resolve(root, ".env.phone.local"), "utf8"));
const host = settings.PHONE_LAN_IP || "";
const octets = host.split(".").map(Number);
if (
  isIP(host) !== 4 ||
  !(
    octets[0] === 10 ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
  )
) {
  throw new Error("PHONE_LAN_IP must be this Mac's private Wi-Fi IPv4 address");
}
const key = settings.STAGING_PUBLISHABLE_KEY || "";
if (!key.startsWith("sb_publishable_")) {
  throw new Error("Use Staging V2's publishable key; privileged keys are refused");
}
const env = {};
for (const name of ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]) {
  if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, {
  PHONE_LAN_IP: host,
  PHONE_TLS_CERT: resolve(root, ".phone.local/cert.pem"),
  PHONE_TLS_KEY: resolve(root, ".phone.local/key.pem"),
  VITE_APP_URL: `https://${host}:8443`,
  VITE_SUPABASE_PROJECT_ID: ref,
  VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: key,
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: key,
  VITE_RELEASE_SHA: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
});
for (const area of [
  "AUTH",
  "FOOTBALL",
  "NEWS",
  "NOTIFICATIONS",
  "FANTASY",
  "PRIZES",
  "PREDICTIONS",
  "PEPITES",
  "MANAGER_CARD",
]) {
  env[`VITE_${area}${area === "AUTH" ? "" : "_DATA"}_MODE`] = "supabase";
}
console.log(`Staging V2 only: https://${host}:8443 (Ctrl-C to stop)`);
const child = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--config", "vite.phone.config.ts"],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 1));
