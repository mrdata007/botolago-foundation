import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { hasRunningAnimation } from "./motion-loader";

import {
  EASE_EMPHASIZED,
  EASE_STANDARD,
  ExitCollapse,
  ExitFade,
  ExitPresence,
  ExitSwap,
} from "./motion-exit";

/**
 * The exit wrappers (MOTION_PLAN_4.md). The server render must be plain,
 * finished markup: nothing starts from `opacity: 0`, nothing is hidden or inert.
 */
describe("motion-exit server render", () => {
  it("renders a collapsing list item as plain finished markup", () => {
    const html = renderToStaticMarkup(
      <ul>
        <ExitPresence>
          <ExitCollapse as="li" key="a" className="row">
            <span>Alpha</span>
          </ExitCollapse>
          <ExitCollapse as="li" key="b" className="row">
            <span>Beta</span>
          </ExitCollapse>
        </ExitPresence>
      </ul>,
    );
    expect(html).toContain("<li");
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
    expect(html).not.toContain("opacity");
    expect(html).not.toContain("height");
    expect(html).not.toContain("aria-hidden");
    expect(html).not.toContain("inert");
  });

  it("renders a fading panel with its own attributes and no hidden state", () => {
    const html = renderToStaticMarkup(
      <ExitPresence>
        <ExitFade as="ul" key="p" id="list" role="listbox" className="panel">
          <li role="option">One</li>
        </ExitFade>
      </ExitPresence>,
    );
    expect(html).toContain('id="list"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain("One");
    expect(html).not.toContain("opacity");
    expect(html).not.toContain("transform");
    expect(html).not.toContain("aria-hidden");
  });

  it("renders a swap slot at its finished state, even though it fades in later", () => {
    const html = renderToStaticMarkup(
      <ExitSwap swapKey="player-1" className="slot">
        <button type="button">Player</button>
      </ExitSwap>,
    );
    expect(html).toContain("Player");
    // The server answers "reduced motion", so it draws no animation state.
    expect(html).not.toContain("style=");
    expect(html).not.toContain("opacity");
    expect(html).not.toContain("aria-hidden");
    expect(html).not.toContain("inert");
  });
});

describe("hasRunningAnimation", () => {
  it("counts running and pending animations", () => {
    expect(hasRunningAnimation([{ playState: "running" }])).toBe(true);
    expect(hasRunningAnimation([{ playState: "finished" }, { playState: "pending" }])).toBe(true);
  });
  it("ignores finished (a fill holds them in the list), idle and paused ones", () => {
    expect(
      hasRunningAnimation([
        { playState: "finished" },
        { playState: "idle" },
        { playState: "paused" },
      ]),
    ).toBe(false);
    expect(hasRunningAnimation([])).toBe(false);
  });
});

describe("motion-exit conventions", () => {
  it("keeps the easings equal to the tokens in styles.css", () => {
    const css = readFileSync(join(import.meta.dir, "..", "styles.css"), "utf8");
    const bezier = (value: readonly number[]) => `cubic-bezier(${value.join(", ")})`;
    expect(css).toContain(`--ease-standard: ${bezier(EASE_STANDARD)};`);
    expect(css).toContain(`--ease-emphasized: ${bezier(EASE_EMPHASIZED)};`);
  });

  it("is, with `motion-lib.tsx`, the only module that imports motion/react", () => {
    const root = join(import.meta.dir, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/motion-(exit|lib|loader)\.tsx?$/.test(path)) {
          if (
            /from\s+["']motion(\/react)?["']|from\s+["']framer-motion["']/.test(
              readFileSync(path, "utf8"),
            )
          )
            offenders.push(path);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
