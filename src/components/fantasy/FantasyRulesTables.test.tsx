import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";

import { fantasyRulesSchema } from "@/backend/fantasy/contracts";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { PRODUCTION_RULES } from "@/lib/__fixtures__/fantasy-rules-production";
import { RulesChipList, RulesScoringTable } from "./FantasyRulesTables";

/**
 * `/fantasy/rules` from the server's ruleset: the scoring table and the chip
 * list, rendered (French) from production's `api.fantasy_rules` response.
 * The values themselves are checked against FANTASY_RULES_V1.md in
 * `src/lib/fantasy-rules-table.test.ts`; this checks what the reader gets.
 */

const fr = dictionaries.fr;
const rules = fantasyRulesSchema.parse(PRODUCTION_RULES);
const render = (node: React.ReactElement) =>
  renderToString(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");
const decode = (html: string) =>
  html
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
const cells = (row: string) =>
  [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) =>
    decode(m[1].replace(/<[^>]+>/g, "")).trim(),
  );

describe("rules page — scoring table", () => {
  const html = render(<RulesScoringTable rules={rules} />);
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => cells(m[1]));

  it("is a real table with a head per position, the full word for screen readers", () => {
    expect(html).toContain("<table");
    expect(html).toContain(`<caption`);
    expect(rows[0][0]).toBe(fr["fantasy.rules.scoring_event"]);
    // Phone label and full word, both in the head cell.
    expect(rows[0].slice(1)).toEqual([
      `${fr["player.pos.GK"]}${fr["fantasy.rules.pos.GK"]}`,
      `${fr["player.pos.DEF"]}${fr["fantasy.rules.pos.DEF"]}`,
      `${fr["player.pos.MID"]}${fr["fantasy.rules.pos.MID"]}`,
      `${fr["player.pos.FWD"]}${fr["fantasy.rules.pos.FWD"]}`,
    ]);
  });

  it("states the real scale, a goalkeeper's goal 10 and a midfielder's clean sheet 1", () => {
    const body = rows.slice(1);
    expect(body).toHaveLength(13);
    expect(body).toContainEqual(["Moins de 60 min jouées", "+1", "+1", "+1", "+1"]);
    expect(body).toContainEqual(["60 min jouées ou plus", "+2", "+2", "+2", "+2"]);
    expect(body).toContainEqual([fr["fantasy.events.goal"], "+10", "+6", "+5", "+4"]);
    expect(body).toContainEqual([fr["fantasy.events.clean_sheet"], "+4", "+4", "+1", "–"]);
    expect(body).toContainEqual(["Tous les 3 arrêts", "+1", "–", "–", "–"]);
    expect(body).toContainEqual(["Tous les 2 buts encaissés", "-1", "-1", "–", "–"]);
    expect(body).toContainEqual(["Carton rouge direct", "-3", "-3", "-3", "-3"]);
  });

  it("keeps each sign in front of its number in Arabic (an isolated left-to-right figure)", () => {
    expect(html).toContain('<bdi dir="ltr">-3</bdi>');
    expect(html).toContain('<bdi dir="ltr">+10</bdi>');
  });

  it("says what a dash means, and that only official data counts and there is no bonus", () => {
    const text = decode(html);
    expect(text).toContain(fr["fantasy.rules.scoring_none"]);
    expect(text).toContain(fr["fantasy.rules.scoring_official"]);
    expect(text).toContain(fr["fantasy.rules.scoring_no_bonus"]);
  });

  it("draws nothing for an empty ruleset (mock mode) rather than an empty table", () => {
    expect(render(<RulesScoringTable rules={{ ...rules, positions: [], scoring: [] }} />)).toBe("");
  });
});

describe("rules page — chips", () => {
  const html = decode(render(<RulesChipList rules={rules} />));

  it("lists the four, in PRODUCT.md's order, with when each can be played", () => {
    const order = [...html.matchAll(/data-chip="([a-z_]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["wildcard", "triple_captain", "free_hit", "bench_boost"]);
    expect(html).toContain("Une fois, journées 1 à 15");
    expect(html).toContain("Une fois, de la journée 16 à la fin de la saison");
    expect(html.match(/Une fois dans la saison/g)).toHaveLength(3);
  });

  it("says one chip per journée, and that a confirmed chip cannot be cancelled", () => {
    expect(html).toContain(fr["fantasy.rules.chips_desc"]);
    expect(html).toContain(fr["fantasy.rules.chips_final"]);
  });
});
