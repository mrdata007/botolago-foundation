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

import { formatDeadline } from "@/components/fpl/deadline";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { SQUAD_RULES } from "@/types/fantasy";
import { FantasyGuestIntro, GUEST_CREATE_NEXT } from "./FantasyGuestIntro";

/**
 * Audit 2026-09-25 (A16) — the Fantasy hub for a visitor without a team.
 *
 * The proposition is checked on rendered markup (a memory router, because
 * it holds router links; the French dictionary; `react-dom/server`, as the
 * club and match page tests do). Which audience gets it, and which of the
 * hub's sections it replaces, is `fantasyHubLayout` and the hub's personal
 * parts, rendered for every audience in `FantasyHubPersonal.test.tsx`.
 */

const fr = dictionaries.fr;
const ar = dictionaries.ar;
const ROOT = join(import.meta.dir, "..", "..", "..");
/** Source without comments, so a note that NAMES a construct does not trip a rule. */
const code = (path: string) =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/fantasy"] }),
  });
  await router.load();
  return renderToString(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

/** Copy as React writes it into markup. */
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const text = (html: string) => html.replace(/<[^>]+>/g, "");
const anchors = (html: string) => html.match(/<a [^>]*>/g) ?? [];
const hrefOf = (tag: string) => /href="([^"]*)"/.exec(tag)?.[1]?.replace(/&amp;/g, "&") ?? "";
const createLink = (html: string) =>
  anchors(html).find((tag) => tag.includes('data-testid="fantasy-intro-create"'));

const inAWeek = () => new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();

const intro = (props: Partial<Parameters<typeof FantasyGuestIntro>[0]> = {}) => (
  <FantasyGuestIntro
    audience="signed_out"
    joinBy={null}
    registrationClosed={false}
    prizes={false}
    {...props}
  />
);

