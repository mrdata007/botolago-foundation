import { describe, expect, test } from "bun:test";

import { plateName } from "./plate-name";

describe("plateName", () => {
  test("takes the last word of a Latin-script name, hyphenated compounds whole", () => {
    expect(plateName("Yahya Attiat-Allah")).toBe("Attiat-Allah");
    expect(plateName("Anass Salah-Eddine")).toBe("Salah-Eddine");
    expect(plateName("Abdelhak Ben Nasser")).toBe("Nasser");
  });

  test("keeps an Arabic compound whose second half never stands alone", () => {
    expect(plateName("يحيى عطية الله")).toBe("عطية الله");
    expect(plateName("أنس صلاح الدين")).toBe("صلاح الدين");
    expect(plateName("محمد عبد الصمد")).toBe("عبد الصمد");
  });

  test("otherwise takes the last word in Arabic too, as French does", () => {
    expect(plateName("أيوب الكعبي")).toBe("الكعبي");
    expect(plateName("عبد الحق بن ناصر")).toBe("ناصر");
    expect(plateName("بن مالانغو")).toBe("مالانغو");
  });

  test("copes with a single word, stray spaces and an empty name", () => {
    expect(plateName("Kaabi")).toBe("Kaabi");
    expect(plateName("الله")).toBe("الله");
    expect(plateName("  Yahya   Attiat-Allah ")).toBe("Attiat-Allah");
    expect(plateName("")).toBe("");
  });
});
