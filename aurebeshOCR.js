/**
 * Local Aurebesh OCR using template matching
 * 
 * Strategy:
 * 1. Binarize image (isolate bright text from dark background)
 * 2. Find text rows via horizontal projection
 * 3. Segment characters within rows
 * 4. Template match each character against reference glyphs
 */

const sharp = require('sharp');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');
const { createCanvas } = require('canvas');
const path = require('path');
const fs = require('fs');

// Reference glyph size for template matching
const REF_SIZE = 32;
const REF_DIR = path.join(__dirname, 'ref_glyphs');

// Use the same glyph drawing code from imageGenerator
const GLYPH_DRAW = {
  'A': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x+s*0.5,y); ctx.lineTo(x,y+s); ctx.lineTo(x+s,y+s); ctx.closePath(); ctx.stroke(); },
  'B': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+s); ctx.lineTo(x+s*0.7,y+s); ctx.lineTo(x+s*0.7,y+s*0.55); ctx.lineTo(x+s*0.3,y+s*0.5); ctx.lineTo(x+s*0.7,y+s*0.45); ctx.lineTo(x+s*0.7,y); ctx.closePath(); ctx.stroke(); },
  'C': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x+s*0.8,y); ctx.lineTo(x+s*0.2,y+s*0.5); ctx.lineTo(x+s*0.8,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.4,y+s*0.5); ctx.lineTo(x+s,y+s*0.5); ctx.stroke(); },
  'D': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x+s*0.5,y); ctx.lineTo(x+s,y+s*0.5); ctx.lineTo(x+s*0.5,y+s); ctx.lineTo(x,y+s*0.5); ctx.closePath(); ctx.stroke(); },
  'E': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x+s*0.5,y); ctx.lineTo(x+s*0.5,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.2,y+s*0.3); ctx.lineTo(x+s*0.5,y+s*0.5); ctx.lineTo(x+s*0.2,y+s*0.7); ctx.stroke(); },
  'F': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s*0.8,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y+s*0.4); ctx.lineTo(x+s*0.6,y+s*0.4); ctx.lineTo(x+s*0.6,y+s); ctx.stroke(); },
  'G': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x+s*0.8,y); ctx.lineTo(x+s*0.2,y); ctx.lineTo(x+s*0.2,y+s*0.6); ctx.lineTo(x+s*0.8,y+s*0.6); ctx.lineTo(x+s*0.8,y+s); ctx.lineTo(x+s*0.2,y+s); ctx.stroke(); },
  'H': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.8,y); ctx.lineTo(x+s*0.8,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y+s*0.35); ctx.lineTo(x+s*0.8,y+s*0.65); ctx.stroke(); },
  'I': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x+s*0.5,y); ctx.lineTo(x+s*0.5,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.2,y); ctx.lineTo(x+s*0.8,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.2,y+s); ctx.lineTo(x+s*0.8,y+s); ctx.stroke(); },
  'J': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x+s*0.7,y); ctx.lineTo(x+s*0.7,y+s*0.7); ctx.lineTo(x+s*0.3,y+s); ctx.lineTo(x,y+s*0.7); ctx.stroke(); },
  'K': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.8,y); ctx.lineTo(x,y+s*0.5); ctx.lineTo(x+s*0.8,y+s); ctx.stroke(); },
  'L': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s*0.5,y+s); ctx.lineTo(x+s,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.5,y+s*0.4); ctx.lineTo(x+s*0.5,y+s); ctx.stroke(); },
  'M': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y+s); ctx.lineTo(x,y); ctx.lineTo(x+s*0.4,y+s*0.6); ctx.lineTo(x+s*0.8,y); ctx.lineTo(x+s*0.8,y+s); ctx.stroke(); },
  'N': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y+s); ctx.lineTo(x,y); ctx.lineTo(x+s*0.8,y+s); ctx.lineTo(x+s*0.8,y); ctx.stroke(); },
  'O': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x+s*0.3,y); ctx.lineTo(x+s*0.7,y); ctx.lineTo(x+s,y+s*0.5); ctx.lineTo(x+s*0.7,y+s); ctx.lineTo(x+s*0.3,y+s); ctx.lineTo(x,y+s*0.5); ctx.closePath(); ctx.stroke(); },
  'P': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s*0.8,y+s*0.25); ctx.lineTo(x,y+s*0.5); ctx.closePath(); ctx.stroke(); },
  'Q': (ctx, x, y, s) => { ctx.beginPath(); ctx.arc(x+s*0.4,y+s*0.4,s*0.35,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.6,y+s*0.6); ctx.lineTo(x+s,y+s); ctx.stroke(); },
  'R': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s*0.7,y); ctx.lineTo(x+s*0.7,y+s*0.4); ctx.lineTo(x,y+s*0.4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.3,y+s*0.4); ctx.lineTo(x+s*0.8,y+s); ctx.stroke(); },
  'S': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x+s*0.8,y); ctx.lineTo(x+s*0.3,y+s*0.45); ctx.lineTo(x+s*0.7,y+s*0.55); ctx.lineTo(x+s*0.2,y+s); ctx.stroke(); },
  'T': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.5,y); ctx.lineTo(x+s*0.5,y+s*0.7); ctx.lineTo(x+s*0.2,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.5,y+s*0.7); ctx.lineTo(x+s*0.8,y+s); ctx.stroke(); },
  'U': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+s*0.7); ctx.lineTo(x+s*0.5,y+s); ctx.lineTo(x+s,y+s*0.7); ctx.lineTo(x+s,y); ctx.stroke(); },
  'V': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s*0.5,y+s); ctx.lineTo(x+s,y); ctx.stroke(); },
  'W': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s*0.25,y+s); ctx.lineTo(x+s*0.5,y+s*0.4); ctx.lineTo(x+s*0.75,y+s); ctx.lineTo(x+s,y); ctx.stroke(); },
  'X': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s,y+s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s,y); ctx.lineTo(x,y+s); ctx.stroke(); ctx.beginPath(); ctx.arc(x+s*0.5,y+s*0.5,s*0.15,0,Math.PI*2); ctx.stroke(); },
  'Y': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s*0.5,y+s*0.5); ctx.lineTo(x+s,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+s*0.5,y+s*0.5); ctx.lineTo(x+s*0.5,y+s); ctx.stroke(); },
  'Z': (ctx, x, y, s) => { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s,y); ctx.lineTo(x,y+s); ctx.lineTo(x+s,y+s); ctx.stroke(); },
};

