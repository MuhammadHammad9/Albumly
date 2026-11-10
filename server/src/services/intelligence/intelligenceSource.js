// One shape for "what does the catalogue already know about this artist?", whatever the provider:
//   { mode, peekArtist, peekReleases, loadPreview | null, blockedFor, previewCost }
// Every method resolves to null instead of throwing, so one unknown artist cannot fail a whole list.

// The few artist fields the client needs
const artistSummary = (artist) => artist && { id: artist.id, name: artist.name, imageUrl: artist.imageUrl ?? null, genres: artist.genres ?? [] }
const orNull = async (work) => {
  try {
    return (await work()) ?? null
  } catch {
    return null
  }
}

export function intelligenceSource(provider) {
  // Spotify with the extra methods from spotifyIntelligence.js
  if (typeof provider.peekReleases === 'function') {
    return {
      mode: provider.name,
      peekArtist: (id) => orNull(async () => artistSummary(await provider.peekArtist(id))),
      peekReleases: (id) => orNull(() => provider.peekReleases(id)),
      loadPreview: (id) => provider.loadPreview(id),
      blockedFor: () => provider.blockedFor?.() ?? 0,
      previewCost: provider.previewCost ?? 2,
    }
  }

  // The demo catalogue costs nothing to read, so everything counts as already known
  if (provider.name === 'mock') {
    return {
      mode: 'mock',
      peekArtist: (id) => orNull(async () => artistSummary(await provider.getArtist(id))),
      peekReleases: (id) => orNull(async () => ({ source: 'full', releases: (await provider.getDiscography(id)).releases })),
      loadPreview: null,
      blockedFor: () => 0,
      previewCost: 0,
    }
  }

  // A provider that cannot answer from its cache: say so rather than spend requests
  return {
    mode: 'unsupported',
    peekArtist: async () => null,
    peekReleases: async () => null,
    loadPreview: null,
    blockedFor: () => 0,
    previewCost: 0,
  }
}
