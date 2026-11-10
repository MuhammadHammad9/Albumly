import { ApiError } from '../utils/errors.js'

// Lets a request through only with a valid "Authorization: Bearer <token>" header.
// The signed-in user ({ id, email }) is then available to the route as req.user.
export function requireAuth(verify) {
  return async function auth(req, res, next) {
    const match = /^Bearer ([A-Za-z0-9\-_.]+)$/.exec(req.get('authorization') ?? '')
    if (!match) throw new ApiError(401, 'unauthorized', 'Sign in to use your account.')
    req.user = await verify(match[1])
    next()
  }
}
