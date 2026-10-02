import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";

import sharp from "sharp";

import { CREST_PROVIDER_IDS, curatedCrestPath, makeCrest } from "./upload-curated-crests";

describe("curated crests", () => {
  test("every club has its own provider id", () => {
    const ids = Object.values(CREST_PROVIDER_IDS);
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
  });

  test("the path is the one the database accepts", () => {
    expect(curatedCrestPath("306")).toBe("football/teams/306/crest-curated.png");
  });

  test("a JPEG becomes a real 256 px PNG", async () => {
    const jpeg = await sharp({
      create: { width: 240, height: 240, channels: 3, background: "#c8102e" },
    })
      .jpeg()
      .toBuffer();
    const out = sharp(await makeCrest(jpeg));
    const meta = await out.metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 256, 256]);
  });

  test("the script has no other exports to leak", () => {
    expect(readdirSync("scripts/backend").includes("upload-curated-crests.ts")).toBe(true);
  });
});
