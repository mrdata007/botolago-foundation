import { afterEach, describe, expect, it } from "bun:test";

import { copyText } from "./copy-text";
import { shareLink } from "./share-link";
import { shareablePageUrl } from "./share-url";

/**
 * The share helpers tell the truth: `copyText` answers true only when the text
 * really reached the clipboard, and `shareLink` never copies behind a cancelled
 * share sheet. The tests have no DOM, so the browser's side is a small fake.
 */

const globals = globalThis as Record<string, unknown>;
const saved = {
  navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
  document: Object.getOwnPropertyDescriptor(globalThis, "document"),
};

function setGlobal(name: "navigator" | "document", value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

afterEach(() => {
  for (const name of ["navigator", "document"] as const) {
    const original = saved[name];
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globals[name];
  }
});

/**
 * A document whose `execCommand("copy")` answers `ok`, recording what was
 * selected and where the text area went. `stealFocus` is a dialog's focus trap:
 * focusing the area outside the dialog leaves the focus where it was, yet
 * `execCommand` still answers true. `dialog` is an open `[role="dialog"]`.
 */
function fakeDocument(
  ok: boolean | "throws",
  options: { stealFocus?: boolean; dialog?: boolean; focusedDialog?: boolean } = {},
) {
  const log: { value: string; removed: boolean; copied: number; host: string } = {
    value: "",
    removed: false,
    copied: 0,
    host: "",
  };
  const doc: Record<string, unknown> = { activeElement: null };
  let trapped = Boolean(options.stealFocus);
  const area = {
    value: "",
    style: { cssText: "" },
    tabIndex: 0,
    setAttribute() {},
    focus() {
      if (!trapped) doc.activeElement = area;
    },
    select() {},
    setSelectionRange() {},
    remove() {
      log.removed = true;
    },
  };
  const hostOf = (name: string) => ({
    appendChild(node: typeof area) {
      log.value = node.value;
      log.host = name;
      // A trap lets the focus in only when the area is inside the dialog.
      if (name === "dialog") trapped = false;
    },
  });
  const dialog = hostOf("dialog");
  doc.body = hostOf("body");
  doc.querySelectorAll = () => (options.dialog ? [dialog] : []);
  if (options.focusedDialog) {
    doc.activeElement = { closest: () => dialog, focus() {} };
  }
  doc.createElement = () => area;
  doc.execCommand = (command: string) => {
    if (command !== "copy") return false;
    log.copied += 1;
    if (ok === "throws") throw new Error("not allowed");
    return ok;
  };
  setGlobal("document", doc);
  return log;
}

describe("copyText", () => {
  it("is true when the Clipboard API took the text", async () => {
    let written = "";
    setGlobal("navigator", {
      clipboard: { writeText: async (text: string) => void (written = text) },
    });
    expect(await copyText("https://botolago.com/x")).toBe(true);
    expect(written).toBe("https://botolago.com/x");
  });

  it("falls back to selecting the text when the Clipboard API refuses", async () => {
    setGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new DOMException("denied", "NotAllowedError");
        },
      },
    });
    const log = fakeDocument(true);
    expect(await copyText("le lien")).toBe(true);
    expect(log.value).toBe("le lien");
    expect(log.removed).toBe(true);
  });

  it("falls back when there is no Clipboard API (insecure page, in-app browser)", async () => {
    setGlobal("navigator", {});
    const log = fakeDocument(true);
    expect(await copyText("le lien")).toBe(true);
    expect(log.copied).toBe(1);
  });

  it("is false when a dialog's focus trap took the focus away, though execCommand says true", async () => {
    // Reproduced in the Pronostics journée sheet: the area sat in the body,
    // outside the dialog, the trap kept the focus, `execCommand("copy")` still
    // answered true and the toast said "Lien copié" over an unchanged clipboard.
    setGlobal("navigator", {});
    const log = fakeDocument(true, { stealFocus: true });
    expect(await copyText("le lien")).toBe(false);
    expect(log.removed).toBe(true);
  });

  it("puts the area inside the open dialog even when the focus is on the body", async () => {
    setGlobal("navigator", {});
    const log = fakeDocument(true, { stealFocus: true, dialog: true });
    expect(await copyText("le lien")).toBe(true);
    expect(log.host).toBe("dialog");
    expect(log.removed).toBe(true);
    const focused = fakeDocument(true, { focusedDialog: true });
    expect(await copyText("le lien")).toBe(true);
    expect(focused.host).toBe("dialog");
  });

  it("removes the temporary area on every path", async () => {
    setGlobal("navigator", {});
    for (const ok of [true, false, "throws"] as const) {
      const log = fakeDocument(ok);
      await copyText("x");
      expect(log.removed).toBe(true);
    }
  });

  it("is false, never a pretend success, when nothing could copy", async () => {
    // The old league-code button called `navigator.clipboard?.writeText(code)`
    // without waiting and showed "Copié" whatever happened.
    setGlobal("navigator", {});
    fakeDocument(false);
    expect(await copyText("x")).toBe(false);
    fakeDocument("throws");
    expect(await copyText("x")).toBe(false);
    delete globals.document;
    expect(await copyText("x")).toBe(false);
  });
});

