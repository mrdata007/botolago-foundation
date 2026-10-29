import { createClient } from "@supabase/supabase-js";

export const STAFF_DENIED = "Staff sign-in with a verified second factor is required.";

export function requireStaff(context) {
  if (
    !context ||
    context.isStaff !== true ||
    context.status !== "active" ||
    context.currentAal !== "aal2" ||
    context.mfaEnrolled !== true ||
    context.emailVerified !== true ||
    context.accessAllowed !== true ||
    context.suspended ||
    context.revoked ||
    !Array.isArray(context.permissions) ||
    !context.staffPrincipalId
  ) {
    throw new Error(STAFF_DENIED);
  }
  // recentAuthSufficient is intentionally left to each existing RPC. Reads
  // remain usable; a sensitive action still requires a fresh password login.
  return context;
}

export class Backend {
  constructor(config) {
    this.config = config;
  }
  client(token) {
    return createClient(this.config.supabaseUrl, this.config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    });
  }
  async password(email, password) {
    const client = this.client();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(STAFF_DENIED);
    const factor =
      data.user.factors?.find((f) => f.status === "verified" && f.factor_type === "totp") ??
      data.user.factors?.find((f) => f.status === "verified" && f.factor_type === "phone");
    if (!factor) throw new Error(STAFF_DENIED);
    const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error || !challenge.data?.id) throw new Error(STAFF_DENIED);
    return {
      session: data.session,
      factorId: factor.id,
      challengeId: challenge.data.id,
      factorType: factor.factor_type,
    };
  }
  async mfa(pending, code) {
    const client = this.client();
    const established = await client.auth.setSession(pending.session);
    if (established.error) throw new Error(STAFF_DENIED);
    const { data, error } = await client.auth.mfa.verify({
      factorId: pending.factorId,
      challengeId: pending.challengeId,
      code,
    });
    if (error || !data?.access_token) throw new Error(STAFF_DENIED);
    const result = await client.auth.getSession();
    const session = result.data.session;
    if (!session || result.error) throw new Error(STAFF_DENIED);
    const context = await this.context(session);
    return { session, context };
  }
  async refresh(session) {
    const { data, error } = await this.client().auth.refreshSession({
      refresh_token: session.refresh_token,
    });
    if (error || !data.session || data.session.user.id !== session.user.id)
      throw new Error(STAFF_DENIED);
    return data.session;
  }
  async context(session) {
    const { data, error } = await this.client(session.access_token)
      .schema("api")
      .rpc("get_my_staff_context");
    if (error) throw new Error(STAFF_DENIED);
    return requireStaff(data);
  }
  async rpc(session, name, args) {
    return this.client(session.access_token).schema("api").rpc(name, args);
  }
  async edge(session, name, body) {
    return this.client(session.access_token).functions.invoke(name, { body });
  }
}
