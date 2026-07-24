import { appendFile, chmod, readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";

const operation = process.argv[2];
const projectRef = process.env.SUPABASE_STAGING_PROJECT_REF;
const supabaseUrl = process.env.SUPABASE_STAGING_URL;
const managementToken = process.env.SUPABASE_ACCESS_TOKEN;
const stateFile =
  process.env.PHASE65_STATE_FILE ?? `${process.env.RUNNER_TEMP}/phase65-functional-state.json`;
const expectedRef = "srdrflfrfpwixsllveid";

function required(value, name) {
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

function mask(value) {
  process.stdout.write(`::add-mask::${value}\n`);
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
  if (!response.ok) throw new Error(`request_failed_${response.status}`);
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

async function setup() {
  if (projectRef !== expectedRef || !supabaseUrl?.includes(expectedRef)) {
    throw new Error("staging_project_guard_failed");
  }
  mask(required(managementToken, "management_token"));
  const project = await management(`/v1/projects/${projectRef}`);
  if (project?.ref !== expectedRef) throw new Error("management_project_mismatch");

  const runId = `p65-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const key = await management(`/v1/projects/${projectRef}/api-keys?reveal=true`, {
    method: "POST",
    body: JSON.stringify({
      type: "secret",
      name: `phase65-functional-${runId}`,
      description: "Temporary Phase 6.5 staging functional acceptance key",
    }),
  });
  const secret = key?.api_key ?? key?.key;
  const keyId = key?.id ?? key?.key_id;
  if (!secret?.startsWith("sb_secret_") || !keyId) throw new Error("temporary_key_invalid");
  mask(secret);

  const githubEnv = required(process.env.GITHUB_ENV, "github_env");
  const users = [];
  await writeFile(stateFile, JSON.stringify({ runId, keyId, users }), { mode: 0o600 });
  await chmod(stateFile, 0o600);
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
    await writeFile(stateFile, JSON.stringify({ runId, keyId, users }), { mode: 0o600 });
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
    process.stdout.write("phase65_cleanup=WARNING state_unavailable\n");
    return;
  }
  const secret = process.env.PHASE65_TEMP_SECRET;
  const cleanupErrors = [];
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
  const remainingKeys = Array.isArray(keys)
    ? keys.filter((key) => key.name === `phase65-functional-${state.runId}`)
    : [];
  if (remainingKeys.length) cleanupErrors.push(new Error("temporary_key_cleanup_failed"));
  if (cleanupErrors.length) throw new Error(`cleanup_failed_${cleanupErrors.length}`);
  process.stdout.write(
    `phase65_cleanup=PASS auth_users_deleted=${state.users?.length ?? 0} temporary_keys=0\n`,
  );
}

if (operation === "setup") await setup();
else if (operation === "cleanup") await cleanup();
else throw new Error("operation_must_be_setup_or_cleanup");