describe("FantasyGuestIntro — what the game is, before anything personal", () => {
  it("says what BotolaGO Fantasy is under its own heading, in a labelled section", async () => {
    const html = await render(intro());
    const section = /<section aria-labelledby="([^"]+)"/.exec(html);
    expect(section).not.toBeNull();
    expect(html).toContain(`<h2 id="${section![1]}"`);
    expect(text(html)).toContain(escapeHtml(fr["fantasy.intro.title"]));
    expect(text(html)).toContain(escapeHtml(fr["fantasy.intro.lede"]));
  });

  it("explains it in four points — squad, budget, captain, deadline — with the real rule numbers", async () => {
    const html = await render(intro());
    const list = /<ul aria-labelledby="([^"]+)"[^>]*>([\s\S]*?)<\/ul>/.exec(html);
    expect(list).not.toBeNull();
    expect(html).toContain(`<h3 id="${list![1]}"`);
    expect(list![2].match(/<li /g)).toHaveLength(4);
    const plain = text(list![2]);
    expect(plain).toContain("Un effectif de 15 joueurs");
    expect(plain).toContain("Un budget de 100 M");
    expect(plain).toContain("3 joueurs au maximum par club");
    expect(plain).toContain(escapeHtml(fr["fantasy.intro.captain_title"]));
    expect(plain).toContain(escapeHtml(fr["fantasy.intro.deadline_title"]));
    // No placeholder survives into the page.
    expect(plain).not.toMatch(/\{(size|budget|max|n)\}/);
  });

  it("has ONE call to action, and a signed-out visitor signs in first and comes back to the builder", async () => {
    const html = await render(intro({ audience: "signed_out" }));
    const primary = anchors(html).filter((tag) => tag.includes("var(--ui-grad-action)"));
    expect(primary).toHaveLength(1);
    expect(primary[0]).toContain('data-testid="fantasy-intro-create"');
    const href = new URL(hrefOf(primary[0]), "https://botolago.com");
    expect(href.pathname).toBe("/auth/login");
    expect(href.searchParams.get("next")).toBe(GUEST_CREATE_NEXT);
    expect(GUEST_CREATE_NEXT).toBe("/fantasy/create");
    expect(text(html)).toContain(escapeHtml(fr["fantasy.create.title"]));
    // The login page is not a surprise: the line under the button says so.
    expect(text(html)).toContain(escapeHtml(fr["fantasy.intro.sign_in_note"]));
  });

  it("sends a signed-in manager without a team straight to the builder, and says there is no team yet", async () => {
    const html = await render(intro({ audience: "no_team" }));
    expect(hrefOf(createLink(html) ?? "")).toBe("/fantasy/create");
    expect(text(html)).toContain(escapeHtml(fr["fpl.no_team_yet"]));
    expect(text(html)).not.toContain(escapeHtml(fr["fantasy.intro.sign_in_note"]));
  });

  it("links the rules as the one secondary action", async () => {
    const html = await render(intro());
    const rules = anchors(html).filter((tag) => hrefOf(tag) === "/fantasy/rules");
    expect(rules).toHaveLength(1);
    expect(rules[0]).not.toContain("var(--ui-grad-action)");
    expect(text(html)).toContain(escapeHtml(fr["fpl.rules"]));
    // Nothing else to click: the call to action and the rules.
    expect(anchors(html)).toHaveLength(2);
  });

  it("names the deadline a new team has to meet, and the gameweek it starts in", async () => {
    const deadline = inAWeek();
    const html = await render(intro({ joinBy: { number: 2, deadline } }));
    expect(text(html)).toContain(escapeHtml(fr["fantasy.intro.join_by"].replace("{n}", "2")));
    expect(text(html)).toContain(escapeHtml(formatDeadline(deadline, "fr", { weekday: "short" })));
    // The date is isolated, so its digits keep their order inside Arabic.
    expect(html).toMatch(/<bdi>[^<]+<\/bdi>/);

    const none = await render(intro({ joinBy: null }));
    expect(text(none)).not.toContain(escapeHtml(fr["fantasy.intro.join_by"].slice(0, 20)));
  });

  it("says registration is closed in words instead of offering a button the builder would refuse", async () => {
    const html = await render(
      intro({ registrationClosed: true, joinBy: { number: 2, deadline: inAWeek() } }),
    );
    expect(createLink(html)).toBeUndefined();
    expect(anchors(html).some((tag) => tag.includes("var(--ui-grad-action)"))).toBe(false);
    expect(text(html)).toContain(escapeHtml(fr["fantasy.availability.registration_closed.title"]));
    expect(text(html)).toContain(escapeHtml(fr["fantasy.availability.registration_closed.body"]));
    expect(text(html)).not.toContain(escapeHtml(fr["fantasy.intro.join_by"].slice(0, 20)));
    // The explanation and the rules stay: they are still true.
    expect(text(html)).toContain(escapeHtml(fr["fantasy.intro.title"]));
    expect(anchors(html).map(hrefOf)).toEqual(["/fantasy/rules"]);
  });

  it("mentions prizes only when the catalog has one", async () => {
    expect(text(await render(intro({ prizes: true })))).toContain(
      escapeHtml(fr["fantasy.intro.prizes"]),
    );
    expect(text(await render(intro({ prizes: false })))).not.toContain(
      escapeHtml(fr["fantasy.intro.prizes"]),
    );
  });

  it("puts the call to action right after the lede, before how it works, so a phone reaches it", async () => {
    for (const audience of ["signed_out", "no_team"] as const) {
      const html = await render(
        intro({ audience, prizes: true, joinBy: { number: 2, deadline: inAWeek() } }),
      );
      const at = (needle: string) => {
        const index = html.indexOf(needle);
        expect({ needle, found: index >= 0 }).toEqual({ needle, found: true });
        return index;
      };
      const title = at(escapeHtml(fr["fantasy.intro.title"]));
      const lede = at(escapeHtml(fr["fantasy.intro.lede"]));
      const joinBy = at(escapeHtml(fr["fantasy.intro.join_by"].replace("{n}", "2")));
      const create = at('data-testid="fantasy-intro-create"');
      const prizes = at(escapeHtml(fr["fantasy.intro.prizes"]));
      const how = at(escapeHtml(fr["fantasy.intro.how_title"]));
      const list = at("<ul ");
      const rules = at('href="/fantasy/rules"');
      expect([title, lede, create, joinBy, prizes, how, list, rules]).toEqual(
        [title, lede, create, joinBy, prizes, how, list, rules].sort((a, b) => a - b),
      );
    }
  });

  it("describes the signed-out button with the note under it, so its destination is announced", async () => {
    const html = await render(intro({ audience: "signed_out" }));
    const described = /aria-describedby="([^"]+)"/.exec(createLink(html) ?? "");
    expect(described).not.toBeNull();
    const note = new RegExp(`<p id="${described![1]}"[^>]*>([^<]*)</p>`).exec(html);
    expect(note?.[1]).toBe(escapeHtml(fr["fantasy.intro.sign_in_note"]));
    // Signed in, the button goes where it says: nothing to describe.
    const signedIn = await render(intro({ audience: "no_team" }));
    expect(createLink(signedIn)).not.toContain("aria-describedby");
  });

  it("says there is no team yet under the heading, where heading navigation lands", async () => {
    const html = await render(intro({ audience: "no_team" }));
    const heading = html.indexOf("</h2>");
    const status = html.indexOf(escapeHtml(fr["fpl.no_team_yet"]));
    expect(heading).toBeGreaterThan(0);
    expect(status).toBeGreaterThan(heading);
  });

  it("carries none of the owner's dashboard: no leagues, no cup, no switches, no dialog", async () => {
    for (const audience of ["signed_out", "no_team"] as const) {
      const html = await render(intro({ audience, prizes: true }));
      const plain = text(html);
      expect(plain).not.toContain(escapeHtml(fr["fantasy.hub.my_leagues"]));
      expect(plain).not.toContain(escapeHtml(fr["fpl.cup_not_qualified"]));
      expect(plain).not.toContain(escapeHtml(fr["fpl.notifications"]));
      expect(html).not.toContain('role="switch"');
      expect(html).not.toContain('role="dialog"');
    }
  });
});

