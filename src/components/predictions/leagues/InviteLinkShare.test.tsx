import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { inviteLink, whatsappUrl } from "./invite-link";
import { InviteLinkShare } from "./InviteLinkShare";

/**
 * BG-0155 — the share buttons, from the game they go out from. One league
 * serves both games: Pronostics shares it by default, exactly as before, and
 * the Fantasy league pages pass `game="fantasy"` so the link lands on the
 * Fantasy join, the message is the Fantasy hub's and no Pronostics share is
 * counted. Rendered with `react-dom/server` in the French dictionary; the
 * buttons themselves need a browser to press, so what pressing does is pinned
 * at the source.
 */

const fr = dictionaries.fr;
const CODE = "0035D6D8995B37EA0F05E2331C21FC0F";
/** The direction isolates the share text puts around a league's name. */
const isolated = (name: string) => `⁨${name}⁩`;
/** The link as the server renders it: no window, so the public site's origin. */
const linkFor = (game: "fantasy" | "predictions") => inviteLink(CODE, PUBLIC_SITE_ORIGIN, game);

// The server has no window, and the link reads `window.location` when there
// is one. Test files share one process and one may leave a bare `window`
// behind, so each render takes it away and puts back what was there.
const globals = globalThis as { window?: unknown };
function render(node: ReactElement): string {
  const had = "window" in globals;
  const saved = globals.window;
  delete globals.window;
  try {
    return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");
  } finally {
    if (had) globals.window = saved;
  }
}

const unescape = (html: string) =>
  html
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
/** The WhatsApp link's address, as the browser reads it. */
const whatsappHref = (html: string) =>
  unescape(/<a [^>]*href="(https:\/\/wa\.me\/[^"]*)"/.exec(html)?.[1] ?? "");

const source = readFileSync(join(import.meta.dir, "InviteLinkShare.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1")
  .replace(/\s+/g, " ");

describe("InviteLinkShare, Pronostics (the default)", () => {
  const pronostics = () => render(<InviteLinkShare league="Les Lions" code={CODE} />);

  it("links to the join naming Pronostics, with the Pronostics message", () => {
    const link = linkFor("predictions");
    expect(link.endsWith(`#code=${CODE}&game=predictions`)).toBe(true);
    const text = fr["predictions.leagues.share_text"]
      .replace("{league}", isolated("Les Lions"))
      .replace("{link}", link);
    expect(whatsappHref(pronostics())).toBe(whatsappUrl(text));
  });

  it("keeps its own test ids and shows no code unless asked", () => {
    const html = pronostics();
    expect(html).toContain('data-testid="predictions-invite-share"');
    expect(html).not.toContain("predictions-invite-code");
    expect(html).not.toContain("fantasy-invite");
  });

  it("is the same markup whether the game is left out or named", () => {
    expect(render(<InviteLinkShare league="Les Lions" code={CODE} game="predictions" />)).toBe(
      pronostics(),
    );
    expect(render(<InviteLinkShare league="Les Lions" code={CODE} showCode />)).toBe(
      render(<InviteLinkShare league="Les Lions" code={CODE} showCode game="predictions" />),
    );
  });
});

describe("InviteLinkShare, Fantasy (game='fantasy')", () => {
  const fantasy = () =>
    render(<InviteLinkShare game="fantasy" league="Casablanca Derby" code={CODE} showCode />);

  it("links to the join naming Fantasy, never Pronostics", () => {
    const link = linkFor("fantasy");
    expect(link.endsWith(`#code=${CODE}&game=fantasy`)).toBe(true);
    expect(whatsappHref(fantasy())).toContain(encodeURIComponent(link));
    expect(whatsappHref(fantasy())).not.toContain(encodeURIComponent("game=predictions"));
  });

  it("sends the Fantasy hub's invite message, the league's name isolated", () => {
    const text = fr["fantasy.hub.invite_message"]
      .replace("{name}", isolated("Casablanca Derby"))
      .replace("{link}", linkFor("fantasy"));
    expect(whatsappHref(fantasy())).toBe(whatsappUrl(text));
  });

  it("shows the new code once, left to right, with the warning", () => {
    const html = fantasy();
    expect(html).toContain('data-testid="fantasy-invite-share"');
    expect(html).toMatch(
      new RegExp(`dir="ltr"[^>]*data-testid="fantasy-invite-code"[^>]*>${CODE}<`),
    );
    expect(unescape(html)).toContain(fr["predictions.leagues.code_once"]);
    expect(html).not.toContain("predictions-invite");
  });

  it("offers the phone's share sheet, WhatsApp and copying the link", () => {
    const text = unescape(fantasy().replace(/<[^>]+>/g, " "));
    for (const key of [
      "article.share",
      "predictions.share.whatsapp",
      "predictions.leagues.copy_link",
    ] as const) {
      expect(text).toContain(fr[key]);
    }
  });
});

describe("InviteLinkShare: what pressing does", () => {
  it("counts a Pronostics share only, from one place", () => {
    expect(source.match(/track\(/g)).toHaveLength(1);
    expect(source).toContain('if (!fantasy) track("pronostics_share");');
    // The share sheet, the copy and the WhatsApp link all go through it.
    expect(source.match(/counted\(\);/g)).toHaveLength(2);
    expect(source).toContain("onClick={counted}");
  });

  it("says a copied Fantasy link in the Fantasy wording", () => {
    expect(source).toContain(
      'toast.success(fantasy ? t("fantasy.hub.invite_copied") : t("article.share_copied"));',
    );
    expect(source).toContain(
      'toast.error(fantasy ? t("state.error") : t("predictions.save.offline"));',
    );
  });
});
