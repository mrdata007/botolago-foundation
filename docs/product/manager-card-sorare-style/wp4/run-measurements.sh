#!/usr/bin/env bash
# Every measurement of the collectible's evidence (WP4) in the order they were run, each one's printed summary
# and its JSON written to results/. Run against a development server you started yourself, from the tree
# being measured, in the mock data modes with the preview on, on its own port:
#
#   VITE_FOOTBALL_DATA_MODE=mock VITE_FANTASY_DATA_MODE=mock VITE_AUTH_MODE=mock VITE_MANAGER_CARD_DATA_MODE=mock \
#   VITE_NEWS_DATA_MODE=mock VITE_NOTIFICATIONS_DATA_MODE=mock VITE_PRIZES_DATA_MODE=mock VITE_PREDICTIONS_DATA_MODE=mock \
#   VITE_PEPITES_DATA_MODE=mock VITE_MANAGER_CARD_PREVIEW=1 VITE_PEPITES_PREVIEW=1 \
#     bun run dev -- --host 127.0.0.1 --port 4194 --strictPort
#   BASE=http://127.0.0.1:4194 bash docs/product/manager-card-sorare-style/wp4/run-measurements.sh [step ...]
#
# Steps (all of them when none is named): contrast edge marks ink structure shape rtl names words columns
# firstscreen motion probes   -- and, run alone on a quiet machine because they measure time: perf tilt
# The one-off captures (the AFTER set, the gallery, the detail crops, the comparison sheets, the switch-off
# comparison) have their own commands in ../INDEX.md.
set -o pipefail
: "${BASE:?set BASE to the development server, e.g. http://127.0.0.1:4194}"
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../../.." && pwd)"
r="$here/results"
mkdir -p "$r"
cd "$repo"
steps=("$@")
[[ ${#steps[@]} -eq 0 ]] && steps=(contrast edge marks ink structure shape rtl names words columns firstscreen motion probes)
want() { for s in "${steps[@]}"; do [[ "$s" == "$1" ]] && return 0; done; return 1; }
run() { local name="$1"; shift; echo "== $name"; "$@" 2>&1 | tee "$r/$name.txt"; echo "$name exit ${PIPESTATUS[0]}"; }

want contrast && {
  run contrast-card-390 node "$here/contrast-card.mjs" --widths=390 --jobs=2 --out="$r/contrast-card-390.json"
  run contrast-card-1440 node "$here/contrast-card.mjs" --widths=1440 --fx=forming1,homa,rated,tierUp,legend,founder --jobs=2 --out="$r/contrast-card-1440.json"
}
want edge && {
  run contrast-edge-390 node "$here/contrast-card.mjs" --widths=390 --kinds=edge --jobs=2 --out="$r/contrast-edge-390.json"
  run contrast-edge-1440 node "$here/contrast-card.mjs" --widths=1440 --kinds=edge --fx=rated,legend,homa,tierUp,forming1 --jobs=2 --out="$r/contrast-edge-1440.json"
}
want marks && run contrast-marks node "$here/contrast-card.mjs" --widths=390 --kinds=mark --fx=forming1,eve2,notFinal2 --jobs=2 --out="$r/contrast-marks.json"
want ink && run number-ink node "$here/number-ink.mjs" --out="$r/number-ink.json"
want structure && run structure node "$here/structure.mjs" --out="$r/structure.json"
want shape && run shape-checks node "$here/shape-checks.mjs" --out="$r/shape-checks.json"
want rtl && run rtl node "$here/rtl.mjs" --out="$r/rtl.json"
want names && run names node "$here/names.mjs" --out="$r/names.json"
want words && run words node "$here/words.mjs" --out="$r/words.json"
want columns && run column-fit node "$here/column-fit.mjs" --out="$r/column-fit.json"
want firstscreen && run first-screen node "$here/first-screen.mjs" --out="$r/first-screen.json"
want motion && run motion node "$here/motion.mjs" --only=reduced,beats,depth --out="$r/motion.json"
want probes && bash "$here/run-probes.sh" all
want perf && run perf node "$here/perf.mjs" --out="$r/perf.json"
want tilt && run tilt node "$here/motion.mjs" --only=tilt --out="$r/tilt.json"
exit 0
