import { SignJWT, generateKeyPair } from 'jose'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { createTokenVerifier } from './verifyToken.js'
import { TEST_ISSUER, createTestKeys } from '../test/tokens.js'

const USER = '00000000-0000-4000-8000-00000000000a'
let keys
let verify

beforeAll(async () => {
  keys = await createTestKeys()
  verify = createTokenVerifier({ issuer: TEST_ISSUER, keySet: keys.keySet })
})

const rejectsWith = (promise, status, code) => expect(promise).rejects.toMatchObject({ status, code })

test('a valid token gives the user id and email', async () => {
  expect(await verify(await keys.sign(USER, { email: 'a@example.com' }))).toEqual({ id: USER, email: 'a@example.com' })
})

describe('rejects', () => {
  test('an expired token as session_expired', async () => {
    await rejectsWith(verify(await keys.sign(USER, { expiresIn: Math.floor(Date.now() / 1000) - 60 })), 401, 'session_expired')
  })

  test('a token from another project (issuer)', async () => {
    await rejectsWith(verify(await keys.sign(USER, { issuer: 'https://other.supabase.co/auth/v1' })), 401, 'unauthorized')
  })

  test('a token meant for something else (audience), such as the public key itself', async () => {
    await rejectsWith(verify(await keys.sign(USER, { audience: 'anon' })), 401, 'unauthorized')
  })

  test('a token signed with a different key', async () => {
    const { privateKey } = await generateKeyPair('ES256')
    await rejectsWith(verify(await keys.sign(USER, { key: privateKey })), 401, 'unauthorized')
  })

  test('an unsigned token (alg: none)', async () => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const token = `${encode({ alg: 'none' })}.${encode({ sub: USER, aud: 'authenticated', iss: TEST_ISSUER, exp: now + 60 })}.`
    await rejectsWith(verify(token), 401, 'unauthorized')
  })

  test('a token without a user id', async () => {
    await rejectsWith(verify(await keys.sign(null)), 401, 'unauthorized')
  })

  test('something that is not a token at all', async () => {
    await rejectsWith(verify('not-a-token'), 401, 'unauthorized')
  })
})

describe('old HS256 projects', () => {
  const hsToken = (exp) =>
    new SignJWT({ sub: USER })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode('a-shared-secret-that-we-do-not-know'))

  test('ask Supabase Auth instead of checking the signature here', async () => {
    const getUserFromAuthServer = vi.fn(async () => ({ id: USER, email: 'a@example.com' }))
    const verifyHs = createTokenVerifier({ issuer: TEST_ISSUER, keySet: keys.keySet, getUserFromAuthServer })

    expect(await verifyHs(await hsToken('1h'))).toEqual({ id: USER, email: 'a@example.com' })
    expect(getUserFromAuthServer).toHaveBeenCalledOnce()
  })

  test('are refused when Supabase Auth says no, or when expired', async () => {
    const verifyHs = createTokenVerifier({ issuer: TEST_ISSUER, keySet: keys.keySet, getUserFromAuthServer: async () => null })
    await rejectsWith(verifyHs(await hsToken('1h')), 401, 'unauthorized')
    await rejectsWith(verifyHs(await hsToken(Math.floor(Date.now() / 1000) - 60)), 401, 'session_expired')
  })

  test('are refused when there is no fallback', async () => {
    await rejectsWith(verify(await hsToken('1h')), 401, 'unauthorized')
  })
})
