import { useState } from 'react'
import c from '../common/common.module.css'
import s from './admin.module.css'

const TYPE_LABELS = { collection: 'Shared collection', review: 'Review', battle: 'Battle' }
const REASON_LABELS = { spam: 'Spam', offensive: 'Offensive', personal_info: 'Personal information', copyright: 'Copyright', other: 'Other' }

// The moderation queue. Each report shows what was reported and why.
// report: { id, targetType, reason, details, createdAt, resolvedAt, resolution,
//           target: { label, excerpt, hidden } }
// onResolve(report, 'hide' | 'dismiss', reason) and onRestore(report) return promises.
export default function ReportsQueue({ reports, status = 'open', onResolve, onRestore, busyId }) {
  if (reports.length === 0) {
    return <p className={s.note}>{status === 'open' ? 'No open reports. Nice.' : 'No resolved reports yet.'}</p>
  }
  return (
    <ul className={s.reports}>
      {reports.map((report) => (
        <ReportItem key={report.id} report={report} onResolve={onResolve} onRestore={onRestore} busy={busyId === report.id} />
      ))}
    </ul>
  )
}

function ReportItem({ report, onResolve, onRestore, busy }) {
  const [reason, setReason] = useState('')
  const { target } = report
  const when = new Date(report.createdAt).toLocaleString()

  return (
    <li className={s.report}>
      <div className={s.reportHead}>
        <strong>
          {TYPE_LABELS[report.targetType] ?? report.targetType}: {target?.label ?? 'no longer available'}
        </strong>
        <span className={s.note}>{when}</span>
      </div>
      <p className={s.note}>
        Reason: {REASON_LABELS[report.reason] ?? report.reason}
        {report.details ? `: “${report.details}”` : ''}
      </p>
      {target?.excerpt && <blockquote className={s.excerpt}>{target.excerpt}</blockquote>}

      {!report.resolvedAt ? (
        <div className={s.actions}>
          <label className="sr-only" htmlFor={`reason-${report.id}`}>
            Reason shown to the owner (optional)
          </label>
          <input
            id={`reason-${report.id}`}
            className={s.input}
            placeholder="Reason shown to the owner (optional)"
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <button type="button" className={c.button} disabled={busy} onClick={() => onResolve(report, 'hide', reason.trim() || undefined)}>
            Hide
          </button>
          <button type="button" className={c.buttonGhost} disabled={busy} onClick={() => onResolve(report, 'dismiss')}>
            Dismiss
          </button>
        </div>
      ) : (
        <div className={s.actions}>
          <span className={s.note}>{report.resolution === 'hidden' ? (target?.hidden ? 'Hidden' : 'Hidden, since restored') : 'Dismissed'}</span>
          {report.resolution === 'hidden' && target?.hidden && (
            <button type="button" className={c.buttonGhost} disabled={busy} onClick={() => onRestore(report)}>
              Restore
            </button>
          )}
        </div>
      )}
    </li>
  )
}
