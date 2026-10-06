import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";

import { NATIVE_APP_ATTRIBUTE } from "@/lib/native-app";
import { WebOnly } from "./WebOnly";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("WebOnly", () => {
  test("is in the server's HTML wherever the page will be opened", () => {
    // The server cannot know it will be opened in the app, and the first
    // client render must match it, so both always carry the children.
    const scope = globalThis as { webkit?: unknown };
    const html = renderToString(
      <WebOnly>
        <button type="button">Continuer avec Google</button>
      </WebOnly>,
    );
    expect(html).toContain('data-web-only=""');
    expect(html).toContain("Continuer avec Google");
    scope.webkit = { messageHandlers: { bridge: {} } };
    try {
      expect(
        renderToString(
          <WebOnly>
            <span>x</span>
          </WebOnly>,
        ),
      ).toBe(
        renderToString(
          <WebOnly>
            <span>x</span>
          </WebOnly>,
        ),
      );
      expect(
        renderToString(
          <WebOnly>
            <span>x</span>
          </WebOnly>,
        ),
      ).toContain('data-web-only=""');
    } finally {
      delete scope.webkit;
    }
  });

  test("the stylesheet hides it under the head script's attribute, unlayered", () => {
    const css = read("src/styles.css");
    const rule = `:root[${NATIVE_APP_ATTRIBUTE}] [data-web-only] {\n  display: none;\n}`;
    expect(css).toContain(rule);
    // At the top level (no @layer or other block around it), so it beats the
    // wrapper's `contents` utility, which lives in `@layer utilities`.
    const before = css.slice(0, css.indexOf(rule)).replace(/\/\*[\s\S]*?\*\//g, "");
    const depth = [...before].reduce(
      (open, ch) => open + (ch === "{" ? 1 : ch === "}" ? -1 : 0),
      0,
    );
    expect(depth).toBe(0);
  });

  test("the root route runs the native-app script before the first paint", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain("{ children: NATIVE_APP_INIT_SCRIPT }");
    // Before the splash script, with the theme script: all three are head scripts.
    expect(root.indexOf("{ children: NATIVE_APP_INIT_SCRIPT }")).toBeLessThan(
      root.indexOf("{ children: SPLASH_INIT_SCRIPT }"),
    );
  });
});

describe("what is web-only", () => {
  test.each(["src/routes/auth.login.tsx", "src/routes/auth.register.tsx"])(
    "%s: Google, Apple and their divider are inside one WebOnly",
    (file) => {
      const source = read(file);
      const open = source.indexOf("<WebOnly>");
      const close = source.indexOf("</WebOnly>");
      expect(open).toBeGreaterThan(source.indexOf("{OAUTH_PROVIDERS_ENABLED && ("));
      for (const part of ["<AuthDivider", 'onSocial("google")', 'onSocial("apple")']) {
        const at = source.indexOf(part);
        expect(`${part} ${at > open && at < close}`).toBe(`${part} true`);
      }
    },
  );

  test("the share sheet's download is web-only, and its other channels are not", () => {
    const source = read("src/components/common/ShareImageSheet.tsx");
    const open = source.indexOf("<WebOnly>");
    const close = source.indexOf("</WebOnly>");
    const download = source.indexOf("download={fileName}");
    expect(download > open && download < close).toBe(true);
    for (const part of ["navigator.share(", "whatsappUrl(", "navigator.clipboard.writeText("]) {
      const at = source.indexOf(part);
      expect(`${part} ${at > open && at < close}`).toBe(`${part} false`);
    }
  });
});
