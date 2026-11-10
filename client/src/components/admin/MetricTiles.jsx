import { errorRate, formatCount, formatMs, formatPercent, formatUptime } from '../../utils/metrics.js'
import s from './admin.module.css'

// The headline numbers of the dashboard, one tile each.
// report: the body of GET /api/admin/metrics
export default function MetricTiles({ report }) {
  const { requests, cache, spotify } = report
  const demo = report.provider !== 'spotify'

  const tiles = [
    { label: 'Requests', value: formatCount(requests.total), hint: `since restart, ${formatUptime(report.uptimeSeconds)} ago` },
    { label: 'Server errors', value: formatPercent(errorRate(requests)), hint: `${formatCount(requests.errors)} with status 5xx` },
    { label: 'Rate-limited (429)', value: formatCount(requests.rateLimited), hint: 'our own per-IP limits' },
    { label: 'Response time p95', value: formatMs(requests.latency.p95Ms), hint: `median ${formatMs(requests.latency.p50Ms)}` },
    { label: 'Cache hit ratio', value: cache ? formatPercent(cache.hitRate) : '–', hint: cache ? `${formatCount(cache.size)} entries cached` : 'not used in demo mode' },
    { label: 'Spotify latency', value: spotify ? formatMs(spotify.averageLatencyMs) : '–', hint: spotify ? `average over ${formatCount(spotify.requests)} calls` : demo ? 'demo catalogue, no Spotify calls' : 'no data' },
  ]

  return (
    <dl className={s.tiles}>
      {tiles.map((tile) => (
        <div key={tile.label} className={s.tile}>
          <dt className={s.tileLabel}>{tile.label}</dt>
          <dd className={s.tileBody}>
            <span className={s.tileValue}>{tile.value}</span>
            <span className={s.tileHint}>{tile.hint}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
