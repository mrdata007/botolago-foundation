// Pauses and resumes the `pepites-tick` pg_cron job around the photo storage
// job (.github/workflows/pepites-photo-publish.yml), for the one-writer rule
// (AGENTS.md): the tick writes players, Pépites tables and photo-release
// expiry, and a GitHub concurrency group cannot hold back a database cron job.
//
// It pauses the cron job itself (cron.alter_job active := false) rather than
// switching the Pépites mode off: `off` would also hide Pépites from readers
// for the length of the run, and pausing the job is enough to stop its writes.
// A tick already in flight is waited for, so nothing writes beside the photo
// job once `pause` returns.
//
//   SUPABASE_ACCESS_TOKEN=… PROJECT_REF=… bun scripts/backend/pepites-tick-pause.ts pause
//   SUPABASE_ACCESS_TOKEN=… PROJECT_REF=… bun scripts/backend/pepites-tick-pause.ts resume <true|false>
//
// `pause` writes `previous_active=<true|false>` to $GITHUB_OUTPUT before it
// changes anything, so an always-run cleanup step can restore the job even
// when the pause fails midway. It logs states only, never the token.

import { appendFileSync } from "node:fs";

export type Query = (sql: string) => Promise<Array<Record<string, unknown>>>;

const JOB = "pepites-tick";

const READ_ACTIVE_SQL = `select active from cron.job where jobname = '${JOB}'`;

const SET_ACTIVE_SQL = (active: boolean) =>
  `select cron.alter_job((select jobid from cron.job where jobname = '${JOB}'), active := ${active})`;

// A tick that started in the last 30 minutes and has not ended. Older rows in
// `running` are left by a crashed worker and do not hold any lock.
const IN_FLIGHT_SQL = `select count(*)::int as running
from cron.job_run_details detail
join cron.job job on job.jobid = detail.jobid
where job.jobname = '${JOB}'
  and detail.status in ('starting', 'running')
  and detail.start_time > now() - interval '30 minutes'`;

export function managementQuery(
  projectRef: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Query {
  return async (sql) => {
    const response = await fetchImpl(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query: sql }),
      },
    );
    if (!response.ok) throw new Error(`management_query_${response.status}`);
    return (await response.json()) as Array<Record<string, unknown>>;
  };
}

async function readActive(query: Query): Promise<boolean> {
  const rows = await query(READ_ACTIVE_SQL);
  const active = rows[0]?.active;
  if (typeof active !== "boolean") throw new Error("pepites_tick_job_missing");
  return active;
}

export async function pauseTick(
  query: Query,
  options: {
    recordPrevious: (active: boolean) => void;
    sleep?: (ms: number) => Promise<void>;
    attempts?: number;
  },
): Promise<boolean> {
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 18;
  const previous = await readActive(query);
  options.recordPrevious(previous);
  if (previous) await query(SET_ACTIVE_SQL(false));
  if (await readActive(query)) throw new Error("pepites_tick_pause_not_applied");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const running = Number((await query(IN_FLIGHT_SQL))[0]?.running ?? NaN);
    if (running === 0) return previous;
    if (!Number.isFinite(running)) throw new Error("pepites_tick_state_unreadable");
    await sleep(10_000);
  }
  throw new Error("pepites_tick_still_running");
}

export async function resumeTick(query: Query, previous: boolean): Promise<void> {
  if (!previous) return;
  await query(SET_ACTIVE_SQL(true));
  if (!(await readActive(query))) throw new Error("pepites_tick_resume_not_applied");
}

if (import.meta.main) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.PROJECT_REF?.trim();
  const [command, argument] = process.argv.slice(2);
  if (!token || !ref || (command !== "pause" && command !== "resume")) {
    console.error(
      "usage: SUPABASE_ACCESS_TOKEN=… PROJECT_REF=… pepites-tick-pause.ts pause|resume <true|false>",
    );
    process.exit(2);
  }
  const query = managementQuery(ref, token);
  if (command === "pause") {
    const output = process.env.GITHUB_OUTPUT;
    await pauseTick(query, {
      recordPrevious: (active) => {
        if (output) appendFileSync(output, `previous_active=${active}\n`);
        console.log(`pepites-tick was ${active ? "active" : "already paused"}`);
      },
    });
    console.log("pepites-tick paused; no tick in flight");
  } else {
    if (argument !== "true" && argument !== "false") {
      console.error("resume needs the previous state: true or false");
      process.exit(2);
    }
    await resumeTick(query, argument === "true");
    console.log(
      argument === "true" ? "pepites-tick resumed" : "pepites-tick left paused, as it was",
    );
  }
}
