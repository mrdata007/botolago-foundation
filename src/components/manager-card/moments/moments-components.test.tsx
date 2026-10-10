import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { AuthProvider } from "@/auth/AuthProvider";
import { FIXTURES } from "@/backend/manager-card/fixtures";
import { I18nProvider } from "@/i18n/provider";

import { fromMyCard } from "../to-profile";
import CardBornPanelDefault, { CardBornPanel } from "./CardBornPanel";
import { MomentHero } from "./MomentHero";
import { MomentLines } from "./MomentLines";
import { ReplaySheet } from "./ReplaySheet";
import { ShareCardSheet } from "./ShareCardSheet";

/**
 * What each component draws on the server, where the launch gate is closed: nothing, so the
 * markup the server sends and the first client render agree, and nothing of a moment is ever
 * counted or acknowledged before the launch sequence lets go (plan 5.3). The page's own stage,
 * passed as `children`, is always there. The decisions themselves are tested where they are made
 * (`moments.test.ts`, `moment-store.test.ts`).
 */
async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/curva"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const rated = FIXTURES.rated.card!;
const born = FIXTURES.born0Serial.card!;
const noop = () => {};

describe("on the server", () => {
  it("the hero draws nothing without a stage", async () => {
    const html = await render(
      <MomentHero
        surface="curva"
        card={rated}
        profile={fromMyCard(rated)}
        onDetail={noop}
        onShare={noop}
      />,
    );
    expect(html).not.toContain("moment-hero");
    expect(html).not.toContain("Première note");
    expect(html).not.toContain("<section");
  });

  it("the hero keeps the page's stage in place, with no hero text and no hero marker", async () => {
    const html = await render(
      <MomentHero
        surface="curva"
        card={rated}
        profile={fromMyCard(rated)}
        onDetail={noop}
        onShare={noop}
      >
        {() => <div data-testid="the-stage">stage</div>}
      </MomentHero>,
    );
    expect(html).toContain('data-testid="the-stage"');
    expect(html).not.toContain("data-hero-kind");
    expect(html).not.toContain("Première note");
  });

  it("the born panel draws nothing, on either surface", async () => {
    for (const surface of ["team", "curva"] as const) {
      const html = await render(
        <CardBornPanel
          card={born}
          profile={fromMyCard(born)}
          nextDeadline={null}
          surface={surface}
        />,
      );
      expect(html).not.toContain("card-born-panel");
      expect(html).not.toContain("Votre carte de manager");
    }
  });

  it("the lines draw nothing", async () => {
    const html = await render(<MomentLines card={FIXTURES.cleared.card!} />);
    expect(html).not.toContain("provisoire");
    expect(html).not.toContain("moment-lines");
  });

  it("the closed sheets draw nothing", async () => {
    const html = await render(
      <>
        <ReplaySheet open={false} onOpenChange={noop} item={null} current={rated} />
        <ShareCardSheet open={false} onOpenChange={noop} card={rated} />
      </>,
    );
    expect(html).not.toContain("dialog");
    expect(html).not.toContain("card-share-sheet");
  });
});

describe("the share sheet is for a card with a number", () => {
  it("does not open for a card with none, whatever it is asked", async () => {
    const html = await render(
      <ShareCardSheet open onOpenChange={noop} card={FIXTURES.forming1.card!} />,
    );
    expect(html).not.toContain("card-share-sheet");
  });
});

describe("the module boundary (the section stays out of ordinary pages)", () => {
  it("the born panel loads lazily: it is a named and a default export", async () => {
    expect(CardBornPanelDefault).toBe(CardBornPanel);
    const loaded = await import("./CardBornPanel");
    expect(loaded.default).toBe(loaded.CardBornPanel);
  });

  it("nothing outside Curva and the moments themselves imports them statically", () => {
    const root = join(import.meta.dir, "..", "..", "..");
    const allowed = [join("components", "manager-card"), join("components", "curva")];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry) || /\.test\./.test(entry)) continue;
        const rel = relative(root, path);
        if (allowed.some((prefix) => rel.startsWith(prefix))) continue;
        const source = readFileSync(path, "utf8");
        // A static import or export-from; a lazy `import("…")` is the deliberate edge.
        if (/(?:from|^import)\s+["'][^"']*manager-card\/moments\/[^"']*["']/m.test(source)) {
          offenders.push(rel);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
