import { describe, expect, it } from "bun:test";

import { whatsappDigits, whatsappLink } from "./plus-pay";

describe("the WhatsApp link", () => {
  it("keeps the digits of a number written with a plus and spaces", () => {
    expect(whatsappDigits("+212 6 00 00 00 00")).toBe("212600000000");
    expect(whatsappDigits("0612345678")).toBe("0612345678");
  });
  it("refuses what is not a number", () => {
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits("")).toBeNull();
    expect(whatsappDigits("12")).toBeNull();
    expect(whatsappDigits("1".repeat(17))).toBeNull();
  });
  it("carries the message, encoded, with the code in it", () => {
    const url = whatsappLink("+212 6 00 00 00 00", "Reçu · code BG-7K4M9X & merci");
    expect(url).toBe(
      "https://wa.me/212600000000?text=" + encodeURIComponent("Reçu · code BG-7K4M9X & merci"),
    );
    expect(decodeURIComponent(url!.split("?text=")[1]!)).toContain("BG-7K4M9X");
    expect(whatsappLink(null, "x")).toBeNull();
  });
});
