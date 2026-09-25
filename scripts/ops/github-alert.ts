/**
 * Failure alerts for production workflows, as GitHub issues.
 *
 * Until 2026-09-24 a red run was the only escalation channel and nobody
 * watched it. A failing production workflow now opens (or comments on) one
 * issue labelled `ops-alert` and mentions the owner, so GitHub notifies them
 * by e-mail and in the app; the next successful run closes it.
 *
 *   bun scripts/ops/github-alert.ts failure "<workflow>" [evidence.json]
 *   bun scripts/ops/github-alert.ts success "<workflow>"
 *
 * Needs GITHUB_TOKEN with `issues: write`. The issue carries the environment,
 * the job, the time, an error category read from the run's sanitised evidence
 * (verdict and code only), the run id and its link -- never a secret, a user
 * or a payload. Reporting never fails the job it reports on.
 */
import { readFile } from "node:fs/promises";

export const ALERT_LABEL = "ops-alert";
export const OWNER_MENTION = "@mrdata007";

export interface RunContext {
  repository: string;
  workflow: string;
  runId: string;
  runAttempt: string;
  serverUrl: string;
  sha: string;
  refName: string;
  event: string;
  now: Date;
}

export interface AlertCategory {
  category: string;
  detail: string;
}

const SAFE_CODE = /^[a-z][a-z0-9_]{1,100}$/;

/**
 * The error category from a run's evidence file: the verdict and the code the
 * scripts already sanitise. Anything else in the file is ignored.
 */
export function categorize(evidence: unknown): AlertCategory {
  if (!evidence || typeof evidence !== "object") {
    return { category: "workflow_failed", detail: "no evidence file; see the run log" };
  }
  const record = evidence as Record<string, unknown>;
  const verdict =
    typeof record.verdict === "string" && SAFE_CODE.test(record.verdict) ? record.verdict : null;
  const code =
    typeof record.code === "string" && SAFE_CODE.test(record.code)
      ? record.code
      : typeof record.errorCode === "string" && SAFE_CODE.test(record.errorCode)
        ? record.errorCode
        : null;
  const workers = Array.isArray(record.workers)
    ? (record.workers as Array<Record<string, unknown>>)
        .filter(
          (w) => w.outcome === "failed" && typeof w.code === "string" && SAFE_CODE.test(w.code),
        )
        .map((w) => `GW${Number(w.sequence) || "?"}: ${w.code as string}`)
    : [];
  const escalations = (() => {
    const watch = record.deadlineWatch as { escalations?: unknown[] } | undefined;
    return Array.isArray(watch?.escalations) ? watch.escalations.length : 0;
  })();
  // The watchdog's failing checks: our own names and one-line reasons.
  const failingChecks = Array.isArray(record.failingChecks)
    ? (record.failingChecks as Array<Record<string, unknown>>)
        .filter((c) => typeof c.name === "string" && SAFE_CODE.test(c.name))
        .slice(0, 12)
        .map((c) => `${c.name as string} (${String(c.detail ?? "").slice(0, 160)})`)
    : [];
  const parts = [
    verdict ? `verdict ${verdict}` : null,
    code ? `code ${code}` : null,
    workers.length ? `lifecycle ${workers.join(", ")}` : null,
    escalations ? `${escalations} deadline escalation(s)` : null,
    failingChecks.length ? `failing: ${failingChecks.join("; ")}` : null,
  ].filter(Boolean);
  return {
    category:
      code ?? (workers.length ? "fantasy_lifecycle_refused" : (verdict ?? "workflow_failed")),
    detail: parts.length ? parts.join("; ") : "see the run log",
  };
}

export function issueTitle(workflow: string): string {
  return `[ops] ${workflow} is failing`;
}

export function runLink(ctx: RunContext): string {
  return `${ctx.serverUrl}/${ctx.repository}/actions/runs/${ctx.runId}`;
}

export function failureReport(ctx: RunContext, category: AlertCategory, first: boolean): string {
  const lines = [
    first
      ? `${OWNER_MENTION} a production job is failing. This issue closes itself on the next successful run.`
      : "Still failing:",
    "",
    "| | |",
    "| --- | --- |",
    "| Environment | production (Supabase `tkewgajrljbwgwedqsxn`) |",
    `| Job | ${ctx.workflow} |`,
    `| Time | ${ctx.now.toISOString().replace(/\.\d{3}Z$/, "Z")} |`,
    `| Error category | \`${category.category}\` |`,
    `| Detail | ${category.detail.replace(/\|/g, "\\|")} |`,
    `| Run | [${ctx.runId} (attempt ${ctx.runAttempt})](${runLink(ctx)}) |`,
    `| Trigger | ${ctx.event} on \`${ctx.refName}\` at \`${ctx.sha.slice(0, 12)}\` |`,
    "",
    "Runbook: `docs/operations/ALERTS.md`.",
  ];
  return lines.join("\n");
}

