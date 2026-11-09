import { Skeleton } from './Feedback.jsx'
import s from './cards.module.css'

// A responsive grid: as many equal columns as fit, no media queries needed (see .grid)
export function CardGrid({ children }) {
  return <ul className={s.grid}>{children}</ul>
}

// Placeholder cards with the same shape as real ones, so nothing shifts when data arrives
export function CardGridSkeleton({ count = 6, round = false }) {
  return (
    <div className={s.grid} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={s.card}>
          <Skeleton style={{ aspectRatio: 1, borderRadius: round ? '50%' : undefined }} />
          <Skeleton style={{ height: 16, width: '80%', marginTop: 12 }} />
          <Skeleton style={{ height: 13, width: '55%', marginTop: 8 }} />
        </div>
      ))}
    </div>
  )
}
