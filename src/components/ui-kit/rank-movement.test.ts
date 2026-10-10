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
