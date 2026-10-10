import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";

import { FIXTURES } from "@/backend/manager-card/fixtures";
import { I18nProvider } from "@/i18n/provider";

import { activeRenderer } from "./active-renderer";
import { CardToken } from "./CardToken";
import { ManagerCard } from "./ManagerCard";
import { mountPointerBehaviour } from "./mount-pointer";
import type { CardRenderer } from "./renderer";
import { clearRenderCache, cachedRender, renderCacheSize, widthBucket } from "./render-cache";
import { fromMyCard, guestProfile } from "./to-profile";

const render = (node: React.ReactNode) =>
  renderToString(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");

const profile = fromMyCard(FIXTURES.rated.card!);

describe("ManagerCard on the server", () => {
  it("draws a sized box with the card's label, and no SVG", () => {
    const html = render(<ManagerCard profile={profile} width={240} testId="stage" />);
    expect(html).toContain("mc-card");
    expect(html).toContain('data-testid="stage"');
    expect(html).toContain("width:240px");
    // The box has the card's shape before its renderer has loaded: the active renderer's estimate.
    expect(html).toContain(`aspect-ratio:1 / ${activeRenderer.estimateAspect(profile, "fr")}`);
    expect(html).toContain("Carte de manager, Ali, 84 OVR, PRO, Raja CA, BOT #482913");
    expect(html).toContain("sr-only");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("data-mc-ready");
  });

  it("says a card with no number has none, and a guest's card is unnamed", () => {
    expect(render(<ManagerCard profile={guestProfile()} width={264} />)).toContain(
      "Carte de manager, pas encore de note",
    );
  });

  it("escapes the name in the label it prints", () => {
    const html = render(
      <ManagerCard profile={{ ...profile, name: '<img src=x onerror="alert(1)">' }} width={240} />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});

describe("the tilt prop", () => {
  const host = {} as HTMLElement;
  const rendererWith = (mount?: CardRenderer["mount"]) => ({ mount }) as unknown as CardRenderer;

  it("mounts the renderer's pointer behaviour on a card that asked for it, and hands back its cleanup", () => {
    const calls: HTMLElement[] = [];
    const cleanup = () => undefined;
    const renderer = rendererWith((el) => {
      calls.push(el);
      return cleanup;
    });
    const got = mountPointerBehaviour({
      tilt: true,
      renderer,
      host,
      html: "<div/>",
      reducedMotion: false,
    });
    expect(calls).toEqual([host]);
    expect(got).toBe(cleanup);
  });

  it("mounts nothing on a card that did not ask, under reduced motion, before the card is in the page, or for a renderer without the behaviour", () => {
    let mounted = 0;
    const renderer = rendererWith(() => {
      mounted += 1;
      return () => undefined;
    });
    const base = { tilt: true, renderer, host, html: "<div/>", reducedMotion: false };
    expect(mountPointerBehaviour({ ...base, tilt: false })).toBeUndefined();
    expect(mountPointerBehaviour({ ...base, reducedMotion: true })).toBeUndefined();
    expect(mountPointerBehaviour({ ...base, host: null })).toBeUndefined();
    expect(mountPointerBehaviour({ ...base, html: null })).toBeUndefined();
    expect(mountPointerBehaviour({ ...base, renderer: null })).toBeUndefined();
    expect(mountPointerBehaviour({ ...base, renderer: rendererWith() })).toBeUndefined();
    expect(mounted).toBe(0);
  });
});

describe("CardToken on the server", () => {
  it("draws a box of the token's size with the label, and no SVG", () => {
    const html = render(<CardToken profile={profile} size={44} />);
    expect(html).toContain("mc-token");
    expect(html).toContain("width:44px;height:44px");
    expect(html).toContain("Carte de manager, Ali, 84 OVR");
    expect(html).not.toContain("<svg");
  });

  it("uses spans only, so it sits inside a button or a table cell", () => {
    const html = render(<CardToken profile={profile} size={28} />);
    expect(html).not.toMatch(/<(div|p)\b/);
  });
});

describe("the render cache", () => {
  it("keeps 64 renders, drops the least recently used, and counts a hit as use", () => {
    clearRenderCache();
    let made = 0;
    const make = (key: string) => cachedRender(key, () => `<g>${key}-${(made += 1)}</g>`);
    for (let i = 0; i < 64; i += 1) make(`k${i}`);
    expect(renderCacheSize()).toBe(64);
    make("k0"); // k0 is the newest now
    make("k64"); // drops k1
    expect(renderCacheSize()).toBe(64);
    const before = made;
    make("k0");
    expect(made).toBe(before);
    make("k1");
    expect(made).toBe(before + 1);
    clearRenderCache();
  });

  it("buckets widths to 16 px", () => {
    expect(widthBucket(240)).toBe(widthBucket(243));
    expect(widthBucket(240)).not.toBe(widthBucket(264));
  });
});
