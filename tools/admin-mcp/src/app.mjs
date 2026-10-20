import express from "express";
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AdminOAuth, SCOPE } from "./oauth.mjs";
import { installBrowser } from "./browser.mjs";
import { createAdminMcp } from "./mcp.mjs";

export function createApp(config, store, backend) {
  const oauth = new AdminOAuth(config, store, backend);
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (req.headers.host !== new URL(config.origin).host) return res.status(421).end();
    next();
  });
  // The SDK limits OAuth endpoint traffic. Bound password/MFA traffic separately;
  // use the socket address so untrusted forwarded headers cannot bypass it.
  const attempts = new Map();
  app.use("/session", (req, res, next) => {
    if (req.method !== "POST") return next();
    const key = req.socket.remoteAddress ?? "unknown",
      time = Date.now();
    for (const [key, record] of attempts) if (record.until < time) attempts.delete(key);
    if (attempts.size >= 10_000 && !attempts.has(key)) return res.status(429).end();
    const record = attempts.get(key) ?? { count: 0, until: time + 60_000 };
    record.count++;
    attempts.set(key, record);
    if (record.count > 30) return res.status(429).send("Too many attempts. Try again later.");
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: "16kb" }));
  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl: new URL(config.origin),
      resourceServerUrl: new URL(config.resource),
      scopesSupported: [SCOPE],
      resourceName: "BotolaGO Admin",
    }),
  );
  installBrowser(app, oauth);
  const auth = requireBearerAuth({
    verifier: oauth,
    requiredScopes: [SCOPE],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(config.resource)),
  });
  app.post("/mcp", auth, express.json({ limit: "42mb" }), async (req, res) => {
    if (req.headers.origin && req.headers.origin !== config.origin) return res.status(403).end();
    const server = createAdminMcp(oauth, req.auth.extra.grantId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.once("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.all("/mcp", auth, (_req, res) => res.status(405).set("Allow", "POST").end());
  app.get("/health", (_req, res) => res.json({ status: "ok", service: "botolago-admin-mcp" }));
  app.use((_error, _req, res, _next) => {
    if (!res.headersSent) res.status(500).json({ error: "admin_mcp_unavailable" });
  });
  return { app, oauth };
}
