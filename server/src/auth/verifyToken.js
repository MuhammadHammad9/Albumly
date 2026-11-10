// Checks the access token (a JWT) that the browser got from Supabase Auth and sends with each request.
// The token is signed with Supabase's private key; we check the signature with the matching
// public keys (the JWKS), which Supabase publishes. No secret is needed, and no request to
// Supabase is made per call: the keys are downloaded once and cached by `jose`.
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, errors, jwtVerify } from 'jose'
import { ApiError } from '../utils/errors.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const unauthorized = () => new ApiError(401, 'unauthorized', 'Sign in to use your account.')
const expired = () => new ApiError(401, 'session_expired', 'Your session has ended. Sign in again.')
const unavailable = () => new ApiError(503, 'auth_unavailable', 'Sign-in checks are unavailable right now. Try again shortly.')

// The Supabase JWKS address for a project URL such as https://abcd.supabase.co
export const remoteKeySet = (supabaseUrl) => createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl))

// keySet: public keys (remote in the app, local in tests).
// getUserFromAuthServer: fallback for projects still signing with the old shared HS256 secret,
// which has no public key: Supabase Auth itself is asked whether the token is valid.
export function createTokenVerifier({ issuer, keySet, getUserFromAuthServer }) {
  return async function verify(token) {
    let header
    try {
      header = decodeProtectedHeader(token)
    } catch {
      throw unauthorized()
    }

    if (header.alg === 'HS256') {
      if (!getUserFromAuthServer) throw unauthorized()
      let claims
      try {
        claims = decodeJwt(token)
      } catch {
        throw unauthorized()
      }
      if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) throw expired()
      const user = await getUserFromAuthServer(token).catch(() => {
        throw unavailable()
      })
      if (!user) throw unauthorized()
      return user
    }

    let payload
    try {
      ;({ payload } = await jwtVerify(token, keySet, { issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256'] }))
    } catch (error) {
      if (error instanceof errors.JWTExpired) throw expired()
      // Could not download the keys: Supabase is unreachable, not the user's fault
      if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid || !(error instanceof errors.JOSEError)) throw unavailable()
      throw unauthorized()
    }

    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) throw unauthorized()
    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : null }
  }
}
