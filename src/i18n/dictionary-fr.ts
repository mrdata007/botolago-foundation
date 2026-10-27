// The French dictionary: every user-facing string of the app, in French.
// Components must not hardcode UI copy -- they call t("key"). French is the
// language every page is first rendered in, so it ships with the app; the
// Arabic dictionary (dictionary-ar.ts) loads when a reader chooses Arabic.
// `dictionaries.ts` puts both together for the tests and the i18n gate.
//
// The French strings are kept in two files so the first view of the home page
// downloads only the first (dictionary-fr-core.ts); the second
// (dictionary-fr-rest.ts) is fetched before the first other page. This module
// is the whole dictionary, for the server, the tests and the gate: do not
// import it from code the home page loads (use `frCore`, or `t()`).
import { frCore } from "./dictionary-fr-core";
import { frRest } from "./dictionary-fr-rest";

export const fr = { ...frCore, ...frRest } as const satisfies Record<string, string>;
