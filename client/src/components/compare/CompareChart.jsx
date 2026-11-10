import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { trackLengthSeries } from '../../utils/compare.js'
import { formatDuration } from '../../utils/format.js'
import s from './compare.module.css'

// Same values as --compare-a / --compare-b in compare.module.css. SVG attributes need real colours.
const COLOR_A = '#18a84b'
const COLOR_B = '#8b5cf6'
const SURFACE = '#181818' // --bg-secondary: the ring around each dot, so dots stay clear where lines cross

const axis = { stroke: '#303030', tick: { fill: '#a7a7a7', fontSize: 12 }, tickLine: false }
// Labels and values use text colours; only the lines and dots carry the series colour
const textColor = { color: 'var(--text-primary)' }

// Track lengths in running order, one line per album. One unit (minutes) on one axis, so the
// lines can be compared honestly. The table above has every number for anyone who cannot see this.
export default function CompareChart({ albumA, albumB }) {
  const data = trackLengthSeries(albumA, albumB)
  if (data.length === 0) return null

  const line = (key, name, color) => (
    <Line
      type="linear"
      dataKey={key}
      name={name}
      stroke={color}
      strokeWidth={2}
      dot={{ r: 4, fill: color, stroke: SURFACE, strokeWidth: 2 }}
      activeDot={{ r: 6, fill: color, stroke: SURFACE, strokeWidth: 2 }}
      isAnimationActive={false}
    />
  )

  return (
    <figure className={s.chart}>
      <figcaption>
        <h2 className={s.chartTitle}>Track lengths in running order</h2>
        <p className={s.chartNote}>Minutes per track. Hover or tap a point for the exact length.</p>
      </figcaption>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }} accessibilityLayer={false}>
            <CartesianGrid stroke="#2a2a2a" vertical={false} />
            <XAxis dataKey="position" {...axis} />
            <YAxis {...axis} width={44} tickFormatter={(minutes) => `${minutes}m`} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#202020', border: '1px solid #303030', borderRadius: 8 }}
              labelStyle={textColor}
              itemStyle={textColor}
              labelFormatter={(position) => `Track ${position}`}
              formatter={(minutes) => formatDuration(minutes * 60000)}
            />
            {/* itemSorter: keep album A before album B (the default sorts by name) */}
            <Legend itemSorter="dataKey" formatter={(name) => <span style={textColor}>{name}</span>} />
            {line('a', albumA.name, COLOR_A)}
            {line('b', albumB.name, COLOR_B)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
