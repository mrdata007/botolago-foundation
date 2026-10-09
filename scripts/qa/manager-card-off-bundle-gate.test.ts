import { describe, expect, it } from "bun:test";

import { findViolations, staticImports } from "./manager-card-off-bundle-gate";

const chunk = (name: string, text: string) => ({ name, text });
const DATA = chunk("manager-card-AAAA.js", 'x("get_my_manager_card")');

describe("the off-bundle gate", () => {
  it("reads static imports and not dynamic ones", () => {
    const text =
      'import{a as e}from"./one-111.js";import"./two-222.js";export{x}from"./three-333.js";' +
      'const m=await import("./lazy-444.js");import t from"./four-555.js";import*as q from"./five-666.js";';
    expect(staticImports(chunk("c.js", text)).sort()).toEqual([
      "five-666.js",
      "four-555.js",
      "one-111.js",
      "three-333.js",
      "two-222.js",
    ]);
  });

  it("also guards the card's own markup and device keys", () => {
    const card = chunk("ManagerCard-KKKK.js", 'className:"mc-card"');
    expect(
      findViolations([
        card,
        chunk("fantasy.index-LLLL.js", 'import{a}from"./ManagerCard-KKKK.js";'),
      ]),
    ).toHaveLength(1);
    expect(
      findViolations([
        card,
        chunk("gradins.index-MMMM.js", 'import{a}from"./ManagerCard-KKKK.js";'),
      ]),
    ).toEqual([]);
  });

  it("passes when only Gradins' pages reach the section's code", () => {
    expect(
      findViolations([
        DATA,
        chunk("gradins.index-BBBB.js", 'import{a}from"./manager-card-AAAA.js";'),
        chunk("BottomNav-CCCC.js", 'import{b}from"./shared-DDDD.js";'),
        chunk("shared-DDDD.js", "export{b}"),
      ]),
    ).toEqual([]);
  });

  it("passes when the status module reaches it by a dynamic import only", () => {
    expect(
      findViolations([
        DATA,
        chunk(
          "manager-card-status-EEEE.js",
          'const s=()=>import("./manager-card-status-server-FFFF.js");',
        ),
        chunk("manager-card-status-server-FFFF.js", 'import{a}from"./manager-card-AAAA.js";'),
        chunk("index-GGGG.js", 'import{s}from"./manager-card-status-EEEE.js";'),
      ]),
    ).toEqual([]);
  });

  it("fails when an ordinary page imports it, directly or through another chunk", () => {
    const direct = findViolations([
      DATA,
      chunk("fantasy.index-HHHH.js", 'import{a}from"./manager-card-AAAA.js";'),
    ]);
    expect(direct).toEqual([
      "fantasy.index-HHHH.js imports manager-card-AAAA.js, which holds the Manager Card's code",
    ]);
    const indirect = findViolations([
      DATA,
      chunk("index-IIII.js", 'import{a}from"./shell-JJJJ.js";'),
      chunk("shell-JJJJ.js", 'import"./manager-card-AAAA.js";'),
    ]);
    expect(indirect.map((line) => line.split(" ")[0])).toEqual(["index-IIII.js", "shell-JJJJ.js"]);
  });

  it("copes with a cycle between chunks", () => {
    expect(
      findViolations([
        DATA,
        chunk("a-1.js", 'import"./b-2.js";'),
        chunk("b-2.js", 'import"./a-1.js";'),
      ]),
    ).toEqual([]);
  });
});
