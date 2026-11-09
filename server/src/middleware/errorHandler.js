import { ApiError } from '../utils/errors.js'

// Any /api path that no route matched
export function apiNotFound(req, res, next) {
  next(new ApiError(404, 'not_found', `No route for ${req.method} ${req.path}`))
}

// Every error leaves the API in the same shape: { error: { code, message, retryAfter? } }
// (Express recognises an error handler by its four arguments, so `next` must stay.)
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    const error = { code: err.code, message: err.message }
    if (err.retryAfter !== undefined) {
      error.retryAfter = err.retryAfter
      res.set('Retry-After', String(err.retryAfter))
    }
    return res.status(err.status).json({ error })
  }

  console.error(err)
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } })
}
