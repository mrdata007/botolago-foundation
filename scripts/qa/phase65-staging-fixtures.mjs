import { appendFile, chmod, readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";

const operation = process.argv[2];
const projectRef = process.env.SUPABASE_STAGING_PROJECT_REF;
const supabaseUrl = process.env.SUPABASE_STAGING_URL;
const managementToken = process.env.SUPABASE_ACCESS_TOKEN;
const stateFile =
  process.env.PHASE65_STATE_FILE ?? `${process.env.RUNNER_TEMP}/phase65-functional-state.json`;
const expectedRef = "srdrflfrfpwixsllveid";
const gameweekId = "fa640000-0000-4000-8000-000000000002";
const keyPrefix = "phase65_functional_";
const secretPattern =
  /(sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+\S+|password["'=:\s]+\S+)/gi;

function required(value, name) {
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

function mask(value) {
  process.stdout.write(`::add-mask::${value}\n`);
}

function sanitize(value) {
  return String(value)
    .replace(secretPattern, "[REDACTED]")
    .replaceAll(/[\r\n]+/g, " ")
    .slice(0, 240);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`non_json_response_${response.status}`);
    }
  }
  if (!response.ok) {
    const classification = sanitize(body?.code ?? body?.error_code ?? body?.error ?? "unknown");
    const message = sanitize(body?.message ?? body?.msg ?? "request rejected");
    throw new Error(`request_failed_${response.status}_${classification}_${message}`);
  }
  return body;
}

function management(path, options = {}) {
  return jsonRequest(`https://api.supabase.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${required(managementToken, "management_token")}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

function authAdmin(secret, path, options = {}) {
  return jsonRequest(`${required(supabaseUrl, "supabase_url")}/auth/v1${path}`, {
    ...options,
    headers: {
      apikey: secret,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

function sql(query) {
  return management(`/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

async function writeState(state) {
  await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
  await chmod(stateFile, 0o600);
}

function uuidArray(values) {
  if (!values.length) return "array[]::uuid[]";
  return `array[${values.map((value) => `'${String(value).replaceAll("'", "''")}'::uuid`).join(",")}]`;
}

function sameInstant(left, right) {
  if (left == null || right == null) return left == null && right == null;
  const leftValue = Date.parse(String(left));
  const rightValue = Date.parse(String(right));
  return Number.isFinite(leftValue) && Number.isFinite(rightValue) && leftValue === rightValue;
}

async function setup() {
  if (projectRef !== expectedRef || !supabaseUrl?.includes(expectedRef)) {
    throw new Error("staging_project_guard_failed");
  }
  mask(required(managementToken, "management_token"));
  const project = await management(`/v1/projects/${projectRef}`);
  if (project?.ref !== expectedRef) throw new Error("management_project_mismatch");

  const runId = `p65-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const keyName = `${keyPrefix}${randomBytes(4).toString("hex")}`;
  const existingKeys = await management(`/v1/projects/${projectRef}/api-keys`);
  if (
    Array.isArray(existingKeys) &&
    existingKeys.some((candidate) => String(candidate?.name ?? "").startsWith(keyPrefix))
  ) {
    throw new Error("stale_phase65_temporary_key");
  }

  const baselineRows = await sql(
    `set statement_timeout = '15s'; select id::text, status::text, points_state::text, deadline_at::text, finalized_at::text, lock_version, scoring_input_version, corrected_at::text from app.fantasy_gameweeks where id = '${gameweekId}'::uuid`,
  );
  const originalGameweek = Array.isArray(baselineRows) ? baselineRows[0] : null;
  if (originalGameweek?.id !== gameweekId) throw new Error("synthetic_gameweek_missing");
  const state = {
    runId,
    keyName,
    keyId: null,
    users: [],
    originalGameweek,
    gameweekPrepared: false,
  };
  await writeState(state);

  state.gameweekPrepared = true;
  await writeState(state);
  await sql(
    `begin; set local statement_timeout = '15s'; set local session_replication_role = 'replica'; update app.fantasy_gameweeks set status = 'open', points_state = 'provisional', deadline_at = statement_timestamp() + interval '90 minutes', finalized_at = null, corrected_at = null where id = '${gameweekId}'::uuid; commit`,
  );
  const preparedRows = await sql(
    `set statement_timeout = '15s'; select status::text, points_state::text, deadline_at > statement_timestamp() as deadline_future, finalized_at::text from app.fantasy_gameweeks where id = '${gameweekId}'::uuid`,
  );
  const prepared = Array.isArray(preparedRows) ? preparedRows[0] : null;
  if (
    prepared?.status !== "open" ||
    prepared?.points_state !== "provisional" ||
    prepared?.deadline_future !== true ||
    prepared?.finalized_at != null
  ) {
    throw new Error("synthetic_gameweek_preparation_failed");
  }
  const key = await management(`/v1/projects/${projectRef}/api-keys?reveal=true`, {
    method: "POST",
    body: JSON.stringify({
      type: "secret",
      name: keyName,
      description: "Temporary Phase 6.5 staging functional acceptance key",
    }),
  });
  const secret = key?.api_key ?? key?.key;
  const keyId = key?.id ?? key?.key_id;
  if (!secret?.startsWith("sb_secret_") || !keyId) throw new Error("temporary_key_invalid");
  mask(secret);

  const githubEnv = required(process.env.GITHUB_ENV, "github_env");
  const users = state.users;
  state.keyId = keyId;
  await writeState(state);
  await appendFile(githubEnv, `PHASE65_RUN_ID=${runId}\nPHASE65_TEMP_SECRET=${secret}\n`, {
    mode: 0o600,
  });
  for (const label of ["first", "second"]) {
    const email = `phase65-${runId}-${label}@staging.botolago.invalid`;
    const password = `${randomBytes(24).toString("base64url")}A1!`;
    mask(email);
    mask(password);
    const user = await authAdmin(secret, "/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: label === "first" ? "Phase65 First" : "Phase65 Second",
          username: `${runId.replaceAll("-", "_").slice(0, 15)}_${label === "first" ? "a" : "b"}`,
        },
      }),
    });
    if (!user?.id) throw new Error(`user_creation_failed_${label}`);
    users.push({ id: user.id, email, password, label });
    await writeState(state);
  }

  await appendFile(
    githubEnv,
    [
      `E2E_STAGING_FIRST_EMAIL=${users[0].email}`,
      `E2E_STAGING_FIRST_PASSWORD=${users[0].password}`,
      `E2E_STAGING_SECOND_EMAIL=${users[1].email}`,
      `E2E_STAGING_SECOND_PASSWORD=${users[1].password}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  process.stdout.write("phase65_fixture_setup=PASS users=2\n");
}

async function cleanup() {
  mask(required(managementToken, "management_token"));
  let state;
  try {
    state = JSON.parse(await readFile(stateFile, "utf8"));
  } catch {
    throw new Error("cleanup_state_unavailable");
  }
  const secret = process.env.PHASE65_TEMP_SECRET;
  const cleanupErrors = [];
  const userIds = (state.users ?? []).map((user) => user.id);
  if (userIds.length) {
    try {
      const ids = uuidArray(userIds);
      await sql(
        `begin;
set local statement_timeout = '15s';
delete from app.fantasy_transfers where transfer_batch_id in (
  select id from app.fantasy_transfer_batches where fantasy_team_id in (
    select id from app.fantasy_teams where user_id = any(${ids})
  )
);
delete from app.fantasy_auto_substitutions where lineup_id in (
  select id from app.fantasy_lineups where fantasy_team_id in (
    select id from app.fantasy_teams where user_id = any(${ids})
  )
);
delete from app.fantasy_lineup_players where lineup_id in (
  select id from app.fantasy_lineups where fantasy_team_id in (
    select id from app.fantasy_teams where user_id = any(${ids})
  )
);
delete from app.fantasy_free_hit_snapshot_players where snapshot_id in (
  select id from app.fantasy_free_hit_snapshots where fantasy_team_id in (
    select id from app.fantasy_teams where user_id = any(${ids})
  )
);
delete from app.fantasy_rankings where fantasy_team_id in (
  select id from app.fantasy_teams where user_id = any(${ids})
);
delete from app.fantasy_team_gameweek_results where fantasy_team_id in (
  select id from app.fantasy_teams where user_id = any(${ids})
);
delete from app.fantasy_league_memberships where user_id = any(${ids});
delete from app_private.fantasy_free_transfer_rollovers where fantasy_team_id in (
  select id from app.fantasy_teams where user_id = any(${ids})
);
delete from app.fantasy_free_hit_snapshots where fantasy_team_id in (
  select id from app.fantasy_teams where user_id = any(${ids})
);
delete from app.fantasy_chip_uses where fantasy_team_id in (
  select id from app.fantasy_teams where user_id = any(${ids})
);
delete from app.fantasy_transfer_batches where fantasy_team_id in (
  select id from app.fantasy_teams where user_id = any(${ids})
);
delete from app.fantasy_lineups where fantasy_team_id in (
  select id from app.fantasy_teams where user_id = any(${ids})
);
delete from app.fantasy_squad_memberships where fantasy_team_id in (
  select id from app.fantasy_teams where user_id = any(${ids})
);
delete from app_private.fantasy_mutation_audit where user_id = any(${ids})
  or fantasy_team_id in (select id from app.fantasy_teams where user_id = any(${ids}));
delete from app_private.fantasy_idempotency_keys where user_id = any(${ids});
delete from app.fantasy_teams where user_id = any(${ids});
delete from app.fantasy_leagues where owner_user_id = any(${ids});
commit`,
      );
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (secret) {
    mask(secret);
    for (const user of state.users ?? []) {
      try {
        await authAdmin(secret, `/admin/users/${user.id}`, { method: "DELETE" });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      const page = await authAdmin(secret, "/admin/users?page=1&per_page=1000");
      const listed = Array.isArray(page?.users) ? page.users : [];
      const remainingUsers = listed.filter((user) =>
        String(user.email ?? "").includes(`phase65-${state.runId}-`),
      );
      if (remainingUsers.length) cleanupErrors.push(new Error("temporary_user_cleanup_failed"));
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (state.keyId) {
    try {
      await management(
        `/v1/projects/${projectRef}/api-keys/${state.keyId}?reason=phase65_functional_acceptance_complete`,
        { method: "DELETE" },
      );
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  const keys = await management(`/v1/projects/${projectRef}/api-keys`);
  const remainingKeys = Array.isArray(keys) ? keys.filter((key) => key.name === state.keyName) : [];
  if (remainingKeys.length) cleanupErrors.push(new Error("temporary_key_cleanup_failed"));
  if (state.gameweekPrepared && state.originalGameweek) {
    try {
      const original = state.originalGameweek;
      const finalizedAt = original.finalized_at
        ? `'${String(original.finalized_at).replaceAll("'", "''")}'::timestamptz`
        : "null";
      const correctedAt = original.corrected_at
        ? `'${String(original.corrected_at).replaceAll("'", "''")}'::timestamptz`
        : "null";
      await sql(
        `begin; set local statement_timeout = '15s'; set local session_replication_role = 'replica'; update app.fantasy_gameweeks set status = '${String(original.status).replaceAll("'", "''")}'::app.fantasy_gameweek_status, points_state = '${String(original.points_state).replaceAll("'", "''")}'::app.fantasy_points_state, deadline_at = '${String(original.deadline_at).replaceAll("'", "''")}'::timestamptz, finalized_at = ${finalizedAt}, lock_version = ${Number(original.lock_version)}, scoring_input_version = ${Number(original.scoring_input_version)}, corrected_at = ${correctedAt} where id = '${gameweekId}'::uuid; commit`,
      );
      const restoredRows = await sql(
        `set statement_timeout = '15s'; select status::text, points_state::text, deadline_at::text, finalized_at::text, lock_version, scoring_input_version, corrected_at::text from app.fantasy_gameweeks where id = '${gameweekId}'::uuid`,
      );
      const restored = Array.isArray(restoredRows) ? restoredRows[0] : null;
      if (
        restored?.status !== original.status ||
        restored?.points_state !== original.points_state ||
        !sameInstant(restored?.deadline_at, original.deadline_at) ||
        !sameInstant(restored?.finalized_at, original.finalized_at) ||
        Number(restored?.lock_version) !== Number(original.lock_version) ||
        Number(restored?.scoring_input_version) !== Number(original.scoring_input_version) ||
        !sameInstant(restored?.corrected_at, original.corrected_at)
      ) {
        throw new Error("synthetic_gameweek_restore_failed");
      }
      state.gameweekPrepared = false;
      await writeState(state);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (userIds.length) {
    try {
      const inventory = await sql(
        `set statement_timeout = '15s'; with ids as (select unnest(${uuidArray(userIds)}) as id) select (select count(*)::integer from auth.users join ids on ids.id = auth.users.id) as users, (select count(*)::integer from auth.identities join ids on ids.id = auth.identities.user_id) as identities, (select count(*)::integer from auth.sessions join ids on ids.id = auth.sessions.user_id) as sessions, (select count(*)::integer from auth.refresh_tokens join ids on ids.id = auth.refresh_tokens.user_id::uuid) as refresh_tokens, (select count(*)::integer from app.profiles join ids on ids.id = app.profiles.id) as profiles, (select count(*)::integer from app.user_preferences join ids on ids.id = app.user_preferences.user_id) as preferences, (select count(*)::integer from app.fantasy_teams join ids on ids.id = app.fantasy_teams.user_id) as fantasy_teams`,
      );
      const totals = Array.isArray(inventory) ? inventory[0] : null;
      if (!totals || Object.values(totals).some((value) => Number(value) !== 0)) {
        cleanupErrors.push(new Error("temporary_resource_inventory_nonzero"));
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) {
    cleanupErrors.forEach((error, index) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`phase65_cleanup_error_${index + 1}=${sanitize(message)}\n`);
    });
    throw new Error(`cleanup_failed_${cleanupErrors.length}`);
  }
  process.stdout.write(
    `phase65_cleanup=PASS auth_users_deleted=${state.users?.length ?? 0} temporary_keys=0\n`,
  );
}

if (operation === "setup") await setup();
else if (operation === "cleanup") await cleanup();
else throw new Error("operation_must_be_setup_or_cleanup");
