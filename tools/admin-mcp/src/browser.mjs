import { timingSafeEqual } from "node:crypto";
import { digest, now, opaque } from "./store.mjs";
import { renderPage } from "./pages.mjs";

function equals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function cookie(req) {
  const match = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("bgo_admin_login="));
  return match?.slice("bgo_admin_login=".length);
}
export function installBrowser(app, oauth) {
  const { store, config, backend } = oauth;
  app.use("/session", (req, res, next) => {
    const id =
      typeof req.query.id === "string"
        ? req.query.id
        : typeof req.body?.id === "string"
          ? req.body.id
          : "";
    const pending = store.get(`pending:${digest(id)}`);
    // Chrome applies form-action to the POST's subsequent redirect too.
    // Permit only the callback origin already validated during OAuth setup.
    const callback = pending?.redirectUri ? ` ${new URL(pending.redirectUri).origin}` : "";
    res.set({
      "Cache-Control": "no-store",
      // Chrome serializes a form POST's Origin as null under no-referrer.
      // Keep same-origin form CSRF validation while suppressing external refs.
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${callback}; frame-ancestors 'none'; base-uri 'none'`,
    });
    next();
  });
  app.get("/session/start", (req, res) => {
    const id = typeof req.query.id === "string" ? req.query.id : "";
    const pending = store.get(`pending:${digest(id)}`);
    if (!pending) return res.status(410).send(renderPage({ state: "expired" }));
    if (!pending.browser) {
      const browser = opaque();
      pending.browser = digest(browser);
      pending.csrf = opaque();
      res.cookie("bgo_admin_login", browser, {
        httpOnly: true,
        secure: config.origin.startsWith("https:"),
        sameSite: "lax",
        path: "/session",
        maxAge: 600_000,
      });
    } else if (!equals(pending.browser, digest(cookie(req) ?? ""))) {
      return res.status(403).send(renderPage({ state: "expired" }));
    }
    pending.lang =
      req.query.lang === "ar" ? "ar" : req.query.lang === "fr" ? "fr" : (pending.lang ?? "fr");
    store.put(`pending:${digest(id)}`, pending, pending.expires);
    res.send(renderPage({ id, pending, lang: pending.lang }));
  });
  const post = (path, action) =>
    app.post(path, async (req, res) => {
      const id = typeof req.body?.id === "string" ? req.body.id : "";
      const key = `pending:${digest(id)}`,
        pending = store.get(key);
      if (
        !pending ||
        req.headers.origin !== config.origin ||
        !equals(pending.browser, digest(cookie(req) ?? "")) ||
        !equals(pending.csrf, req.body?.csrf)
      ) {
        return res.status(403).send(renderPage({ state: "expired" }));
      }
      // One request at a time, including while password/MFA verification awaits.
      if (!store.take(key)) return res.status(410).send(renderPage({ state: "expired" }));
      try {
        await action(req, res, id, pending);
      } catch {
        pending.attempts = (pending.attempts ?? 0) + 1;
        if (pending.attempts < 5 && pending.expires > now()) {
          store.put(key, pending, pending.expires);
          res.status(400).send(renderPage({ id, pending, lang: pending.lang, error: true }));
        } else res.status(403).send(renderPage({ state: "expired", lang: pending.lang }));
      }
    });
  post("/session/login", async (req, res, id, pending) => {
    if (
      pending.stage !== "password" ||
      typeof req.body.email !== "string" ||
      typeof req.body.password !== "string" ||
      req.body.email.length > 254 ||
      req.body.password.length > 1024
    )
      throw new Error("invalid_login");
    const result = await backend.password(req.body.email.trim(), req.body.password);
    if (pending.userId && result.session.user.id !== pending.userId)
      throw new Error("different_user");
    Object.assign(pending, result, { stage: "mfa" });
    store.put(`pending:${digest(id)}`, pending, pending.expires);
    res.send(renderPage({ id, pending, lang: pending.lang }));
  });
  post("/session/verify", async (req, res, id, pending) => {
    if (pending.stage !== "mfa" || !/^[0-9]{6}$/.test(req.body.code ?? ""))
      throw new Error("invalid_code");
    const { session } = await backend.mfa(pending, req.body.code);
    if (session.user.id !== pending.session.user.id) throw new Error("different_user");
    const target = await oauth.finish(id, pending, session);
    res.clearCookie("bgo_admin_login", { path: "/session" });
    if (target) res.redirect(303, target);
    else res.send(renderPage({ state: "done", lang: pending.lang }));
  });
  post("/session/cancel", async (_req, res, _id, pending) => {
    res.clearCookie("bgo_admin_login", { path: "/session" });
    if (pending.kind === "authorize") {
      const target = new URL(pending.redirectUri);
      target.searchParams.set("error", "access_denied");
      if (pending.state !== undefined) target.searchParams.set("state", pending.state);
      res.redirect(303, target.href);
    } else res.send(renderPage({ state: "denied", lang: pending.lang }));
  });
}
