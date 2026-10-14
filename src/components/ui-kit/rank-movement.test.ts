import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { UiRankMovement } from "./primitives";

const labels = { up: "Up", down: "Down", same: "Same" };

/**
 * The arrow rolls and the disc pops only when the rank changes while the page
 * is open (`useJustChanged`). A page's first render, which is what the server
 * sends, never carries the animation classes.
 */
describe("UiRankMovement on first show", () => {
  const render = (rank: number, previousRank: number | null, variant?: "disc" | "quiet") =>
    renderToStaticMarkup(createElement(UiRankMovement, { rank, previousRank, labels, variant }));

  it("draws the disc still, with its arrow and name", () => {
    const html = render(3, 7);
    expect(html).toContain('aria-label="Up"');
    expect(html).toContain("▲");
    expect(html).not.toMatch(/\b(pop|roll-up|roll-down)\b/);
  });

  it("draws the quiet variant still, with its arrow and number", () => {
    const html = render(9, 4, "quiet");
    expect(html).toContain("▼");
    expect(html).toContain("<bdi>5</bdi>");
    expect(html).not.toMatch(/\b(pop|roll-up|roll-down)\b/);
  });
});

/**
 * FANT-04. No earlier rank is not "unchanged": it must not draw "=", an arrow
 * or a zero, in either variant.
 */
describe("UiRankMovement without an earlier rank", () => {
  const withUnknown = { ...labels, unknown: "No history" };
  const render = (variant: "disc" | "quiet") =>
    renderToStaticMarkup(
      createElement(UiRankMovement, { rank: 4, previousRank: null, labels: withUnknown, variant }),
    );

  it("quiet: a dash, named as unknown, never an arrow, an equals sign or a number", () => {
    const html = render("quiet");
    expect(html).toContain("—");
    expect(html).toContain("No history");
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).not.toMatch(/▲|▼|=|[0-9]/);
    expect(html).not.toContain("Same");
  });

  it("disc: a dash, never the 'unchanged' name", () => {
    const html = render("disc");
    expect(html).toContain("—");
    expect(html).not.toMatch(/▲|▼/);
    expect(html).not.toContain("Same");
  });

  it("an unchanged rank still reads as unchanged", () => {
    const html = renderToStaticMarkup(
      createElement(UiRankMovement, { rank: 4, previousRank: 4, labels, variant: "quiet" }),
    );
    expect(html.replace(/<[^>]*>/g, "")).toContain("=");
    expect(html).toContain("Same");
  });
});
