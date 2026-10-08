/**
 * Every Gradins screen and state of WP3, shared by `capture.mjs` and `probe.mjs`. `visitor`,
 * `noTeam`, `patch` and `open` set up what a fixture cannot (see `harness.mjs`).
 */
export const STATES = [
  { id: "g1-guest", path: "/gradins", visitor: true },
  { id: "g1-noteam", path: "/gradins", noTeam: true },
  { id: "g1-forming1", path: "/gradins?mc=forming1" },
  { id: "g1-rated", path: "/gradins?mc=rated" },
  { id: "g1-founder", path: "/gradins?mc=founder" },
  { id: "g1-seasonClosed", path: "/gradins?mc=seasonClosed" },
  { id: "g1-seasonStarted", path: "/gradins?mc=seasonStarted" },
  { id: "g1-offline", path: "/gradins?mc=offline" },
  // The heroes WP4 draws in the hero slot above the stage (plan 5.3), on this page.
  { id: "g1-born0", path: "/gradins?mc=born0" },
  { id: "g1-born0Serial", path: "/gradins?mc=born0Serial" },
  { id: "g1-forming1Arrival", path: "/gradins?mc=forming1", patch: "arrival" },
  { id: "g1-launchArrival", path: "/gradins?mc=launchArrival" },
  { id: "g1-returning", path: "/gradins?mc=returning" },
  { id: "g1-tierUp", path: "/gradins?mc=tierUp" },
  { id: "g1-legend", path: "/gradins?mc=legend" },
  { id: "g2-rated", path: "/gradins/carte?mc=rated" },
  { id: "g2-ratedTrfNull", path: "/gradins/carte?mc=ratedTrfNull" },
  { id: "g2-insufficient3", path: "/gradins/carte?mc=insufficient3" },
  { id: "g2-founder", path: "/gradins/carte?mc=founder" },
  { id: "g2-tierDown", path: "/gradins/carte?mc=tierDown" },
  { id: "g3-rated", path: "/gradins/les-votres?mc=rated" },
  { id: "g3-noLeague", path: "/gradins/les-votres?mc=rated", patch: "noLeague" },
  { id: "g3-alone", path: "/gradins/les-votres?mc=rated", patch: "alone" },
  { id: "g4-rated", path: "/gradins/les-votres?mc=rated", open: "h2h" },
  { id: "g6-rated", path: "/gradins/saisons?mc=rated" },
  { id: "g6-born0", path: "/gradins/saisons?mc=born0" },
  { id: "g6-seasonStarted", path: "/gradins/saisons?mc=seasonStarted" },
];
