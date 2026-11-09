import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '../components/common/Feedback.jsx'
import common from '../components/common/common.module.css'
import { usePageTitle } from '../hooks/usePageTitle.js'

// Used for unknown URLs and, with custom text, for artists or albums that do not exist
export default function NotFound({ title = 'Page not found', message = 'There is nothing at this address.' }) {
  usePageTitle(title)

  return (
    <EmptyState icon={Compass} title={title} message={message}>
      <Link to="/" className={common.button}>
        Back to home
      </Link>
    </EmptyState>
  )
}