/**
 * Generate reference glyph images for template matching.
 * Creates white-on-black glyph images at REF_SIZE x REF_SIZE.
 */
function generateReferenceGlyphs() {
  if (!fs.existsSync(REF_DIR)) {
    fs.mkdirSync(REF_DIR, { recursive: true });
  }

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of letters) {
    const filePath = path.join(REF_DIR, `${letter}.png`);
    if (fs.existsSync(filePath)) continue; // Already generated

    const canvas = createCanvas(REF_SIZE, REF_SIZE);
    const ctx = canvas.getContext('2d');

    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, REF_SIZE, REF_SIZE);

    // White glyph with thick stroke
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pad = 3;
    const drawSize = REF_SIZE - pad * 2;
    if (GLYPH_DRAW[letter]) {
      GLYPH_DRAW[letter](ctx, pad, pad, drawSize);
    }

    const buf = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buf);
  }

  console.log('   ✅ Reference glyphs generated');
}

/**
 * Load reference glyph raw pixel data for comparison
 */
let _refCache = null;
function loadReferenceGlyphs() {
  if (_refCache) return _refCache;

  generateReferenceGlyphs();

  _refCache = {};
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of letters) {
    const filePath = path.join(REF_DIR, `${letter}.png`);
    const data = fs.readFileSync(filePath);
    const png = PNG.sync.read(data);
    _refCache[letter] = png;
  }
  return _refCache;
}

/**
 * Compare a candidate character image against all references.
 * Returns the best matching letter and confidence score.
 */
function matchCharacter(candidatePng) {
  const refs = loadReferenceGlyphs();
  let bestLetter = '?';
  let bestScore = Infinity;

  for (const [letter, refPng] of Object.entries(refs)) {
    const numPixels = REF_SIZE * REF_SIZE;
    const diff = pixelmatch(
      candidatePng.data,
      refPng.data,
      null,
      REF_SIZE,
      REF_SIZE,
      { threshold: 0.3 }
    );
    const score = diff / numPixels;
    if (score < bestScore) {
      bestScore = score;
      bestLetter = letter;
    }
  }

  return { letter: bestLetter, confidence: 1 - bestScore };
}

/**
 * Main OCR pipeline: extract text from an image buffer containing Aurebesh.
 * 
 * @param {Buffer} imageBuffer - PNG/JPEG image buffer
 * @returns {Promise<{lines: string[], raw: {row: number, chars: {letter: string, confidence: number}[]}[]}>}
 */
