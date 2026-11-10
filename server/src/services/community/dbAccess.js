// How the community routes talk to the database, so RLS applies to our own queries too:
// - a signed-in request runs as that user (Phase 5's db.asUser)
// - a logged-out request runs as Supabase's `anon` role (asVisitor below)
import { toApiError } from '../library/libraryRepository.js'
import { ApiError } from '../../utils/errors.js'

// Runs fn(tx) in one transaction as a signed-out visitor
export function asVisitor(db, fn) {
  return db.transaction(async (tx) => {
    await tx.query('set local role anon')
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'anon' })])
    return fn(tx)
  })
}

// As the user when there is one, otherwise as a visitor. Database errors become API errors.
export function runAs(db, user, fn, errors) {
  const run = user ? db.asUser(user.id, (tx) => fn(tx, user.id)) : asVisitor(db, (tx) => fn(tx, null))
  return run.catch((error) => Promise.reject(toCommunityError(error, errors)))
}

// Postgres error codes → our error envelope. `conflict` says what a duplicate means here.
// 42501 (RLS or a missing right) and 23503 (points at nothing) both read as "not found":
// someone else's or a hidden thing must look exactly like a missing one.
export function toCommunityError(error, { conflict, forbidden } = {}) {
  if (error instanceof ApiError) return error
  switch (error?.code) {
    case '23505':
      return conflict ?? new ApiError(409, 'conflict', 'That already exists.')
    case '42501':
      return forbidden ?? new ApiError(404, 'not_found', 'Not found')
    case '23503':
      return new ApiError(404, 'not_found', 'Not found')
    case '23514':
    case '22P02':
    case '22007':
      return new ApiError(400, 'bad_request', 'Some of the data is not valid.')
  }
  // Connection problems and anything else: Phase 5's mapping (503 when the database is unreachable)
  return toApiError(error)
}

// Postgres gives back Date objects (pg) or strings (in JSON); the client wants "...Z" strings
export const iso = (value) => (value == null ? null : new Date(value).toISOString())
