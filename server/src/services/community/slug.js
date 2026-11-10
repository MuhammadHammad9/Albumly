// A slug is the readable part of a share link: /shared/late-night-drives-k3x9q2mw
// The name part makes the link recognisable; the 8 random characters make it unique and
// impossible to guess from the name alone. A slug is made once and never changes, so a link
// keeps working after the collection is renamed.
import { randomInt } from 'node:crypto'
import { z } from 'zod'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const NAME_PART_MAX = 40
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SLUG_MAX = 60

export const slugSchema = z.string().max(SLUG_MAX).regex(SLUG_PATTERN, 'Must be a share link id')

// 8 characters from 36 → about 2.8 trillion possibilities
export function randomSuffix(length = 8, pick = randomInt) {
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[pick(ALPHABET.length)]
  return out
}

// "Café Noir — Live!" → "cafe-noir-live". Accents are dropped, anything else becomes a dash.
export function slugifyName(name) {
  const part = String(name ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // the accents split off by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_PART_MAX)
    .replace(/-+$/, '')
  return part || 'collection'
}

export const makeSlug = (name, suffix = randomSuffix()) => `${slugifyName(name)}-${suffix}`
