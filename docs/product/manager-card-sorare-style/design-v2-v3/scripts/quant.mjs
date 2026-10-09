import sharp from "/home/user/botolago-app/node_modules/sharp/lib/index.js";
import fs from "node:fs";
for (const f of process.argv.slice(2)) {
  const b = await sharp(f)
    .png({ palette: true, quality: 92, effort: 10, compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(f, b);
  console.log(f, (b.length / 1e6).toFixed(2) + " MB");
}
