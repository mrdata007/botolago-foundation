import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { countdownText } from "@/components/fpl/deadline";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { DeadlineCountdown } from "./DeadlineCountdown";

/**
 * Home's deadline pill (Option A, A-Home): the action gradient with ink-deep
 * text, a clock, what the deadline is for, and the time left to the minute.
 *
 * The time itself is read from the first client effect, so the server render
 * — what these tests see — carries no clock-dependent text: that is what keeps
 * the server HTML and the hydrating browser identical when a minute rolls
 * over between them. The spelling is `countdownText`, tested here directly.
 */

const fr = dictionaries.fr;
const t = (key: keyof typeof fr) => fr[key];
const render = (node: ReactElement) =>
  renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");
/** An ISO instant `d` days, `h` hours and `m` minutes (and half a minute) away. */
const inFuture = (d: number, h: number, m: number) =>
  new Date(Date.now() + ((d * 24 + h) * 60 + m) * 60_000 + 30_000).toISOString();
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("countdownText", () => {
  it("counts down in days, hours and minutes", () => {
    expect(countdownText({ days: 1, hours: 13, minutes: 59 }, t)).toBe(
      `1${fr["home.days"]} 13${fr["home.hours"]} 59${fr["home.minutes"]}`,
    );
  });

  it("drops the day part on the last day instead of reading 0j", () => {
    const last = countdownText({ days: 0, hours: 5, minutes: 10 }, t);
    expect(last).toBe(`5${fr["home.hours"]} 10${fr["home.minutes"]}`);
    expect(last).not.toContain(`0${fr["home.days"]}`);
  });
});

describe("DeadlineCountdown", () => {
  it("is the gradient pill: round, ink-deep text, a clock and the label", () => {
    const html = render(
      <DeadlineCountdown iso={inFuture(1, 2, 3)} label={fr["home.deadline_fantasy"]} />,
    );
    expect(html).toContain("background-image:var(--ui-grad-action)");
    expect(html).toContain("rounded-full");
    expect(html).toContain("text-[color:var(--ui-ink-deep)]");
    expect(html).toContain("lucide-clock");
    expect(text(html)).toContain(fr["home.deadline_fantasy"]);
    // Tabular figures, so the minutes do not shift the pill as they tick.
    expect(html).toContain("fpl-tabular");
  });

  it("renders no clock-dependent text on the server, so hydration cannot mismatch", () => {
    for (const node of [
      <DeadlineCountdown key="pill" iso={inFuture(1, 13, 59)} label="Date limite" />,
      <DeadlineCountdown key="plain" iso={inFuture(0, 1, 5)} tone="plain" />,
    ]) {
      const plain = text(render(node));
      expect(plain).not.toMatch(/\d/);
    }
  });
});
