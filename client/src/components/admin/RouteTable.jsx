import { formatCount } from '../../utils/metrics.js'
import s from './admin.module.css'

// The busiest API routes. Routes are patterns such as /api/artists/:id, never real ids.
export default function RouteTable({ routes }) {
  return (
    <section className={s.card} aria-labelledby="admin-routes-title">
      <h2 id="admin-routes-title" className={s.cardTitle}>
        Busiest routes
      </h2>
      {routes.length === 0 ? (
        <p className={s.note}>No requests yet.</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col" className={s.num}>
                  Requests
                </th>
                <th scope="col" className={s.num}>
                  Server errors
                </th>
              </tr>
            </thead>
            <tbody>
              {routes.map((row) => (
                <tr key={row.route}>
                  <td>
                    <code>{row.route}</code>
                  </td>
                  <td className={s.num}>{formatCount(row.count)}</td>
                  <td className={s.num}>{formatCount(row.errors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
