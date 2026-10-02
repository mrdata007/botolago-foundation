import { describe, expect, test } from "bun:test";

import { serializeJsonLd } from "./article-meta";
import {
  breadcrumbJsonLd,
  siteJsonLd,
  sportsEventJsonLd,
  sportsTeamJsonLd,
} from "./structured-data";
import type { Match } from "@/types/domain";

type Graph = { "@graph": Array<Record<string, unknown>> };

function roundTrip(value: Record<string, unknown>) {
  return JSON.parse(serializeJsonLd(value)) as Record<string, unknown>;
}

const match = (overrides: Partial<Match> = {}): Match =>
  ({
    id: "m1",
    gameweek: 1,
    homeClubId: "h",
    awayClubId: "a",
    kickoff: "2026-09-26T19:00:00.000Z",
    status: "scheduled",
    venue: { fr: "Stade Mohammed V", ar: "ملعب محمد الخامس" },
    dateUnconfirmed: false,
    calledOff: false,
    ...overrides,
  }) as Match;

describe("structured data", () => {
  test("the home page names the publisher and the site, with no invented search box", () => {
    const site = roundTrip(siteJsonLd()) as unknown as Graph;
    const [organization, website] = site["@graph"];
    expect(organization).toMatchObject({
      "@type": "Organization",
      name: "BotolaGO",
      url: "https://botolago.com/",
      logo: { url: "https://botolago.com/apple-touch-icon.png", width: 180, height: 180 },
    });
    expect(website).toMatchObject({
      "@type": "WebSite",
      url: "https://botolago.com/",
      publisher: { "@id": "https://botolago.com/#organization" },
    });
    expect(JSON.stringify(site)).not.toContain("SearchAction");
  });

  test("breadcrumbs number their steps from 1 with absolute URLs", () => {
    expect(
      breadcrumbJsonLd([
        { name: "Accueil", path: "/" },
        { name: "Clubs", path: "/clubs" },
      ]),
    ).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, name: "Accueil", item: "https://botolago.com/" },
        { position: 2, name: "Clubs", item: "https://botolago.com/clubs" },
      ],
    });
  });

  test("a club is a SportsTeam using only real public identity", () => {
    expect(
      sportsTeamJsonLd({
        canonicalUrl: "https://botolago.com/clubs/club-1",
        name: "Wydad AC",
        city: "Casablanca",
        logoUrl: "https://media.example.test/wydad.png",
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "SportsTeam",
      name: "Wydad AC",
      url: "https://botolago.com/clubs/club-1",
      sport: "Football",
      location: { "@type": "City", name: "Casablanca" },
      logo: "https://media.example.test/wydad.png",
    });

    expect(
      sportsTeamJsonLd({
        canonicalUrl: "https://botolago.com/clubs/club-2",
        name: "Club sans média",
        city: " ",
      }),
    ).not.toHaveProperty("location");
  });

  const event = (value: Match) =>
    sportsEventJsonLd({
      canonicalUrl: "https://botolago.com/matches/m1",
      match: value,
      homeName: "Wydad AC",
      awayName: "AS FAR",
    });

  test("a confirmed match carries its start, status, teams and venue", () => {
    expect(event(match())).toEqual({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: "Wydad AC – AS FAR",
      url: "https://botolago.com/matches/m1",
      sport: "Football",
      startDate: "2026-09-26T19:00:00.000Z",
      eventStatus: "https://schema.org/EventScheduled",
      homeTeam: { "@type": "SportsTeam", name: "Wydad AC" },
      awayTeam: { "@type": "SportsTeam", name: "AS FAR" },
      location: { "@type": "Place", name: "Stade Mohammed V" },
    });
  });

  test("an unconfirmed kick-off, a postponed or called-off match is not given a start", () => {
    expect(event(match({ kickoff: "2026-10-03T00:00:00.000Z" }))).not.toHaveProperty("startDate");
    const postponed = event(match({ status: "postponed", dateUnconfirmed: true }));
    expect(postponed).not.toHaveProperty("startDate");
    expect(postponed.eventStatus).toBe("https://schema.org/EventPostponed");
    expect(
      event(match({ status: "postponed", calledOff: true, dateUnconfirmed: true })).eventStatus,
    ).toBe("https://schema.org/EventCancelled");
  });

  // PR #199 review asked for EventInProgress / EventCompleted on live and
  // finished matches. schema.org's EventStatusType has no such members: its
  // five are the ones below (https://schema.org/EventStatusType), and
  // EventScheduled means "the event is taking place or has taken place on the
  // startDate as scheduled" (https://schema.org/EventScheduled), which is what
  // a live or finished match is. An invented value would make the data invalid.
  test("live and finished matches are EventScheduled, and every status is a real schema.org one", () => {
    const schemaOrgEventStatuses = [
      "https://schema.org/EventCancelled",
      "https://schema.org/EventMovedOnline",
      "https://schema.org/EventPostponed",
      "https://schema.org/EventRescheduled",
      "https://schema.org/EventScheduled",
    ];
    expect(event(match({ status: "live" })).eventStatus).toBe("https://schema.org/EventScheduled");
    expect(event(match({ status: "finished" })).eventStatus).toBe(
      "https://schema.org/EventScheduled",
    );
    for (const status of ["scheduled", "live", "finished", "postponed"] as const) {
      for (const calledOff of [false, true]) {
        expect(schemaOrgEventStatuses).toContain(
          event(match({ status, calledOff })).eventStatus as string,
        );
      }
    }
  });

  test("no venue, no location; a team name cannot close the script tag", () => {
    const value = event(match({ venue: { fr: "", ar: "" } }));
    expect(value).not.toHaveProperty("location");
    const hostile = sportsEventJsonLd({
      canonicalUrl: "https://botolago.com/matches/m1",
      match: match(),
      homeName: "</script><script>alert(1)</script>",
      awayName: "AS FAR",
    });
    const serialized = serializeJsonLd(hostile);
    expect(serialized).not.toContain("</script>");
    expect((JSON.parse(serialized) as { homeTeam: { name: string } }).homeTeam.name).toBe(
      "</script><script>alert(1)</script>",
    );
  });
});
