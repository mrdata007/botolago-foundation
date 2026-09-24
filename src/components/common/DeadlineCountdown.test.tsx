import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { DeadlineCountdown } from "./DeadlineCountdown";

/**
 * Home's deadline pill (Option A, A-Home): the action gradient with ink-deep
 * text, a clock, what the deadline is for, and the time left to the minute.
 */

const fr = dictionaries.fr;
const render = (node: ReactElement) =>
  renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");
/** An ISO instant `d` days, `h` hours and `m` minutes (and half a minute) away. */
const inFuture = (d: number, h: number, m: number) =>
  new Date(Date.now() + ((d * 24 + h) * 60 + m) * 60_000 + 30_000).toISOString();
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("DeadlineCountdown", () => {
  it("counts down in days, hours and minutes", () => {
    const html = render(<DeadlineCountdown iso={inFuture(1, 13, 59)} />);
    expect(text(html)).toContain(
      `1${fr["home.days"]} 13${fr["home.hours"]} 59${fr["home.minutes"]}`,
    );
  });

  it("drops the day part on the last day instead of reading 0j", () => {
    const html = render(<DeadlineCountdown iso={inFuture(0, 5, 10)} />);
    expect(text(html)).toContain(`5${fr["home.hours"]} 10${fr["home.minutes"]}`);
    expect(text(html)).not.toContain(`0${fr["home.days"]}`);
  });

  it("is the gradient pill: round, ink-deep text, the label before the time", () => {
    const html = render(
      <DeadlineCountdown iso={inFuture(1, 2, 3)} label={fr["home.deadline_fantasy"]} />,
    );
    expect(html).toContain("background-image:var(--ui-grad-action)");
    expect(html).toContain("rounded-full");
    expect(html).toContain("text-[color:var(--ui-ink-deep)]");
    expect(html).toContain("lucide-clock");
    const plain = text(html);
    expect(plain.indexOf(fr["home.deadline_fantasy"])).toBeLessThan(
      plain.indexOf(`1${fr["home.days"]}`),
    );
    // Tabular figures, so the minutes do not shift the pill as they tick.
    expect(html).toContain("fpl-tabular");
  });

  it("renders the countdown alone in the plain tone", () => {
    const html = render(<DeadlineCountdown iso={inFuture(0, 1, 5)} tone="plain" />);
    expect(html).not.toContain("--ui-grad-action");
    expect(text(html)).toBe(`1${fr["home.hours"]} 5${fr["home.minutes"]}`);
  });

  it("never counts below zero once the deadline has passed", () => {
    const html = render(
      <DeadlineCountdown iso={new Date(Date.now() - 60_000).toISOString()} tone="plain" />,
    );
    expect(text(html)).toBe(`0${fr["home.hours"]} 0${fr["home.minutes"]}`);
  });
});
