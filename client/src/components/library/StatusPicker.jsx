import { CircleCheck, Clock, Headphones, Heart } from 'lucide-react'
import { STATUSES } from '../../utils/library.js'
import s from './library.module.css'

const ICONS = { favourite: Heart, want: Clock, listening: Headphones, listened: CircleCheck }

// One status per album, as a group of radio buttons: arrow keys move between them for free
export default function StatusPicker({ value, onChange, name }) {
  const options = [{ key: '', label: 'No status' }, ...Object.entries(STATUSES).map(([key, label]) => ({ key, label }))]

  return (
    <fieldset className={s.fieldset}>
      <legend className={s.legend}>Status</legend>
      <div className={s.pills}>
        {options.map((option) => {
          const Icon = ICONS[option.key]
          return (
            <label key={option.key || 'none'} className={s.pill}>
              <input type="radio" name={name} value={option.key} checked={(value ?? '') === option.key} onChange={() => onChange(option.key || null)} />
              {Icon && <Icon size={15} aria-hidden="true" />}
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
