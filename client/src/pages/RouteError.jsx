import { TriangleAlert } from 'lucide-react'
import { useRouteError } from 'react-router'
import { EmptyState } from '../components/common/Feedback.jsx'
import common from '../components/common/common.module.css'

// The safety net for unexpected crashes (a bug in a page, or a page's code failing to download)
export default function RouteError() {
  const error = useRouteError()
  console.error(error)

  return (
    <div role="alert">
      <EmptyState icon={TriangleAlert} title="This page hit a problem" message="Reloading usually fixes it.">
        <button type="button" className={common.button} onClick={() => window.location.reload()}>
          Reload
        </button>
      </EmptyState>
    </div>
  )
}
