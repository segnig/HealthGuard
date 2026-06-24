/**
 * Generate HealthGuard placeholder extension icons.
 *
 * Install:  npm install canvas
 * Run:      node generate-icons.js
 */

const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

const SIZES = [16, 32, 48, 128];
const BACKGROUND = "#1A56A0";
const SHIELD = "#FFFFFF";
const ICONS_DIR = path.join(__dirname, "icons");

/**
 * Draws a simple white shield centred on the canvas.
 * @param {import('canvas').CanvasRenderingContext2D} ctx
 * @param {number} size
 */
function drawShield(ctx, size) {
  const cx = size / 2;
  const cy = size / 2;
  const scale = size * 0.9;

  ctx.beginPath();
  ctx.moveTo(cx, cy - scale * 0.34);
  ctx.lineTo(cx + scale * 0.28, cy - scale * 0.22);
  ctx.lineTo(cx + scale * 0.28, cy + scale * 0.02);
  ctx.quadraticCurveTo(cx + scale * 0.26, cy + scale * 0.24, cx, cy + scale * 0.36);
  ctx.quadraticCurveTo(cx - scale * 0.26, cy + scale * 0.24, cx - scale * 0.28, cy + scale * 0.02);
  ctx.lineTo(cx - scale * 0.28, cy - scale * 0.22);
  ctx.closePath();

  ctx.fillStyle = SHIELD;
  ctx.fill();
}

/**
 * @param {number} size
 * @returns {Buffer}
 */
function createIconBuffer(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BACKGROUND;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  drawShield(ctx, size);

  return canvas.toBuffer("image/png");
}

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

for (const size of SIZES) {
  const filePath = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(filePath, createIconBuffer(size));
  console.log(`Wrote ${filePath}`);
}

console.log("Done. Generated 4 HealthGuard icons.");
