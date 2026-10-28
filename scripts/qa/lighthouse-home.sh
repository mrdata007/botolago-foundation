#!/usr/bin/env bash
# Lighthouse at phone settings (performance + accessibility).
# Usage: scripts/qa/lighthouse-home.sh <url> <out-dir>
# Needs the `lighthouse` CLI on PATH (npx lighthouse) and CHROME_PATH set.
set -euo pipefail
url="${1:-http://127.0.0.1:4173/}"
out="${2:-audit/tmp}"
mkdir -p "$out"
lighthouse "$url" \
  --form-factor=mobile \
  --only-categories=performance,accessibility \
  --chrome-flags="--headless=new --no-sandbox" \
  --output=json --output=html \
  --output-path="$out/lighthouse" \
  --quiet
node -e '
const r = require(process.argv[1]);
const a = r.audits;
const reqs = a["network-requests"].details.items;
const js = reqs.filter((i) => i.resourceType === "Script");
console.log(JSON.stringify({
  performance: Math.round(r.categories.performance.score * 100),
  accessibility: Math.round(r.categories.accessibility.score * 100),
  requests: reqs.length,
  jsFiles: js.length,
  jsTransferKB: Math.round(js.reduce((s, i) => s + (i.transferSize || 0), 0) / 1024),
  fcp: a["first-contentful-paint"].displayValue,
  lcp: a["largest-contentful-paint"].displayValue,
  tbt: a["total-blocking-time"].displayValue,
  cls: a["cumulative-layout-shift"].displayValue,
  speedIndex: a["speed-index"].displayValue,
  interactive: a["interactive"].displayValue,
}, null, 2));
' "$(cd "$out" && pwd)/lighthouse.report.json"
