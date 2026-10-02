import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { UnsubscribeView, type UnsubscribeViewState } from "./UnsubscribeView";

/**
 * `/unsubscribe`'s six states, rendered for real through a memory router
 * (the actions are router links) and the French dictionary. The route itself
 * only picks the state; everything a reader sees is here.
 */

const fr = dictionaries.fr;

/** How React escapes text into HTML, so dictionary strings can be compared. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/unsubscribe"] }),
  });
  await router.load();
  return renderToString(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

const view = (state: UnsubscribeViewState) =>
  render(<UnsubscribeView state={state} onUnsubscribe={() => {}} />);

/** The markup of the one `<button>` whose text includes `text`. */
function buttonWith(html: string, text: string): string | undefined {
  return [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)]
    .map((m) => m[0])
    .find((button) => button.includes(text));
}

describe("UnsubscribeView", () => {
  it("opens on a question and a button, and nothing has been sent", async () => {
    const html = await view("confirm");
    expect(html).toContain('data-testid="unsubscribe-confirm"');
    expect(html).toContain(escapeHtml(fr["unsubscribe.confirm_title"]));
    expect(html).toContain(escapeHtml(fr["unsubscribe.confirm_body"]));
    const button = buttonWith(html, escapeHtml(fr["unsubscribe.confirm_action"]));
    expect(button).toBeDefined();
    expect(button).not.toContain(' disabled=""');
    // A question, not news: no live region announces it.
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain(escapeHtml(fr["unsubscribe.loading"]));
  });

  it("locks the button while the request is in flight", async () => {
    const html = await view("submitting");
    const button = buttonWith(html, escapeHtml(fr["unsubscribe.loading"]));
    expect(button).toBeDefined();
    expect(button).toContain(' disabled=""');
    expect(button).toContain('aria-busy="true"');
    expect(html).not.toContain(escapeHtml(fr["unsubscribe.confirm_action"]));
    expect(html).toContain('role="status"');
  });

  it("confirms the unsubscribe and says where e-mails can be turned back on", async () => {
    const html = await view("unsubscribed");
    expect(html).toContain('data-testid="unsubscribe-done"');
    expect(html).toContain('role="status"');
    expect(html).toContain(escapeHtml(fr["unsubscribe.done_title"]));
    expect(html).toContain(escapeHtml(fr["unsubscribe.reenable_hint"]));
    expect(html).toContain('href="/profile"');
    expect(html).toContain(escapeHtml(fr["unsubscribe.manage"]));
    expect(html).toContain('href="/"');
    expect(html).not.toContain("<button");
  });

  it("has its own line for a reader who was already unsubscribed", async () => {
    const html = await view("already_unsubscribed");
    expect(html).toContain('data-testid="unsubscribe-already"');
    expect(html).toContain(escapeHtml(fr["unsubscribe.already_title"]));
    expect(html).not.toContain(escapeHtml(fr["unsubscribe.done_title"]));
    expect(html).toContain('href="/profile"');
  });

  it("explains an invalid link as an alert, with no unsubscribe button", async () => {
    const html = await view("invalid");
    expect(html).toContain('role="alert"');
    expect(html).toContain(escapeHtml(fr["unsubscribe.invalid_title"]));
    expect(html).toContain(escapeHtml(fr["unsubscribe.invalid_body"]));
    expect(html).toContain('href="/profile"');
    expect(html).not.toContain("<button");
  });

  it("offers a retry after a network failure", async () => {
    const html = await view("error");
    expect(html).toContain('role="alert"');
    expect(html).toContain(escapeHtml(fr["unsubscribe.error_title"]));
    expect(buttonWith(html, escapeHtml(fr["state.retry"]))).toBeDefined();
    expect(html).toContain('href="/"');
  });

  it("uses logical utilities only, so the Arabic mirror needs no second layout", () => {
    const source = readFileSync(join(import.meta.dir, "UnsubscribeView.tsx"), "utf8");
    expect(source).not.toMatch(/(^|[\s"'`{])-?(ml|mr|pl|pr)-[\w.[\]/-]+/m);
    expect(source).not.toMatch(/\btext-(left|right)\b/);
    expect(source).not.toMatch(/(^|[\s"'`])-?(left|right)-[\w.[\]/-]+/m);
  });
});

describe("/unsubscribe route", () => {
  const route = readFileSync(join(import.meta.dir, "../../routes/unsubscribe.tsx"), "utf8");

  it("is kept out of search", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
  });

  it("sends nothing on load: no effect, and the first screen is the question or invalid", () => {
    expect(route).not.toMatch(/\buse(Layout)?Effect\b/);
    expect(route).toContain('isNotificationEmailUnsubscribeToken(token) ? "confirm" : "invalid"');
  });

  it("sends one request per press", () => {
    expect(route).toContain("if (inFlight.current) return;");
  });

  it("never logs the token", () => {
    expect(route).not.toMatch(/console\./);
  });
});

describe("UnsubscribeView for a Pépites link", () => {
  const pepitesView = (state: UnsubscribeViewState) =>
    render(<UnsubscribeView state={state} topic="pepites_weekly" onUnsubscribe={() => {}} />);

  it("asks about Pépites only, and says the other e-mails stay on", async () => {
    const html = await pepitesView("confirm");
    expect(html).toContain(escapeHtml(fr["unsubscribe.pepites_confirm_title"]));
    expect(html).toContain(escapeHtml(fr["unsubscribe.pepites_confirm_body"]));
    expect(html).not.toContain(escapeHtml(fr["unsubscribe.confirm_body"]));
  });

  it("confirms Pépites is off and nothing else", async () => {
    const done = await pepitesView("unsubscribed");
    expect(done).toContain(escapeHtml(fr["unsubscribe.pepites_done_title"]));
    expect(done).toContain(escapeHtml(fr["unsubscribe.pepites_reenable_hint"]));
    expect(done).not.toContain(escapeHtml(fr["unsubscribe.done_title"]));
    const already = await pepitesView("already_unsubscribed");
    expect(already).toContain(escapeHtml(fr["unsubscribe.pepites_already_title"]));
  });
});
