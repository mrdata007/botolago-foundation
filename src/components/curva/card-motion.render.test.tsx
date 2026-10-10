import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import { FIXTURES } from "@/backend/manager-card/fixtures";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { fromMyCard } from "@/components/manager-card/to-profile";
import { motionCopy } from "@/components/manager-card/motion-copy";

import { eclatRenderer } from "@/components/manager-card/eclat/index";
import { plainRenderer } from "@/components/manager-card/plain-renderer";

import { CardBack } from "./CardBack";
import { CardStage, RatingLine } from "./CardStage";

/**
 * What the server draws for the card's motion work: the stage with « Retourner » and the back
 * face, and the rating change chip. The server never plays anything, so these are the finished,
 * still states.
 */
function render(node: ReactElement): string {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>{node}</I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const profile = fromMyCard(FIXTURES.rated.card!, { sample: false });
const fr = dictionaries.fr;
const ar = dictionaries.ar;

describe("the stage's flip", () => {
  const html = render(<CardStage profile={profile} flippable />);

  it("draws « Retourner » as a button that is not pressed, named for what it does", () => {
    const button = html.match(/<button[^>]*data-testid="curva-flip"[^>]*>/)![0];
    expect(button).toContain('aria-pressed="false"');
    expect(button).toContain(`aria-label="${fr["card_motion.flip.label"]}"`);
    expect(button).toContain('type="button"');
  });

  it("shows the front and hides the back: inert and aria-hidden on the hidden face", () => {
    const front = html.match(/<div[^>]*data-flip-face="front"[^>]*>/)![0];
    const back = html.match(/<div[^>]*data-flip-face="back"[^>]*>/)![0];
    expect(front).not.toContain("inert");
    expect(front).not.toContain("aria-hidden");
    expect(back).toContain('inert=""');
    expect(back).toContain('aria-hidden="true"');
  });

  it("draws the hidden face with no 3D transform before the client knows motion is allowed (and under reduced motion)", () => {
    const back = html.match(/<div[^>]*data-flip-face="back"[^>]*>/)![0];
    expect(back).toContain("invisible");
    expect(back).not.toContain("rotateY");
    expect(html).not.toContain("rotateY");
  });

  it("announces nothing until the card is turned (a live region that starts empty)", () => {
    expect(html).toMatch(/<p role="status"[^>]*data-testid="curva-flip-status"[^>]*><\/p>/);
  });

  it("draws neither the button nor the back on a stage that is not flippable", () => {
    const plain = render(<CardStage profile={profile} />);
    expect(plain).not.toContain("curva-flip");
    expect(plain).not.toContain("data-card-back");
    expect(plain).toContain('data-testid="curva-stage"');
  });

  it("keeps the card's own box and shape: the card is the same reserved box, in the stage's one width", () => {
    expect(html).toContain("aspect-ratio:1 / 1.618");
    expect(html).toMatch(/data-stage-card="" class="[^"]*md:w-\[336px\]/);
  });

  it("has no 3D context at rest: the perspective and preserve-3d come only with the turn", () => {
    expect(html).not.toContain("preserve-3d");
    expect(html).not.toContain("perspective:");
  });
});

describe("the back of the card", () => {
  const html = render(<CardBack profile={profile} />);

  it("shows the four statistics with their codes and names, the season and the serial", () => {
    for (const code of ["CAP", "SEL", "TRF", "CON"]) expect(html).toContain(`>${code}<`);
    for (const key of ["cap", "sel", "trf", "con"] as const) {
      expect(html).toContain(fr[`card.stat_long.${key}`]);
    }
    for (const value of [91, 82, 86, 78]) expect(html).toContain(`>${value}<`);
    expect(html).toContain("2026/27");
    expect(html).toContain("BOT #482913");
  });

  it("is named, as a group, so a screen reader can say which face it is on", () => {
    expect(html).toContain(`aria-label="${fr["card_motion.flip.back_label"]}"`);
  });

  it("takes the tier's colours from the renderer's palette: the PRO row of Éclat's ladder, whole", () => {
    const pro = eclatRenderer.palette("pro");
    expect(pro.plate).toBe("#1A0407");
    expect(pro.deep).toBe("#6E0F18");
    expect(pro.metal).toHaveLength(7);
    expect(eclatRenderer.palette(null).plate).toBe("#12151B");
    expect(eclatRenderer.palette("legend").prism).toHaveLength(6);
    expect(eclatRenderer.palette("pro").prism).toBeNull();
    expect(plainRenderer.palette("pro").plate).toBeTruthy();
  });

  it("takes the neutral graphite until the renderer has loaded, never a palette of its own per tier", () => {
    expect(html).toContain("#12151B");
    expect(html).not.toContain("#1A0407");
  });

  it("is built of the front's parts: the cut-cornered outline, the honeycomb, the club disc, the tier chip and the wordmark", () => {
    expect(html).toContain("clip-path:polygon(");
    expect(html).toContain("<pattern");
    expect(html).toContain(">RCA<");
    expect(html).toContain("BOTOLAGO");
    expect(html).toContain("ALI");
  });

  it("shows a dash, never 0, for a statistic that is not there", () => {
    const empty = render(
      <CardBack profile={{ ...profile, stats: { ...profile.stats, trf: null } }} />,
    );
    expect(empty).toMatch(/data-back-stat="trf"[\s\S]*?>—<\/dd>/);
    expect(empty).not.toMatch(/data-back-stat="trf"[\s\S]*?>0</);
  });
});

