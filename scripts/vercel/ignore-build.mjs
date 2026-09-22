/**
 * Vercel Ignored Build Step.
 *
 * Why this exists: every push to every branch was triggering a preview build
 * on both Vercel projects in the team. Agent branches push often, and on
 * 2026-09-21 that exhausted the team's deployment quota — every deployment,
 * on every PR, failed with "Deployment rate limited — retry in 24 hours",
 * including deployments nobody was waiting on.
 *
 * A preview is only worth a build slot when a person is going to look at it.
 * That means `main`, and pull requests their author has marked ready for
 * review. Drafts and bare work-branch pushes are not.
 *
 * EXIT CODE SEMANTICS ARE INVERTED, and Vercel defines them, not us:
 *   exit 0 -> "ignore this build"  (SKIP)
 *   exit 1 -> "do not ignore it"   (BUILD)
 * Getting these the wrong way round silently stops all deploys, so every
 * return below names which one it means.
 *
 * Dependency-free ESM on node builtins, like the repo's other guards, because
 * this runs before `bun install` in the Vercel build container.
 */

const SKIP = 0;
const BUILD = 1;

const DEFAULT_BRANCH = "main";

function finish(code, reason) {
  const verb = code === BUILD ? "BUILD" : "SKIP";
  process.stdout.write(`vercel-ignore-build: ${verb} — ${reason}\n`);
  process.exit(code);
}

/**
 * Is this pull request still a draft?
 *
 * The repository is public, so this is an unauthenticated read and needs no
 * token configured on the Vercel project. `GITHUB_TOKEN` is used when present
 * purely to get the higher rate limit.
 */
async function isDraftPullRequest(owner, repo, number) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "botolago-vercel-ignore" };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }
  const pull = await response.json();
  if (typeof pull.draft !== "boolean") {
    throw new Error("GitHub API response carried no draft flag");
  }
  return pull.draft;
}

async function main() {
  const environment = process.env.VERCEL_ENV;
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "";
  const pullNumber = process.env.VERCEL_GIT_PULL_REQUEST_ID ?? "";
  const owner = process.env.VERCEL_GIT_REPO_OWNER ?? "";
  const repo = process.env.VERCEL_GIT_REPO_SLUG ?? "";

  // Production is never gated. A production deployment is a release, and no
  // heuristic in this file gets to stand between `main` and the live site.
  if (environment === "production") {
    finish(BUILD, "production deployment");
  }

  if (ref === DEFAULT_BRANCH) {
    finish(BUILD, `${DEFAULT_BRANCH} branch`);
  }

  // A branch push with no pull request open is work in progress by definition:
  // there is no review surface for a preview to serve.
  if (!pullNumber) {
    finish(SKIP, `no pull request open for '${ref}'`);
  }

  if (!owner || !repo) {
    // Cannot identify the repository, so cannot establish that a person is
    // waiting on this. Closed by default: a missing preview is one click to
    // redeploy, whereas an exhausted quota blocks every project for a day.
    finish(SKIP, "repository owner/slug not provided by Vercel");
  }

  let draft;
  try {
    draft = await isDraftPullRequest(owner, repo, pullNumber);
  } catch (error) {
    finish(SKIP, `could not read PR #${pullNumber} draft state (${error.message})`);
  }

  if (draft) {
    finish(SKIP, `PR #${pullNumber} is a draft`);
  }

  finish(BUILD, `PR #${pullNumber} is ready for review`);
}

await main();