async function readAurebeshLocal(imageBuffer) {
  // Step 1: Load and binarize the image — isolate bright text
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  // Extract the image as raw RGBA, boosting red/orange channel (LED text)
  const rawBuf = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Binarize: a pixel is "text" if its brightness in the red channel is high
  // (the Star Tours board uses red/orange LED characters)
  const binaryRows = [];
  const binaryData = Buffer.alloc(width * height);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = rawBuf[idx];
      const g = rawBuf[idx + 1];
      const b = rawBuf[idx + 2];

      // Detect bright pixels — red-ish or orange-ish or white text
      const brightness = Math.max(r, g, b);
      const isText = brightness > 120 && (r > 80 || g > 80);

      binaryData[y * width + x] = isText ? 255 : 0;
      if (isText) rowSum++;
    }
    binaryRows.push(rowSum);
  }

  // Step 2: Find text rows via horizontal projection
  const rowThreshold = width * 0.02; // At least 2% of pixels lit = text row
  const textRows = findTextBands(binaryRows, rowThreshold, 8);

  if (textRows.length === 0) {
    return { lines: [], raw: [], error: 'No text rows detected' };
  }

  console.log(`   📊 Found ${textRows.length} text rows`);

  // Step 3: For each text row, find character columns
  const results = [];
  const allLines = [];

  for (let ri = 0; ri < textRows.length; ri++) {
    const { start: rowStart, end: rowEnd } = textRows[ri];
    const rowHeight = rowEnd - rowStart;

    // Compute vertical projection for this row
    const colSums = new Array(width).fill(0);
    for (let y = rowStart; y < rowEnd; y++) {
      for (let x = 0; x < width; x++) {
        if (binaryData[y * width + x] > 0) colSums[x]++;
      }
    }

    // Find character columns
    const colThreshold = rowHeight * 0.05;
    const charCols = findTextBands(colSums, colThreshold, 2);

    if (charCols.length === 0) continue;

    // Step 4: Extract and match each character
    const rowChars = [];
    let lineStr = '';
    let lastEnd = 0;

    for (const col of charCols) {
      // Detect spaces (gap > 1.5x average character width)
      const avgCharWidth = charCols.reduce((s, c) => s + (c.end - c.start), 0) / charCols.length;
      if (lastEnd > 0 && (col.start - lastEnd) > avgCharWidth * 1.2) {
        lineStr += ' ';
      }
      lastEnd = col.end;

      const charWidth = col.end - col.start;
      const charHeight = rowHeight;

      // Extract character region and resize to REF_SIZE x REF_SIZE
      try {
        const charBuf = await extractRegion(
          binaryData, width, height,
          col.start, rowStart, charWidth, charHeight
        );

        const resized = await sharp(charBuf, { raw: { width: charWidth, height: charHeight, channels: 1 } })
          .resize(REF_SIZE, REF_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
          .png()
          .toBuffer();

        const candidatePng = PNG.sync.read(resized);
        const { letter, confidence } = matchCharacter(candidatePng);

        // Only accept if confidence is above threshold
        if (confidence > 0.3) {
          rowChars.push({ letter, confidence });
          lineStr += letter;
        } else {
          rowChars.push({ letter: '?', confidence });
          lineStr += '?';
        }
      } catch (err) {
        rowChars.push({ letter: '?', confidence: 0 });
        lineStr += '?';
      }
    }

    if (lineStr.trim()) {
      results.push({ row: ri, chars: rowChars });
      allLines.push(lineStr.trim());
    }
  }

  return { lines: allLines, raw: results };
}

/**
 * Find contiguous bands of values above threshold
 */
function findTextBands(projection, threshold, minSize) {
  const bands = [];
  let inBand = false;
  let start = 0;

  for (let i = 0; i < projection.length; i++) {
    if (projection[i] >= threshold && !inBand) {
      inBand = true;
      start = i;
    } else if (projection[i] < threshold && inBand) {
      inBand = false;
      if (i - start >= minSize) {
        bands.push({ start, end: i });
      }
    }
  }
  if (inBand && projection.length - start >= minSize) {
    bands.push({ start, end: projection.length });
  }
  return bands;
}

/**
 * Extract a region from the binary buffer as a single-channel buffer
 */
async function extractRegion(binaryData, fullWidth, fullHeight, x, y, w, h) {
  const buf = Buffer.alloc(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const srcY = y + row;
      const srcX = x + col;
      if (srcY < fullHeight && srcX < fullWidth) {
        buf[row * w + col] = binaryData[srcY * fullWidth + srcX];
      }
    }
  }
  return buf;
}

// Generate reference glyphs on module load
generateReferenceGlyphs();

module.exports = { readAurebeshLocal, generateReferenceGlyphs };
