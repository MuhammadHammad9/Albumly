import { Ban, CloudOff, Hourglass, KeyRound, TriangleAlert } from 'lucide-react'

// 45 -> "about a minute", 5400 -> "about 2 hours", 86280 -> "about 24 hours"
export function describeWait(seconds) {
  if (!seconds || seconds < 90) return 'about a minute'
  if (seconds < 90 * 60) return `about ${Math.round(seconds / 60)} minutes`
  return `about ${Math.round(seconds / 3600)} hours`
}

// Turns an ApiError into words a person can act on. `canRetry` hides "Try again" when it cannot help yet.
export function describeError(error) {
  switch (error?.code) {
    case 'network_error':
      return { icon: CloudOff, title: "Can't reach Albumly", message: 'Check your connection, then try again.', canRetry: true }
    case 'upstream_error':
      return { icon: CloudOff, title: 'The music catalogue is unavailable', message: 'This is usually temporary. Try again in a moment.', canRetry: true }
    case 'rate_limited':
      return {
        icon: Hourglass,
        title: 'Spotify has paused Albumly for a while',
        message: `Spotify limits how often Albumly can look this up. Try again in ${describeWait(error.retryAfter)}. Pages you have already visited still work.`,
        canRetry: !error.retryAfter || error.retryAfter <= 60,
      }
    case 'spotify_auth_failed':
      return { icon: KeyRound, title: "Albumly can't connect to Spotify", message: "The server's Spotify credentials were rejected. This needs fixing on the server.", canRetry: false }
    case 'forbidden':
      return { icon: Ban, title: 'Spotify does not allow this', message: "Albumly's Spotify app is not permitted to show this item.", canRetry: false }
    default:
      return { icon: TriangleAlert, title: 'Something went wrong', message: 'That did not load. Try again.', canRetry: true }
  }
}
