import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createIntentPreloader } from "./intent-preload";

const ROOT = join(import.meta.dir, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Timers the test moves by hand: nothing runs until `advance` says so. */
function manualTimers() {
  let now = 0;
  let next = 1;
  const queue = new Map<number, { at: number; run: () => void }>();
  return {
    timers: {
      set: (run: () => void, ms: number) => {
        const id = next++;
        queue.set(id, { at: now + ms, run });
        return id;
      },
      clear: (handle: unknown) => {
        queue.delete(handle as number);
      },
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...queue].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now) continue;
        queue.delete(id);
        timer.run();
      }
    },
    pending: () => queue.size,
  };
}

function setUp(delay = 50) {
  const clock = manualTimers();
  const loaded: string[] = [];
  const preloader = createIntentPreloader<string>(
    (target) => loaded.push(target),
    delay,
    clock.timers,
  );
  return { clock, loaded, preloader };
}

describe("a control that loads its page ahead, as a link does", () => {
  test("a pointer resting on it loads the page once the delay has passed", () => {
    const { clock, loaded, preloader } = setUp();
    preloader.handlers("/matches/standings").onMouseEnter();
    clock.advance(49);
    expect(loaded).toEqual([]);
    clock.advance(1);
    expect(loaded).toEqual(["/matches/standings"]);
  });

  test("a pointer passing over it without resting loads nothing", () => {
    const { clock, loaded, preloader } = setUp();
    const handlers = preloader.handlers("/matches/standings");
    handlers.onMouseEnter();
    clock.advance(30);
    handlers.onMouseLeave();
    clock.advance(500);
    expect(loaded).toEqual([]);
    expect(clock.pending()).toBe(0);
  });

  test("a finger touching it loads the page at once", () => {
    const { clock, loaded, preloader } = setUp();
    preloader.handlers("/pronostics").onTouchStart();
    expect(loaded).toEqual(["/pronostics"]);
    expect(clock.pending()).toBe(0);
  });

  test("a touch calls off the pointer's wait rather than loading twice", () => {
    const { clock, loaded, preloader } = setUp();
    preloader.handlers("/matches/standings").onMouseEnter();
    preloader.handlers("/matches/standings").onTouchStart();
    clock.advance(500);
    expect(loaded).toEqual(["/matches/standings"]);
  });

  test("moving from one control to the next loads only the one the pointer rests on", () => {
    const { clock, loaded, preloader } = setUp();
    preloader.handlers("/matches/standings").onMouseEnter();
    clock.advance(20);
    // Straight onto the neighbour, whose enter can land before the first's leave.
    preloader.handlers("/pronostics").onMouseEnter();
    clock.advance(500);
    expect(loaded).toEqual(["/pronostics"]);
  });

  test("cancel calls off a wait in progress, and is harmless with none", () => {
    const { clock, loaded, preloader } = setUp();
    preloader.cancel();
    preloader.handlers("/clubs/a").onMouseEnter();
    preloader.cancel();
    clock.advance(500);
    expect(loaded).toEqual([]);
    expect(clock.pending()).toBe(0);
  });

  test("with no delay the pointer loads at once", () => {
    const { clock, loaded, preloader } = setUp(0);
    preloader.handlers("/clubs/a").onMouseEnter();
    expect(loaded).toEqual(["/clubs/a"]);
    expect(clock.pending()).toBe(0);
  });

  test("a leave after the page has loaded changes nothing", () => {
    const { clock, loaded, preloader } = setUp();
    const handlers = preloader.handlers("/clubs/a");
    handlers.onMouseEnter();
    clock.advance(50);
    handlers.onMouseLeave();
    expect(loaded).toEqual(["/clubs/a"]);
  });
});

describe("where the controls load ahead (source)", () => {
  const hook = read("src/lib/intent-preload.ts");

  test("the hook follows the router's own preload setting and delay", () => {
    expect(hook).toContain('router.options.defaultPreload === "intent"');
    expect(hook).toContain("router.options.defaultPreloadDelay ?? 50");
    expect(hook).toContain("router.preloadRoute(target as never).catch(() => {})");
    // Called off when the component goes.
    expect(hook).toContain("useEffect(() => () => preloader.current?.cancel(), [])");
  });

  test("the Matches tabs preload where they navigate, and call off a wait on the click", () => {
    const tabs = read("src/components/matches/MatchesTabs.tsx");
    expect(tabs).toContain("tabIntent={(view) => intent.handlers(destination(view))}");
    expect(tabs).toMatch(
      /onChange=\{\(next\) => \{\s*intent\.cancel\(\);\s*void navigate\(destination\(next\)\);/,
    );
  });

  test("UiTabs gives the handlers only to a tab that is neither chosen nor disabled", () => {
    const primitives = read("src/components/ui-kit/primitives.tsx");
    expect(primitives).toContain(
      "{...(active || option.disabled ? undefined : tabIntent?.(option.value))}",
    );
  });

  test("the header search preloads a result and calls the wait off when it leaves the list", () => {
    const search = read("src/components/shell/GlobalSearch.tsx");
    expect(search).toContain("intent.handlers(destination(entry))?.onMouseEnter();");
    expect(search).toContain(
      "onTouchStart={() => intent.handlers(destination(entry))?.onTouchStart()}",
    );
    expect(search).toContain("onMouseLeave={intent.cancel}");
    expect(search).toMatch(/if \(!showPanel\) intent\.cancel\(\);/);
    expect(search).toMatch(/const go = \(entry: SearchEntry\) => \{\s*intent\.cancel\(\);/);
    // The result is still chosen on mousedown, before the field's blur.
    expect(search).toContain("onMouseDown={(event) => {");
  });

  test("the top players' hero button and rows preload the player's page", () => {
    const page = read("src/routes/fantasy.top-players.tsx");
    expect(page.match(/\{\.\.\.intent\.handlers\(playerPage\(player\.id\)\)\}/g)).toHaveLength(2);
    expect(
      page.match(/onClick=\{\(\) => void navigate\(playerPage\(player\.id\)\)\}/g),
    ).toHaveLength(2);
  });
});
