import { expect, test } from 'vitest'
import { vividColor } from './ambient.js'

const fill = (count, [r, g, b]) => Array.from({ length: count }, () => [r, g, b, 255]).flat()

test('picks the dominant vivid hue, not the dark or grey background', () => {
  // Mostly near-black with a clear patch of red and a little blue
  const pixels = [...fill(400, [10, 10, 12]), ...fill(150, [200, 30, 40]), ...fill(26, [40, 60, 200])]
  const [r, g, b] = vividColor(pixels).match(/\d+/g).map(Number)
  expect(r).toBeGreaterThan(150)
  expect(r).toBeGreaterThan(g + 60)
  expect(r).toBeGreaterThan(b + 60)
})

test('black-and-white artwork gives a neutral colour', () => {
  expect(vividColor([...fill(300, [20, 20, 20]), ...fill(276, [235, 235, 235])])).toBe('rgb(150 156 168)')
})
