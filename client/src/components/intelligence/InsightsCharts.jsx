import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { STATUSES } from '../../utils/library.js'
import s from './intelligence.module.css'

// One series per chart, so one colour: --compare-a, checked against the dark surface for contrast.
// SVG attributes need real colours, not CSS variables.
const BAR = '#18a84b'
const axis = { stroke: '#303030', tick: { fill: '#a7a7a7', fontSize: 12 }, tickLine: false }
const tooltip = {
  contentStyle: { background: '#202020', border: '1px solid #303030', borderRadius: 8 },
  itemStyle: { color: '#ffffff' },
  labelStyle: { color: '#a7a7a7' },
  cursor: { fill: 'rgba(255,255,255,0.06)' },
}

function AlbumBars({ data, xKey, label }) {
  return (
    <div className={s.chart} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {/* accessibilityLayer off: the chart sits inside aria-hidden (the table beside it has the numbers),
            so it must not be focusable either */}
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke="#303030" />
          <XAxis dataKey={xKey} {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip {...tooltip} formatter={(value) => [value, 'Albums']} labelFormatter={label} />
          <Bar dataKey="albums" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Each chart has a table with the same numbers right under it, so nobody depends on seeing the chart
export default function InsightsCharts({ insights }) {
  const ratingRows = insights.ratingDistribution
  return (
    <div className={s.charts}>
      <section className={s.panel} aria-labelledby="decades-title">
        <h2 id="decades-title" className={s.panelTitle}>
          Albums by decade
        </h2>
        <AlbumBars data={insights.decades} xKey="label" label={(value) => value} />
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Decade</th>
              <th scope="col">Albums</th>
            </tr>
          </thead>
          <tbody>
            {insights.decades.map((row) => (
              <tr key={row.decade}>
                <td>
                  <Link className={s.inlineLink} to={`/library?from=${row.decade}&to=${row.decade + 9}`}>
                    {row.label}
                  </Link>
                </td>
                <td>{row.albums}</td>
              </tr>
            ))}
            {insights.unknownYear > 0 && (
              <tr>
                <td>Year unknown</td>
                <td>{insights.unknownYear}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className={s.panel} aria-labelledby="ratings-title">
        <h2 id="ratings-title" className={s.panelTitle}>
          Your ratings
        </h2>
        {insights.totals.rated === 0 ? (
          <p className={s.muted}>Rate albums from their page to see your rating pattern here.</p>
        ) : (
          <>
            <AlbumBars data={ratingRows} xKey="rating" label={(value) => `Rated ${value}/10`} />
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">Rating</th>
                  <th scope="col">Albums</th>
                </tr>
              </thead>
              <tbody>
                {ratingRows
                  .filter((row) => row.albums > 0)
                  .map((row) => (
                    <tr key={row.rating}>
                      <td>{row.rating}/10</td>
                      <td>{row.albums}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className={s.panel} aria-labelledby="status-title">
        <h2 id="status-title" className={s.panelTitle}>
          By status
        </h2>
        <table className={s.table}>
          <tbody>
            {[...Object.entries(STATUSES), ['none', 'No status']].map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                <td>{insights.statusCounts[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={s.panel} aria-labelledby="top-title">
        <h2 id="top-title" className={s.panelTitle}>
          Top artists and tags
        </h2>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Artist</th>
              <th scope="col">Albums</th>
            </tr>
          </thead>
          <tbody>
            {insights.topArtists.slice(0, 5).map((artist) => (
              <tr key={artist.id}>
                <td>
                  <Link className={s.inlineLink} to={`/artist/${artist.id}`}>
                    {artist.name}
                  </Link>
                </td>
                <td>{artist.albums}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {insights.tags.length > 0 && (
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Albums</th>
              </tr>
            </thead>
            <tbody>
              {insights.tags.slice(0, 5).map((tag) => (
                <tr key={tag.name}>
                  <td>
                    <Link className={s.inlineLink} to={`/library?tag=${encodeURIComponent(tag.name)}`}>
                      {tag.name}
                    </Link>
                  </td>
                  <td>{tag.albums}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
