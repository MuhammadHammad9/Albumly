import { compareAlbums } from '../../utils/compare.js'
import s from './compare.module.css'

// The numbers side by side. A real <table> with headers, so screen readers can read any cell with
// its row and column names. It holds everything the chart shows, and more.
export default function CompareTable({ albumA, albumB }) {
  const rows = compareAlbums(albumA, albumB)

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <caption>Differences are album B minus album A.</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">
              <span className={s.columnName}>
                <span className={s.swatchA} aria-hidden="true" />
                {albumA.name}
              </span>
            </th>
            <th scope="col">
              <span className={s.columnName}>
                <span className={s.swatchB} aria-hidden="true" />
                {albumB.name}
              </span>
            </th>
            <th scope="col">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.aText}</td>
              <td>{row.bText}</td>
              <td className={s.delta}>{row.deltaText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
