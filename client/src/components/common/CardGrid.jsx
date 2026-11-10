import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Skeleton } from './Feedback.jsx'
import s from './cards.module.css'

// A responsive grid: as many equal columns as fit, no media queries needed (see .grid)
export function CardGrid({ children }) {
  return <ul className={s.grid}>{children}</ul>
}

// One row of cards that scrolls sideways: swipe on touch screens, arrow buttons with a mouse.
// The buttons only exist while there is something to scroll to on their side.
export function CardRail({ children }) {
  const list = useRef(null)
  const [more, setMore] = useState({ start: false, end: false })

  useEffect(() => {
    const node = list.current
    if (!node) return undefined
    function measure() {
      const start = node.scrollLeft > 8
      const end = node.scrollLeft + node.clientWidth < node.scrollWidth - 8
      setMore((old) => (old.start === start && old.end === end ? old : { start, end }))
    }
    measure()
    node.addEventListener('scroll', measure, { passive: true })
    // Cards arriving or the window resizing changes how much there is to scroll
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(node)
    return () => {
      node.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [children])

  const scroll = (direction) => list.current?.scrollBy({ left: direction * list.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <div className={s.railWrap} data-more-start={more.start || undefined} data-more-end={more.end || undefined}>
      <ul ref={list} className={s.rail}>
        {children}
      </ul>
      {more.start && (
        <button type="button" className={s.railPrev} aria-label="Scroll back" onClick={() => scroll(-1)}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      )}
      {more.end && (
        <button type="button" className={s.railNext} aria-label="Scroll forward" onClick={() => scroll(1)}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

// Placeholder cards with the same shape as real ones, so nothing shifts when data arrives.
// `rail` matches CardRail's single row instead of the grid.
export function CardGridSkeleton({ count = 6, round = false, rail = false }) {
  return (
    <div className={rail ? s.rail : s.grid} aria-hidden="true">
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
