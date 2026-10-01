import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import {
  useViewerTimeZone,
  differsFromMatchDay,
  localMatchDayKey,
  timeZoneLabel,
} from "./viewer-time-zone";

describe("viewer time zone", () => {
  test("uses the competition zone for server rendering", () => {
    function Probe() {
      return <span>{useViewerTimeZone()}</span>;
    }
    expect(renderToString(<Probe />)).toContain("Africa/Casablanca");
  });

  test("detects local day rollover in either direction", () => {
    const late = "2026-09-24T21:30:00Z";
    expect(localMatchDayKey(late, "Asia/Dubai")).toBe("2026-09-25");
    expect(differsFromMatchDay(late, "Asia/Dubai")).toBe(true);
    const early = "2026-09-24T02:30:00Z";
    expect(localMatchDayKey(early, "America/New_York")).toBe("2026-09-23");
    expect(differsFromMatchDay(early, "America/New_York")).toBe(true);
  });

  test("names the browser zone concisely", () => {
    expect(timeZoneLabel("Asia/Dubai")).toBe("Dubai");
    expect(timeZoneLabel("America/New_York")).toBe("New York");
  });
});
