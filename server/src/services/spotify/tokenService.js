import { ApiError } from '../../utils/errors.js'

// Client Credentials flow: Albumly proves who it is with its client ID and secret and gets an
// access token for public catalogue data. No user signs in. Tokens last about an hour.
// https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const REFRESH_MARGIN_MS = 60_000 // renew a minute early so a request never goes out with a token about to expire

export function createTokenService({ clientId, clientSecret, fetch = globalThis.fetch, now = Date.now }) {
  let token = null
  let expiresAt = 0
  let pending = null

  async function requestToken() {
    let response
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          // The secret only ever travels from this server to Spotify, never to the browser
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      })
    } catch {
      throw new ApiError(502, 'upstream_error', 'Could not reach Spotify')
    }

    if (response.status === 400 || response.status === 401) {
      // Almost always a wrong client ID or secret, or an app whose owner's Premium lapsed
      throw new ApiError(502, 'spotify_auth_failed', `Spotify rejected Albumly's credentials (HTTP ${response.status})`)
    }
    if (!response.ok) {
      throw new ApiError(502, 'upstream_error', `Spotify's token service failed (HTTP ${response.status})`)
    }

    const body = await response.json()
    token = body.access_token
    expiresAt = now() + body.expires_in * 1000
    return token
  }

  return {
    async getToken() {
      if (token && now() < expiresAt - REFRESH_MARGIN_MS) return token
      // Many requests can notice an expired token at once; they all wait on the same refresh
      pending ??= requestToken().finally(() => {
        pending = null
      })
      return pending
    },

    // Called when Spotify answers 401: the token is no good, so the next getToken() fetches a new one
    invalidate() {
      token = null
      expiresAt = 0
    },
  }
}
