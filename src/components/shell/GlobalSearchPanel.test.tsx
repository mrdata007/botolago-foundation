// Audit MOB-02 (Phase C, lane C4): the header search's combobox wiring,
// rendered the way the server renders the open panel, plus the copy that
// announces its results in both languages.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import {
  searchEntries,
  searchOptionId,
  searchPanelState,
  type SearchEntry,
  type SearchPanelState,
} from "@/lib/global-search";
import { GlobalSearchPanelBody } from "./GlobalSearchPanel";
import { searchAnnouncementText, searchResultsLabel } from "./search-copy";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SOURCE = readFileSync(join(ROOT, "src/components/shell/GlobalSearch.tsx"), "utf8");

const entries: SearchEntry[] = [
  { kind: "club", id: "wac", label: "Wydad AC", hint: "Casablanca" },
  { kind: "club", id: "rca", label: "Raja CA", hint: "Casablanca" },
  { kind: "player", id: "p2", label: "Rayan Wadi", hint: "Wydad AC" },
];
const ok = { pending: false, failed: false };

function render(options: {
  query: string;
  active: number;
  panel?: SearchPanelState;
  results?: SearchEntry[];
}): string {
  const results = options.results ?? searchEntries(entries, options.query);
  const panel =
    options.panel ?? searchPanelState({ resultCount: results.length, sources: [ok, ok] });
  return renderToString(
    <I18nProvider>
      <GlobalSearchPanelBody
        panel={panel}
        results={results}
        active={options.active}
        listId="list-1"
        query={options.query}
        note={null}
        onPick={() => undefined}
        onHover={() => undefined}
        onRetry={() => undefined}
      />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("the open panel is a listbox of identified options", () => {
  const html = render({ query: "ra", active: 1 });
  const options = [...html.matchAll(/<li\b[^>]*>/g)].map((match) => match[0]);

  it("is one listbox with the id the field controls", () => {
    expect(html.match(/role="listbox"/g)).toHaveLength(1);
    expect(html).toMatch(/<ul[^>]*id="list-1"[^>]*role="listbox"/);
  });

  it("gives every option a role and a distinct, stable id", () => {
    expect(options.length).toBe(searchEntries(entries, "ra").length);
    const ids = options.map((tag) => /\bid="([^"]+)"/.exec(tag)?.[1]);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tag of options) expect(tag).toContain('role="option"');
    const expected = searchEntries(entries, "ra").map((entry) => searchOptionId("list-1", entry));
    expect(ids).toEqual(expected);
  });

  it("marks exactly the active option as selected, and its id is what the field names", () => {
    const selected = options.filter((tag) => tag.includes('aria-selected="true"'));
    expect(selected).toHaveLength(1);
    const results = searchEntries(entries, "ra");
    expect(selected[0]).toContain(`id="${searchOptionId("list-1", results[1]!)}"`);
  });

  it("has nothing selected when nothing is active", () => {
    expect(render({ query: "ra", active: -1 })).not.toContain('aria-selected="true"');
  });
});

describe("with nothing to choose there is no listbox", () => {
  it("shows the empty line outside any list", () => {
    const html = render({ query: "zzz", active: -1 });
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('role="option"');
    expect(html).toContain(dictionaries.fr["nav.search.empty"]);
  });

  it("shows the loading line outside any list", () => {
    const html = render({ query: "ra", active: -1, results: [], panel: { kind: "loading" } });
    expect(html).not.toContain('role="listbox"');
    expect(html).toContain(dictionaries.fr["nav.search.loading"]);
  });
});

describe("the field is wired as a combobox", () => {
  it("names the active option, controls the list only while it is on screen, and announces", () => {
    expect(SOURCE).toContain('role="combobox"');
    expect(SOURCE).toContain("aria-activedescendant={activeId}");
    expect(SOURCE).toContain("aria-controls={listShown ? listId : undefined}");
    expect(SOURCE).toContain("aria-expanded={showPanel}");
    expect(SOURCE).toMatch(/role="status" aria-live="polite" aria-atomic="true"/);
  });

  it("ArrowDown on a shut list opens it instead of moving the hidden selection", () => {
    expect(SOURCE).toMatch(
      /if \(!showPanel\) \{\s*if \(text\.trim\(\) !== ""\) setOpen\(true\);\s*return;/,
    );
  });

  it("uses no left/right arrow handler, so right-to-left is untouched", () => {
    expect(SOURCE).not.toContain("ArrowLeft");
    expect(SOURCE).not.toContain("ArrowRight");
  });
});

describe("the announcement, in both languages", () => {
  const frT = (key: keyof typeof dictionaries.fr) => dictionaries.fr[key];
  const arT = (key: keyof typeof dictionaries.ar) => dictionaries.ar[key];

  it("French counts results", () => {
    expect(searchResultsLabel(1, "fr", frT)).toBe("1 résultat");
    expect(searchResultsLabel(5, "fr", frT)).toBe("5 résultats");
  });

  it("Arabic agrees the noun with the number", () => {
    expect(searchResultsLabel(1, "ar", arT)).toBe("نتيجة واحدة");
    expect(searchResultsLabel(2, "ar", arT)).toBe("نتيجتان");
    expect(searchResultsLabel(3, "ar", arT)).toBe("3 نتائج");
    expect(searchResultsLabel(8, "ar", arT)).toBe("8 نتائج");
    expect(searchResultsLabel(11, "ar", arT)).toBe("11 نتيجة");
  });

  it("says searching, and no result, with the panel's own words", () => {
    expect(searchAnnouncementText({ kind: "empty" }, "fr", frT)).toBe("Aucun résultat");
    expect(searchAnnouncementText({ kind: "loading" }, "ar", arT)).toBe(
      dictionaries.ar["nav.search.loading"],
    );
    expect(searchAnnouncementText(null, "fr", frT)).toBe("");
  });
});
