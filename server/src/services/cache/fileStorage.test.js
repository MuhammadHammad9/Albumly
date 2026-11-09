import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createFileStorage } from './fileStorage.js'

const dir = mkdtempSync(join(tmpdir(), 'albumly-cache-'))
const path = join(dir, 'nested', 'cache.json')
afterEach(() => rmSync(join(dir, 'nested'), { recursive: true, force: true }))

test('batches saves into one write, then loads them back', () => {
  const storage = createFileStorage(path, { delayMs: 60_000 })
  storage.save(new Map([['a', { value: 1, expiresAt: 9 }]]))
  storage.save(new Map([['b', { value: 2, expiresAt: 9 }]]))
  storage.flush()

  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual([['b', { value: 2, expiresAt: 9 }]])
  expect(createFileStorage(path).load()).toEqual([['b', { value: 2, expiresAt: 9 }]])
})

test('a missing or corrupt file loads as empty', () => {
  expect(createFileStorage(path).load()).toEqual([])
  writeFileSync(join(dir, 'corrupt.json'), '{not json')
  expect(createFileStorage(join(dir, 'corrupt.json')).load()).toEqual([])
})
