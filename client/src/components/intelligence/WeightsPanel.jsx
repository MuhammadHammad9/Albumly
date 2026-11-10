import { preferences } from '../../hooks/usePreferences.js'
import { MAX_WEIGHT, PARTS, PART_LABELS } from '../../utils/recommender.js'
import common from '../common/common.module.css'
import s from './intelligence.module.css'

const HELP = {
  genre: 'Shared genres and your tags. Spotify gives no genres, so this is low by default.',
  era: 'Released in the decades you save most.',
  connection: 'Made by, or with, artists linked to your library.',
  taste: 'By artists you rate highly or saved often.',
}

// The settings panel: how much each part of the score counts. Saved in this browser.
export default function WeightsPanel({ weights }) {
  const total = PARTS.reduce((sum, part) => sum + weights[part], 0)
  return (
    <div className={s.panelBody}>
      {PARTS.map((part) => {
        const id = `weight-${part}`
        const share = total ? Math.round((weights[part] / total) * 100) : 0
        return (
          <div key={part} className={s.slider}>
            <label htmlFor={id}>
              {PART_LABELS[part]}
              <br />
              <span className={s.muted}>{HELP[part]}</span>
            </label>
            <input
              id={id}
              type="range"
              min="0"
              max={MAX_WEIGHT}
              step="0.5"
              value={weights[part]}
              aria-valuetext={`${weights[part]} (${share}% of the score)`}
              onChange={(event) => preferences.setWeight(part, Number(event.target.value))}
            />
            <span className={s.score}>{share}%</span>
          </div>
        )
      })}
      <div>
        <button type="button" className={common.buttonGhost} onClick={preferences.resetWeights}>
          Reset to defaults
        </button>
      </div>
    </div>
  )
}
