import { Router } from 'express'
import { hash } from '../data/mockCatalog.js'

// Generated placeholder artwork for the mock catalogue: the same seed always gives the same cover.
export const mockArtRoutes = Router()

mockArtRoutes.get('/:file', (req, res) => {
  const h = hash(req.params.file.replace(/\.svg$/, ''))
  const hue = h % 360
  const hue2 = (hue + 40 + ((h >>> 9) % 100)) % 360
  const cx = 120 + ((h >>> 3) % 400)
  const cy = 120 + ((h >>> 12) % 400)
  const r = 120 + ((h >>> 18) % 160)

  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 65% 42%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 60% 18%)"/>
    </linearGradient>
  </defs>
  <rect width="640" height="640" fill="url(#g)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hue2} 80% 70%)" opacity="0.28"/>
  <circle cx="${640 - cx}" cy="${640 - cy}" r="${r * 0.6}" fill="hsl(${hue} 90% 80%)" opacity="0.22"/>
  <circle cx="${cy}" cy="${640 - cx}" r="${r * 0.3}" fill="#fff" opacity="0.16"/>
</svg>`,
  )
})
