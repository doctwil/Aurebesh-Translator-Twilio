const { createCanvas, Image } = require('canvas');
const fs = require('fs');
const path = require('path');

// Glyph source rectangles [x, y, w, h] in chart.jpg — the same reference chart
// the image scanner sends to the vision model, so rendered glyphs match it exactly.
const GLYPH_BOXES = {
  A: [41, 180, 102, 60],  B: [280, 180, 96, 60],  C: [522, 180, 53, 60],  D: [724, 180, 74, 60],
  E: [934, 180, 92, 60],  F: [1168, 180, 92, 60], G: [1405, 180, 90, 60], H: [1634, 180, 98, 60],
  I: [87, 396, 33, 60],   J: [269, 396, 88, 60],  K: [497, 396, 91, 60],  L: [737, 396, 57, 60],
  M: [944, 396, 57, 60],  N: [1147, 396, 88, 60], O: [1422, 396, 91, 60], P: [1654, 396, 59, 60],
  Q: [41, 612, 78, 60],   R: [263, 612, 74, 60],  S: [473, 612, 83, 60],  T: [707, 612, 82, 60],
  U: [935, 612, 86, 60],  V: [1170, 612, 63, 60], W: [1418, 612, 92, 60], X: [1660, 612, 77, 60],
  Y: [41, 828, 81, 60],   Z: [261, 828, 79, 60],
};

const GLYPH_COLOR = [255, 215, 0]; // #ffd700

// Lazily cut each glyph out of the chart as a gold-on-transparent canvas
let _glyphs = null;
function getGlyphs() {
  if (_glyphs) return _glyphs;
  const chart = new Image();
  chart.src = fs.readFileSync(path.join(__dirname, 'chart.jpg'));

  _glyphs = {};
  for (const [char, [sx, sy, sw, sh]] of Object.entries(GLYPH_BOXES)) {
    const glyph = createCanvas(sw, sh);
    const gctx = glyph.getContext('2d');
    gctx.drawImage(chart, sx, sy, sw, sh, 0, 0, sw, sh);

    // Chart is yellow on black: use brightness as alpha so glyphs sit on any background
    const data = gctx.getImageData(0, 0, sw, sh);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const alpha = Math.min(255, Math.max(0, (px[i] + px[i + 1]) / 2 - 20) * 1.4);
      px[i] = GLYPH_COLOR[0]; px[i + 1] = GLYPH_COLOR[1]; px[i + 2] = GLYPH_COLOR[2];
      px[i + 3] = alpha;
    }
    gctx.putImageData(data, 0, 0);
    _glyphs[char] = glyph;
  }
  return _glyphs;
}

/**
 * Generate an image of Aurebesh text
 * @param {string} text - English text to render in Aurebesh
 * @returns {string} - Path to the generated PNG image
 */
function generateAurebeshImage(text, outputPath) {
  const glyphs = getGlyphs();
  const upper = text.toUpperCase().replace(/[^A-Z\s]/g, '');
  const words = upper.split(/\s+/).filter(Boolean);
  
  const glyphSize = 40; // glyph height; width follows each glyph's aspect ratio
  const padding = 10;
  const letterGap = 6;
  const spaceWidth = glyphSize * 0.5;
  const lineHeight = glyphSize + padding * 2;
  const maxCharsPerLine = 12;
  
  const glyphWidth = (char) => {
    const [, , w, h] = GLYPH_BOXES[char];
    return Math.round(w * glyphSize / h);
  };
  const lineWidth = (line) => [...line].reduce(
    (sum, char) => sum + (char === ' ' ? spaceWidth : glyphWidth(char) + letterGap), 0);
  
  // Calculate dimensions
  let lines = [];
  for (const word of words) {
    if (lines.length === 0 || lines[lines.length - 1].length + word.length + 1 > maxCharsPerLine) {
      lines.push(word);
    } else {
      lines[lines.length - 1] += ' ' + word;
    }
  }
  
  const maxLineWidth = Math.max(0, ...lines.map(lineWidth));
  const width = Math.max(300, maxLineWidth + padding * 4);
  const height = Math.max(200, lines.length * lineHeight + padding * 4 + 60);
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Star Wars style background - dark with subtle stars
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, width, height);
  
  // Add some star dots
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 30; i++) {
    const sx = Math.random() * width;
    const sy = Math.random() * height;
    const sr = Math.random() * 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Title
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('⟨ AUREBESH TRANSLATION ⟩', width / 2, 25);
  
  // Draw glyphs
  let yOffset = 45;
  
  for (const line of lines) {
    let xOffset = (width - lineWidth(line)) / 2;
    
    for (const char of line) {
      if (char === ' ') {
        xOffset += spaceWidth;
        continue;
      }
      
      const w = glyphWidth(char);
      ctx.drawImage(glyphs[char], xOffset, yOffset, w, glyphSize);
      xOffset += w + letterGap;
    }
    
    yOffset += lineHeight;
  }
  
  // Add original text at bottom
  ctx.fillStyle = '#88aacc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`"${text}"`, width / 2, height - 15);
  
  // Save to file
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  
  return outputPath;
}

module.exports = { generateAurebeshImage };
