import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { addMatchDays, startOfMatchDay } from "@/lib/match-kickoff";
import { DateStrip } from "./DateStrip";

/**
 * The Matches date navigation (Option A, A-Matches): a navy band with the
 * day in the display face, its context line (the day relative to today and
 * its round) and glass previous / next controls; the day chips under it.
 */

const fr = dictionaries.fr;
/** Markup without React's text separators, apostrophes unescaped ("Aujourd'hui"). */
const render = (node: ReactElement) =>
  renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>)
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'");
const noop = () => {};
const today = startOfMatchDay(new Date());

describe("DateStrip — the band", () => {
  it("titles the band with the selected day, capitalised, in the display face", () => {
    const html = render(<DateStrip selected={today} onSelect={noop} />);
    const heading = /<h2 class="([^"]*)">([^<]*)<\/h2>/.exec(html);
    expect(heading).not.toBeNull();
    expect(heading![1]).toContain("[font-family:var(--ui-font-display)]");
    expect(heading![2]!.charAt(0)).toBe(heading![2]!.charAt(0).toLocaleUpperCase());
  });

  it("names today and the day's round on the context line", () => {
    const html = render(<DateStrip selected={today} onSelect={noop} gameweeks={[14]} />);
    expect(html).toContain(`${fr["matches.date.today"]} · ${fr["home.gameweek"]} 14`);
  });

  it("names yesterday and tomorrow too, and every round a day spans", () => {
    const yesterday = render(
      <DateStrip selected={addMatchDays(today, -1)} onSelect={noop} gameweeks={[13, 14]} />,
    );
    expect(yesterday).toContain(`${fr["matches.date.yesterday"]} · ${fr["home.gameweek"]} 13 · 14`);
    const tomorrow = render(<DateStrip selected={addMatchDays(today, 1)} onSelect={noop} />);
    expect(tomorrow).toContain(`>${fr["matches.date.tomorrow"]}</p>`);
  });

  it("keeps the context line one line tall when there is nothing to say", () => {
    const html = render(<DateStrip selected={addMatchDays(today, 3)} onSelect={noop} />);
    const NBSP = String.fromCharCode(0xa0);
    expect(html).toMatch(new RegExp(`<p class="[^"]*">${NBSP}</p>`));
  });

  it("steps one day either way with named round glass controls", () => {
    const html = render(<DateStrip selected={today} onSelect={noop} />);
    expect(html).toContain(`aria-label="${fr["matches.date.prev"]}"`);
    expect(html).toContain(`aria-label="${fr["matches.date.next"]}"`);
    expect(html.match(/color-mix\(in_srgb,var\(--ui-on-club\)_16%,transparent\)/g)?.length).toBe(2);
  });

  it("disables stepping past the season", () => {
    const html = render(
      <DateStrip selected={today} onSelect={noop} minDate={today} maxDate={today} />,
    );
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });

  it("runs its scrim to the bottom — never a physical angle", () => {
    const html = render(<DateStrip selected={today} onSelect={noop} />);
    expect(html).toContain("linear-gradient(to bottom");
    expect(html).not.toMatch(/to (left|right)|\d+deg/);
  });
});

describe("DateStrip — the day chips", () => {
  it("marks the day on show with aria-current, and no chip as a toggle", () => {
    const html = render(<DateStrip selected={today} onSelect={noop} />);
    expect(html.match(/aria-current="date"/g)?.length).toBe(1);
    expect(html).toContain('aria-current="false"');
    expect(html).not.toContain("aria-pressed");
  });

  it("offers the way back to today from any other day in the season", () => {
    const away = render(<DateStrip selected={addMatchDays(today, 10)} onSelect={noop} />);
    expect(away).toContain(`>${fr["matches.date.jump_today"]}</button>`);
    const onToday = render(<DateStrip selected={today} onSelect={noop} />);
    expect(onToday).not.toContain(`>${fr["matches.date.jump_today"]}</button>`);
  });
});
