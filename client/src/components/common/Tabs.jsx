import { useRef } from 'react'
import s from './common.module.css'

// Accessible tabs: one tab stop for the whole row, arrow keys move between tabs.
// The parent owns which tab is active and renders the panel itself.
export default function Tabs({ tabs, activeKey, onChange, label }) {
  const refs = useRef({})

  function handleKeyDown(event) {
    const index = tabs.findIndex((tab) => tab.key === activeKey)
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (!step) return

    event.preventDefault()
    const next = tabs[(index + step + tabs.length) % tabs.length]
    onChange(next.key)
    refs.current[next.key]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={s.tabs} onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.key === activeKey
        return (
          <button
            key={tab.key}
            ref={(node) => {
              refs.current[tab.key] = node
            }}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={selected}
            aria-controls="tabpanel"
            tabIndex={selected ? 0 : -1}
            className={s.tab}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
            {tab.count !== undefined && <span className={s.tabCount}>{tab.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
