// Looks for secrets (keys, passwords, tokens) in files that are, or could be, committed.
// It prints only file:line and the rule name, never the matched text.
// Run:  npm run check:secrets      Exit code 1 means something needs a look.
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })

// Tracked files plus new files that are not git-ignored: everything a `git add .` would pick up
const files = [...new Set([...git('ls-files').split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')])].filter(Boolean)

const RULES = [
  { name: 'private-key-block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'supabase-secret-key', pattern: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'jwt-token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'database-url-with-password', pattern: /\bpostgres(?:ql)?:\/\/[^\s:/@'"]+:[^\s@'"]{3,}@/ },
  { name: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'stripe-live-key', pattern: /\b[sr]k_live_[0-9A-Za-z]{20,}\b/ },
  // A 32-character hex value assigned to something called secret (Spotify client secrets look like this)
  { name: 'hex-secret-assignment', pattern: /secret[A-Za-z_]*["']?\s*[:=]\s*["']?[0-9a-f]{32}\b/i },
  // Any VAR=value line in an env-style file where the name suggests a secret and a value is filled in
  { name: 'filled-secret-in-env-file', pattern: /^\s*[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|DATABASE_URL)[A-Z0-9_]*\s*=\s*\S+/, envOnly: true },
]

// Known false alarms, each with its reason. Matching is by file path prefix and rule name.
const ALLOW = [
  // Example: { path: 'server/src/test/', rule: 'jwt-token', why: 'tokens signed by throwaway test keys' },
]

const SKIP = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|zip|pdf)$|(^|\/)package-lock\.json$/
const isEnvFile = (file) => /(^|\/)\.env(\.|$)/.test(file)
const findings = []

for (const file of files) {
  if (SKIP.test(file)) continue
  let text
  try {
    if (statSync(join(root, file)).size > 2_000_000) continue
    text = readFileSync(join(root, file), 'utf8')
  } catch {
    continue // deleted but not yet staged
  }
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (rule.envOnly && !isEnvFile(file)) continue
      if (!rule.pattern.test(line)) continue
      if (ALLOW.some((a) => file.startsWith(a.path) && a.rule === rule.name)) continue
      findings.push(`${file}:${index + 1}  ${rule.name}`)
    }
  })
}

// .env files must never be tracked, and must be ignored by git
const trackedEnv = git('ls-files').split('\n').filter((file) => isEnvFile(file) && !file.endsWith('.example'))
for (const file of trackedEnv) findings.push(`${file}  env-file-is-tracked`)
for (const file of ['server/.env', 'client/.env', 'client/.env.local']) {
  try {
    git('check-ignore', '-q', file)
  } catch {
    findings.push(`${file}  env-file-not-ignored`)
  }
}

console.log(`Scanned ${files.length} files (tracked + untracked, not ignored).`)
if (findings.length === 0) {
  console.log('No secrets found.')
} else {
  console.log(`${findings.length} possible secret(s) - values are not shown:`)
  for (const line of findings) console.log(`  ${line}`)
  process.exit(1)
}
