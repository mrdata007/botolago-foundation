import { describe, expect, it } from "bun:test";
import { appLinkPath } from "./app-links";

describe("a botolago.com link opened in the phone app (ST-2)", () => {
  it("opens the same page, with its query and fragment", () => {
    expect(appLinkPath("https://botolago.com/matches/abc?tab=lineups#top")).toBe(
      "/matches/abc?tab=lineups#top",
    );
    expect(appLinkPath("https://www.botolago.com/news")).toBe("/news");
    expect(appLinkPath("https://BOTOLAGO.com/")).toBe("/");
  });

  it("answers for nothing else", () => {
    expect(appLinkPath("https://example.com/matches")).toBeNull();
    expect(appLinkPath("http://botolago.com/news")).toBeNull();
    expect(appLinkPath("https://botolago.com.evil.example/news")).toBeNull();
    expect(appLinkPath("not a link")).toBeNull();
  });
});
