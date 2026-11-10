// Makes real signed access tokens for tests, the way Supabase Auth would, with a key pair that
// only exists in memory. The verifier checks them against the matching public key set (JWKS).
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'

export const TEST_ISSUER = 'https://test-project.supabase.co/auth/v1'

export async function createTestKeys() {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' }
  const keySet = createLocalJWKSet({ keys: [jwk] })

  // Options let a test break one thing at a time (expired, wrong audience, ...)
  async function sign(userId, { email = `${userId?.slice(-1) ?? 'x'}@example.com`, issuer = TEST_ISSUER, audience = 'authenticated', expiresIn = '1h', key = privateKey, extra = {} } = {}) {
    const token = new SignJWT({ email, role: 'authenticated', ...extra })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
    if (userId) token.setSubject(userId)
    return token.sign(key)
  }

  return { keySet, sign }
}
