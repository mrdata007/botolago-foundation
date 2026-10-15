import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { GuestClaimStatus } from "./guest-claim";
import { GuestClaimNotice, PersonalReadNotice } from "./PredictionsPage";

/**
 * What the Pronostics screen says while the reader's own picks are unread and
 * while the visitor's picks are on their way to the account. Rendered with
 * `react-dom/server` in French, like the other component tests.
 */

const fr = dictionaries.fr;
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const render = (node: React.ReactElement) =>
  renderToString(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");

describe("PersonalReadNotice", () => {
  const notice = (state: Parameters<typeof PersonalReadNotice>[0]["state"], fetching = false) =>
    render(<PersonalReadNotice state={state} fetching={fetching} onRetry={() => {}} />);

  it("says the picks are loading, with no retry", () => {
    const html = notice("loading");
    expect(html).toContain(escapeHtml(fr["predictions.personal.loading"]));
    expect(html).not.toContain(escapeHtml(fr["state.retry"]));
  });

  it("explains a failed read and offers the retry", () => {
    const html = notice("failed");
    expect(html).toContain(escapeHtml(fr["predictions.personal.failed"]));
    expect(html).toContain(escapeHtml(fr["state.retry"]));
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("holds the retry button while the retry runs", () => {
    const html = notice("failed", true);
    expect(html).toMatch(/<button[^>]*\sdisabled=""/);
    expect(html).toContain('aria-busy="true"');
  });

  it("says nothing once the picks are known, or for a visitor", () => {
    expect(notice("ready")).toBe("");
    expect(notice("not_needed")).toBe("");
  });
});

describe("GuestClaimNotice", () => {
  const notice = (status: GuestClaimStatus) =>
    render(<GuestClaimNotice status={status} onRetry={() => {}} />);

  it("says the visitor's picks are being added", () => {
    const html = notice({ phase: "pending", owner: "A", attempt: 1, remaining: 3 });
    expect(html).toContain(escapeHtml(fr["predictions.claim.pending"]));
  });

  it("says how many picks are not on the account yet, with a retry, after a failure", () => {
    const html = notice({
      phase: "failed",
      owner: "A",
      remaining: 3,
      code: "network",
      retrying: false,
    });
    expect(html).toContain("3 pronostics faits avant la connexion");
    expect(html).toContain(escapeHtml(fr["predictions.claim.failed_body"]));
    expect(html).toContain(escapeHtml(fr["state.retry"]));
  });

  it("says an automatic retry is under way instead of the manual advice", () => {
    const html = notice({
      phase: "failed",
      owner: "A",
      remaining: 1,
      code: "network",
      retrying: true,
    });
    expect(html).toContain(escapeHtml(fr["predictions.claim.retrying"]));
    expect(html).toContain("1 pronostic fait avant la connexion");
  });

  it("reports matches that had already started, and nothing for a clean import", () => {
    const started = notice({
      phase: "done",
      owner: "A",
      imported: 1,
      keptExisting: 0,
      started: 2,
      appliedAt: 1,
    });
    expect(started).toContain("2 matchs déjà commencés");
    const clean = notice({
      phase: "done",
      owner: "A",
      imported: 3,
      keptExisting: 0,
      started: 0,
      appliedAt: 1,
    });
    expect(clean).toBe("");
    expect(notice({ phase: "idle" })).toBe("");
  });
});
