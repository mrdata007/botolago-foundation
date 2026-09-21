import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The launch ledger is the agent system's shared state (AGENT_SYSTEM.md §29):
// every lane reads it to decide what is already known, done, or waiting on the
// owner. Nothing parsed it, and it silently stopped being YAML -- so two real
// defects rode along unnoticed:
//
//   - duplicate task keys. BG-0051..BG-0054 were each written twice; in YAML a
//     repeated key in the same mapping is last-wins, so the newer entries were
//     shadowed by the historical ones. A lane reading the ledger would have been
//     told the Admin outage entry was about a Fantasy catalog re-stage.
//   - a wrapped list item whose text contained ": ". YAML then reads the text
//     before the colon as a mapping key, and a key may not span lines, so the
//     whole document failed to load.
//
// This file pins both. It deliberately does not import a YAML library: the repo
// has none as a direct dependency, and the two failure modes above are what
// actually happened and are cheap to detect on the raw text.

const LEDGER = join(import.meta.dir, "LAUNCH_LEDGER.yaml");
const lines = readFileSync(LEDGER, "utf8").split("\n");

/** Indentation of a line, or null for blank lines and comments. */
function indentOf(line: string): number | null {
  if (!line.trim() || line.trim().startsWith("#")) return null;
  return line.length - line.trimStart().length;
}

describe("launch ledger", () => {
  it("gives every task a unique id", () => {
    const seen = new Map<string, number[]>();
    lines.forEach((line, index) => {
      const match = /^ {2}(BG-\d{4}):\s*$/.exec(line);
      if (!match) return;
      const at = seen.get(match[1]) ?? [];
      at.push(index + 1);
      seen.set(match[1], at);
    });
    expect(seen.size).toBeGreaterThan(0);
    const duplicated = [...seen.entries()]
      .filter(([, at]) => at.length > 1)
      .map(([id, at]) => `${id} at lines ${at.join(", ")}`);
    // A duplicate does not fail the parse -- the later entry silently wins and
    // the earlier one disappears. Take the next free id instead of reusing one.
    expect(duplicated).toEqual([]);
  });

  it("never wraps a plain list item that contains a colon", () => {
    const offenders: string[] = [];
    lines.forEach((line, index) => {
      const match = /^(\s*)- (?!["'>|])(.*)$/.exec(line);
      if (!match || !match[2].includes(": ")) return;
      const contentIndent = match[1].length + 2;
      const next = lines[index + 1];
      if (next === undefined) return;
      const nextIndent = indentOf(next);
      // A continuation of this item's own text sits at the item's content
      // indent. A deeper-nested `key: value` is a legitimate mapping entry,
      // which is why the indent has to match exactly rather than merely exceed.
      if (nextIndent !== contentIndent) return;
      if (/^[\w.-]+:(\s|$)/.test(next.trim())) return; // a sibling mapping key
      offenders.push(`line ${index + 1}: ${line.trim().slice(0, 72)}`);
    });
    // Fix by making the item a block scalar (`- >-` with the text on the
    // following lines), or by rewording so the colon is not followed by a space.
    expect(offenders).toEqual([]);
  });

  it("keeps every human action an id/action pair", () => {
    const start = lines.findIndex((line) => line === "human_actions_open:");
    expect(start).toBeGreaterThan(-1);
    const end = lines.findIndex((line, index) => index > start && /^\w/.test(line));
    const block = lines.slice(start + 1, end).filter((line) => indentOf(line) !== null);
    const ids = block.filter((line) => /^ {2}- id: BG-\d{4}$/.test(line));
    const actions = block.filter((line) => /^ {4}action: /.test(line));
    // These are mappings, not prose. An automated rewrite once flattened them
    // into strings, which reads the same and is no longer addressable by id.
    expect(ids.length).toBeGreaterThan(0);
    expect(actions.length).toBe(ids.length);
    expect(block.length).toBe(ids.length + actions.length);
  });

  it("never repeats a field inside one task, which is what a lost id looks like", () => {
    // Dropping a `  BG-00xx:` line while editing does not break the parse: the
    // orphaned entry's fields are simply absorbed by the one above it, and YAML
    // resolves the repeated keys last-wins. The visible symptom is a task
    // silently wearing another task's title and state, and the id-uniqueness
    // check above cannot see it because one of the two ids no longer exists.
    const offenders: string[] = [];
    let current = "";
    let seen = new Set<string>();
    lines.forEach((line, index) => {
      const header = /^ {2}(BG-\d{4}):\s*$/.exec(line);
      if (header) {
        current = header[1];
        seen = new Set();
        return;
      }
      if (!current) return;
      // Only a task's own top-level fields; deeper lines belong to its values.
      const field = /^ {4}([a-z_]+):/.exec(line);
      if (!field) return;
      if (seen.has(field[1]))
        offenders.push(`${current} repeats "${field[1]}" at line ${index + 1}`);
      seen.add(field[1]);
    });
    expect(offenders).toEqual([]);
  });

  it("gives every task a title and a state", () => {
    const entries = lines.reduce<{ id: string; fields: string[] }[]>((all, line) => {
      const header = /^ {2}(BG-\d{4}):\s*$/.exec(line);
      if (header) return [...all, { id: header[1], fields: [] }];
      const field = /^ {4}([a-z_]+):/.exec(line);
      if (field && all.length) all[all.length - 1].fields.push(field[1]);
      return all;
    }, []);
    expect(entries.length).toBeGreaterThan(0);
    const incomplete = entries
      .filter((entry) => !entry.fields.includes("title") || !entry.fields.includes("state"))
      .map((entry) => entry.id);
    expect(incomplete).toEqual([]);
  });
});
