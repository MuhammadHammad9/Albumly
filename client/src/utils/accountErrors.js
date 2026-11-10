// Account-related API errors in plain words (the catalogue errors live in errorMessages.js)
export function accountErrorMessage(error) {
  switch (error?.code) {
    case 'accounts_unavailable':
      return "Accounts aren't set up on this server."
    case 'session_expired':
    case 'unauthorized':
      return 'Your session has ended. Please sign in again.'
    case 'database_unavailable':
    case 'auth_unavailable':
      return 'Your account is unavailable right now. Please try again shortly.'
    case 'rate_limited':
      return 'Too many requests just now. Please wait a moment and try again.'
    case 'network_error':
      return "Can't reach the Albumly server. Check your connection and try again."
    case 'bad_request':
      return error.message
    default:
      return error?.message || 'Something went wrong. Please try again.'
  }
}
