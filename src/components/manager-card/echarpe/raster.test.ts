import { describe, expect, it } from "bun:test";

import { rasterText, ready } from "./raster";

describe("the Arabic sampler", () => {
  it("answers null where there is no canvas (the server, the tests)", () => {
    expect(typeof document).toBe("undefined");
    expect(rasterText("فاطمة", 12)).toBeNull();
  });
  it("is ready at once where there is no document, and never rejects", async () => {
    await expect(ready()).resolves.toBeUndefined();
  });
});
