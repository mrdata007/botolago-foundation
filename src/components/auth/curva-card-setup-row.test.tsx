import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";

import { FIXTURES } from "@/backend/manager-card/fixtures";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";

import { CardSetupRow } from "./curva-card-setup-row";
import { isFantasyCreateNext } from "./fantasy-create-path";
import { serverResolvesClub } from "./server-resolves-club";

/**
 * Profile setup's card row (plan M1c), as the server draws it: a 64 px token, the name beside it,
 * the club hint only when the server resolves the club, and none of the eyebrow label the lab
 * review ruled out.
 */

const fr = dictionaries.fr;
const render = (node: React.ReactNode) =>
  renderToString(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

const RAJA = {
  id: "raja",
  initials: "RCA",
  name: { fr: "Raja CA", ar: "الرجاء الرياضي" },
  primary: "#00843d",
  secondary: "#ffffff",
};

describe("which account paths show the card", () => {
  it("is the Fantasy builder's own address, with or without a query, hash or trailing slash", () => {
    for (const next of [
      "/fantasy/create",
      "/fantasy/create/",
      "/fantasy/create?step=name",
      "/fantasy/create#squad",
    ])
      expect(isFantasyCreateNext(next)).toBe(true);
  });

  it("is nothing else", () => {
    for (const next of [
      undefined,
      "",
      "/",
      "/fantasy",
      "/fantasy/team",
      "/fantasy/created",
      "/fantasy/create/extra",
      "/curva",
    ])
      expect(isFantasyCreateNext(next)).toBe(false);
  });
});

describe("the club colour waits for the server (owner decision 5)", () => {
  it("is allowed only when the account's own card read carries a club", () => {
    expect(serverResolvesClub(FIXTURES.rated.card)).toBe(true);
    expect(serverResolvesClub(FIXTURES.clubNull.card)).toBe(false);
    // No card yet (a new account, no team): nothing says the server resolves the club.
    expect(serverResolvesClub(null)).toBe(false);
    expect(serverResolvesClub(undefined)).toBe(false);
  });
});

describe("CardSetupRow", () => {
  it("draws a 64 px token with the name beside it, and no label over the name", () => {
    const html = render(<CardSetupRow name="Karim" club={null} clubHint={false} />);
    expect(html).toContain('data-testid="auth-card-row"');
    expect(html).toContain("mc-token");
    expect(html).toContain("width:64px;height:64px");
    expect(html).toContain('<bdi dir="auto">Karim</bdi>');
    // The token's own name carries the accessible description; the echo is not read twice.
    expect(html).toMatch(/<p aria-hidden="true"[^>]*>.*Karim/);
    expect(html).toContain("Carte de manager, Karim");
    expect(html).not.toContain("uppercase");
    expect(html).not.toContain(escapeHtml(fr["card.onboarding.m1.setup.card_label"]));
    expect(html).not.toMatch(/<h[1-6]/);
  });

  it("follows the name as typed, trimmed, whatever script it is in", () => {
    expect(render(<CardSetupRow name="  كريم  " club={null} clubHint={false} />)).toContain(
      '<bdi dir="auto">كريم</bdi>',
    );
  });

  it("escapes a hostile name", () => {
    const html = render(
      <CardSetupRow name={'<img src=x onerror="alert(1)">'} club={null} clubHint={false} />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x");
  });

  it("says « Votre carte » only while no name is typed", () => {
    const html = render(<CardSetupRow name="   " club={null} clubHint={false} />);
    expect(html).toContain(escapeHtml(fr["card.onboarding.m1.setup.card_label"]));
    expect(html).not.toContain("<bdi");
  });

  it("shows the club hint only when it is told to, and promises no colour otherwise", () => {
    const without = render(<CardSetupRow name="Karim" club={null} clubHint={false} />);
    expect(without).not.toContain(escapeHtml(fr["card.onboarding.m1.setup.club_hint"]));
    expect(without).not.toContain("couleur");
    const withHint = render(<CardSetupRow name="Karim" club={RAJA} clubHint />);
    expect(withHint).toContain(escapeHtml(fr["card.onboarding.m1.setup.club_hint"]));
  });

  it("keeps the row slim: a flex row, 16px under it, nothing animated", () => {
    const html = render(<CardSetupRow name="Karim" club={null} clubHint={false} />);
    expect(html).toContain('class="mb-4 flex items-center gap-3"');
    expect(html).not.toMatch(/animate-|transition|motion-|duration-/);
  });
});
