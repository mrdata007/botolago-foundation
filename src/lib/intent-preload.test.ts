import { describe, expect, it } from "bun:test";
import { intentPath, preloadCode, type LinkLike } from "./intent-preload";
import type { WarmupRouter } from "./section-warmup";

const ORIGIN = "https://botolago.com";
const link = (href: string, target = "", download = false): LinkLike => ({
  href,
  target,
  hasAttribute: (name) => name === "download" && download,
});

describe("the page a link opens (FE-L1)", () => {
  it("is the path of a link on this site", () => {
    expect(intentPath(link("https://botolago.com/news/abc?x=1#top"), ORIGIN)).toBe("/news/abc");
    expect(intentPath(link("/matches"), ORIGIN)).toBe("/matches");
    expect(intentPath(link("/fantasy", "_self"), ORIGIN)).toBe("/fantasy");
  });

  it("is nothing for a link away, to another tab, or to a download", () => {
    expect(intentPath(link("https://example.com/x"), ORIGIN)).toBeNull();
    expect(intentPath(link("/terms", "_blank"), ORIGIN)).toBeNull();
    expect(intentPath(link("/card.png", "", true), ORIGIN)).toBeNull();
    expect(intentPath(null, ORIGIN)).toBeNull();
  });
});

describe("fetching a page's code", () => {
  const routerWith = (load: () => Promise<void> | undefined) => {
    const asked: string[] = [];
    const router: WarmupRouter = {
      getMatchedRoutes: (path) => {
        asked.push(path);
        return [["root", path]];
      },
      loadRouteChunk: load,
      state: { status: "idle" },
    };
    return { router, asked };
  };

  it("loads each matched route's code, once per path", () => {
    let loads = 0;
    const { router, asked } = routerWith(() => {
      loads += 1;
      return Promise.resolve();
    });
    const done = new Set<string>();
    preloadCode(router, "/news", done);
    preloadCode(router, "/news", done);
    expect(asked).toEqual(["/news"]);
    expect(loads).toBe(2);
  });

  it("tries again after a failed load", async () => {
    const { router, asked } = routerWith(() => Promise.reject(new Error("offline")));
    const done = new Set<string>();
    preloadCode(router, "/clubs", done);
    await new Promise((resolve) => setTimeout(resolve, 0));
    preloadCode(router, "/clubs", done);
    expect(asked).toEqual(["/clubs", "/clubs"]);
  });
});
