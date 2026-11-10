// The one place the client talks to the Albumly backend.

export class ApiError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message)
    this.status = status // HTTP status, or 0 when the server could not be reached at all
    this.code = code
    this.retryAfter = retryAfter // seconds until trying again makes sense (rate limits only)
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

// Any method. `token` adds "Authorization: Bearer ..." for account routes; `body` is sent as JSON.
// Resolves with the parsed JSON body (null for empty answers such as 204).
export async function apiRequest(method, path, { params, body, token, signal } = {}) {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`${BASE_URL}${path}${query}`, {
      method,
      signal,
      ...(Object.keys(headers).length > 0 && { headers }),
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  } catch (cause) {
    // A cancelled request is not a failure; let the caller see the abort as-is
    if (cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'network_error', "Can't reach the Albumly server")
  }

  // Non-JSON bodies happen when the dev proxy is up but the API is down
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    // An error without our JSON envelope came from a proxy in front of the API, not the API itself
    if (!data && response.status >= 502) throw new ApiError(0, 'network_error', "Can't reach the Albumly server")
    const error = data?.error
    throw new ApiError(response.status, error?.code ?? 'unknown_error', error?.message ?? 'Request failed', error?.retryAfter)
  }
  return data
}

export const apiGet = (path, { params, signal } = {}) => apiRequest('GET', path, { params, signal })
