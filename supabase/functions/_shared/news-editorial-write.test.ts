import { describe, expect, it } from "bun:test";
import sanitizeHtml from "sanitize-html";
import {
  NEWS_SANITIZER_MIN_LENGTH,
  NEWS_SANITIZER_OPTIONS,
  NEWS_SANITIZER_VERSION,
} from "../../../src/backend/news/sanitizer-policy";
import {
  computeHmacHex,
  handleNewsEditorialWriteRequest,
  type NewsEditorialWriteDependencies,
  type RpcResult,
  type ServiceRoleClient,
  type UserScopedClient,
} from "./news-editorial-write";

// Exercises the REAL sanitize-html allowlist (the same npm package and the
// same shared policy the deployed Edge Function uses), not a stub -- this is
// what proves malicious input is actually sanitized before it ever reaches
// the RPC call, i.e. the real write boundary, not the sanitizer helper in
// isolation.
function trustedSanitize(html: string): string {
  const clean = sanitizeHtml(html, NEWS_SANITIZER_OPTIONS).trim();
  if (clean.length < NEWS_SANITIZER_MIN_LENGTH) throw new Error("unsafe_content");
  return clean;
}

const TEST_SECRET = new Uint8Array(32).fill(7);
const TEST_SECRET_HEX =
  "\\x" + Array.from(TEST_SECRET, (b) => b.toString(16).padStart(2, "0")).join("");

function serviceClient(secretHex: string = TEST_SECRET_HEX): ServiceRoleClient {
  return {
    schema: () => ({
      rpc: async () => ({ data: secretHex, error: null }),
    }),
  };
}

function userClient(options: {
  userId?: string | null;
  rpcResult?: RpcResult;
  calls?: Array<{ name: string; args: Record<string, unknown> }>;
}): UserScopedClient {
  return {
    auth: {
      getUser: async () =>
        options.userId
          ? { data: { user: { id: options.userId, role: "authenticated" } }, error: null }
          : { data: { user: null }, error: { message: "no session" } },
    },
    schema: () => ({
      rpc: async (name, args) => {
        options.calls?.push({ name, args });
        return (
          options.rpcResult ?? {
            data: { storyId: "s1", articleId: "a1", status: "draft" },
            error: null,
          }
        );
      },
    }),
  };
}

function deps(
  overrides: Partial<NewsEditorialWriteDependencies> = {},
): NewsEditorialWriteDependencies {
  return {
    serviceClient: serviceClient(),
    createUserClient: () => userClient({ userId: "user-1" }),
    sanitize: trustedSanitize,
    sanitizerVersion: NEWS_SANITIZER_VERSION,
    ...overrides,
  };
}

