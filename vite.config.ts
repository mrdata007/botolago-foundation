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
// otherwise the checkout's own HEAD; without git the release reads "unknown".
if (!process.env.VITE_RELEASE_SHA) {
  try {
    process.env.VITE_RELEASE_SHA = execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // Not a git checkout: the release stays unknown.
  }
}

// FE-C2: the browser build puts the big libraries in a few stable files
// instead of dozens of tiny ones. Before this, the home page downloaded about
// 120 separate scripts, many of them a few hundred bytes (one per icon, one
// per router hook), each one a separate request for a phone to make.
// The groups are claimed in priority order, highest first, so React lands in
// `react` and not in a group whose library depends on it. Browser build only:
// the server build keeps its own layout.
const libraryGroups = [
  { name: "react", test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 60 },
  {
    name: "tanstack",
    // Not the start-up code (`hydrateStart`, `StartClient`, the default
    // entry): it imports the app's own router, and a group takes in what its
    // modules import, so it would pull the whole app into this file.
    test: (id: string) =>
      /[\\/]node_modules[\\/](@tanstack|seroval|seroval-plugins)[\\/]/.test(id) &&
      !/(hydrateStart|StartClient|default-entry)/.test(id),
    priority: 50,
  },
  { name: "supabase", test: /[\\/]node_modules[\\/]@supabase[\\/]/, priority: 40 },
  {
    name: "motion",
    test: /[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/,
    priority: 30,
  },
  { name: "radix", test: /[\\/]node_modules[\\/]@radix-ui[\\/]/, priority: 20 },
  // Each icon is a few hundred bytes; on their own they were a request each.
  { name: "icons", test: /[\\/]node_modules[\\/]lucide-react[\\/]/, priority: 10 },
];

function clientLibraryChunks() {
  return {
    name: "botolago:client-library-chunks",
    configEnvironment(name: string) {
      if (name !== "client") return;
      return {
        build: { rolldownOptions: { output: { codeSplitting: { groups: libraryGroups } } } },
      };
    },
  };
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
    plugins: [mcpPlugin(), clientLibraryChunks()],
  },
});