describe("FantasyGuestIntro — French and Arabic", () => {
  const keys = Object.keys(fr).filter((key) => key.startsWith("fantasy.intro.")) as Array<
    keyof typeof fr
  >;

  it("has every line in both languages, Arabic in Arabic script, the same placeholders", () => {
    expect(keys.length).toBeGreaterThanOrEqual(14);
    const placeholders = (value: string) => [...value.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
    for (const key of keys) {
      const arabic = (ar as Record<string, string>)[key];
      expect({ key, present: typeof arabic === "string" && arabic.trim().length > 0 }).toEqual({
        key,
        present: true,
      });
      expect({ key, arabicScript: /[؀-ۿ]/.test(arabic) }).toEqual({
        key,
        arabicScript: true,
      });
      expect({ key, placeholders: placeholders(arabic) }).toEqual({
        key,
        placeholders: placeholders(fr[key]),
      });
    }
  });

  it("states the squad's position split and starting XI as the rules have them, in both languages", () => {
    // Written out, not filled in: Arabic says "حارسان" for two goalkeepers,
    // a dual a {gk} placeholder cannot produce. So the copy is pinned to
    // SQUAD_RULES here instead, and a rule change fails this test.
    const { GK, DEF, MID, FWD } = SQUAD_RULES.perPosition;
    expect(GK + DEF + MID + FWD).toBe(SQUAD_RULES.totalSize);
    expect(fr["fantasy.intro.squad_body"]).toContain(
      `${GK} gardiens, ${DEF} défenseurs, ${MID} milieux et ${FWD} attaquants, dont ${SQUAD_RULES.startingXI} titulaires`,
    );
    expect(GK).toBe(2);
    expect(ar["fantasy.intro.squad_body"]).toContain(
      `حارسان و${DEF} مدافعين و${MID} لاعبي وسط و${FWD} مهاجمين، تختار منهم ${SQUAD_RULES.startingXI} أساسياً`,
    );
  });

  it("uses the kit's logical properties only, so it mirrors in Arabic", () => {
    const source = code("src/components/fantasy/FantasyGuestIntro.tsx");
    expect(source).not.toMatch(
      /["'`\s](?:m[lr]|p[lr]|border-[lr]|rounded-[lr]|rounded-(?:tl|tr|bl|br)|text-(?:left|right)|float-(?:left|right))(?:-|\b)/,
    );
    expect(source).not.toMatch(/["'`\s]-?(?:left|right)-(?:\d|\[|1\/2|full|px)/);
    expect(source).not.toMatch(/(?<!ltr:)tracking-/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\(/);
    expect(source).not.toMatch(/\b(?:bg|text)-(?:white|black)\b/);
    expect(source).not.toMatch(/(?:text|ring|border)-\[color:var\(--ui-ink\)\]/);
  });
});

describe("the Fantasy hub around the proposition", () => {
  const hub = code("src/routes/fantasy.index.tsx");
  const personal = code("src/components/fantasy/FantasyHubPersonal.tsx");

  it("puts the proposition in the team card's place, not the bare sign-in card", () => {
    expect(personal).toContain("<FantasyGuestIntro");
    expect(personal).toContain("joinBy={joinTarget(gameweek)}");
    expect(personal).toContain("registrationClosed={gameweek?.enrolment === null}");
    expect(personal).not.toContain('phase="guest"');
    expect(hub).not.toContain('phase="guest"');
  });

  it("opens the prize welcome over the owner's dashboard only", () => {
    expect(hub).toContain("{PRIZES_ENABLED && layout.prizeWelcome && <PrizeWelcome />}");
    expect(hub.match(/<PrizeWelcome/g)).toHaveLength(1);
    expect(personal).not.toContain("<PrizeWelcome");
  });

  it("leaves the prize welcome one way on: its visitor always has a team", () => {
    // `layout.prizeWelcome` is an owner's only (fantasy-hub-layout.test.ts),
    // so the "Créer une équipe" it kept for a visitor without a team could
    // not be reached: the proposition is where that visitor is asked.
    const welcome = code("src/components/prizes/PrizeWelcome.tsx");
    expect(welcome).toContain("export function PrizeWelcome() {");
    expect(welcome).not.toContain("hasTeam");
    expect(welcome).not.toContain('to="/fantasy/create"');
    expect(welcome).not.toContain("fpl.create_team");
    expect(welcome).toContain('{t("prizes.welcome.go")}');
    expect(welcome).toContain('to="/prizes"');
  });

  it("keeps the band caption the e2e journey finds the hub by", () => {
    // "Journée N · Date limite", one element.
    expect(hub).toContain('{`${t("fpl.gameweek")} ${gameweek.number}`}');
    expect(hub).toContain('{`· ${t("fpl.deadline")}`}');
  });
});
