import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { I18nProvider } from "@/i18n/provider";
import { FantasyAmount } from "./FantasyAmount";

const render = (value: number) =>
  renderToString(
    <I18nProvider>
      <FantasyAmount value={value} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");

describe("Fantasy amounts", () => {
  test("keeps the existing million scale and one decimal for prices and remaining budget", () => {
    expect(render(100)).toContain('<bdi dir="ltr">100,0</bdi>');
    expect(render(7.2)).toContain('<bdi dir="ltr">7,2</bdi>');
    expect(render(0)).toContain('<bdi dir="ltr">0,0</bdi>');
  });

  test("speaks the full unit once and isolates the number separately from the compact unit", () => {
    const html = render(7.2);
    expect(html).toContain('<span aria-hidden="true"><bdi dir="ltr">7,2</bdi>');
    expect(html).toContain('<span class="sr-only">En millions : 7,2</span>');
    expect(html).not.toContain('<bdi dir="ltr">7,2 M</bdi>');
  });
});
