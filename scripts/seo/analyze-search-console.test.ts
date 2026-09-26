import { describe, expect, test } from "bun:test";
import { contentDecayRows, gscRows, parseCsv, positionBucket } from "./analyze-search-console";

describe("Search Console analysis", () => {
  test("parses French semicolon-delimited exports and quoted values", () => {
    expect(
      parseCsv('Requetes;Clics;Impressions;CTR;Position\n"fantasy, botola";12;450;2,67%;9,4\n'),
    ).toEqual([
      {
        requetes: "fantasy, botola",
        clics: "12",
        impressions: "450",
        ctr: "2,67%",
        position: "9,4",
      },
    ]);
  });

  test("does not treat missing positions as top-ranking pages", () => {
    expect(positionBucket(0)).toBeNull();
    expect(positionBucket(1)).toBe("1");
    expect(positionBucket(3)).toBe("2-3");
    expect(positionBucket(5)).toBe("4-5");
    expect(positionBucket(6)).toBeNull();
  });

  test("accepts unmodified English Top pages and French Pages principales exports", () => {
    const english = gscRows(
      parseCsv(
        "Top pages,Clicks,Impressions,CTR,Position\nhttps://botolago.com/fantasy,12,450,2.67%,9.4\n",
      ),
      "page",
    );
    expect(english[0]).toMatchObject({
      key: "https://botolago.com/fantasy",
      clicks: 12,
      impressions: 450,
      position: 9.4,
    });
    expect(english[0]?.ctr).toBeCloseTo(0.0267);
    expect(
      gscRows(
        parseCsv(
          "Top queries,Top pages,Clicks,Impressions,CTR,Position\nfantasy,https://botolago.com/fantasy,12,450,2.67%,9.4\n",
        ),
        "query",
        true,
      )[0]?.page,
    ).toBe("https://botolago.com/fantasy");
    expect(
      gscRows(
        parseCsv(
          "Pages principales;Clics;Impressions;CTR;Position\nhttps://botolago.com/fantasy;12;450;2,67%;9,4\n",
        ),
        "page",
      )[0]?.key,
    ).toBe("https://botolago.com/fantasy");
  });

  test("rejects missing dimensions and malformed metrics instead of emitting empty or false reports", () => {
    expect(() =>
      gscRows(parseCsv("URL,Clicks,Impressions,CTR,Position\n/fantasy,12,450,2%,9\n"), "query"),
    ).toThrow("Missing query column");
    expect(() =>
      gscRows(
        parseCsv("Top queries,Clicks,Impressions,CTR,Position\nfantasy,12,450,2%,9\n"),
        "query",
        true,
      ),
    ).toThrow("Missing page column");
    expect(() =>
      gscRows(
        parseCsv("Top pages,Clicks,Impressions,CTR,Position\n/fantasy,oops,450,2%,9\n"),
        "page",
      ),
    ).toThrow("Invalid clicks value");
  });

  test("flags URLs missing from the current period as possible complete decay", () => {
    const previous = gscRows(
      parseCsv(
        "Top pages,Clicks,Impressions,CTR,Position\n/vanished,80,400,20%,3\n/present,100,500,20%,4\n",
      ),
      "page",
    );
    const current = gscRows(
      parseCsv("Top pages,Clicks,Impressions,CTR,Position\n/present,60,300,20%,5\n"),
      "page",
    );
    expect(contentDecayRows(current, previous)).toMatchObject([
      {
        page: "/vanished",
        current_clicks: 0,
        click_loss: 1,
        current_position: "",
        current_export_status: "missing",
      },
      { page: "/present", current_clicks: 60, click_loss: 0.4, current_export_status: "present" },
    ]);
  });
});
