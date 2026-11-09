// An error that knows which HTTP status and machine-readable code it should be sent as
export class ApiError extends Error {
  constructor(status, code, message, { retryAfter } = {}) {
    super(message)
    this.status = status
    this.code = code
    this.retryAfter = retryAfter // seconds, for rate-limit errors
  }
}

export const notFound = (what) => new ApiError(404, 'not_found', `${what} not found`)
export const badRequest = (message) => new ApiError(400, 'bad_request', message)
