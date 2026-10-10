/**
 * Runs the repo's own probes on the Gradins screens: `scripts/qa/layout-probe.mjs` (element
 * rectangles past the viewport, clipped and spilling text; NOT scrollWidth, which
 * `overflow-x: clip` hides) and `scripts/qa/contrast-probe.mjs` (WCAG ratios read from rendered
 * pixels). Neither signs in or finds the sandbox's Chromium by itself, so this wrapper reads the
 * probe's source, seeds the mock demo account into storage in its init script (as `harness.mjs`
 * does), points its browser at this Chromium, writes the result beside it as a temporary file,
 * runs it and removes the file. The probes themselves are not edited.
 *
 *   BASE=http://127.0.0.1:4183 node docs/product/manager-card-section/wp3/repo-probe.mjs \
 *     --kind layout|contrast [--routes "/gradins?mc=rated,/gradins/carte?mc=rated"]
 *     [--langs fr,ar] [--widths 390,1440] [--theme light|dark] [--visitor] [--all]
 *
 * `--theme dark` is the phone set to dark (the theme's own pre-paint path); `--all` makes the
 * contrast probe measure every visible text from pixels, not only what its first pass nominates.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..", "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const kind = flag("kind", "contrast");
if (!["layout", "contrast"].includes(kind)) throw new Error("--kind layout|contrast");
const BASE = process.env.BASE ?? "http://127.0.0.1:4183";
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const visitor = args.includes("--visitor");

const user = {
  id: "usr_wp3_capture",
  email: "demo@botolago.ma",
  displayName: "Rachid Demo",
  username: "rachid_demo",
  language: "fr",
  notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
  profileComplete: true,
  createdAt: "2026-09-01T10:00:00.000Z",
  verified: true,
  provider: "email",
  favoriteClubId: "war",
  passwordDigest: "mock:0",
};
const seed =
  `localStorage.setItem("botolago.welcomed", "1");` +
  `localStorage.setItem("botolago.prizes.welcome.v1", "1");` +
  `sessionStorage.setItem("botolago.splashShown", "1");` +
  (visitor
    ? ""
    : `localStorage.setItem("botolago.auth.users", JSON.stringify([${JSON.stringify(user)}]));` +
      `localStorage.setItem("botolago.auth.session", JSON.stringify({ kind: "user", userId: ${JSON.stringify(user.id)}, createdAt: ${JSON.stringify(user.createdAt)} }));`);

const file = `${kind}-probe.mjs`;
let source = readFileSync(join(repo, "scripts", "qa", file), "utf8");
const must = (from, to) => {
  if (!source.includes(from)) throw new Error(`${file} changed: ${from} not found`);
  source = source.replace(from, to);
};
must(
  'localStorage.setItem("botolago.language", l);',
  `localStorage.setItem("botolago.language", l);${seed}`,
);
must(
  "SPKI ? { args: [`--ignore-certificate-errors-spki-list=${SPKI}`] } : {},",
  `{ executablePath: ${JSON.stringify(CHROMIUM)}, args: ["--no-sandbox"] },`,
);

const temp = join(repo, "scripts", "qa", `.wp3-${file}`);
writeFileSync(temp, source);
try {
  const result = spawnSync("node", [temp], {
    stdio: "inherit",
    cwd: repo,
    env: {
      ...process.env,
      PROBE_BASE: BASE,
      PROBE_ROUTES: flag("routes", "/gradins?mc=rated"),
      PROBE_LANGS: flag("langs", "fr"),
      PROBE_WIDTHS: flag("widths", "390"),
      PROBE_THEME: flag("theme", "light") === "dark" ? "system" : "light",
      ...(args.includes("--all") ? { PROBE_ALL: "1" } : {}),
    },
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temp, { force: true });
}
