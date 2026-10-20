// Generates the PWA raster icons with no external dependencies.
// Shapes are drawn with signed-distance functions so edges are anti-aliased.
// Run with: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public')

/* ------------------------------------------------------------------ PNG ---- */

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------------------------------------------- canvas ---- */

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

function createCanvas(size) {
  return { size, data: Buffer.alloc(size * size * 4) }
}

function blend(canvas, x, y, [r, g, b, a]) {
  const { size, data } = canvas
  if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return
  const i = (y * size + x) * 4
  const src = Math.min(1, a / 255)
  const dst = 1 - src
  data[i] = Math.min(255, Math.max(0, Math.round(r * src + data[i] * dst)))
  data[i + 1] = Math.min(255, Math.max(0, Math.round(g * src + data[i + 1] * dst)))
  data[i + 2] = Math.min(255, Math.max(0, Math.round(b * src + data[i + 2] * dst)))
  data[i + 3] = Math.max(data[i + 3], a)
}

/* ------------------------------------------------------------ geometry ---- */

function sdfBox(x, y, x0, y0, x1, y1) {
  const hx = (x1 - x0) / 2
  const hy = (y1 - y0) / 2
  const cx = x0 + hx
  const cy = y0 + hy
  const dx = Math.abs(x - cx) - hx
  const dy = Math.abs(y - cy) - hy
  const ox = Math.max(dx, 0)
  const oy = Math.max(dy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0)
}

const sdfCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r

/** Test-tube outline: square top, fully rounded bottom. */
function sdfTube(x, y, x0, y0, x1, y1) {
  const r = (x1 - x0) / 2
  const cy = y1 - r
  const body = sdfBox(x, y, x0, y0, x1, cy)
  const base = sdfCircle(x, y, (x0 + x1) / 2, cy, r)
  return Math.min(body, base)
}

/** Approximate ellipse SDF; accurate enough for soft anti-aliasing. */
const sdfEllipse = (x, y, cx, cy, rx, ry) =>
  (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry)

const coverage = (distance) => Math.min(1, Math.max(0, 0.5 - distance))

/** Fill every pixel where `sdf` is negative, with 1px anti-aliased edges. */
function paint(canvas, sdf, color) {
  const { size } = canvas
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const cov = coverage(sdf(px, py))
      if (cov <= 0) continue
      const c = typeof color === 'function' ? color(px, py) : color
      if (c[3] <= 0) continue
      blend(canvas, x, y, [c[0], c[1], c[2], c[3] * cov])
    }
  }
}

/* --------------------------------------------------------------- scene ---- */

const TUBE_COLORS = [
  [230, 57, 70],
  [58, 134, 255],
  [6, 214, 160],
]
const TUBE_LEVELS = [0.55, 0.32, 0.74]

function drawIcon(size, { scale = 1 } = {}) {
  const canvas = createCanvas(size)

  // Background gradient.
  const bgTop = [27, 37, 71]
  const bgMid = [11, 16, 32]
  const bgBottom = [7, 10, 22]
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1)
    const c = t < 0.55 ? mix(bgTop, bgMid, t / 0.55) : mix(bgMid, bgBottom, (t - 0.55) / 0.45)
    const color = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255]
    for (let x = 0; x < size; x++) blend(canvas, x, y, color)
  }

  // Soft glow near the top.
  paint(
    canvas,
    (x, y) => Math.hypot(x - size * 0.5, y - size * 0.16) - size * 0.55,
    (x, y) => {
      const d = Math.hypot(x - size * 0.5, y - size * 0.16) / (size * 0.55)
      return [120, 170, 255, Math.max(0, 1 - d) ** 1.4 * 46]
    },
  )

  // Tube layout (centred; `scale` shrinks content for maskable icons).
  const s = scale
  const tubeW = size * 0.155 * s
  const tubeH = size * 0.54 * s
  const gap = size * 0.055 * s
  const groupW = tubeW * 3 + gap * 2
  const startX = (size - groupW) / 2
  const topY = (size - tubeH) / 2
  const bottomY = topY + tubeH
  const border = Math.max(1, size * 0.013)

  // Ground shadow.
  const shadowCx = size / 2
  const shadowCy = bottomY + size * 0.035
  const shadowRx = groupW * 0.62
  const shadowRy = size * 0.028
  paint(
    canvas,
    (x, y) => sdfEllipse(x, y, shadowCx, shadowCy, shadowRx, shadowRy),
    (x, y) => {
      const d = Math.hypot((x - shadowCx) / shadowRx, (y - shadowCy) / shadowRy)
      return [0, 0, 0, Math.max(0, 1 - d) ** 1.5 * 110]
    },
  )

  for (let i = 0; i < 3; i++) {
    const x0 = startX + i * (tubeW + gap)
    const x1 = x0 + tubeW
    const y0 = topY
    const y1 = bottomY
    const tube = (x, y) => sdfTube(x, y, x0, y0, x1, y1)
    const inner = (x, y) => tube(x, y) + border

    // Bright rim, then dark glass interior (the rim is what remains visible).
    paint(canvas, tube, [236, 242, 255, 225])
    paint(canvas, inner, [10, 14, 30, 205])

    // Liquid, shaded slightly darker toward the bottom.
    const innerTop = y0 + border
    const innerBottom = y1 - border
    const liquidTop = innerBottom - (innerBottom - innerTop) * TUBE_LEVELS[i]
    const [r, g, b] = TUBE_COLORS[i]
    paint(
      canvas,
      (x, y) => Math.max(inner(x, y), liquidTop - y),
      (x, y) => {
        const t = (y - liquidTop) / Math.max(1, innerBottom - liquidTop)
        const shade = 1 - t * 0.3
        return [r * shade, g * shade, b * shade, 255]
      },
    )

    // Specular highlight down the left of the glass.
    const hx = x0 + tubeW * 0.2
    const hw = tubeW * 0.13
    paint(
      canvas,
      (x, y) =>
        Math.max(inner(x, y), sdfBox(x, y, hx, y0 + tubeH * 0.16, hx + hw, y1 - tubeH * 0.24)),
      [255, 255, 255, 70],
    )
  }

  return canvas
}

const targets = [
  ['icons/pwa-192.png', 192, 1],
  ['icons/pwa-512.png', 512, 1],
  ['icons/maskable-512.png', 512, 0.74],
  ['apple-touch-icon.png', 180, 1],
]

for (const [rel, size, scale] of targets) {
  const canvas = drawIcon(size, { scale })
  const file = join(outDir, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, encodePng(canvas.size, canvas.size, canvas.data))
  console.log(`wrote public/${rel} (${size}x${size})`)
}