export function recoveryReport(ctx: RunContext): string {
  return `Recovered: [run ${ctx.runId}](${runLink(ctx)}) succeeded at ${ctx.now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")}. Closing.`;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class GitHubIssues {
  constructor(
    private readonly repository: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchImpl(
      `https://api.github.com/repos/${this.repository}${path}`,
      {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) throw new Error(`github_api_${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  async findOpen(title: string): Promise<number | null> {
    const issues = (await this.call(
      `/issues?state=open&labels=${ALERT_LABEL}&per_page=100`,
    )) as Array<{ number: number; title: string; pull_request?: unknown }>;
    return issues.find((issue) => !issue.pull_request && issue.title === title)?.number ?? null;
  }

  async ensureLabel(): Promise<void> {
    try {
      await this.call(`/labels/${ALERT_LABEL}`);
    } catch {
      await this.call("/labels", {
        method: "POST",
        body: JSON.stringify({
          name: ALERT_LABEL,
          color: "d73a4a",
          description: "A production job or health check is failing",
        }),
      }).catch(() => undefined);
    }
  }

  async create(title: string, body: string): Promise<number> {
    const issue = (await this.call("/issues", {
      method: "POST",
      body: JSON.stringify({ title, body, labels: [ALERT_LABEL] }),
    })) as { number: number };
    return issue.number;
  }

  async comment(number: number, body: string): Promise<void> {
    await this.call(`/issues/${number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async close(number: number): Promise<void> {
    await this.call(`/issues/${number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "completed" }),
    });
  }
}

/** Open or update the workflow's alert issue; close it on success. */
export async function reportRun(
  issues: Pick<GitHubIssues, "findOpen" | "ensureLabel" | "create" | "comment" | "close">,
  outcome: "failure" | "success",
  ctx: RunContext,
  category: AlertCategory,
): Promise<string> {
  const title = issueTitle(ctx.workflow);
  const open = await issues.findOpen(title);
  if (outcome === "success") {
    if (open === null) return "nothing_open";
    await issues.comment(open, recoveryReport(ctx));
    await issues.close(open);
    return `closed #${open}`;
  }
  if (open !== null) {
    await issues.comment(open, failureReport(ctx, category, false));
    return `commented #${open}`;
  }
  await issues.ensureLabel();
  const created = await issues.create(title, failureReport(ctx, category, true));
  return `opened #${created}`;
}

async function readEvidence(path: string | undefined): Promise<unknown> {
  if (!path) return null;
  try {
    const text = await readFile(path, "utf8");
    return text.length > 2_000_000 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const [outcome, workflow, evidencePath] = process.argv.slice(2);
  try {
    if ((outcome !== "failure" && outcome !== "success") || !workflow) {
      throw new Error("usage: github-alert.ts failure|success <workflow> [evidence.json]");
    }
    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    if (!token || !repository) throw new Error("github_context_missing");
    const ctx: RunContext = {
      repository,
      workflow,
      runId: process.env.GITHUB_RUN_ID ?? "unknown",
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
      serverUrl: process.env.GITHUB_SERVER_URL ?? "https://github.com",
      sha: process.env.GITHUB_SHA ?? "unknown",
      refName: process.env.GITHUB_REF_NAME ?? "unknown",
      event: process.env.GITHUB_EVENT_NAME ?? "unknown",
      now: new Date(),
    };
    const result = await reportRun(
      new GitHubIssues(repository, token),
      outcome,
      ctx,
      categorize(await readEvidence(evidencePath)),
    );
    console.log(`OPS_ALERT ${outcome} ${result}`);
  } catch (error) {
    // The job's own status already says what happened; a broken alert must
    // not turn a green run red or hide a red one.
    console.log(
      `OPS_ALERT_UNAVAILABLE ${error instanceof Error && SAFE_CODE.test(error.message) ? error.message : "alert_failed"}`,
    );
  }
}