describe("the rating change chip", () => {
  const line = (change: { delta: number; pop: boolean } | null, over = {}) =>
    render(
      <RatingLine
        ovr={84}
        tier="pro"
        provisional={false}
        counted={9}
        min={3}
        formingLabel="forming"
        change={change}
        {...over}
      />,
    );
  const chip = (html: string) =>
    html.match(/data-testid="curva-rating-change"[\s\S]*?<\/span><\/span>/)?.[0] ?? "";

  it("shows « +3 ▲ » in the positive colour, in one left-to-right run, with the sentence for a screen reader", () => {
    const html = line({ delta: 3, pop: false });
    expect(html).toContain('<bdi dir="ltr" aria-hidden="true">+3 ▲</bdi>');
    expect(html).toContain("text-[color:var(--ui-positive)]");
    expect(html).toContain(">note en hausse de 3<");
    expect(chip(html)).toContain('data-change="up"');
  });

  it("shows « −2 ▼ » with the true minus sign, in the negative colour", () => {
    const html = line({ delta: -2, pop: false });
    expect(html).toContain('<bdi dir="ltr" aria-hidden="true">−2 ▼</bdi>');
    expect(html).toContain("text-[color:var(--ui-negative)]");
    expect(html).toContain(">note en baisse de 2<");
    expect(chip(html)).toContain('data-change="down"');
  });

  it("pops only when told to: the pop class and marker are absent otherwise (reduced motion, a seen round)", () => {
    expect(line({ delta: 3, pop: true })).toMatch(/class="[^"]*\bpop\b[^"]*"/);
    expect(chip(line({ delta: 3, pop: true }))).toContain('data-pop="1"');
    expect(line({ delta: 3, pop: false })).not.toMatch(/class="[^"]*\bpop\b[^"]*"/);
    expect(chip(line({ delta: 3, pop: false }))).not.toContain("data-pop");
  });

  it("is absent with no change: no previous rating, or nothing moved", () => {
    expect(line(null)).not.toContain("curva-rating-change");
    expect(
      render(
        <RatingLine ovr={84} tier="pro" provisional={false} counted={9} min={3} formingLabel="f" />,
      ),
    ).not.toContain("curva-rating-change");
  });

  it("is absent on a forming card, which has no number to compare", () => {
    const html = line({ delta: 3, pop: false }, { ovr: null, tier: null });
    expect(html).not.toContain("curva-rating-change");
  });
});

describe("the motion words", () => {
  const dict = (lang: "fr" | "ar") => (key: keyof typeof fr) => dictionaries[lang][key];
  it("say the same things in both languages, with the size isolated in Arabic", () => {
    const f = motionCopy(dict("fr"));
    const a = motionCopy(dict("ar"));
    expect(f.flip.label).toBe("Retourner la carte");
    expect(a.flip.label).toBe("اقلب البطاقة");
    expect(f.deltaA11y(true, 3)).toBe("note en hausse de 3");
    expect(f.deltaA11y(false, 2)).toBe("note en baisse de 2");
    expect(a.deltaA11y(true, 3)).toContain("3");
    expect(a.deltaA11y(true, 3)).toContain("ارتفع");
    expect(a.deltaA11y(false, 2)).toContain("انخفض");
    for (const key of Object.keys(fr).filter((k) => k.startsWith("card_motion."))) {
      expect(ar[key as keyof typeof ar]).toBeDefined();
    }
  });
});
