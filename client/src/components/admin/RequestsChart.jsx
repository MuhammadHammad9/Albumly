import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCount, timelineRows } from '../../utils/metrics.js'
import s from './admin.module.css'

// SVG attributes need real colours: --accent-secondary and --danger from variables.css
const REQUESTS = '#8b5cf6'
const ERRORS = '#f87171'
const axis = { stroke: '#303030', tick: { fill: '#a7a7a7', fontSize: 12 }, tickLine: false }
const textColor = { color: 'var(--text-primary)' }

// Requests per minute over the last hour. The chart is hidden from screen readers; the sentence
// under the title gives the same information in words.
export default function RequestsChart({ timeline }) {
  const data = timelineRows(timeline)
  const total = data.reduce((sum, row) => sum + row.requests, 0)
  const errors = data.reduce((sum, row) => sum + row.errors, 0)
  const peak = data.reduce((best, row) => (row.requests > (best?.requests ?? 0) ? row : best), null)

  return (
    <figure className={s.card}>
      <figcaption>
        <h2 className={s.cardTitle}>Requests in the last hour</h2>
        <p className={s.note}>
          {formatCount(total)} requests, {formatCount(errors)} server errors.
          {peak ? ` Busiest minute: ${peak.time} with ${formatCount(peak.requests)}.` : ' No traffic yet.'}
        </p>
      </figcaption>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid stroke="#2a2a2a" vertical={false} />
            <XAxis dataKey="time" {...axis} interval={9} />
            <YAxis {...axis} width={44} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#202020', border: '1px solid #303030', borderRadius: 8 }} labelStyle={textColor} itemStyle={textColor} />
            <Legend formatter={(name) => <span style={textColor}>{name}</span>} />
            <Area type="monotone" dataKey="requests" name="Requests" stroke={REQUESTS} fill={REQUESTS} fillOpacity={0.25} isAnimationActive={false} />
            <Area type="monotone" dataKey="errors" name="Server errors" stroke={ERRORS} fill={ERRORS} fillOpacity={0.3} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