function jsonRequest(body: unknown, token = "Bearer test-jwt"): Request {
  return new Request("https://example.test/news-editorial-write", {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const cleanDraft = {
  action: "create_draft" as const,
  language: "fr",
  slug: "derby-test",
  title: "Derby test",
  summary: "Un résumé suffisant pour la contrainte de longueur du CMS BotolaGO.",
  bodyFormat: "markdown" as const,
  bodySource: "Corps de test.",
  bodyHtml: "<p>Un contenu tout à fait légitime pour l'article du derby de test.</p>",
};

describe("handleNewsEditorialWriteRequest -- transport basics", () => {
  it("answers a CORS preflight without ever requiring a bearer token", async () => {
    const response = await handleNewsEditorialWriteRequest(
      new Request("https://example.test/news-editorial-write", { method: "OPTIONS" }),
      deps(),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects a request with no bearer token", async () => {
    const response = await handleNewsEditorialWriteRequest(
      new Request("https://example.test/news-editorial-write", { method: "POST" }),
      deps(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects an anonymous caller", async () => {
    const response = await handleNewsEditorialWriteRequest(
      jsonRequest(cleanDraft),
      deps({ createUserClient: () => userClient({ userId: null }) }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a body with no bodyHtml", async () => {
    const response = await handleNewsEditorialWriteRequest(
      jsonRequest({ ...cleanDraft, bodyHtml: "" }),
      deps(),
    );
    expect(response.status).toBe(400);
  });
});

describe("handleNewsEditorialWriteRequest -- the real write boundary", () => {
  it("forwards sanitized body_html, a fresh valid MAC, and the server sanitizer_version -- never the client's claims", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleNewsEditorialWriteRequest(
      jsonRequest({
        ...cleanDraft,
        bodyHtml: '<p onclick="steal()">Contenu <script>evil()</script>légitime et suffisant.</p>',
        // A direct/modified client claiming its own (fake) sanitizer version
        // and MAC must never be trusted -- both are always recomputed here.
        sanitizerVersion: "attacker-claimed@0.0.1",
      }),
      deps({ createUserClient: () => userClient({ userId: "user-1", calls }) }),
    );
    expect(response.status).toBe(201);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.name).toBe("editorial_create_draft");
    const persistedHtml = call.args.p_body_html as string;
    expect(persistedHtml).not.toContain("<script>");
    expect(persistedHtml).not.toContain("onclick");
    expect(persistedHtml).toContain("Contenu");
    expect(call.args.p_sanitizer_version).toBe(NEWS_SANITIZER_VERSION);

    const expectedMac = await computeHmacHex(TEST_SECRET, persistedHtml);
    expect(call.args.p_body_html_mac).toBe(expectedMac);
  });

  it("rejects content that sanitizes down to nothing (unsafe_content) before ever calling the RPC", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleNewsEditorialWriteRequest(
      jsonRequest({ ...cleanDraft, bodyHtml: "<script>alert(1)</script>" }),
      deps({ createUserClient: () => userClient({ userId: "user-1", calls }) }),
    );
    expect(response.status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it("maps a news_editorial_forbidden RPC error to 403", async () => {
    const response = await handleNewsEditorialWriteRequest(
      jsonRequest(cleanDraft),
      deps({
        createUserClient: () =>
          userClient({
            userId: "user-1",
            rpcResult: {
              data: null,
              error: { message: "news_editorial_forbidden", code: "42501" },
            },
          }),
      }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { message: string; code: string } };
    expect(body.error.message).toBe("news_editorial_forbidden");
    expect(body.error.code).toBe("42501");
  });

  it("handles update_article the same way, over the update RPC", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleNewsEditorialWriteRequest(
      jsonRequest({
        action: "update_article",
        articleEditionId: "a1",
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
        slug: "derby-test",
        title: "Derby test",
        subtitle: null,
        summary: "Un résumé suffisant pour la contrainte de longueur du CMS BotolaGO.",
        bodyFormat: "markdown",
        bodySource: "Corps de test.",
        bodyHtml:
          '<p>Contenu légitime <iframe src="https://evil.example"></iframe> et suffisant.</p>',
      }),
      deps({ createUserClient: () => userClient({ userId: "user-1", calls }) }),
    );
    expect(response.status).toBe(200);
    expect(calls[0]?.name).toBe("editorial_update_article");
    expect(calls[0]?.args.p_body_html as string).not.toContain("iframe");
  });
});

// Security acceptance: every construct below must never survive into what
// gets forwarded as p_body_html to the real write RPC.
describe("handleNewsEditorialWriteRequest -- malicious payload acceptance tests", () => {
  const dangerousInputs: ReadonlyArray<{
    name: string;
    html: string;
    mustNotContain: readonly string[];
  }> = [
    {
      name: "inline event handler (onerror)",
      html: '<p onerror="steal()">Contenu suffisant pour la longueur minimale requise ici.</p>',
      mustNotContain: ["onerror"],
    },
    {
      name: "inline event handler (onclick) via img",
      html: '<img src="https://x.test/a.png" onclick="steal()" alt="a"><p>Texte suffisant pour la contrainte de longueur.</p>',
      mustNotContain: ["onclick"],
    },
    {
      name: "javascript: URL in an anchor",
      html: '<p><a href="javascript:alert(1)">lien</a> texte suffisant pour la contrainte de longueur du CMS.</p>',
      mustNotContain: ["javascript:"],
    },
    {
      name: "data: URL on an image",
      html: '<img src="data:text/html,<script>1</script>" alt="a"><p>Texte suffisant pour la longueur minimale requise.</p>',
      mustNotContain: ["data:text/html"],
    },
    {
      name: "iframe embed",
      html: '<iframe src="https://evil.example/x"></iframe><p>Texte suffisant pour la longueur minimale requise ici.</p>',
      mustNotContain: ["<iframe", "</iframe>"],
    },
    {
      name: "object embed",
      html: '<object data="https://evil.example/x"></object><p>Texte suffisant pour la longueur minimale requise ici.</p>',
      mustNotContain: ["<object"],
    },
    {
      name: "embed tag",
      html: '<embed src="https://evil.example/x"><p>Texte suffisant pour la longueur minimale requise ici.</p>',
      mustNotContain: ["<embed"],
    },
    {
      name: "unsafe style attribute (expression/behavior)",
      html: '<p style="background:url(javascript:alert(1))">Texte suffisant pour la longueur minimale requise.</p>',
      mustNotContain: ["style=", "javascript:"],
    },
    {
      name: "svg with embedded script",
      html: '<svg onload="alert(1)"><script>alert(2)</script></svg><p>Texte suffisant pour la longueur minimale requise.</p>',
      mustNotContain: ["<svg", "<script", "onload"],
    },
    {
      name: "malformed nested markup",
      html: '<p><b><i>Texte suffisant pour la longueur <script>alert(1)</script></i></b attr="x">minimale.</p>',
      mustNotContain: ["<script"],
    },
    {
      name: "protocol-relative URL on an image (disallowed by policy)",
      html: '<img src="//evil.example/a.png" alt="a"><p>Texte suffisant pour la longueur minimale requise.</p>',
      mustNotContain: ['src="//evil.example'],
    },
    {
      name: "http (non-https) image URL (disallowed by policy)",
      html: '<img src="http://evil.example/a.png" alt="a"><p>Texte suffisant pour la longueur minimale requise.</p>',
      mustNotContain: ["http://evil.example"],
    },
  ];

  for (const { name, html, mustNotContain } of dangerousInputs) {
    it(`sanitizes: ${name}`, async () => {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const response = await handleNewsEditorialWriteRequest(
        jsonRequest({ ...cleanDraft, bodyHtml: html }),
        deps({ createUserClient: () => userClient({ userId: "user-1", calls }) }),
      );
      expect(response.status).toBe(201);
      expect(calls).toHaveLength(1);
      const persisted = (calls[0]?.args.p_body_html as string).toLowerCase();
      for (const needle of mustNotContain) {
        expect(persisted).not.toContain(needle.toLowerCase());
      }
    });
  }

  it("still persists valid supported editorial HTML unchanged in substance", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const richHtml =
      "<h2>Titre de section</h2><p>Un <strong>paragraphe</strong> avec de l'<em>emphase</em> et un " +
      '<a href="https://example.com" target="_blank">lien</a>.</p>' +
      '<figure><img src="https://example.com/a.jpg" alt="Une photo" width="800" height="600"><figcaption>Légende</figcaption></figure>' +
      "<ul><li>Un</li><li>Deux</li></ul>";
    const response = await handleNewsEditorialWriteRequest(
      jsonRequest({ ...cleanDraft, bodyHtml: richHtml }),
      deps({ createUserClient: () => userClient({ userId: "user-1", calls }) }),
    );
    expect(response.status).toBe(201);
    const persisted = calls[0]?.args.p_body_html as string;
    expect(persisted).toContain("<h2>Titre de section</h2>");
    expect(persisted).toContain("<strong>paragraphe</strong>");
    expect(persisted).toContain('href="https://example.com"');
    expect(persisted).toContain('rel="nofollow noopener noreferrer"');
    expect(persisted).toContain('loading="lazy"');
    expect(persisted).toContain("<figcaption>Légende</figcaption>");
    expect(persisted).toContain("<li>Un</li>");
  });
});

describe("the Edge Function's sanitizer policy is the frontend's, byte for byte", () => {
  it("both policy files declare the same allowlist and transforms", async () => {
    const policy = (path: string) =>
      Bun.file(new URL(path, import.meta.url))
        .text()
        .then((text) => text.slice(text.indexOf("export const NEWS_SANITIZER_VERSION")));
    expect(await policy("./news-editorial-sanitizer-policy.ts")).toBe(
      await policy("../../../src/backend/news/sanitizer-policy.ts"),
    );
  });
});
