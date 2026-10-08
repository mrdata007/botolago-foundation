#!/usr/bin/env bash
# Captures the onboarding screens into review/onboarding/ and writes review/onboarding/INDEX.md.
# Calls tools/capture.mjs (screens) and tools/capture-motion.mjs (the t = 0 motion proof), then
# converts each PNG to WebP (quality 80) with ffmpeg.
#
#   PW_CORE=/path/to/node_modules/playwright-core/index.mjs CHROME=/path/to/chrome \
#   bash design-lab/manager-cards-claude/tools/capture-onboarding.sh [only]
#
# only: all (default) | lead | others | desktop | motion | 2x   (which set to take; the index is
# always rewritten from the files on disk). Environment: PORT (4350), JOBS (4), ONB_OUT (the folder).
#
# The matrix (ONBOARDING_PLAN.md section 7, "Captures"), phone 390 x 844:
#   Écharpe 07-v2     every screen and variant, fr and ar, light and dark, dpr 1
#   Écharpe 07-v2/2x  eight key moments (S05 new, S06 forming1, S08 fresh, S09 rated, S10 band,
#                     S11 image, S14 founder, S16 page) in fr light and ar dark, dpr 2
#   03-v2, 01, 05-v2, t1-touchline   S05, S06, S08, S09, S10, S14 (every variant) in fr light,
#                     ar light and ar dark, dpr 1
#   Desktop D1        Écharpe, fr and ar light, 1440 wide, dpr 1
#   motion/           S05 new-serial and S08 fresh at t = 0 with the beat on, and under reduced
#                     motion (every direction in fr light, Écharpe also in ar dark)
set -euo pipefail

LAB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LAB"
PORT="${PORT:-4350}"
JOBS="${JOBS:-4}"
OUT="${ONB_OUT:-$LAB/review/onboarding}"
BASE="http://127.0.0.1:$PORT"
export PW_CORE="${PW_CORE:-playwright-core}" CHROME="${CHROME:-}"

# One capture: a tab-separated job line -> OUT/<path>.webp
one() {
  local url out w h dpr scheme mode
  IFS=$'\t' read -r url out w h dpr scheme mode <<<"$1"
  mkdir -p "$(dirname "$out")"
  local tmp json
  tmp="$(mktemp --suffix=.png)"
  case "$mode" in
    phone) json="$(node tools/capture.mjs "$url" "$tmp" "$w" --height="$h" --viewport --dpr="$dpr" --scheme="$scheme")" ;;
    page) json="$(node tools/capture.mjs "$url" "$tmp" "$w" --height="$h" --dpr="$dpr" --scheme="$scheme")" ;;
    motion) json="$(node tools/capture-motion.mjs "$url" "$tmp" --dpr="$dpr")" ;;
    reduced) json="$(node tools/capture-motion.mjs "$url" "$tmp" --reduced --dpr="$dpr")" ;;
  esac
  ffmpeg -y -loglevel error -i "$tmp" -c:v libwebp -quality 80 -compression_level 6 "$out"
  rm -f "$tmp"
  # the log line names the WebP it made, not the temporary PNG
  printf '%s\n' "${json//$tmp/${out#"$OUT"/}}"
}
if [ "${1:-}" = "--one" ]; then
  one "$2"
  exit 0
fi
ONLY="${1:-all}"

SERVER_PID=""
if ! curl -fs "$BASE/onboarding.html" >/dev/null 2>&1; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER_PID=$!
  trap '[ -z "$SERVER_PID" ] || kill "$SERVER_PID" 2>/dev/null || true' EXIT
  until curl -fs "$BASE/onboarding.html" >/dev/null 2>&1; do sleep 0.3; done
fi

# Every registered screen and variant (id, variant key), read from the page itself.
SCREENS="$(node --input-type=module -e '
const pw = await import(process.env.PW_CORE);
const b = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage();
await p.goto(process.argv[1] + "/onboarding.html?c=07&v=v2");
await p.waitForFunction(() => document.documentElement.dataset.ready === "1");
const r = await p.evaluate(() => MC.ONB.SCREENS.filter((s) => s.id !== "S00").flatMap((s) => s.variants.map((v) => s.id + " " + v.key + " " + (s.desktop ? "d" : "p"))));
console.log(r.join("\n"));
await b.close();
' "$BASE")"

JOBFILE="$(mktemp)"
q() { # direction query, screen, variant, lang, scheme
  echo "$BASE/onboarding.html?$1&screen=$2&variant=$3&lang=$4&scheme=$5"
}
job() { # url out width height dpr scheme mode
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$@" >>"$JOBFILE"
}

