/**
 * A small, exact reader for the SQL in supabase/migrations: it splits a file
 * into top-level statements (honouring comments, quoted strings and dollar
 * quotes, so a `;` or a `create function` inside a function body is never a
 * statement of its own) and follows the objects a chain of migrations leaves.
 *
 * It exists for one job: the owner script
 * (build-apply-sofascore-automatic.ts) records a few migrations in the history
 * only after checking, at run time, that what they create is in production. The
 * expected value of that check is the md5 of the function body text as
 * PostgreSQL keeps it (`md5(prosrc)`), which equals the md5 of the exact text
 * between the dollar-quote tags. Nothing here guesses: a shape this reader does
 * not understand throws, so a wrong expectation cannot be generated quietly.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");

export interface Statement {
  /** Text of the statement without its `;`, comments removed outside dollar bodies and strings. */
  clean: string;
  /** The text between the dollar-quote tags, in order of appearance. */
  bodies: string[];
  /** The clean text with every dollar body replaced by `$body$` (so a header regex cannot cross into a body). */
  skeleton: string;
  /** The statement exactly as written in the file (comments inside it kept), from its first token to its `;`. */
  raw: string;
}

const identStart = /[A-Za-z_\u0080-￿]/;
const identPart = /[A-Za-z0-9_$\u0080-￿]/;

