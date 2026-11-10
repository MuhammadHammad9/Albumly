import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import MetricTiles from '../components/admin/MetricTiles.jsx'
import ReportsQueue from '../components/admin/ReportsQueue.jsx'
import RequestsChart from '../components/admin/RequestsChart.jsx'
import RouteTable from '../components/admin/RouteTable.jsx'
import SpotifyPanel from '../components/admin/SpotifyPanel.jsx'
import TopSearches from '../components/admin/TopSearches.jsx'
import a from '../components/admin/admin.module.css'
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '../components/common/Feedback.jsx'
import Tabs from '../components/common/Tabs.jsx'
import { useAdminMetrics, useAdminStatus, useModeration, useReports } from '../hooks/useAdmin.js'
import { communityApi } from '../hooks/useCommunity.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useSession } from '../stores/sessionStore.js'
import s from './pages.module.css'

const REPORT_TABS = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
]

function Dashboard({ api }) {
  const metrics = useAdminMetrics(api, true)
  if (metrics.isPending) {
    return (
      <LoadingRegion label="Loading metrics">
        <Skeleton style={{ height: 120, marginBottom: 16 }} />
        <Skeleton style={{ height: 260 }} />
      </LoadingRegion>
    )
  }
  if (metrics.error) return <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />
  const report = metrics.data
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <MetricTiles report={report} />
      <RequestsChart timeline={report.timeline} />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))' }}>
        <RouteTable routes={report.requests.topRoutes} />
        <SpotifyPanel provider={report.provider} spotify={report.spotify} cache={report.cache} />
        <TopSearches searches={report.topSearches} minCount={report.searches?.minCount} />
      </div>
      <p className={a.note}>Numbers are kept in the server's memory and start again from zero when it restarts. Refreshes every 15 seconds.</p>
    </div>
  )
}

function Moderation({ api }) {
  const [status, setStatus] = useState('open')
  const reports = useReports(api, status, true)
  const { resolve, restore } = useModeration(api)
  const busyId = resolve.variables?.report.id ?? restore.variables?.report.id
  const busy = resolve.isPending || restore.isPending

  return (
    <section className={s.section} aria-labelledby="moderation-title">
      <h2 id="moderation-title" className={s.sectionTitle}>
        Reports
      </h2>
      <Tabs tabs={REPORT_TABS} activeKey={status} onChange={setStatus} label="Reports" />
      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${status}`} className={s.tabPanel}>
        {(resolve.error || restore.error) && (
          <p role="alert" className={a.note}>
            {(resolve.error || restore.error).message}
          </p>
        )}
        {reports.isPending ? (
          <Skeleton style={{ height: 120 }} />
        ) : reports.error ? (
          <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
        ) : (
          <ReportsQueue
            reports={reports.data.reports}
            status={status}
            busyId={busy ? busyId : undefined}
            onResolve={(report, action, reason) => resolve.mutate({ report, action, reason })}
            onRestore={(report) => restore.mutate({ report })}
          />
        )}
      </div>
    </section>
  )
}

// The ops dashboard and moderation queue. Not linked in the navigation; admins open /admin.
// Everyone else gets a plain explanation and no data (the server refuses them anyway).
export default function Admin({ api = communityApi }) {
  usePageTitle('Admin')
  const status = useSession((state) => state.status)
  const signedIn = status === 'signedIn'
  const admin = useAdminStatus(api, signedIn)

  let blocked = null
  if (status === 'disabled') blocked = { title: 'Admin needs accounts', message: "This server doesn't have accounts turned on." }
  else if (!signedIn) blocked = { title: 'Sign in as an admin', message: <Link to="/account">Go to sign in</Link> }
  else if (admin.isPending) return <Skeleton style={{ height: 200 }} />
  else if (admin.error) return <ErrorState error={admin.error} onRetry={() => admin.refetch()} />
  else if (!admin.data.admin) blocked = { title: 'Admins only', message: "Your account doesn't have admin access." }

  if (blocked) {
    return (
      <>
        <h1 className={s.pageTitle}>Admin</h1>
        <EmptyState icon={ShieldAlert} title={blocked.title} message={blocked.message} />
      </>
    )
  }

  return (
    <>
      <header className={s.section}>
        <h1 className={s.pageTitle}>Admin</h1>
        <p className={s.pageSubtitle}>How the server is doing, and what people reported.</p>
      </header>
      <Dashboard api={api} />
      <Moderation api={api} />
    </>
  )
}
