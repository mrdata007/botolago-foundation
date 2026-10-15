// Lossless PNG codec shared by the private draft editor and its tests.
export const MAX_VISUAL_BYTES = 10 * 1024 * 1024;
export class MatchVisualError extends Error {}
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function concatenate(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c,
    pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
// Reject palette, interlaced, animated and high-bit-depth PNGs. Inputs are
// explicitly prepared as sRGB 8-bit RGB/RGBA canvases at the final dimensions.
export async function decodeVisualPng(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const fail = () => {
    throw new MatchVisualError("invalid_visual_png");
  };
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 1536)) fail();
  if (
    bytes.length > MAX_VISUAL_BYTES ||
    bytes.length < 57 ||
    !SIGNATURE.every((b, i) => bytes[i] === b)
  )
    fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8,
    channels = 0,
    ended = false,
    dataEnded = false;
  const compressed: Uint8Array[] = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail();
    const length = view.getUint32(offset),
      end = offset + length + 12;
    if (end > bytes.length) fail();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)
    )
      fail();
    if (offset === 8) {
      if (
        type !== "IHDR" ||
        length !== 13 ||
        view.getUint32(16) !== width ||
        view.getUint32(20) !== height
      )
        throw new MatchVisualError("invalid_visual_dimensions");
      channels = bytes[25] === 2 ? 3 : bytes[25] === 6 ? 4 : 0;
      if (!channels || bytes[24] !== 8 || bytes[26] || bytes[27] || bytes[28]) fail();
    } else if (type === "IDAT") {
      if (dataEnded) fail();
      compressed.push(bytes.subarray(offset + 8, end - 4));
    } else if (type === "IEND") {
      if (length || !compressed.length || end !== bytes.length) fail();
      ended = true;
    } else {
      // sRGB/gAMA/text metadata do not change stored channel values. Other
      // colour spaces and animation would make pixel identity ambiguous.
      if (!["sRGB", "gAMA", "pHYs", "tEXt", "iTXt", "zTXt"].includes(type)) fail();
      if (type === "sRGB" && (length !== 1 || bytes[offset + 8] > 3)) fail();
      if (type === "gAMA" && (length !== 4 || view.getUint32(offset + 8) !== 45455)) fail();
      if (compressed.length) dataEnded = true;
    }
    offset = end;
  }
  if (!ended) fail();
  const rowBytes = width * channels,
    stride = rowBytes + 1;
  const raster = new Uint8Array(height * stride);
  const reader = new Blob(compressed as BlobPart[])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  let read = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (read + value.length > raster.length) fail();
      raster.set(value, read);
      read += value.length;
    }
    if (read !== raster.length) fail();
  } catch {
    await reader.cancel().catch(() => {});
    fail();
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = y * stride + 1,
      filter = raster[start - 1];
    if (filter > 4) fail();
    for (let x = 0; x < rowBytes; x++) {
      const index = start + x,
        left = x >= channels ? raster[index - channels] : 0;
      const up = y ? raster[index - stride] : 0;
      const upperLeft = y && x >= channels ? raster[index - stride - channels] : 0;
      const prediction =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? Math.floor((left + up) / 2)
              : filter === 4
                ? paeth(left, up, upperLeft)
                : 0;
      raster[index] = (raster[index] + prediction) & 255;
    }
    for (let x = 0; x < width; x++) {
      const from = start + x * channels,
        to = (y * width + x) * 4;
      output[to] = raster[from];
      output[to + 1] = raster[from + 1];
      output[to + 2] = raster[from + 2];
      output[to + 3] = channels === 4 ? raster[from + 3] : 255;
    }
  }
  return output;
}
function chunk(type: string, body: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(body.length + 12),
    view = new DataView(bytes.buffer);
  view.setUint32(0, body.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(body, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, -4)));
  return bytes;
}
export async function encodeVisualPng(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (rgba.length !== width * height * 4) throw new MatchVisualError("invalid_visual_raster");
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const stride = 1 + width * 4,
    raster = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++)
    raster.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  const compressed = new Uint8Array(
    await new Response(
      new Blob([raster]).stream().pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer(),
  );
  const bytes = concatenate([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("sRGB", new Uint8Array([0])),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array()),
  ]);
  if (bytes.length > MAX_VISUAL_BYTES) throw new MatchVisualError("visual_too_large");
  return bytes;
}

// Hash decoded pixels and their dimensions, independent of PNG metadata or
// compression, so manual imports and feed retries identify the same original.
export async function visualSourceHash(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<string> {
  if (rgba.length !== width * height * 4) throw new MatchVisualError("invalid_visual_raster");
  const input = new Uint8Array(8 + rgba.length),
    view = new DataView(input.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  input.set(rgba, 8);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
