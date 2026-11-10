// Runs the API for development and restarts it when a source file is really edited.
//   node scripts/dev-watch.js src/server.js
//
// Why not `node --watch`: it restarts on every file-system event, and on Windows (more so inside
// a OneDrive folder) merely reading a file — a search, a test run, a virus scan, a sync — raises
// one. Each needless restart drops whatever request was in flight, which showed up as
// "Can't reach Albumly" during sign-up. This script restarts only when a file's size or
// modified time has actually changed.
import { spawn } from 'node:child_process'
import { readdirSync, statSync, watch } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entry = process.argv[2] ?? 'src/server.js'
const WATCHED_DIRS = ['src', 'scripts']
const WATCHED_FILE = /\.(js|json)$/
const SETTLE_MS = 250 // an editor's save can be several events; wait for them to stop

// What a file looked like when last seen, or null if it is not there
function fingerprint(path) {
  try {
    const stats = statSync(path)
    return stats.isFile() ? `${stats.size}:${stats.mtimeMs}` : null
  } catch {
    return null
  }
}

const seen = new Map()
function remember(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name)
    if (item.isDirectory()) remember(path)
    else if (WATCHED_FILE.test(item.name)) seen.set(path, fingerprint(path))
  }
}

let child = null
let stopping = false

function start() {
  child = spawn(process.execPath, [entry], { cwd: serverDir, stdio: 'inherit' })
  child.on('exit', () => {
    child = null
    if (stopping) process.exit(0)
  })
}

function restart(reason) {
  console.log(`Restarting (${reason} changed)`)
  if (!child) return start()
  child.once('exit', start)
  child.kill()
}

let timer = null
let changed = null
for (const name of WATCHED_DIRS) {
  const dir = join(serverDir, name)
  remember(dir)
  watch(dir, { recursive: true }, (_event, file) => {
    if (!file || !WATCHED_FILE.test(file)) return
    const path = join(dir, file)
    const now = fingerprint(path)
    if (seen.get(path) === now || (now === null && !seen.has(path))) return // nothing really changed
    seen.set(path, now)
    changed = join(name, file)
    clearTimeout(timer)
    timer = setTimeout(() => restart(changed), SETTLE_MS)
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true
    if (child) child.kill()
    else process.exit(0)
  })
}

start()
