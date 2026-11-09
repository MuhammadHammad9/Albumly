// Pure formatting helpers: no React, easy to unit test.

// 225000 -> "3:45"
export function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

// 4380000 -> "1 hr 13 min"
export function formatLongDuration(ms) {
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`
}

// Release dates can be precise to the day, the month or only the year, so we never show more than we know
const DATE_OPTIONS = {
  year: { year: 'numeric' },
  month: { year: 'numeric', month: 'short' },
  day: { year: 'numeric', month: 'short', day: 'numeric' },
}

export function formatReleaseDate(date, precision = 'day') {
  // Pad partial dates ("2022", "2013-11") so they parse, and stay in UTC so the day never shifts
  const iso = `${date}${'-01-01'.slice(date.length - 4)}`
  return new Intl.DateTimeFormat('en-US', { ...DATE_OPTIONS[precision], timeZone: 'UTC' }).format(new Date(iso))
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

const TYPE_LABELS = { album: 'Album', single: 'Single', ep: 'EP', compilation: 'Compilation' }

export const releaseTypeLabel = (type) => TYPE_LABELS[type] ?? 'Release'

// "Neon Harbor" -> "NH", used when there is no image
export function initials(name) {
  return name
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}
