// Read-only smoke-test evidence. Decode with Sharp independently of the Edge
// compositor and compare the normalized private original against its result.
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const [sourcePath, resultPath, ...coordinates] = process.argv.slice(2);
const [x, y, width, height] = coordinates.map(Number);
if (
  !sourcePath ||
  !resultPath ||
  coordinates.length !== 4 ||
  ![x, y, width, height].every(Number.isInteger) ||
  x < 0 ||
  y < 0 ||
  width < 1 ||
  height < 1
)
  throw Error(
    "Usage: bun scripts/editorial/check-held-match-visual.ts <private-source.png> <private-result.png> x y width height",
  );
async function decode(path: string) {
  const input = await readFile(path);
  if (input.length > 10 * 1024 * 1024) throw Error("Image exceeds the workflow byte limit");
  const image = sharp(input, { limitInputPixels: 1536 * 1536 });
  const metadata = await image.metadata();
  if (
    metadata.format !== "png" ||
    !metadata.width ||
    !metadata.height ||
    metadata.width > 1536 ||
    metadata.height > 1536
  )
    throw Error("Use the normalized PNG original and result from private Storage");
  return image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
const source = await decode(sourcePath),
  result = await decode(resultPath);
if (
  source.info.width !== result.info.width ||
  source.info.height !== result.info.height ||
  source.info.channels !== 4 ||
  result.info.channels !== 4
)
  throw Error("Original and result dimensions/channels differ");
const imageWidth = source.info.width,
  imageHeight = source.info.height;
if (
  x + width > imageWidth ||
  y + height > imageHeight ||
  width * height > (imageWidth * imageHeight) / 4
)
  throw Error("Rectangle is outside the workflow limits");
let changedInside = 0,
  changedOutside = 0;
for (let row = 0; row < imageHeight; row++)
  for (let column = 0; column < imageWidth; column++) {
    const at = (row * imageWidth + column) * 4;
    if (!source.data.subarray(at, at + 4).equals(result.data.subarray(at, at + 4))) {
      if (column >= x && column < x + width && row >= y && row < y + height) changedInside++;
      else changedOutside++;
    }
  }
console.log(
  JSON.stringify({
    status: changedOutside ? "protected_pixels_changed" : "protected_pixels_preserved",
    width: imageWidth,
    height: imageHeight,
    protectedPixels: imageWidth * imageHeight - width * height,
    changedInside,
    changedOutside,
  }),
);
if (changedOutside) process.exitCode = 1;
