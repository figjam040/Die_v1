// ============================================================
// TESTS/PNGDIFF.JS — BUILD (KI-6 screenshot baseline)
// A minimal, dependency-free PNG decoder + pixel differ. No image library
// is installed in this project (package.json lists only `playwright`), and
// this project's own convention is plain Node scripts with nothing added
// beyond what's already there — so this decodes PNG chunks by hand and
// leans on Node's built-in zlib for the DEFLATE inflate step, rather than
// adding pixelmatch/pngjs/jimp/sharp as a new dependency for one tool.
// Handles the PNG shapes Chromium/Playwright screenshots actually produce
// (8-bit depth, no interlace, colour types 0/2/3/4/6) — anything else
// (16-bit depth, interlaced) throws a clear error rather than silently
// misreading pixels.
// ============================================================

const fs = require('fs');
const zlib = require('zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readChunks(buf) {
  if (!buf.slice(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG file (bad signature)');
  }
  const chunks = [];
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.slice(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 8 + length + 4; // length + type + data + crc
  }
  return chunks;
}

const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Decodes a PNG file into { width, height, channels, pixels } where pixels
// is a flat Buffer of unfiltered samples, row-major, `channels` samples
// per pixel (RGBA=4, RGB=3, grey=1, grey+alpha=2 — palette (colorType 3)
// is decoded to raw index values, 1 channel, since these screenshots never
// use a palette in practice and a full PLTE lookup isn't needed for a
// pixel-difference count).
function decodePNG(filePath) {
  const buf = fs.readFileSync(filePath);
  const chunks = readChunks(buf);
  const ihdr = chunks.find(function(c) { return c.type === 'IHDR'; });
  if (!ihdr) throw new Error('no IHDR chunk: ' + filePath);
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data.readUInt8(8);
  const colorType = ihdr.data.readUInt8(9);
  const interlace = ihdr.data.readUInt8(12);
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth + ' in ' + filePath + ' (only 8-bit handled)');
  if (interlace !== 0) throw new Error('interlaced PNG not supported: ' + filePath);
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (!channels) throw new Error('unsupported color type ' + colorType + ' in ' + filePath);

  const idatParts = chunks.filter(function(c) { return c.type === 'IDAT'; }).map(function(c) { return c.data; });
  const compressed = Buffer.concat(idatParts);
  const raw = zlib.inflateSync(compressed);

  const bytesPerPixel = channels; // bitDepth 8 -> 1 byte per channel
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);

  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset]; rawOffset += 1;
    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOffset + x];
      const a = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const b = y > 0 ? pixels[prevRowStart + x] : 0;
      const c = (y > 0 && x >= bytesPerPixel) ? pixels[prevRowStart + x - bytesPerPixel] : 0;
      let value;
      if (filterType === 0) value = rawByte;
      else if (filterType === 1) value = (rawByte + a) & 0xff;
      else if (filterType === 2) value = (rawByte + b) & 0xff;
      else if (filterType === 3) value = (rawByte + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) value = (rawByte + paeth(a, b, c)) & 0xff;
      else throw new Error('unsupported PNG filter type ' + filterType + ' in ' + filePath);
      pixels[rowStart + x] = value;
    }
    rawOffset += stride;
  }

  return { width: width, height: height, channels: channels, pixels: pixels };
}

// Counts pixels that differ by more than `threshold` in any channel
// between two same-size decoded images (a small per-channel threshold,
// default 10/255, absorbs harmless anti-aliasing/sub-pixel jitter between
// two runs of the identical page rather than flagging every edge pixel).
function diffPNGs(pathA, pathB, threshold) {
  const t = threshold === undefined ? 10 : threshold;
  const imgA = decodePNG(pathA);
  const imgB = decodePNG(pathB);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return { comparable: false, reason: 'size mismatch: ' + imgA.width + 'x' + imgA.height + ' vs ' + imgB.width + 'x' + imgB.height, changedPixels: null, totalPixels: null };
  }
  if (imgA.channels !== imgB.channels) {
    return { comparable: false, reason: 'channel-count mismatch: ' + imgA.channels + ' vs ' + imgB.channels, changedPixels: null, totalPixels: null };
  }
  const totalPixels = imgA.width * imgA.height;
  let changed = 0;
  const channels = imgA.channels;
  for (let p = 0; p < totalPixels; p++) {
    const base = p * channels;
    let differs = false;
    for (let ch = 0; ch < channels; ch++) {
      if (Math.abs(imgA.pixels[base + ch] - imgB.pixels[base + ch]) > t) { differs = true; break; }
    }
    if (differs) changed++;
  }
  return { comparable: true, reason: null, changedPixels: changed, totalPixels: totalPixels };
}

// Same changed-pixel rule as diffPNGs(), plus the changed pixels grouped
// into bounding boxes: the picture is cut into `cell`-pixel cells, cells
// holding a changed pixel join when within `gapCells` of each other, and each
// group reports the tight box of its own changed pixels, largest first.
function diffBoxes(pathA, pathB, threshold, cell, gapCells) {
  const t = threshold === undefined ? 10 : threshold;
  const size = cell || 8;
  const gap = gapCells === undefined ? 2 : gapCells;
  const imgA = decodePNG(pathA);
  const imgB = decodePNG(pathB);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height || imgA.channels !== imgB.channels) {
    return { comparable: false, reason: 'size or channel mismatch: ' + imgA.width + 'x' + imgA.height + 'x' + imgA.channels + ' vs ' + imgB.width + 'x' + imgB.height + 'x' + imgB.channels, changedPixels: null, totalPixels: null, boxes: [] };
  }
  const w = imgA.width;
  const h = imgA.height;
  const channels = imgA.channels;
  const cols = Math.ceil(w / size);
  const rows = Math.ceil(h / size);
  const cells = new Map();
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = (y * w + x) * channels;
      let differs = false;
      for (let ch = 0; ch < channels; ch++) {
        if (Math.abs(imgA.pixels[base + ch] - imgB.pixels[base + ch]) > t) { differs = true; break; }
      }
      if (!differs) continue;
      changed++;
      const key = Math.floor(y / size) * cols + Math.floor(x / size);
      let c = cells.get(key);
      if (!c) { c = { x0: x, y0: y, x1: x, y1: y, n: 0 }; cells.set(key, c); }
      c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      c.n++;
    }
  }
  const seen = new Set();
  const boxes = [];
  cells.forEach(function(start, startKey) {
    if (seen.has(startKey)) return;
    seen.add(startKey);
    const box = { x0: start.x0, y0: start.y0, x1: start.x1, y1: start.y1, pixels: start.n };
    const queue = [startKey];
    while (queue.length) {
      const key = queue.pop();
      const cy = Math.floor(key / cols);
      const cx = key % cols;
      for (let dy = -gap; dy <= gap; dy++) {
        for (let dx = -gap; dx <= gap; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const nk = ny * cols + nx;
          if (seen.has(nk) || !cells.has(nk)) continue;
          seen.add(nk);
          const c = cells.get(nk);
          box.x0 = Math.min(box.x0, c.x0); box.x1 = Math.max(box.x1, c.x1);
          box.y0 = Math.min(box.y0, c.y0); box.y1 = Math.max(box.y1, c.y1);
          box.pixels += c.n;
          queue.push(nk);
        }
      }
    }
    boxes.push({ x: box.x0, y: box.y0, w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1, pixels: box.pixels });
  });
  boxes.sort(function(a, b) { return b.pixels - a.pixels; });
  return { comparable: true, reason: null, changedPixels: changed, totalPixels: w * h, boxes: boxes };
}

module.exports = { decodePNG, diffPNGs, diffBoxes };
