import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compareFingerprints, parseFingerprint } from "./schema-fingerprint-compare";

const A = "0123456789abcdef0123456789abcdef";
const B = "fedcba9876543210fedcba9876543210";

describe("schema fingerprint comparison", () => {
  test("reads psql's tab-separated rows and refuses anything else", () => {
    const rows = parseFingerprint(`function\tapi.f(integer)\t${A}\nindex\tapp.i\t${B}\n\n`);
    expect([...rows.entries()]).toEqual([
      ["function api.f(integer)", A],
      ["index app.i", B],
    ]);
    expect(() => parseFingerprint("function api.f(integer)")).toThrow("not a fingerprint row");
    expect(() => parseFingerprint(`function\tapi.f\tnot-an-md5`)).toThrow("not a fingerprint row");
  });

  test("names what is missing, unexpected and different, and nothing else", () => {
    const expected = parseFingerprint(
      [`function\tapi.same()\t${A}`, `function\tapi.gone()\t${A}`, `index\tapp.i\t${A}`].join("\n"),
    );
    const actual = parseFingerprint(
      [`function\tapi.same()\t${A}`, `function\tapi.extra()\t${A}`, `index\tapp.i\t${B}`].join(
        "\n",
      ),
    );
    expect(compareFingerprints(expected, actual)).toEqual({
      missing: ["function api.gone()"],
      unexpected: ["function api.extra()"],
      different: ["index app.i"],
    });
    expect(compareFingerprints(expected, expected)).toEqual({
      missing: [],
      unexpected: [],
      different: [],
    });
  });

  test("the fingerprint query only reads", () => {
    const sql = readFileSync(join(import.meta.dir, "sql/schema-fingerprint.sql"), "utf8")
      .replace(/--.*$/gm, "")
      .toLowerCase();
    for (const word of [
      "insert ",
      "update ",
      "delete ",
      "create ",
      "alter ",
      "drop ",
      "grant ",
      "truncate ",
    ]) {
      expect(`${word.trim()}: ${sql.includes(word)}`).toBe(`${word.trim()}: false`);
    }
  });
});
