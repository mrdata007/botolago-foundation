/**
 * Production deploy guard for the legal documents.
 *
 * The Terms and Privacy pages are binding statements about a real operator and
 * its handling of real people's data. They currently carry `[...]` spans where
 * the owner's values belong, because the legal entity does not exist yet. A
 * bracketed blank on a live Terms page reads as unfinished; a blank where a
 * registration number belongs is worse, because the sentence around it asserts
 * a registration that has not been issued.
 *
 * `src/content/legal/legal-content.test.ts` states that as a test and is
 * deliberately red. It no longer runs in `bun test`, so it cannot block
 * ordinary CI on a value nobody can supply yet -- see package.json's
 * `--path-ignore-patterns`. This script is the other half of that trade: the
 * check still exists, and it stands between the documents and production.
 *
 * It fails ONLY for a production build. "Production" is decided by the resolved
 * VITE_APP_URL matching the live origin, which `.env.production` already sets
 * and no preview or staging build does -- so previews and staging are
 * unaffected without anyone configuring anything new. CI builds that same
 * bundle as a smoke test on every pull request, which is not a publish, so it
 * exempts itself with LEGAL_GATE_ALLOW_PLACEHOLDERS=1 in the workflow.
 *
 * Note the limit of this guard, honestly: it runs inside the build. It can stop
 * a production bundle being produced with blanks in it. It cannot stop someone
 * publishing an older bundle, and nothing in GitHub can physically prevent a
 * publish from the Lovable editor. It is an interlock on the build, not on the
 * button.
 */

import { readFileSync } from "node:fs";

import {
  LEGAL_DOCUMENTS,
  type LegalBlock,
  type LegalDocument,
} from "../../src/content/legal/documents";

const PRODUCTION_ORIGINS = ["https://botolago.com", "https://www.botolago.com"];

function textOf(block: LegalBlock): string[] {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return [block.text];
    case "list":
      return [...block.items];
    case "table":
      return [...block.head, ...block.rows.flat()];
  }
}

function allText(doc: LegalDocument): string[] {
  return [doc.title, ...doc.blocks.flatMap(textOf)];
}

/** `[...]` spans, which is how the source documents mark a value nobody has yet. */
export function placeholdersIn(doc: LegalDocument): string[] {
  return allText(doc).flatMap((line) =>
    [...line.matchAll(/\[([^\]]{2,80})\]/g)].map((match) => match[1]),
  );
}

export function findPlaceholders(): { where: string; placeholder: string }[] {
  const found: { where: string; placeholder: string }[] = [];
  for (const [name, byLang] of Object.entries(LEGAL_DOCUMENTS)) {
    for (const lang of ["fr", "ar"] as const) {
      for (const placeholder of new Set(placeholdersIn(byLang[lang]))) {
        found.push({ where: `${name}.${lang}`, placeholder });
      }
    }
  }
  return found;
}

/**
 * Vite resolves `.env.production` for a default `vite build`, but this script
 * runs as its own process beforehand, and whether Bun has auto-loaded that file
 * depends on NODE_ENV. Relying on that would make the guard fire or not fire
 * for reasons unrelated to the build. So read the file the build will read.
 */
function resolveAppUrl(): string {
  const fromEnv = (process.env.VITE_APP_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  try {
    const file = readFileSync(new URL("../../.env.production", import.meta.url), "utf8");
    const match = /^\s*VITE_APP_URL\s*=\s*(.+?)\s*$/m.exec(file);
    return (match?.[1] ?? "").replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function isProductionBuild(): boolean {
  // `build:dev` passes --mode development and is never a production publish.
  if (process.argv.includes("--mode=development")) return false;
  return PRODUCTION_ORIGINS.includes(resolveAppUrl());
}

/**
 * CI builds the production bundle as a smoke test on every pull request. That
 * is not a publish, and failing it would block ordinary work on a value nobody
 * can supply yet. The exemption is a named environment variable rather than a
 * CI sniff, so it is visible in the workflow that claims it and cannot be
 * inherited by accident -- a publish that wanted to bypass this guard would
 * have to say so out loud.
 */
function exempt(): boolean {
  return process.env.LEGAL_GATE_ALLOW_PLACEHOLDERS === "1";
}

function main(): void {
  const found = findPlaceholders();
  const production = isProductionBuild() && !exempt();

  if (found.length === 0) {
    console.log("legal-placeholder-gate: no unfilled placeholders. OK.");
    return;
  }

  const lines = found.map(({ where, placeholder }) => `  ${where}: [${placeholder}]`).join("\n");

  if (!production) {
    // Preview, staging and local builds carry on. Saying nothing here would
    // let the blanks go unnoticed for weeks, so it still prints.
    console.warn(
      `legal-placeholder-gate: ${found.length} unfilled placeholder(s) remain.\n${lines}\n` +
        (exempt()
          ? "LEGAL_GATE_ALLOW_PLACEHOLDERS=1 is set, so this is a warning."
          : "Not a production build (VITE_APP_URL is not the live origin), so this is a warning."),
    );
    return;
  }

  console.error(
    `legal-placeholder-gate: refusing to build for production.\n\n` +
      `${found.length} unfilled placeholder(s) would be published on the Terms or Privacy page:\n${lines}\n\n` +
      "Each is a value only the owner holds. Fill them in src/content/legal/documents.ts,\n" +
      "or stop linking the legal pages, but do not publish a bracketed blank.\n",
  );
  process.exit(1);
}

if (import.meta.main) main();
