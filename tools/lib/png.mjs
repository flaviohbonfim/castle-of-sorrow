/**
 * Minimal PNG codec — no dependencies, just node:zlib.
 *
 * Decodes the 8-bit non-interlaced subset (grayscale, RGB, palette, and both
 * alpha variants) into straight RGBA, and encodes RGBA back out. That covers
 * everything SpriteCook returns and everything we hand-author; anything else
 * fails loudly rather than silently producing garbage.
 */
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** @returns {{width:number, height:number, data:Uint8Array}} data is RGBA, 4 bytes/px. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG file");

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];

  let pos = 8;
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth} (need 8)`);
  if (interlace !== 0) throw new Error("interlaced PNG is not supported");
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unsupported color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const lines = new Uint8Array(height * stride);

  // Undo per-scanline filtering.
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[src++];
      const a = x >= channels ? lines[row + x - channels] : 0;
      const b = y > 0 ? lines[prev + x] : 0;
      const c = y > 0 && x >= channels ? lines[prev + x - channels] : 0;
      let out;
      switch (filter) {
        case 0:
          out = value;
          break;
        case 1:
          out = value + a;
          break;
        case 2:
          out = value + b;
          break;
        case 3:
          out = value + ((a + b) >> 1);
          break;
        case 4:
          out = value + paeth(a, b, c);
          break;
        default:
          throw new Error(`unknown filter type ${filter} on row ${y}`);
      }
      lines[row + x] = out & 0xff;
    }
  }

  // Normalise to RGBA.
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, px = 0; px < width * height; px++) {
    const s = px * channels;
    let r;
    let g;
    let b;
    let a = 255;
    if (colorType === 0) {
      r = g = b = lines[s];
      if (transparency && transparency.readUInt16BE(0) === lines[s]) a = 0;
    } else if (colorType === 2) {
      [r, g, b] = [lines[s], lines[s + 1], lines[s + 2]];
      if (
        transparency &&
        transparency.readUInt16BE(0) === r &&
        transparency.readUInt16BE(2) === g &&
        transparency.readUInt16BE(4) === b
      ) {
        a = 0;
      }
    } else if (colorType === 3) {
      if (!palette) throw new Error("indexed PNG without PLTE");
      const idx = lines[s];
      [r, g, b] = [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]];
      if (transparency && idx < transparency.length) a = transparency[idx];
    } else if (colorType === 4) {
      r = g = b = lines[s];
      a = lines[s + 1];
    } else {
      [r, g, b, a] = [lines[s], lines[s + 1], lines[s + 2], lines[s + 3]];
    }
    data[i++] = r;
    data[i++] = g;
    data[i++] = b;
    data[i++] = a;
  }

  return { width, height, data };
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encode straight RGBA as a color-type-6 PNG. */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none — pixel art compresses fine anyway
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Blit a rectangle between two RGBA buffers, clipping at the destination edges. */
export function blit(src, dst, rect) {
  const { sx, sy, sw, sh, dx, dy } = rect;
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const s = ((sy + y) * src.width + (sx + x)) * 4;
      const d = (ty * dst.width + tx) * 4;
      dst.data[d] = src.data[s];
      dst.data[d + 1] = src.data[s + 1];
      dst.data[d + 2] = src.data[s + 2];
      dst.data[d + 3] = src.data[s + 3];
    }
  }
}

export function makeImage(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Bounding box of opaque pixels, or null when the image is empty. */
export function opaqueBounds(img, x0 = 0, y0 = 0, w = img.width, h = img.height) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
