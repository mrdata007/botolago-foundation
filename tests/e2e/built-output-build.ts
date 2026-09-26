/**
 * Builds the production bundle for the smoke test: `vite build`, in its own
 * mode so `.env.production` is not read, against the local stub backend
 * (see built-output-env.ts). Then checks the result names no production
 * project before anything serves it.
 *
 *   bun tests/e2e/built-output-build.ts
 */
import {
  assertBuiltAgainstStub,
  BUILT_OUTPUT_ENV,
  BUILT_OUTPUT_MODE,
  REPOSITORY_ROOT,
} from "./built-output-env";

const build = Bun.spawnSync(["./node_modules/.bin/vite", "build", "--mode", BUILT_OUTPUT_MODE], {
  cwd: REPOSITORY_ROOT,
  env: { ...process.env, ...BUILT_OUTPUT_ENV },
  stdout: "inherit",
  stderr: "inherit",
});
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);

assertBuiltAgainstStub();
console.log("Built the production bundle against the local stub backend.");
