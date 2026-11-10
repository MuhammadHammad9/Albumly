import { describeWait } from '../../utils/errorMessages.js'
import { blockedList, formatCount, formatMs, formatPercent } from '../../utils/metrics.js'
import s from './admin.module.css'

// Spotify and cache counters, read from what the server already keeps (no Spotify call)
export default function SpotifyPanel({ provider, spotify, cache }) {
  if (!spotify && !cache) {
    return (
      <section className={s.card} aria-labelledby="admin-spotify-title">
        <h2 id="admin-spotify-title" className={s.cardTitle}>
          Spotify and cache
        </h2>
        <p className={s.note}>The server uses the {provider === 'mock' ? 'demo catalogue' : `"${provider}" catalogue`}, so there are no Spotify calls or cache numbers.</p>
      </section>
    )
  }

  const blocked = blockedList(spotify?.blocked)
  return (
    <section className={s.card} aria-labelledby="admin-spotify-title">
      <h2 id="admin-spotify-title" className={s.cardTitle}>
        Spotify and cache
      </h2>
      <dl className={s.facts}>
        {spotify && (
          <>
            <dt>Spotify calls</dt>
            <dd>{formatCount(spotify.requests)}</dd>
            <dt>Average latency</dt>
            <dd>{formatMs(spotify.averageLatencyMs)}</dd>
            <dt>429 answers from Spotify</dt>
            <dd>{formatCount(spotify.rateLimited)}</dd>
            <dt>Retries</dt>
            <dd>{formatCount(spotify.retries)}</dd>
            <dt>Failures</dt>
            <dd>{formatCount(spotify.failures)}</dd>
            <dt>Refused while blocked</dt>
            <dd>{formatCount(spotify.shortCircuited)}</dd>
          </>
        )}
        {cache && (
          <>
            <dt>Cache hit ratio</dt>
            <dd>{formatPercent(cache.hitRate)}</dd>
            <dt>Hits / shared / misses</dt>
            <dd>
              {formatCount(cache.hits)} / {formatCount(cache.shared)} / {formatCount(cache.misses)}
            </dd>
            <dt>Entries</dt>
            <dd>{formatCount(cache.size)}</dd>
          </>
        )}
      </dl>
      {blocked.length > 0 && (
        <div>
          <h3 className={s.cardTitle}>Blocked by Spotify</h3>
          <ul>
            {blocked.map((row) => (
              <li key={row.endpoint}>
                <code>{row.endpoint}</code>: {describeWait(row.secondsLeft)} left
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
