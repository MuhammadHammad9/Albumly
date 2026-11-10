// One function per community/admin endpoint. `request(method, path, { body, auth })` does the
// actual HTTP call (in the app: the authenticated request helper from services/api.js), so this
// file stays free of fetch details and is easy to test with a fake.

const enc = encodeURIComponent

function withQuery(path, params) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  return entries.length ? `${path}?${new URLSearchParams(entries)}` : path
}

export function createCommunityApi(request) {
  return {
    // Shared collections
    getPublicCollection: (slug) => request('GET', `/api/public/collections/${enc(slug)}`, { auth: false }),
    getShare: (collectionId) => request('GET', `/api/collections/${enc(collectionId)}/share`, { auth: true }),
    saveShare: (collectionId, { visibility, includeReviews }) =>
      request('PUT', `/api/collections/${enc(collectionId)}/share`, { auth: true, body: { visibility, includeReviews } }),

    // Album Battle. Reading works signed out; the token is sent when there is one, for "my vote".
    listBattles: ({ view, limit, before } = {}) => request('GET', withQuery('/api/battles', { view, limit, before }), { auth: 'optional' }),
    createBattle: (albumIds) => request('POST', '/api/battles', { auth: true, body: { albumIds } }),
    vote: (battleId, choice) => request('POST', `/api/battles/${enc(battleId)}/vote`, { auth: true, body: { choice } }),
    getLeaderboard: ({ limit } = {}) => request('GET', withQuery('/api/leaderboard', { limit }), { auth: false }),

    // Moderation. target: { targetType, slug?, albumId?, battleId? }
    report: (target, { reason, details = '' }) => request('POST', '/api/reports', { auth: true, body: { ...target, reason, details } }),

    // Admin
    adminStatus: () => request('GET', '/api/admin/status', { auth: true }),
    adminMetrics: () => request('GET', '/api/admin/metrics', { auth: true }),
    adminReports: ({ status = 'open' } = {}) => request('GET', withQuery('/api/admin/reports', { status }), { auth: true }),
    resolveReport: (reportId, { action, reason }) =>
      request('POST', `/api/admin/reports/${enc(reportId)}/resolve`, { auth: true, body: reason ? { action, reason } : { action } }),
    unhide: (type, key) => request('DELETE', `/api/admin/hides/${enc(type)}/${enc(key)}`, { auth: true }),
  }
}

// The share link people copy, e.g. https://albumly.app/shared/road-trip-abc12345
export const shareUrl = (slug, origin = globalThis.location?.origin ?? '') => `${origin}/shared/${slug}`
