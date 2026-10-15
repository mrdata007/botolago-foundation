#!/usr/bin/env bash
# Renders the live shield card and the share picture side by side, for every tier and paid edition
# in French and Arabic, from THIS checkout, and screenshots the page.
# Usage: scripts/qa/share-card-compare.sh <out-dir> [port]
# Each tree must use its own port: a server for another tree measures the wrong tree.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mkdir -p "${1:?out dir}" && cd "$1" && pwd)"
PORT="${2:-$((20000 + RANDOM % 20000))}"
WORK="$OUT/work"
mkdir -p "$WORK/dist"
sed "s#__ROOT__#$ROOT#g" "$ROOT/scripts/qa/share-card-compare.entry.ts" > "$WORK/entry.ts"
ln -sfn "$ROOT/public/fonts" "$WORK/fonts"
ln -sfn "$ROOT/src" "$WORK/src"
cp "$ROOT/scripts/qa/share-card-compare.html" "$WORK/index.html"
(cd "$ROOT" && bun build "$WORK/entry.ts" --outdir "$WORK/dist" --target browser \
  --loader .svg:dataurl --external '*.css' >/dev/null)
(cd "$WORK" && python3 -m http.server "$PORT" >/dev/null 2>&1 & echo $! > "$WORK/server.pid")
trap 'kill "$(cat "$WORK/server.pid")" 2>/dev/null || true' EXIT
sleep 1
PORT="$PORT" OUT="$OUT" ROOT="$ROOT" node "$ROOT/scripts/qa/share-card-compare.shot.mjs"
echo "wrote $OUT/compare.png and $OUT/share-*.png"
