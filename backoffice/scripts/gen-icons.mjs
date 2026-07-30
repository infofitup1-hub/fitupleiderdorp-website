// Generates placeholder PWA icons (solid FIT UP dark background with a lime
// rounded square + "F"). No external dependencies — encodes PNG via zlib.
// Run:  node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

const INK = [10, 10, 10];
const LIME = [190, 242, 100];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Simple 5x7 bitmap font for the letter "F".
const F = [
  "11111",
  "10000",
  "10000",
  "11110",
  "10000",
  "10000",
  "10000",
];

function drawLetterF(px, size, x0, y0, scale, color) {
  for (let ry = 0; ry < F.length; ry++) {
    for (let rx = 0; rx < F[ry].length; rx++) {
      if (F[ry][rx] !== "1") continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = x0 + rx * scale + dx;
          const y = y0 + ry * scale + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const idx = (y * size + x) * 3;
          px[idx] = color[0];
          px[idx + 1] = color[1];
          px[idx + 2] = color[2];
        }
      }
    }
  }
}

function makePng(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 3);
  // Background.
  for (let i = 0; i < size * size; i++) {
    px[i * 3] = INK[0];
    px[i * 3 + 1] = INK[1];
    px[i * 3 + 2] = INK[2];
  }
  // Lime rounded square (as a plain square; rounded corners omitted in the
  // placeholder). For maskable we keep more padding for the safe zone.
  const pad = maskable ? Math.round(size * 0.22) : Math.round(size * 0.16);
  const r = size - pad * 2;
  const radius = Math.round(r * 0.22);
  for (let y = pad; y < pad + r; y++) {
    for (let x = pad; x < pad + r; x++) {
      // rounded-corner test
      const lx = x - pad;
      const ly = y - pad;
      const inCorner =
        (lx < radius && ly < radius && (lx - radius) ** 2 + (ly - radius) ** 2 > radius ** 2) ||
        (lx > r - radius && ly < radius && (lx - (r - radius)) ** 2 + (ly - radius) ** 2 > radius ** 2) ||
        (lx < radius && ly > r - radius && (lx - radius) ** 2 + (ly - (r - radius)) ** 2 > radius ** 2) ||
        (lx > r - radius && ly > r - radius && (lx - (r - radius)) ** 2 + (ly - (r - radius)) ** 2 > radius ** 2);
      if (inCorner) continue;
      const idx = (y * size + x) * 3;
      px[idx] = LIME[0];
      px[idx + 1] = LIME[1];
      px[idx + 2] = LIME[2];
    }
  }
  // Black "F" centered in the lime square.
  const scale = Math.max(1, Math.round(r / 9));
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const gx = Math.round(pad + (r - glyphW) / 2);
  const gy = Math.round(pad + (r - glyphH) / 2);
  drawLetterF(px, size, gx, gy, scale, INK);

  // Build raw scanlines with filter byte 0.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

writeFileSync(join(OUT, "icon-192.png"), makePng(192));
writeFileSync(join(OUT, "icon-512.png"), makePng(512));
writeFileSync(join(OUT, "icon-maskable-512.png"), makePng(512, { maskable: true }));
console.log("Generated icons in", OUT);
