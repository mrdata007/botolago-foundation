// Real components/CSS with a fixture repository, never a production connection.
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import sharp from "sharp";
const root = new URL("../..", import.meta.url),
  output = new URL("../../test-results/match-visual-drafts/", import.meta.url);
await mkdir(output, { recursive: true });
const svg =
  '<svg width="588" height="736" xmlns="http://www.w3.org/2000/svg"><rect width="588" height="736" fill="#246e48"/><path d="M0 400H588M294 0V736" stroke="#bfe1cf" stroke-width="4"/><circle cx="294" cy="400" r="90" fill="none" stroke="#bfe1cf" stroke-width="4"/><rect x="20" y="20" width="60" height="60" fill="#fff"/><text x="294" y="150" text-anchor="middle" font-size="28" fill="#fff">Synthetic QA image</text><rect x="100" y="610" width="388" height="80" fill="#123b31"/><text x="294" y="663" text-anchor="middle" font-size="36" fill="#fff">FUS 1 : 1 RCA</text></svg>';
await sharp(Buffer.from(svg)).png().toFile(new URL("source.png", output).pathname);
await sharp({
  create: { width: 60, height: 40, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .png()
  .toFile(new URL("logo.png", output).pathname);
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--config", "tests/visual-drafts/vite.config.mjs"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
const ready = new Promise((resolve, reject) => {
  let buffer = "";
  const timer = setTimeout(() => reject(Error("QA server did not start")), 15000);
  server.on("exit", (code) => {
    clearTimeout(timer);
    reject(Error(`QA server exited (${code})`));
  });
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.includes("http://127.0.0.1:4390/")) {
        clearTimeout(timer);
        resolve();
      }
    });
});
try {
  await ready;
  await import("./verify.mjs");
} finally {
  server.kill("SIGTERM");
}
