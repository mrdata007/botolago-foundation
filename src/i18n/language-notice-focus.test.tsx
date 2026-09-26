import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import {
  LANGUAGE_SWITCHER_SELECTOR,
  returnFocusFromNotice,
  type FocusCandidate,
} from "./language-notice-focus";
import { I18nProvider } from "./provider";

/**
 * Where keyboard focus goes when the Arabic-failure notice leaves — closed,
 * or its Retry answered (review of audit 2026-09-25, A10). The focused button
 * left with it and focus dropped to the document's body. There is no DOM
 * here, so the page is a stand-in: elements that take focus, or refuse it as
 * one in the document but not drawn does.
 */

class StandIn implements FocusCandidate {
  readonly attributes = new Map<string, string>();
  readonly focusCalls: (FocusOptions | undefined)[] = [];
  private readonly onBlur: (() => void)[] = [];
  constructor(
    private readonly page: { active: StandIn | null },
    readonly drawn = true,
  ) {}
  focus(options?: FocusOptions) {
    this.focusCalls.push(options);
    if (this.drawn) this.page.active = this;
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  addEventListener(_type: "blur", listener: () => void) {
    this.onBlur.push(listener);
  }
  /** Focus moves on: the one-shot blur listeners run. */
  blur() {
    for (const listener of this.onBlur.splice(0)) listener();
  }
}

function page({
  focusInNotice = true,
  switchers = [] as boolean[],
  landmarks = [] as boolean[],
} = {}) {
  const state = { active: null as StandIn | null };
  const made = {
    switchers: switchers.map((drawn) => new StandIn(state, drawn)),
    landmarks: landmarks.map((drawn) => new StandIn(state, drawn)),
  };
  const handedTo = returnFocusFromNotice({
    focusInNotice,
    ...made,
    holdsFocus: (element) => state.active === element,
  });
  return { ...made, handedTo, active: () => state.active };
}

describe("the notice leaving with focus in it", () => {
  it("hands focus to the language switcher, without scrolling the page", () => {
    const { switchers, landmarks, handedTo } = page({ switchers: [true], landmarks: [true] });
    expect(handedTo).toBe(switchers[0]!);
    expect(switchers[0]!.focusCalls).toEqual([{ preventScroll: true }]);
    // A button is focusable as it is: no tabindex put on it.
    expect(switchers[0]!.attributes.size).toBe(0);
    expect(landmarks[0]!.focusCalls).toEqual([]);
  });

  it("without a switcher (the match page's bar has none), to <main>, focusable for this visit only", () => {
    const { landmarks, handedTo } = page({ landmarks: [true] });
    const main = landmarks[0]!;
    expect(handedTo).toBe(main);
    expect(main.focusCalls).toEqual([{ preventScroll: true }]);
    // Focusable by script, and out of the Tab order…
    expect(main.attributes.get("tabindex")).toBe("-1");
    // …until focus moves on, when it is as it was.
    main.blur();
    expect(main.attributes.has("tabindex")).toBe(false);
  });

  it("passes over a switcher that is not drawn, which refuses focus", () => {
    const { switchers, landmarks, handedTo } = page({
      switchers: [false, true],
      landmarks: [true],
    });
    expect(handedTo).toBe(switchers[1]!);
    expect(landmarks[0]!.focusCalls).toEqual([]);
    const none = page({ switchers: [false], landmarks: [true] });
    expect(none.handedTo).toBe(none.landmarks[0]!);
  });

  it("leaves a <main> that had a tabindex of its own with it", () => {
    const state = { active: null as StandIn | null };
    const main = new StandIn(state);
    main.setAttribute("tabindex", "-1");
    returnFocusFromNotice({
      focusInNotice: true,
      switchers: [],
      landmarks: [main],
      holdsFocus: (element) => state.active === element,
    });
    expect(state.active).toBe(main);
    main.blur();
    expect(main.attributes.get("tabindex")).toBe("-1");
  });

  it("when nothing takes focus, changes nothing", () => {
    const { landmarks, handedTo, active } = page({ switchers: [false], landmarks: [false] });
    expect(handedTo).toBeNull();
    expect(active()).toBeNull();
    expect(landmarks[0]!.attributes.has("tabindex")).toBe(false);
  });
});

describe("the notice leaving with focus elsewhere", () => {
  it("leaves it where it is: the notice never took it", () => {
    const { switchers, landmarks, handedTo, active } = page({
      focusInNotice: false,
      switchers: [true],
      landmarks: [true],
    });
    expect(handedTo).toBeNull();
    expect(active()).toBeNull();
    expect([...switchers, ...landmarks].flatMap((element) => element.focusCalls)).toEqual([]);
  });
});

describe("what the page offers it", () => {
  const attribute = LANGUAGE_SWITCHER_SELECTOR.replace(/^\[(.+)\]$/, "$1");

  it.each([["onSurface" as const], ["onMesh" as const]])(
    "the %s switcher's button carries the handle focus is handed to",
    (tone) => {
      const html = renderToStaticMarkup(
        <I18nProvider>
          <LanguageSwitcher tone={tone} />
        </I18nProvider>,
      );
      const button = /<button[^>]*>/.exec(html)?.[0] ?? "";
      expect(button).toContain(`${attribute}=""`);
      expect(button).toContain('aria-haspopup="menu"');
    },
  );

  it("the notice hands focus on from a layout effect's cleanup, before React removes it", () => {
    // A passive effect's cleanup runs after the notice is out of the
    // document, by when focus has already dropped to the body.
    const source = readFileSync(join(import.meta.dir, "language-load-notice.tsx"), "utf8");
    expect(source).toMatch(/useLayoutEffect\(\(\) => \{\s*const notice = ref\.current;/);
    expect(source).toContain("focusInNotice: notice.contains(document.activeElement)");
    expect(source).toContain("document.querySelectorAll<HTMLElement>(LANGUAGE_SWITCHER_SELECTOR)");
    expect(source).toContain('document.querySelectorAll<HTMLElement>("main")');
  });
});
