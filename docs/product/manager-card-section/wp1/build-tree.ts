/**
 * Builds one tree (this branch, or the base commit extracted somewhere) as the production bundle
 * against the local stub backend, so two trees can be compared like for like.
 *
 *   bun docs/product/manager-card-section/wp1/build-tree.ts <treeDir> [stubOrigin]
 *
 * The same `vite build` the site ships, in its own mode (so `.env.production` is not read), every
 * data mode on `supabase`, the Supabase URL on the stub, the release sha pinned so the
 * `botolago-release` meta tag does not differ, and no Manager Card preview. Nothing can reach the
 * production project. The output lands in `<treeDir>/.output`.
 */
const [treeDir, stubOrigin = "http://127.0.0.1:4187"] = process.argv.slice(2);
if (!treeDir) throw new Error("usage: build-tree.ts <treeDir> [stubOrigin]");

const env: Record<string, string> = {
  ...(process.env as Record<string, string>),
  VITE_AUTH_MODE: "supabase",
  VITE_FOOTBALL_DATA_MODE: "supabase",
  VITE_NEWS_DATA_MODE: "supabase",
  VITE_NOTIFICATIONS_DATA_MODE: "supabase",
  VITE_FANTASY_DATA_MODE: "supabase",
  VITE_PRIZES_DATA_MODE: "supabase",
  VITE_PREDICTIONS_DATA_MODE: "supabase",
  VITE_PEPITES_DATA_MODE: "supabase",
  VITE_APP_URL: stubOrigin,
  VITE_SUPABASE_PROJECT_ID: "off-compare",
  VITE_SUPABASE_URL: stubOrigin,
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_off_compare",
  VITE_RELEASE_SHA: "off-compare",
};
delete env.VITE_MANAGER_CARD_PREVIEW;

const build = Bun.spawnSync(["./node_modules/.bin/vite", "build", "--mode", "off-compare"], {
  cwd: treeDir,
  env,
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(build.exitCode ?? 1);
