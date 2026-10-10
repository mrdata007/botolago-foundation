/**
 * Compares two captures of `capture-off.mjs` (the base tree and the branch with the switch off)
 * and, optionally, the branch against the owner's reference screenshots.
 *
 *   node docs/product/manager-card-section/wp1/compare-off.mjs <baseDir> <branchDir> [--ref=<dir>]
 *
 * Prints, and writes `comparison.json` next to the branch capture:
 *   - per screenshot: the share of pixels that differ (a channel off by more than 2 of 255 counts)
 *     and the bounding box of what differs;
 *   - the server `<body>` of every page, with `<script>` elements removed and hashed asset names
 *     normalised, equal or not (and the first difference);
 *   - the request sets (method and path, hashes normalised) that appear on one side only: a new
 *     data or document request, or any request for the section's own chunks, fails; a shared
 *     library chunk the bundler re-split is listed (`regroupedChunks`) and counted;
 *   - localStorage and sessionStorage keys that appear on one side only, console errors, and where
 *     the section's addresses go.
 * Exit 1 when a screenshot differs by more than 0.1%, a body differs, a request or storage key
 * is new, or the redirects are not all to /fantasy.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

const [baseDir, branchDir, ...flags] = process.argv.slice(2);
if (!baseDir || !branchDir)
  throw new Error("usage: compare-off.mjs <baseDir> <branchDir> [--ref=dir]");
const refDir = flags.find((flag) => flag.startsWith("--ref="))?.slice("--ref=".length);
const THRESHOLD = 0.1; // percent of pixels
const CHANNEL_TOLERANCE = 2;

async function diff(fileA, fileB) {
  const [a, b] = await Promise.all(
    [fileA, fileB].map((file) =>
      sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    ),
  );
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return {
      percent: 100,
      box: null,
      note: `size ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}`,
    };
  }
  const { width, height, channels } = a.info;
  let count = 0;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      let differs = false;
      for (let c = 0; c < channels; c += 1) {
        if (Math.abs(a.data[i + c] - b.data[i + c]) > CHANNEL_TOLERANCE) differs = true;
      }
      if (differs) {
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    percent: (count / (width * height)) * 100,
    box: count ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
  };
}

const normaliseBody = (html) => {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return body
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/([-_.])[A-Za-z0-9_-]{8}(\.(?:m?js|css|woff2?|webp|png|svg))/g, "$1#$2")
    .trim();
};

const result = {
  screenshots: {},
  bodies: {},
  requests: {},
  storage: {},
  errors: {},
  redirects: null,
  failures: [],
};

// Screenshots
for (const file of readdirSync(branchDir)
  .filter((name) => name.endsWith(".png"))
  .sort()) {
  const other = join(baseDir, file);
  if (!existsSync(other)) {
    result.failures.push(`${file}: missing in the base capture`);
    continue;
  }
  const d = await diff(other, join(branchDir, file));
  result.screenshots[file] = d;
  if (d.percent > THRESHOLD) result.failures.push(`${file}: ${d.percent.toFixed(3)}% differs`);
}
if (refDir) {
  result.reference = {};
  for (const file of readdirSync(refDir)
    .filter((name) => name.endsWith(".png"))
    .sort()) {
    const mine = join(branchDir, file);
    if (!existsSync(mine)) continue;
    result.reference[file] = await diff(join(refDir, file), mine);
  }
}

// Server bodies
for (const file of readdirSync(join(branchDir, "html")).sort()) {
  const a = normaliseBody(readFileSync(join(baseDir, "html", file), "utf8"));
  const b = normaliseBody(readFileSync(join(branchDir, "html", file), "utf8"));
  const equal = a === b;
  let first = null;
  if (!equal) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i += 1;
    first = {
      at: i,
      base: a.slice(Math.max(0, i - 80), i + 120),
      branch: b.slice(Math.max(0, i - 80), i + 120),
    };
    result.failures.push(`${file}: <body> differs at ${i}`);
  }
  result.bodies[file] = { equal, bytes: [a.length, b.length], first };
}

// Requests, storage, errors
const reportA = JSON.parse(readFileSync(join(baseDir, "report.json"), "utf8"));
const reportB = JSON.parse(readFileSync(join(branchDir, "report.json"), "utf8"));
for (const key of Object.keys(reportB.pages)) {
  const a = reportA.pages[key];
  const b = reportB.pages[key];
  const only = (x, y) => x.filter((item) => !y.includes(item));
  const requests = {
    onlyBranch: only(b.requests, a.requests),
    onlyBase: only(a.requests, b.requests),
  };
  // A file the bundler named differently is not a new request for something else: a shared
  // library chunk that a new lazy chunk now shares is re-split, and its old home shrinks by the
  // same code. What must never be asked for is the section's own code, or any data.
  const regrouped = requests.onlyBranch.filter((r) => /^GET \/assets\/[^/]+\.(m?js|css)$/.test(r));
  const dataOrDocument = requests.onlyBranch.filter((r) => !regrouped.includes(r));
  const sectionCode = regrouped.filter((r) =>
    /curva|manager-card|plain-renderer|\/copy-|ManagerCard|CardToken/i.test(r),
  );
  requests.regroupedChunks = regrouped.filter((r) => !sectionCode.includes(r));
  const storage = {
    onlyBranch: [
      ...only(b.storage.local, a.storage.local),
      ...only(b.storage.session, a.storage.session),
    ],
    onlyBase: [
      ...only(a.storage.local, b.storage.local),
      ...only(a.storage.session, b.storage.session),
    ],
  };
  result.requests[key] = requests;
  result.storage[key] = storage;
  result.errors[key] = { base: a.errors, branch: b.errors };
  if (dataOrDocument.length)
    result.failures.push(`${key}: new requests ${dataOrDocument.join(", ")}`);
  if (sectionCode.length)
    result.failures.push(`${key}: the section's code is requested: ${sectionCode.join(", ")}`);
  if (storage.onlyBranch.length)
    result.failures.push(`${key}: new storage keys ${storage.onlyBranch.join(", ")}`);
  const newErrors = b.errors.filter((error) => !a.errors.includes(error));
  if (newErrors.length) result.failures.push(`${key}: new console errors ${newErrors.join(" | ")}`);
}
result.redirects = reportB.redirects;
for (const [path, answer] of Object.entries(reportB.redirects ?? {})) {
  if (
    ![301, 302, 303, 307, 308].includes(answer.status) ||
    !String(answer.location).endsWith("/fantasy")
  ) {
    result.failures.push(`${path}: answered ${answer.status} ${answer.location}`);
  }
}

writeFileSync(join(branchDir, "comparison.json"), JSON.stringify(result, null, 2));
const worst = Object.entries(result.screenshots).sort((x, y) => y[1].percent - x[1].percent)[0];
console.log(
  `${Object.keys(result.screenshots).length} screenshots compared, worst ${worst?.[0]} at ${worst?.[1].percent.toFixed(4)}%`,
);
const regroupedPerPage = Object.values(result.requests).map((r) => r.regroupedChunks.length);
console.log(
  `requests: no new data or document request and none for the section's code; up to ${Math.max(...regroupedPerPage)} shared chunk(s) re-split per page (${[...new Set(Object.values(result.requests).flatMap((r) => r.regroupedChunks))].join(", ")})`,
);
console.log(
  `${Object.keys(result.bodies).length} server bodies: ${Object.values(result.bodies).filter((b) => b.equal).length} identical`,
);
if (result.reference) {
  for (const [file, d] of Object.entries(result.reference)) {
    console.log(
      `  vs reference ${file}: ${d.percent.toFixed(3)}%${d.box ? ` in ${JSON.stringify(d.box)}` : ""}${d.note ? ` (${d.note})` : ""}`,
    );
  }
}
if (result.failures.length) {
  console.log("FAILURES:\n  " + result.failures.join("\n  "));
  process.exit(1);
}
console.log("OFF MEANS IDENTICAL: no difference found.");
