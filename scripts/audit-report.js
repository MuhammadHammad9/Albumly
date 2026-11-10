// Runs `npm audit` for the root, client and server packages and prints one summary.
// Read-only: it never runs `npm audit fix`. Exit code 1 means a high or critical problem in a
// dependency that ships to users (devDependencies are reported but do not fail the check).
// Run:  npm run check:audit
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PACKAGES = ['.', 'client', 'server']
const root = fileURLToPath(new URL('..', import.meta.url))

function audit(dir, productionOnly) {
  // A fixed command (no user input), so running it through the shell is safe
  const command = `npm audit --json${productionOnly ? ' --omit=dev' : ''}`
  try {
    return JSON.parse(execSync(command, { cwd: `${root}/${dir}`, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch (error) {
    // npm audit exits with 1 when it finds anything; the JSON is still on stdout
    if (error.stdout) return JSON.parse(error.stdout)
    throw error
  }
}

let failed = false
for (const dir of PACKAGES) {
  const name = dir === '.' ? 'root' : dir
  const all = audit(dir, false)
  const prod = audit(dir, true)
  const counts = all.metadata?.vulnerabilities ?? {}
  const prodCounts = prod.metadata?.vulnerabilities ?? {}
  console.log(`\n${name}: ${['critical', 'high', 'moderate', 'low'].map((level) => `${counts[level] ?? 0} ${level}`).join(', ')}`)

  for (const [pkg, info] of Object.entries(all.vulnerabilities ?? {})) {
    const inProd = Boolean(prod.vulnerabilities?.[pkg])
    const titles = info.via.filter((via) => typeof via === 'object').map((via) => via.title)
    const fix = info.fixAvailable ? (info.fixAvailable === true ? 'fix available' : `fix: ${info.fixAvailable.name}@${info.fixAvailable.version}`) : 'no fix yet'
    console.log(`  - ${pkg} (${info.severity}, ${inProd ? 'production' : 'dev only'}, ${fix})${titles.length ? `: ${titles.join('; ')}` : ''}`)
  }
  if ((prodCounts.high ?? 0) + (prodCounts.critical ?? 0) > 0) failed = true
}

if (failed) {
  console.error('\nHigh or critical problems in production dependencies. See docs/security-review.md.')
  process.exit(1)
}
console.log('\nNo high or critical problems in production dependencies.')
