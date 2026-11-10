// Draws the share-preview image (client/public/og-image.png, 1200x630) from the design tokens,
// using the Chromium that Playwright already installed. Run again after changing the look:
//   node scripts/make-og-image.js
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const out = fileURLToPath(new URL('../client/public/og-image.png', import.meta.url))
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="132" height="132"><rect width="32" height="32" rx="8" fill="#1DB954"/><circle cx="16" cy="16" r="9" fill="none" stroke="#101010" stroke-width="2.5"/><circle cx="16" cy="16" r="2.5" fill="#101010"/></svg>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; width: 1200px; height: 630px; background: #101010; color: #fff;
         font-family: "Segoe UI", Inter, system-ui, sans-serif; display: flex; align-items: center; }
  main { padding: 0 96px; display: grid; gap: 28px; }
  .brand { display: flex; align-items: center; gap: 28px; font-size: 88px; font-weight: 800; letter-spacing: -2px; }
  h1 { margin: 0; font-size: 60px; line-height: 1.1; font-weight: 700; max-width: 960px; }
  h1 span { color: #1DB954; display: block; }
  p { margin: 0; color: #A7A7A7; font-size: 30px; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: linear-gradient(90deg, #1DB954, #8B5CF6); }
</style></head><body><main>
  <div class="brand">${logo}Albumly</div>
  <h1>Find every album. <span>Explore every era.</span></h1>
  <p>Discographies, editions, your own library and recommendations.</p>
</main><div class="bar"></div></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.screenshot({ path: out })
await browser.close()
console.log(`Wrote ${out}`)
