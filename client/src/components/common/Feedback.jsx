import { RotateCw } from 'lucide-react'
import { describeError } from '../../utils/errorMessages.js'
import s from './common.module.css'

// The "nothing to show" family: every data page uses these instead of inventing its own.

export function Skeleton({ className = '', style }) {
  return <div className={`${s.skeleton} ${className}`} style={style} aria-hidden="true" />
}

// Announces loading to screen readers once, while the visual skeletons stay silent
export function LoadingRegion({ label, children }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, message, children }) {
  return (
    <div className={s.state}>
      {Icon && <Icon size={40} aria-hidden="true" className={s.stateIcon} />}
      <h2 className={s.stateTitle}>{title}</h2>
      {message && <p className={s.stateMessage}>{message}</p>}
      {children}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  const { icon, title, message, canRetry } = describeError(error)
  return (
    <div role="alert">
      <EmptyState icon={icon} title={title} message={message}>
        {onRetry && canRetry && (
          <button type="button" className={s.button} onClick={onRetry}>
            <RotateCw size={16} aria-hidden="true" />
            Try again
          </button>
        )}
      </EmptyState>
    </div>
  )
}
