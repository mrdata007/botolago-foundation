export function readConfig(env = process.env) {
  const origin = new URL(env.ADMIN_MCP_ORIGIN ?? "http://127.0.0.1:3107");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    (!local && origin.protocol !== "https:") ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new Error("ADMIN_MCP_ORIGIN must be an HTTPS origin (HTTP loopback is allowed locally).");
  }
  const encryptionKey = Buffer.from(env.ADMIN_MCP_ENCRYPTION_KEY ?? "", "base64");
  if (encryptionKey.length !== 32)
    throw new Error("Set ADMIN_MCP_ENCRYPTION_KEY to 32 random base64-encoded bytes.");
  const supabaseUrl = new URL(env.SUPABASE_URL ?? "http://invalid");
  if (
    supabaseUrl.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(supabaseUrl.hostname)
  ) {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? "";
  let legacyRole;
  try {
    legacyRole = JSON.parse(Buffer.from(publishableKey.split(".")[1], "base64url")).role;
  } catch {}
  if (!publishableKey.startsWith("sb_publishable_") && legacyRole !== "anon") {
    throw new Error("SUPABASE_PUBLISHABLE_KEY must be a publishable key or legacy anon key.");
  }
  const port = Number(env.ADMIN_MCP_PORT ?? 3107);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid ADMIN_MCP_PORT.");
  return {
    origin: origin.origin,
    resource: new URL("/mcp", origin).href,
    encryptionKey,
    supabaseUrl: supabaseUrl.origin,
    publishableKey,
    host: env.ADMIN_MCP_HOST ?? "127.0.0.1",
    port,
    dataDir: env.ADMIN_MCP_DATA_DIR ?? "./data",
  };
}
