// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { execSync } from "node:child_process";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// The commit this build is made from, so the live site can say which code it
// runs (`x-botolago-release` header, `botolago-release` meta tag, and every
// operational error event). On 2026-09-24 the live login page was days behind
// `main` and nothing showed it. A CI or host that sets VITE_RELEASE_SHA wins;
// otherwise the checkout's own HEAD, then the commit variables of common build
// hosts (Workers Builds, Pages, GitHub, Vercel, Netlify, Lovable); with none of
// them the release reads "unknown".
const RELEASE_ENV_VARS = [
  "WORKERS_CI_COMMIT_SHA",
  "CF_PAGES_COMMIT_SHA",
  "GITHUB_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "COMMIT_REF",
  "LOVABLE_COMMIT_SHA",
];

function validRelease(value: string | undefined): string | undefined {
  const sha = value?.trim().toLowerCase();
  return sha && /^[0-9a-f]{7,40}$/.test(sha) ? sha : undefined;
}

if (!validRelease(process.env.VITE_RELEASE_SHA)) {
  let release: string | undefined;
  try {
    release = validRelease(
      execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString(),
    );
  } catch {
    // Not a git checkout: fall back to the build host's own variables.
  }
  for (const name of RELEASE_ENV_VARS) release ??= validRelease(process.env[name]);
  if (release) process.env.VITE_RELEASE_SHA = release;
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    router: {
      // Keep colocated route tests out of TanStack's file-based route discovery.
      routeFileIgnorePattern: "\\.test\\.",
    },
  },
  vite: {
    plugins: [mcpPlugin()],
  },
});
