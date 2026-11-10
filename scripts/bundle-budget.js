// Checks the production build against the JavaScript budget in docs/PRD.md §3.3:
// the JavaScript a visitor downloads before the first page shows must stay under 200 KB gzip.
// Run after `npm run build`:  npm run check:bundle
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 200
const dist = fileURLToPath(new URL('../client/dist', import.meta.url))
const indexFile = join(dist, 'index.html')

if (!existsSync(indexFile)) {
  console.error('No build found. Run `npm run build` first.')
  process.exit(1)
}

const kb = (bytes) => (bytes / 1024).toFixed(1)
const gzipSize = (file) => gzipSync(readFileSync(join(dist, file))).length

// "Initial" = files index.html loads straight away: the entry script plus modulepreload links
const html = readFileSync(indexFile, 'utf8')
const initial = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1]))

const files = readdirSync(join(dist, 'assets'))
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => {
    const file = `assets/${name}`
    return { file, raw: readFileSync(join(dist, file)).length, gzip: gzipSize(file), initial: initial.has(file) }
  })
  .sort((a, b) => Number(b.initial) - Number(a.initial) || b.gzip - a.gzip)

console.log('File'.padEnd(48), 'Raw KB'.padStart(8), 'Gzip KB'.padStart(8), ' Loaded')
for (const f of files) {
  console.log(f.file.padEnd(48), kb(f.raw).padStart(8), kb(f.gzip).padStart(8), ` ${f.initial ? 'initial' : 'lazy'}`)
}

const initialJs = files.filter((f) => f.initial && f.file.endsWith('.js'))
const totalGzip = initialJs.reduce((sum, f) => sum + f.gzip, 0)
console.log(`\nInitial JavaScript: ${kb(totalGzip)} KB gzip (budget ${BUDGET_KB} KB)`)

// Big libraries that must only arrive with the page that needs them
const problems = []
if (totalGzip > BUDGET_KB * 1024) problems.push(`initial JavaScript is over budget by ${kb(totalGzip - BUDGET_KB * 1024)} KB`)
const LAZY_ONLY = [
  ['recharts', /recharts/i],
  ['@supabase/auth-js', /GoTrueClient|supabase\.auth|sb-.*-auth-token/],
]
for (const [name, pattern] of LAZY_ONLY) {
  const found = initialJs.find((f) => pattern.test(readFileSync(join(dist, f.file), 'utf8')))
  if (found) problems.push(`${name} is in the initial bundle (${found.file}); it should be lazy-loaded`)
}

if (problems.length > 0) {
  console.error(`\nBudget check FAILED:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('Budget check passed.')
