import { afterEach, describe, expect, test } from "bun:test";
import { activeLanguage } from "./active-language";

describe("the language pages read their data in, outside React", () => {
  const global = globalThis as { document?: unknown };
  const saved = global.document;
  afterEach(() => {
    if (saved === undefined) delete global.document;
    else global.document = saved;
  });

  test("French on the server, which always renders French", () => {
    delete global.document;
    expect(activeLanguage()).toBe("fr");
  });

  test("in the browser, what the language provider wrote on <html>", () => {
    const html = { dataset: {} as Record<string, string> };
    global.document = { documentElement: html };
    expect(activeLanguage()).toBe("fr");
    html.dataset.lang = "ar";
    expect(activeLanguage()).toBe("ar");
    html.dataset.lang = "fr";
    expect(activeLanguage()).toBe("fr");
  });
});