/** Split SQL into top-level statements. */
export function splitStatements(sql: string): Statement[] {
  const out: Statement[] = [];
  let clean = "";
  let skeleton = "";
  let bodies: string[] = [];
  let startAt = -1;
  let i = 0;
  const n = sql.length;
  const flush = (endAt: number) => {
    if (clean.trim() !== "") {
      out.push({
        clean: clean.trim(),
        bodies,
        skeleton: skeleton.trim(),
        raw: sql.slice(startAt, endAt),
      });
    }
    startAt = -1;
    clean = "";
    skeleton = "";
    bodies = [];
  };
  while (i < n) {
    const c = sql[i]!;
    const d = sql[i + 1];
    if (startAt < 0 && !/\s/.test(c) && !(c === "-" && d === "-") && !(c === "/" && d === "*")) {
      startAt = i;
    }
    if (c === "-" && d === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      clean += " ";
      skeleton += " ";
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      for (;;) {
        if (j >= n) throw new Error("unterminated string literal");
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      clean += sql.slice(i, j + 1);
      skeleton += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      if (j < 0) throw new Error("unterminated quoted identifier");
      clean += sql.slice(i, j + 1);
      skeleton += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$" && !(i > 0 && identPart.test(sql[i - 1]!))) {
      let j = i + 1;
      if (j < n && identStart.test(sql[j]!)) {
        while (j < n && /[A-Za-z0-9_\u0080-￿]/.test(sql[j]!)) j++;
      }
      if (sql[j] === "$") {
        const tag = sql.slice(i, j + 1);
        const end = sql.indexOf(tag, j + 1);
        if (end < 0) throw new Error(`unterminated dollar quote ${tag}`);
        const body = sql.slice(j + 1, end);
        bodies.push(body);
        clean += tag + body + tag;
        skeleton += "$body$";
        i = end + tag.length;
        continue;
      }
    }
    if (c === ";") {
      flush(i + 1);
      i++;
      continue;
    }
    clean += c;
    skeleton += c;
    i++;
  }
  flush(n);
  return out;
}

/** Top-level comma split of an argument list (parentheses, brackets, quotes aware). */
export function splitArgs(argText: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < argText.length; i++) {
    const c = argText[i]!;
    if (c === "'") {
      let j = i + 1;
      while (j < argText.length && !(argText[j] === "'" && argText[j + 1] !== "'")) {
        j += argText[j] === "'" ? 2 : 1;
      }
      cur += argText.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) {
      args.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim() !== "") args.push(cur.trim());
  return args;
}

const NAME = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)(?:\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*))?`;
const unquote = (s: string) => s.replace(/"/g, "");

/** Read `schema.name` and the parenthesised text that follows it, starting at `from`. */
function nameAndArgs(
  text: string,
  from: number,
): { qualified: string; args: string[]; end: number } | null {
  const m = new RegExp(String.raw`^\s*(${NAME})\s*\(`).exec(text.slice(from));
  if (!m) return null;
  const open = from + m[0].length - 1;
  let depth = 0;
  let i = open;
  for (; i < text.length; i++) {
    const c = text[i]!;
    if (c === "'") {
      i = text.indexOf("'", i + 1);
      while (text[i + 1] === "'") i = text.indexOf("'", i + 2);
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  const inner = text.slice(open + 1, i);
  return { qualified: unquote(m[1]!), args: splitArgs(inner), end: i + 1 };
}

const inputArgCount = (args: string[]) =>
  args.filter((a) => !/^out\s/i.test(a) && !/^table\s*\(/i.test(a)).length;

export interface FnObject {
  /** `schema.name`, as the object is called right now. */
  name: string;
  nargs: number;
  body: string;
  /** Version of the migration that last (re)defined it. */
  definedIn: string;
  /** Every migration version that created or replaced it. */
  touchedBy: string[];
}
export interface TableObject {
  name: string;
  createdIn: string;
}
export interface TypeObject {
  name: string;
  createdIn: string;
  labels: string[];
  /** True when a later `alter type ... add value` made the label list open-ended. */
  extended: boolean;
}
export interface Catalog {
  functions: Map<string, FnObject>;
  tables: Map<string, TableObject>;
  types: Map<string, TypeObject>;
}

const fnKey = (name: string, nargs: number) => `${name}/${nargs}`;

/** Follow the migrations in version order and keep the live objects. */
export function followChain(files: { version: string; sql: string }[]): Catalog {
  const catalog: Catalog = { functions: new Map(), tables: new Map(), types: new Map() };
  for (const { version, sql } of files) {
    for (const st of splitStatements(sql)) {
      const s = st.skeleton;
      let m: RegExpExecArray | null;
      if ((m = /^create\s+(?:or\s+replace\s+)?function\s+/i.exec(s))) {
        const header = nameAndArgs(s, m[0].length);
        if (!header) throw new Error(`${version}: cannot read function header: ${s.slice(0, 120)}`);
        if (st.bodies.length !== 1) {
          throw new Error(
            `${version}: ${header.qualified} has ${st.bodies.length} dollar-quoted parts, expected one body`,
          );
        }
        if (!/\bas\s+\$body\$/i.test(s)) {
          throw new Error(`${version}: ${header.qualified} has no 'as $$ body $$'`);
        }
        const nargs = inputArgCount(header.args);
        const key = fnKey(header.qualified, nargs);
        const prior = catalog.functions.get(key);
        catalog.functions.set(key, {
          name: header.qualified,
          nargs,
          body: st.bodies[0]!,
          definedIn: version,
          touchedBy: [...(prior?.touchedBy ?? []), version],
        });
      } else if ((m = /^drop\s+function\s+(?:if\s+exists\s+)?/i.exec(s))) {
        for (const part of s
          .slice(m[0].length)
          .replace(/\s+(cascade|restrict)\s*$/i, "")
          .split(/\)\s*,\s*(?=[A-Za-z_"])/)) {
          const p = part.endsWith(")") ? part : `${part})`;
          const header = nameAndArgs(p, 0);
          if (!header) {
            const bare = new RegExp(String.raw`^\s*(${NAME})\s*$`).exec(part);
            if (!bare) throw new Error(`${version}: cannot read drop function: ${s.slice(0, 120)}`);
            for (const [key, fn] of catalog.functions)
              if (fn.name === unquote(bare[1]!)) catalog.functions.delete(key);
            continue;
          }
          catalog.functions.delete(fnKey(header.qualified, inputArgCount(header.args)));
        }
      } else if ((m = /^alter\s+function\s+/i.exec(s))) {
        const header = nameAndArgs(s, m[0].length);
        if (!header) throw new Error(`${version}: cannot read alter function: ${s.slice(0, 120)}`);
        const rest = s.slice(header.end);
        const rename = new RegExp(String.raw`^\s*rename\s+to\s+(${NAME})\s*$`, "i").exec(rest);
        if (rename) {
          const key = fnKey(header.qualified, inputArgCount(header.args));
          const fn = catalog.functions.get(key);
          if (!fn)
            throw new Error(
              `${version}: renames ${header.qualified}, which this chain never created`,
            );
          catalog.functions.delete(key);
          const schema = header.qualified.split(".")[0]!;
          const next = `${schema}.${unquote(rename[1]!)}`;
          catalog.functions.set(fnKey(next, fn.nargs), { ...fn, name: next });
        }
      } else if (
        (m = new RegExp(
          String.raw`^create\s+table\s+(?:if\s+not\s+exists\s+)?(${NAME})\s*\(`,
          "i",
        ).exec(s))
      ) {
        const name = unquote(m[1]!);
        if (!catalog.tables.has(name)) catalog.tables.set(name, { name, createdIn: version });
      } else if (
        (m = new RegExp(String.raw`^drop\s+table\s+(?:if\s+exists\s+)?(.+)$`, "i").exec(s))
      ) {
        for (const t of m[1]!.replace(/\s+(cascade|restrict)\s*$/i, "").split(",")) {
          catalog.tables.delete(unquote(t.trim()));
        }
      } else if (
        (m = new RegExp(
          String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${NAME})\s+rename\s+to\s+(${NAME})\s*$`,
          "i",
        ).exec(s))
      ) {
        const from = unquote(m[1]!);
        const t = catalog.tables.get(from);
        if (t) {
          catalog.tables.delete(from);
          const next = `${from.split(".")[0]}.${unquote(m[2]!)}`;
          catalog.tables.set(next, { ...t, name: next });
        }
      } else if (
        (m = new RegExp(
          String.raw`^create\s+type\s+(${NAME})\s+as\s+enum\s*\((.*)\)\s*$`,
          "is",
        ).exec(s))
      ) {
        const labels = [...m[2]!.matchAll(/'((?:[^']|'')*)'/g)].map((x) =>
          x[1]!.replace(/''/g, "'"),
        );
        catalog.types.set(unquote(m[1]!), {
          name: unquote(m[1]!),
          createdIn: version,
          labels,
          extended: false,
        });
      } else if (
        (m = new RegExp(
          String.raw`^alter\s+type\s+(${NAME})\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'((?:[^']|'')*)'`,
          "i",
        ).exec(s))
      ) {
        const t = catalog.types.get(unquote(m[1]!));
        const label = m[2]!.replace(/''/g, "'");
        if (t) {
          if (!t.labels.includes(label)) t.labels.push(label);
          t.extended = true;
        }
      } else if (
        (m = new RegExp(String.raw`^drop\s+type\s+(?:if\s+exists\s+)?(${NAME})`, "i").exec(s))
      ) {
        catalog.types.delete(unquote(m[1]!));
      }
    }
  }
  return catalog;
}

export const migrationsDir = (root: string) => join(root, "supabase/migrations");

export function listMigrations(root: string): { version: string; name: string; file: string }[] {
  return readdirSync(migrationsDir(root))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => {
      const m = /^(\d{14})_(.+)\.sql$/.exec(file);
      if (!m) throw new Error(`unexpected migration file name ${file}`);
      return { version: m[1]!, name: m[2]!, file };
    });
}

export function readChain(
  root: string,
  include: (version: string) => boolean,
): { version: string; sql: string }[] {
  return listMigrations(root)
    .filter((m) => include(m.version))
    .map((m) => ({
      version: m.version,
      sql: readFileSync(join(migrationsDir(root), m.file), "utf8"),
    }));
}

/** The body with every full-line `--` comment removed (how production holds some Lovable-applied functions). */
export const stripFullLineComments = (body: string) =>
  body
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
