import { describe, expect, test } from "bun:test";

import {
  armTabSlide,
  TAB_SLIDE_WINDOW_MS,
  tabSlideDirection,
  tabSlideKeyframes,
  takeTabSlide,
} from "./tab-slide";
import { stretchKeyframes } from "./pill-stretch";

describe("Slide direction", () => {
  test("follows the bar's order", () => {
    expect(tabSlideDirection("/news", "/fantasy")).toBe(1);
    expect(tabSlideDirection("/matches", "/fantasy")).toBe(-1);
    expect(tabSlideDirection("/", "/curva")).toBe(1);
    expect(tabSlideDirection("/curva", "/")).toBe(-1);
    expect(tabSlideDirection("/fantasy/", "/matches")).toBe(1);
  });

  test("follows Calendrier, Classement, Pronostics inside Matches", () => {
    expect(tabSlideDirection("/matches", "/matches/standings")).toBe(1);
    expect(tabSlideDirection("/pronostics", "/matches/standings")).toBe(-1);
    expect(tabSlideDirection("/matches/standings", "/pronostics")).toBe(1);
  });

  test("Classement and Pronostics stand where Matches stands on the bar", () => {
    expect(tabSlideDirection("/pronostics", "/fantasy")).toBe(-1);
    expect(tabSlideDirection("/matches/standings", "/profile")).toBe(1);
  });

  test("does not slide a drill-down, a way back, or the same place", () => {
    expect(tabSlideDirection("/matches", "/matches/12")).toBe(0);
    expect(tabSlideDirection("/matches/12", "/fantasy")).toBe(0);
    expect(tabSlideDirection("/news", "/news/abc")).toBe(0);
    expect(tabSlideDirection("/news", "/news")).toBe(0);
    expect(tabSlideDirection("/fantasy/team", "/news")).toBe(0);
  });
});

describe("arming and taking a slide", () => {
  test("is taken once", () => {
    armTabSlide("/news", "/matches", 1000, false);
    expect(takeTabSlide(1100)).toBe(1);
    expect(takeTabSlide(1150)).toBe(0);
  });

  test("lapses when no frame takes it in time", () => {
    armTabSlide("/matches", "/news", 1000, false);
    expect(takeTabSlide(1000 + TAB_SLIDE_WINDOW_MS + 1)).toBe(0);
  });

  test("is not armed with reduced motion, on a first load, or for a move that does not slide", () => {
    armTabSlide("/news", "/matches", 1000, true);
    expect(takeTabSlide(1001)).toBe(0);
    armTabSlide(undefined, "/matches", 1000, false);
    expect(takeTabSlide(1001)).toBe(0);
    armTabSlide("/news", "/matches", 1000, false);
    armTabSlide("/matches", "/matches/12", 1010, false);
    expect(takeTabSlide(1020)).toBe(0);
  });

  test("arrives from the tab's side, mirrored in Arabic", () => {
    expect(tabSlideKeyframes(1, false)[0]).toEqual({ opacity: 0, left: "40px" });
    expect(tabSlideKeyframes(-1, false)[0]).toEqual({ opacity: 0, left: "-40px" });
    expect(tabSlideKeyframes(1, true)[0]).toEqual({ opacity: 0, left: "-40px" });
    expect(tabSlideKeyframes(1, true).at(-1)).toEqual({ opacity: 1, left: "0px" });
  });
});

describe("Stretch", () => {
  test("reaches from the old tab to the new one and rests on the new one", () => {
    const frames = stretchKeyframes({ x: 10, y: 0 }, { x: 160, y: 0 });
    expect(frames[0].transform).toBe("translate(10px, 0px)");
    expect(frames[1].transform).toBe("translate(10px, 3px)");
    expect(frames[1].width).toBe("206px");
    expect(frames.at(-1)).toEqual({
      transform: "translate(160px, 0px)",
      width: "56px",
      height: "32px",
    });
  });

  test("reaches leftwards from the new tab's edge", () => {
    const frames = stretchKeyframes({ x: 160, y: 0 }, { x: 10, y: 0 });
    expect(frames[1].transform).toBe("translate(10px, 3px)");
    expect(frames[1].width).toBe("206px");
  });
});
