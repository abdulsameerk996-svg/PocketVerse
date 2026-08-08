/*
 * Generates PocketVerse's PWA / favicon PNGs into `public/icons/`.
 *
 * The repo deliberately ships no binary art (see docs/ASSETS.md) — every sprite
 * in the game is an emoji glyph. But a PWA cannot be installed without real
 * raster icons, and PWABuilder needs PNGs to package an APK. So rather than
 * commit opaque binaries or take an image dependency, the icons are drawn here
 * in maths and encoded straight to PNG with Node's built-in zlib.
 *
 *   node tools/icons/generate.js
 *
 * Re-run it after changing the palette in src/ui/theme/tokens.ts.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', '..', 'public', 'icons');

/* ------------------------------------------------------------------ PNG -- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixel buffer → PNG file buffer. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (width * 4 + 1);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- paint -- */

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// Straight from src/ui/theme/tokens.ts.
const VOID = hex('#08080F');
const DEEP = hex('#1A1030');
const VIOLET = hex('#7C5CFF');
const CYAN = hex('#22D3EE');
const GOLD = hex('#FFD166');

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Coverage of a shape edge across one pixel — cheap analytic antialiasing. */
const cover = (dist, halfWidth) => clamp01(0.5 - dist / Math.max(halfWidth, 1e-6));

/**
 * The mark: a violet→cyan ring with a gold satellite, on a deep radial ground.
 * Abstract on purpose — it reads at 16px in a browser tab and at 512px on a
 * home screen, and it owes nothing to a font being installed.
 *
 * `inset` shrinks the artwork toward the centre so the maskable variant keeps
 * everything inside Android's 80% safe zone.
 */
function draw(size, inset) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const unit = (size / 2) * inset;

  const ringR = unit * 0.62;
  const ringW = unit * 0.17;
  const satR = unit * 0.15;
  const satAngle = -Math.PI / 4;
  const satX = c + Math.cos(satAngle) * ringR;
  const satY = c + Math.sin(satAngle) * ringR;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);

      // Ground: radial fade, darker at the corners.
      const t = clamp01(d / (size * 0.62));
      let col = mix(DEEP, VOID, t * t);

      // Ring, hue rotating violet → cyan around its circumference.
      const ringA = cover(Math.abs(d - ringR) - ringW / 2, 1.2);
      if (ringA > 0) {
        const sweep = clamp01((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2));
        col = mix(col, mix(VIOLET, CYAN, sweep), ringA);
      }

      // Inner glow, so the middle is not a dead hole at small sizes.
      const glow = clamp01(1 - d / (ringR - ringW * 0.5)) ** 2.2;
      col = mix(col, VIOLET, glow * 0.35);

      // Satellite.
      const satA = cover(Math.hypot(x - satX, y - satY) - satR, 1.2);
      if (satA > 0) col = mix(col, GOLD, satA);

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(clamp01(col[0] / 255) * 255);
      rgba[i + 1] = Math.round(clamp01(col[1] / 255) * 255);
      rgba[i + 2] = Math.round(clamp01(col[2] / 255) * 255);
      rgba[i + 3] = 255; // opaque: maskable icons must fill their whole canvas
    }
  }
  return rgba;
}

/* ----------------------------------------------------------------- emit -- */

const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 0.88 },
  { file: 'icon-512.png', size: 512, inset: 0.88 },
  // Android masks aggressively — keep the mark inside the 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.62 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.86 },
  { file: 'favicon-32.png', size: 32, inset: 0.94 },
  { file: 'favicon-16.png', size: 16, inset: 1.0 },
];

fs.mkdirSync(OUT, { recursive: true });
for (const { file, size, inset } of TARGETS) {
  const png = encodePng(size, size, draw(size, inset));
  fs.writeFileSync(path.join(OUT, file), png);
  console.log(`  ${file.padEnd(26)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
console.log(`\nWrote ${TARGETS.length} icons to public/icons/`);