LEAD_ID="07-v2"
LEAD_Q="c=07&v=v2"
OTHERS=("03-v2|c=03&v=v2" "01|c=01" "05-v2|c=05&v=v2" "t1-touchline|c=t1-touchline")
OBJECT_SCREENS=" S05 S06 S08 S09 S10 S14 "
KEY_MOMENTS=" S05:new S06:forming1 S08:fresh S09:rated S10:band S11:image S14:founder S16:page "

if [ "$ONLY" = all ] || [ "$ONLY" = lead ]; then
  while read -r id variant kind; do
    [ "$kind" = p ] || continue
    for lang in fr ar; do for scheme in light dark; do
      job "$(q "$LEAD_Q" "$id" "$variant" "$lang" "$scheme")" "$OUT/$LEAD_ID/$id-$variant-$lang-$scheme.webp" 390 844 1 "$scheme" phone
    done; done
  done <<<"$SCREENS"
fi
if [ "$ONLY" = all ] || [ "$ONLY" = 2x ]; then
  for km in $KEY_MOMENTS; do
    id="${km%%:*}"; variant="${km##*:}"
    for ls in fr:light ar:dark; do
      lang="${ls%%:*}"; scheme="${ls##*:}"
      job "$(q "$LEAD_Q" "$id" "$variant" "$lang" "$scheme")" "$OUT/$LEAD_ID/2x/$id-$variant-$lang-$scheme@2x.webp" 390 844 2 "$scheme" phone
    done
  done
fi
if [ "$ONLY" = all ] || [ "$ONLY" = others ]; then
  for d in "${OTHERS[@]}"; do
    dir="${d%%|*}"; dq="${d##*|}"
    while read -r id variant kind; do
      [[ "$OBJECT_SCREENS" == *" $id "* ]] || continue
      for ls in fr:light ar:light ar:dark; do
        lang="${ls%%:*}"; scheme="${ls##*:}"
        job "$(q "$dq" "$id" "$variant" "$lang" "$scheme")" "$OUT/$dir/$id-$variant-$lang-$scheme.webp" 390 844 1 "$scheme" phone
      done
    done <<<"$SCREENS"
  done
fi
if [ "$ONLY" = all ] || [ "$ONLY" = desktop ]; then
  for variant in hub card; do for lang in fr ar; do
    job "$(q "$LEAD_Q" D1 "$variant" "$lang" light)" "$OUT/$LEAD_ID/D1-$variant-$lang-light.webp" 1440 900 1 light page
  done; done
fi
if [ "$ONLY" = all ] || [ "$ONLY" = motion ]; then
  ALL=("$LEAD_ID|$LEAD_Q" "${OTHERS[@]}")
  for d in "${ALL[@]}"; do
    dir="${d%%|*}"; dq="${d##*|}"
    sets=("fr:light")
    [ "$dir" = "$LEAD_ID" ] && sets+=("ar:dark")
    for ls in "${sets[@]}"; do
      lang="${ls%%:*}"; scheme="${ls##*:}"
      for sv in S05:new-serial S08:fresh; do
        id="${sv%%:*}"; variant="${sv##*:}"
        for mode in motion reduced; do
          job "$(q "$dq" "$id" "$variant" "$lang" "$scheme")" "$OUT/motion/$dir/$id-$variant-$lang-$scheme-$([ "$mode" = motion ] && echo t0-motion || echo reduced).webp" 390 844 1 "$scheme" "$mode"
        done
      done
    done
  done
fi

if [ -s "$JOBFILE" ]; then
  echo "$(wc -l <"$JOBFILE") captures, $JOBS at a time" >&2
  LOG="$OUT/capture.log"
  mkdir -p "$OUT"
  : >"$LOG"
  export -f one
  export BASE OUT PW_CORE CHROME
  # each job prints one JSON line (console errors, elements outside the frame): keep them for review
  xargs -d '\n' -P "$JOBS" -I{} bash "${BASH_SOURCE[0]}" --one {} <"$JOBFILE" | tee -a "$LOG" |
    awk '/"errors":\[[^]]/ || /"overflow":\[[^]]/ {print "NOTE " $0}' >&2 || true
fi
rm -f "$JOBFILE"