describe("shareLink", () => {
  const abort = () => Object.assign(new Error("closed"), { name: "AbortError" });

  it("shares through the sheet when there is one", async () => {
    const sent: unknown[] = [];
    setGlobal("navigator", { share: async (data: unknown) => void sent.push(data) });
    expect(await shareLink({ url: "https://botolago.com/a" })).toBe("shared");
    expect(sent).toHaveLength(1);
  });

  it("copies nothing behind a share sheet the person closed", async () => {
    // The article and match pages used to copy the link when the sheet was
    // dismissed, then say "Lien copié".
    let wrote = false;
    setGlobal("navigator", {
      share: async () => {
        throw abort();
      },
      clipboard: { writeText: async () => void (wrote = true) },
    });
    expect(await shareLink({ url: "https://botolago.com/a" })).toBe("cancelled");
    expect(wrote).toBe(false);
  });

  it("copies the link when the sheet cannot open, and says if that fails too", async () => {
    let written = "";
    setGlobal("navigator", {
      share: async () => {
        throw Object.assign(new Error("blocked"), { name: "NotAllowedError" });
      },
      clipboard: { writeText: async (text: string) => void (written = text) },
    });
    expect(await shareLink({ url: "https://botolago.com/a" })).toBe("copied");
    expect(written).toBe("https://botolago.com/a");

    setGlobal("navigator", {
      share: async () => {
        throw new Error("blocked");
      },
    });
    fakeDocument(false);
    expect(await shareLink({ url: "https://botolago.com/a" })).toBe("failed");
  });

  it("copies the given text instead of the link when asked", async () => {
    let written = "";
    setGlobal("navigator", {
      clipboard: { writeText: async (text: string) => void (written = text) },
    });
    expect(await shareLink({ text: "message" }, "https://botolago.com/l")).toBe("copied");
    expect(written).toBe("https://botolago.com/l");
    expect(await shareLink({ text: "message" })).toBe("failed");
  });
});

describe("shareablePageUrl", () => {
  it("drops the fragment and the campaign tags the sharer arrived with", () => {
    expect(
      shareablePageUrl(
        "https://botolago.com/matches/42?utm_source=share&utm_medium=whatsapp&utm_campaign=x&tab=lineups#code=SECRET",
      ),
    ).toBe("https://botolago.com/matches/42?tab=lineups");
  });

  it("keeps a query that selects what is shown, and is stable", () => {
    const url = "https://botolago.com/pepites/comparer?a=1&b=2";
    expect(shareablePageUrl(url)).toBe(url);
    expect(shareablePageUrl(shareablePageUrl(url))).toBe(url);
  });

  it("also drops click identifiers and credential or one-time-code keys", () => {
    expect(
      shareablePageUrl(
        "https://botolago.com/news/1?fbclid=abc&gclid=def&code=123&token=t&access_token=x&tab=a",
      ),
    ).toBe("https://botolago.com/news/1?tab=a");
    expect(shareablePageUrl("https://botolago.com/news/1?code=123&utm_source=x")).toBe(
      "https://botolago.com/news/1",
    );
  });

  it("never throws on a bad address", () => {
    expect(shareablePageUrl("http://")).toBe("https://botolago.com");
  });
});
