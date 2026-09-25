import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The production-bundle smoke test (audit 2026-09-25, A09): the same
 * `vite build` the site ships, its Worker module served from `.output` (under
 * Bun, not workerd: see built-output-serve.ts), instead of the development
 * server every other browser suite uses.
 *
 * A production bundle refuses mock data by design (`selectAuthMode` and its
 * siblings throw on anything but `supabase` when `import.meta.env.PROD`), and
 * `.env.production` points it at the live project. So this build runs in its
 * own Vite mode, which leaves `.env.production` unread, with every data mode
 * on `supabase` and the Supabase URL on a local stub (`stub-supabase.ts`) that
 * answers from the same mock data the development server serves. Nothing in
 * it can reach the production project, and `assertBuiltAgainstStub` refuses to
 * serve a bundle that names it.
 */

/** playwright.config.ts writes this origin out too; change both together. */
export const BUILT_OUTPUT_PORT = 4318;
export const STUB_SUPABASE_PORT = 4319;
export const BUILT_OUTPUT_ORIGIN = `http://127.0.0.1:${BUILT_OUTPUT_PORT}`;
export const STUB_SUPABASE_ORIGIN = `http://127.0.0.1:${STUB_SUPABASE_PORT}`;
export const STUB_PUBLISHABLE_KEY = "sb_publishable_built_output_smoke";
export const BUILT_OUTPUT_MODE = "built-output-smoke";

/** The live project: the one thing this bundle must never contain. */
const PRODUCTION_PROJECT_REF = "tkewgajrljbwgwedqsxn";

export const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const OUTPUT_DIR = join(REPOSITORY_ROOT, ".output");

/** Everything `.env.production` sets, pointed at the stub instead. */
export const BUILT_OUTPUT_ENV: Readonly<Record<string, string>> = {
  VITE_AUTH_MODE: "supabase",
  VITE_FOOTBALL_DATA_MODE: "supabase",
  VITE_NEWS_DATA_MODE: "supabase",
  VITE_NOTIFICATIONS_DATA_MODE: "supabase",
  VITE_FANTASY_DATA_MODE: "supabase",
  VITE_PRIZES_DATA_MODE: "supabase",
  VITE_PREDICTIONS_DATA_MODE: "supabase",
  VITE_APP_URL: BUILT_OUTPUT_ORIGIN,
  VITE_SUPABASE_PROJECT_ID: "built-output-smoke",
  VITE_SUPABASE_URL: STUB_SUPABASE_ORIGIN,
  VITE_SUPABASE_PUBLISHABLE_KEY: STUB_PUBLISHABLE_KEY,
};

function codeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return codeFiles(path);
    return /\.(m?js|json)$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Throws unless `.output` holds a build made for the stub: one that names the
 * stub's origin and never the production project.
 */
export function assertBuiltAgainstStub(outputDir = OUTPUT_DIR): void {
  let files: string[];
  try {
    files = codeFiles(outputDir);
  } catch {
    throw new Error(`No build in ${outputDir}. Run \`bun tests/e2e/built-output-build.ts\` first.`);
  }
  let namesStub = false;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (text.includes(PRODUCTION_PROJECT_REF)) {
      throw new Error(
        `${file} names the production project. This is not the smoke build; ` +
          "rebuild with `bun tests/e2e/built-output-build.ts` before serving it.",
      );
    }
    namesStub ||= text.includes(STUB_SUPABASE_ORIGIN);
  }
  if (!namesStub) {
    throw new Error(
      `Nothing in ${outputDir} points at ${STUB_SUPABASE_ORIGIN}. ` +
        "Rebuild with `bun tests/e2e/built-output-build.ts`.",
    );
  }
}