# The index, from the registry and the files on disk.
node --input-type=module -e '
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [out, base] = process.argv.slice(1);
const pw = await import(process.env.PW_CORE);
const b = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage();
await p.goto(base + "/onboarding.html?c=07&v=v2");
await p.waitForFunction(() => document.documentElement.dataset.ready === "1");
const reg = await p.evaluate(() => MC.ONB.SCREENS.filter((s) => s.id !== "S00").map((s) => ({ id: s.id, moment: s.moment, title: s.title, desktop: !!s.desktop, variants: s.variants.map((v) => ({ key: v.key, fixture: v.fixture, label: v.label || "" })) })));
await b.close();
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".webp") ? [join(d, e.name)] : []);
const files = walk(out);
const rel = (f) => f.slice(out.length + 1);
const kb = (n) => (n / 1024).toFixed(0) + " KB";
const total = files.reduce((s, f) => s + statSync(f).size, 0);
const L = [];
L.push("# Onboarding captures", "");
L.push("Screenshots of the onboarding screens (`onboarding.html`), made by `tools/capture-onboarding.sh`. Fictional sample data only; Semelle captures carry the label « Test culturel en attente » (no onboarding moment ships on Semelle until its cultural test passes).", "");
L.push(`**${files.length} files, ${(total / 1048576).toFixed(1)} MB** (WebP, quality 80).`, "");
L.push("## How they were made", "", "```sh", "cd design-lab/manager-cards-claude", "PW_CORE=<playwright-core/index.mjs> CHROME=<chrome> bash tools/capture-onboarding.sh   # everything", "bash tools/capture-onboarding.sh lead|others|desktop|motion|2x                          # one set", "```", "");
L.push("Each file is one `tools/capture.mjs` call, `onboarding.html?<direction>&screen=<id>&variant=<key>&lang=<fr|ar>&scheme=<light|dark>`, converted with `ffmpeg -c:v libwebp -quality 80`. Phone screens are the 390 x 844 viewport at device pixel ratio 1 (2 in `2x/`), reduced motion on, animations frozen. The t = 0 motion proofs come from `tools/capture-motion.mjs`. The per-capture console errors and elements outside the frame are in `capture.log` (one JSON line each, named by the WebP it made).", "");
L.push("## Files", "");
L.push("| Folder | Direction | What |", "|---|---|---|");
const dirs = [["07-v2", "Écharpe v2 (the lead)", "every screen and variant, fr and ar, light and dark, 390 x 844 at 1x; `2x/` has the eight key moments at 2x; `D1-*` are the desktop screens at 1440"], ["03-v2", "Porte-clés v2", "S05, S06, S08, S09, S10, S14: fr light, ar light, ar dark"], ["01", "Lucarne", "the same six screens"], ["05-v2", "Semelle v2", "the same six screens, with the cultural-test label"], ["t1-touchline", "Touchline (reworked)", "the same six screens"], ["motion", "all five", "S05 new-serial and S08 fresh at t = 0 with motion on, and under reduced motion"]];
for (const [d, n, w] of dirs) {
  const fs = files.filter((f) => rel(f).startsWith(d + "/"));
  L.push(`| \`${d}/\` | ${n} | ${fs.length} files (${kb(fs.reduce((s, f) => s + statSync(f).size, 0))}): ${w} |`);
}
L.push("", "File names: `<screen>-<variant>-<fr|ar>-<light|dark>.webp`. Motion proofs: `motion/<direction>/<screen>-<variant>-<lang>-<scheme>-<t0-motion|reduced>.webp`.", "");
L.push("## By moment (Écharpe set; the other directions reuse the names)", "");
const moments = new Map();
for (const s of reg) {
  const key = s.moment || "other";
  if (!moments.has(key)) moments.set(key, []);
  moments.get(key).push(s);
}
for (const [m, list] of moments) {
  L.push(`### ${m}`, "");
  for (const s of list) {
    L.push(`**${s.id}** · ${s.title}${s.desktop ? " (desktop 1440)" : ""}`, "");
    for (const v of s.variants) {
      const names = files.map(rel).filter((r) => r.startsWith("07-v2/") && !r.includes("/2x/") && r.includes(`/${s.id}-${v.key}-`)).sort();
      const other = files.map(rel).filter((r) => !r.startsWith("07-v2/") && !r.startsWith("motion/") && r.includes(`/${s.id}-${v.key}-`)).length;
      const two = files.map(rel).filter((r) => r.includes("/2x/") && r.includes(`/${s.id}-${v.key}-`)).length;
      L.push(`- \`${s.id}-${v.key}\` (fixture \`${v.fixture}\`${v.label ? `: ${v.label}` : ""}): ${names.length} files in 07-v2${two ? `, ${two} at 2x` : ""}${other ? `, ${other} in the other directions` : ""}`);
    }
    L.push("");
  }
}
const mo = files.map(rel).filter((r) => r.startsWith("motion/")).sort();
L.push("## Motion proof", "", "`motion/<direction>/…-t0-motion.webp` is the screen with `motion=1` under `prefers-reduced-motion: no-preference`, every animation rewound to time 0 and paused: the first painted frame of the beat. The number and the serial are there, at full opacity, in every one. `…-reduced.webp` is the same screen under `prefers-reduced-motion: reduce` (no animation, no beat). The measured version of this is criterion 5 in `CHECKS.md`.", "");
for (const r of mo) L.push(`- \`${r}\``);
L.push("");
writeFileSync(join(out, "INDEX.md"), L.join("\n"));
console.log(`${files.length} files, ${(total / 1048576).toFixed(2)} MB`);
' "$OUT" "$BASE"
