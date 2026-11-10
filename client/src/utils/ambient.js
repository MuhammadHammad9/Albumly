// Picks the colour a page glows with from an album cover or artist photo. The artwork itself is
// never changed: it is read once, at thumbnail size, and only the colour is kept.

const SIZE = 24 // the image is shrunk to SIZE x SIZE before reading; plenty for one colour
const HUE_BINS = 12
const NEUTRAL = 'rgb(150 156 168)' // for black-and-white artwork

function toHsl(r, g, b) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  let h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
  h = (h * 60 + 360) % 360
  return [h, Math.min(1, s), l]
}

function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [r, g, b].map((v) => Math.round((v + m) * 255))
}

// pixels: RGBA bytes. Finds the most common vivid hue and returns it bright enough to glow on a
// dark page, as a CSS colour.
export function vividColor(pixels) {
  const bins = Array.from({ length: HUE_BINS }, () => ({ weight: 0, x: 0, y: 0, s: 0 }))
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const [h, s, l] = toHsl(pixels[i], pixels[i + 1], pixels[i + 2])
    // Near-black, near-white and grey pixels say nothing about the artwork's colour
    if (s < 0.2 || l < 0.12 || l > 0.92) continue
    const bin = bins[Math.floor(h / (360 / HUE_BINS)) % HUE_BINS]
    const weight = s * (1 - Math.abs(l - 0.5))
    const angle = (h * Math.PI) / 180
    bin.weight += weight
    // Hues are angles, so they are averaged as directions (350° and 10° average to 0°, not 180°)
    bin.x += Math.cos(angle) * weight
    bin.y += Math.sin(angle) * weight
    bin.s += s * weight
  }
  const best = bins.reduce((a, b) => (b.weight > a.weight ? b : a))
  // Too little colour to call it (a handful of stray pixels on a monochrome cover)
  if (best.weight < (pixels.length / 4) * 0.01) return NEUTRAL
  const hue = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360
  const [r, g, b] = fromHsl(hue, Math.min(0.85, Math.max(0.5, best.s / best.weight)), 0.56)
  return `rgb(${r} ${g} ${b})`
}

const cache = new Map()

// Resolves with a CSS colour, or null when the image cannot be read (blocked, offline, no canvas)
export function artworkColor(src) {
  if (!cache.has(src)) {
    cache.set(
      src,
      new Promise((resolve) => {
        const image = new Image()
        image.crossOrigin = 'anonymous' // needed to read pixels of an image from another site
        image.decoding = 'async'
        image.onerror = () => resolve(null)
        image.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = SIZE
            const context = canvas.getContext('2d', { willReadFrequently: true })
            context.drawImage(image, 0, 0, SIZE, SIZE)
            resolve(vividColor(context.getImageData(0, 0, SIZE, SIZE).data))
          } catch {
            resolve(null)
          }
        }
        image.src = src
      }),
    )
  }
  return cache.get(src)
}
