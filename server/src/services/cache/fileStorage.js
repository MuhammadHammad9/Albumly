import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Saves the cache to a JSON file so Spotify answers survive server restarts. In development the
// server restarts on every code change, and without this each restart would re-fetch everything
// and use up Spotify's small daily allowance.
//
// Writes are batched: many changes within `delayMs` become one write. The file is written to a
// temporary name and then renamed, so a crash mid-write never leaves a half-written cache.

export function createFileStorage(path, { delayMs = 2000 } = {}) {
  let timer = null
  let latest = null

  function flush() {
    timer = null
    try {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(`${path}.tmp`, JSON.stringify([...latest]))
      renameSync(`${path}.tmp`, path)
    } catch (error) {
      console.warn(`Could not save the cache to ${path}: ${error.message}`)
    }
  }

  return {
    load() {
      try {
        const saved = JSON.parse(readFileSync(path, 'utf8'))
        return Array.isArray(saved) ? saved : []
      } catch {
        return [] // no file yet, or unreadable: start empty
      }
    },

    save(entries) {
      latest = entries
      if (delayMs === 0) return flush() // write right now, before anything can interrupt
      timer ??= setTimeout(flush, delayMs)
      timer.unref?.() // a pending save must not keep the process alive on shutdown
    },

    flush() {
      if (timer) {
        clearTimeout(timer)
        flush()
      }
    },
  }
}
