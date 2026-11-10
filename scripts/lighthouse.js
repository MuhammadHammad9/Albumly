// Runs the Lighthouse checks (e2e/tests/lighthouse) against the production build.
// Playwright starts the test servers, as for `npm run test:e2e`. Reports: e2e/lighthouse/
//   npm run test:lighthouse
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const reports = fileURLToPath(new URL('../e2e/lighthouse', import.meta.url))
if (existsSync(reports)) rmSync(reports, { recursive: true }) // only this run's results
// A fixed command (no user input), so running it through the shell is safe
const result = spawnSync('npx playwright test --project=lighthouse --workers=1', {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_LIGHTHOUSE: '1' },
})

// One table of every score, also saved per page in e2e/lighthouse/*.json
if (existsSync(reports)) {
  const rows = readdirSync(reports).filter((file) => file.endsWith('.json')).map((file) => JSON.parse(readFileSync(`${reports}/${file}`, 'utf8')))
  console.log('\nPage        Form     Perf  A11y  Best  SEO')
  for (const r of rows.sort((a, b) => a.formFactor.localeCompare(b.formFactor) || a.page.localeCompare(b.page))) {
    console.log(`${r.page.padEnd(12)}${r.formFactor.padEnd(9)}${String(r.performance).padStart(4)}  ${String(r.accessibility).padStart(4)}  ${String(r['best-practices']).padStart(4)}  ${String(r.seo).padStart(3)}`)
  }
}
process.exit(result.status ?? 1)
