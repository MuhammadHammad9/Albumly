// SQL for reports and moderation. Reporting runs as the reporter. The admin functions in the
// database check is_admin() themselves, so even a bug in our routes cannot let a normal user
// moderate.
import { notFound } from '../../utils/errors.js'
import { iso } from './dbAccess.js'

// Returns { created }. Reporting the same thing twice is fine (created: false).
export async function createReport(tx, report) {
  let shareId = null
  let battleId = null
  if (report.targetType === 'battle') {
    const { rows } = await tx.query('select id from battles where id = $1', [report.battleId]) // visible battles only (RLS)
    if (rows.length === 0) throw notFound('Battle')
    battleId = report.battleId
  } else {
    const albumId = report.targetType === 'review' ? report.albumId : null
    const { rows } = await tx.query('select public.reportable_share($1, $2) as id', [report.slug, albumId])
    if (!rows[0]?.id) throw notFound(report.targetType === 'review' ? 'Review' : 'Collection')
    shareId = rows[0].id
  }

  const { rows } = await tx.query(
    `insert into reports (target_type, share_id, album_id, battle_id, reason, details)
     values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning id`,
    [report.targetType, shareId, report.targetType === 'review' ? report.albumId : null, battleId, report.reason, report.details],
  )
  return { created: rows.length > 0 }
}

export async function isAdmin(tx) {
  const { rows } = await tx.query('select public.is_admin() as admin')
  return rows[0]?.admin === true
}

// The key the client sends back to restore a hidden thing
function hideKey(row) {
  if (row.targetType === 'battle') return row.battleId
  if (row.targetType === 'review') return row.slug && `${row.slug}:${row.albumId}`
  return row.slug
}

function label(row) {
  if (row.targetType === 'battle') return row.battleNames
  if (row.targetType === 'review') return row.albumName && `${row.albumName} in “${row.collectionName}”`
  return row.collectionName
}

export async function listReports(tx, { status }) {
  const { rows } = await tx.query('select public.admin_list_reports($1) as reports', [status === 'open'])
  return rows[0].reports.map((row) => ({
    id: row.id,
    targetType: row.targetType,
    reason: row.reason,
    details: row.details,
    createdAt: iso(row.createdAt),
    resolvedAt: iso(row.resolvedAt),
    resolution: row.resolution,
    target: label(row) ? { label: label(row), excerpt: row.targetType === 'review' ? row.review : null, hidden: row.hidden, hideKey: hideKey(row) } : null,
  }))
}

export async function resolveReport(tx, reportId, { action, reason }) {
  const { rows } = await tx.query('select public.admin_resolve_report($1, $2, $3) as ok', [reportId, action, reason ?? null])
  if (!rows[0].ok) throw notFound('Report')
}

// Restores a hidden collection, review or battle. key: slug, "slug:albumId" or battle id.
export async function unhide(tx, { type, key }) {
  let shareId = null
  let albumId = null
  let battleId = null
  if (type === 'battle') battleId = key
  else {
    const [slug, album] = key.split(':')
    // Admin function context: is_admin() is checked inside admin_set_hidden; this lookup only finds the id
    const { rows } = await tx.query('select public.admin_share_id($1) as id', [slug])
    shareId = rows[0]?.id ?? null
    albumId = type === 'review' ? album : null
    if (!shareId) throw notFound('Collection')
  }
  const { rows } = await tx.query('select public.admin_set_hidden($1, $2, $3, $4, false, null) as ok', [type, shareId, albumId, battleId])
  if (!rows[0].ok) throw notFound('Item')
}
