import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup, renderToString } from "react-dom/server";

import { FIXTURES } from "@/backend/manager-card/fixtures";
import { fill } from "@/components/manager-card/interpolate";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";

import { CardDeletionNotice } from "./curva-card-deletion-line";

/**
 * The deletion request's line about the card (plan section 4): the card goes with the account, its
 * number is never reissued, and the number part is there only when the card has one.
 */

const fr = dictionaries.fr;
const ar = dictionaries.ar;
const render = (node: React.ReactNode) =>
  renderToString(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");

describe("the card's line in the deletion request", () => {
  it("names the number, as one unit that never breaks or reorders, when the card has one", () => {
    const html = render(<CardDeletionNotice card={FIXTURES.rated.card} />);
    expect(html).toContain('data-testid="deletion-card-line"');
    expect(html).toContain(
      'Votre carte de manager et son numéro <bdi dir="ltr" class="whitespace-nowrap">BOT #482913</bdi> seront supprimés. Ce numéro ne sera jamais réattribué.',
    );
  });

  it("says only that the card goes while it has no number yet", () => {
    const card = FIXTURES.born0.card;
    expect(card?.serial).toBeNull();
    const html = render(<CardDeletionNotice card={card} />);
    expect(html).toContain("Votre carte de manager sera supprimée.");
    expect(html).not.toContain("BOT");
    expect(html).not.toContain("numéro");
  });

  it("treats an empty serial as none", () => {
    const html = render(<CardDeletionNotice card={{ serial: "" }} />);
    expect(html).toContain("Votre carte de manager sera supprimée.");
  });

  it("is absent when there is no card, or no answer yet", () => {
    expect(render(<CardDeletionNotice card={null} />)).toBe("");
    expect(render(<CardDeletionNotice card={undefined} />)).toBe("");
  });

  it("prints a serial the way the card does and never with a leading zero", () => {
    for (const fixture of Object.values(FIXTURES)) {
      const serial = fixture.card?.serial;
      if (!serial) continue;
      expect(serial).not.toMatch(/^0/);
      expect(render(<CardDeletionNotice card={fixture.card} />)).toContain(`BOT #${serial}`);
    }
  });

  it("is a line in a sunken block, not a heading, with the kit's radius and no new token", () => {
    const html = render(<CardDeletionNotice card={FIXTURES.rated.card} />);
    expect(html).toContain("bg-[color:var(--ui-surface-sunken)]");
    expect(html).toContain("rounded-[var(--ui-radius-control)]");
    expect(html).not.toMatch(/<h[1-6]/);
  });
});

describe("the Arabic line", () => {
  it("fills the template with the serial isolated left to right", () => {
    const node = fill(ar["card.onboarding.state.deletion"], {
      serial: <bdi dir="ltr">BOT #482913</bdi>,
    });
    const html = renderToStaticMarkup(<>{node}</>);
    expect(html).toBe(
      'ستُحذف بطاقتك كمدرّب ورقمها <bdi dir="ltr">BOT #482913</bdi>، ولن يُعاد إسناد هذا الرقم أبدًا.',
    );
  });

  it("has the same placeholders as the French, and a serial-free variant in both languages", () => {
    expect(fr["card.onboarding.state.deletion"]).toContain("{serial}");
    expect(ar["card.onboarding.state.deletion"]).toContain("{serial}");
    expect(fr["card.onboarding.state.deletion_noserial"]).not.toContain("{");
    expect(ar["card.onboarding.state.deletion_noserial"]).not.toContain("{");
  });
});
