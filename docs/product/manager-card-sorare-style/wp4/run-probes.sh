#!/usr/bin/env bash
# The repository's own probes (scripts/qa/layout-probe.mjs and scripts/qa/contrast-probe.mjs), run on the
# Gradins screens and the Fantasy surfaces that draw the card, through the wrapper the Manager Card section
# used (it seeds the mock demo account and finds this sandbox's Chromium without editing the probes).
#
#   BASE=http://127.0.0.1:4194 bash docs/product/manager-card-sorare-style/wp4/run-probes.sh [layout|contrast|all]
#
# Each route is run on its own (a page crash on one route, which this sandbox's Chromium shows now and then
# under load, loses that route only; it is retried once and the retry is recorded). Results land in
# docs/product/manager-card-sorare-style/wp4/results/ as one file per probe, theme and visitor mode, with a
# section per route and a tally at the top. The development server must be one you started yourself, in the
# mock data modes with VITE_MANAGER_CARD_PREVIEW=1.
set -o pipefail
: "${BASE:?set BASE to the development server, e.g. http://127.0.0.1:4194}"
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../../.." && pwd)"
results="$here/results"
mkdir -p "$results"
cd "$repo"
probe="docs/product/manager-card-section/wp3/repo-probe.mjs"
what="${1:-all}"

# every state of the card on G1, G2, G3, G6, the team page's born panel, the Fantasy hub, rankings and league band
routes_signed=(
  "/gradins?mc=forming1" "/gradins?mc=rated" "/gradins?mc=founder" "/gradins?mc=legend" "/gradins?mc=homa"
  "/gradins?mc=clubNull" "/gradins?mc=arabicName" "/gradins?mc=longNameLatin" "/gradins?mc=tierUp"
  "/gradins/carte?mc=rated" "/gradins/carte?mc=founder" "/gradins/carte?mc=homa" "/gradins/carte?mc=insufficient3"
  "/gradins/carte?mc=tierDown" "/gradins/les-votres?mc=rated" "/gradins/saisons?mc=rated" "/gradins/saisons?mc=born0"
  "/fantasy/team?mc=born0" "/fantasy/team?mc=born0Serial" "/fantasy?mc=rated" "/fantasy?mc=homa" "/fantasy?mc=legend"
  "/fantasy/rankings?mc=rated" "/fantasy/leagues/lg1?mc=rated"
)
routes_visitor=("/gradins")

# run <kind> <outfile> <widths> <extra flags...> -- <routes...>
run() {
  local kind="$1" out="$2" widths="$3"; shift 3
  local flags=() routes=()
  while [[ "$1" != "--" ]]; do flags+=("$1"); shift; done; shift
  routes=("$@")
  local body; body="$(mktemp)"
  local retried=0 failed=0
  : > "$body"
  for route in "${routes[@]}"; do
    local text status
    for attempt in 1 2; do
      text="$(node "$probe" --kind "$kind" --routes "$route" --langs fr,ar --widths "$widths" "${flags[@]}" 2>&1)"; status=$?
      if grep -q "checks over\|texts in view" <<<"$text"; then break; fi
      retried=$((retried + 1))
    done
    if ! grep -q "checks over\|texts in view" <<<"$text"; then failed=$((failed + 1)); fi
    { echo "=== $route (exit $status)"; echo "$text"; echo; } >> "$body"
  done
  { echo "# $kind probe, flags: ${flags[*]}, widths $widths, ${#routes[@]} routes, retried runs: $retried, routes with no result: $failed"; echo; cat "$body"; } > "$out"
  rm -f "$body"
  echo "$kind $(basename "$out"): ${#routes[@]} routes, retried $retried, no result $failed"
}

if [[ "$what" == layout || "$what" == all ]]; then
  # 320, 390 and 1440, French and Arabic; the first two are the phone widths the brief names
  for theme in light dark; do
    run layout "$results/layout-$theme.txt" 320,390,1440 --theme "$theme" -- "${routes_signed[@]}"
  done
  run layout "$results/layout-visitor.txt" 320,390,1440 --visitor -- "${routes_visitor[@]}"
fi

if [[ "$what" == contrast || "$what" == all ]]; then
  # every visible text measured from pixels (--all), French and Arabic, 390 px
  for theme in light dark; do
    run contrast "$results/contrast-page-$theme.txt" 390 --all --theme "$theme" -- "${routes_signed[@]}"
  done
  run contrast "$results/contrast-page-visitor.txt" 390 --all --visitor -- "${routes_visitor[@]}"
fi
