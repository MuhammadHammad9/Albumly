import s from './library.module.css'

const SCORES = Array.from({ length: 10 }, (_, index) => index + 1)

// Rating 1 to 10 as radio buttons (plus "None"), so it works with the keyboard like any form field
export default function RatingPicker({ value, onChange, name }) {
  return (
    <fieldset className={s.fieldset}>
      <legend className={s.legend}>Rating</legend>
      <div className={s.pills}>
        <label className={s.pill}>
          <input type="radio" name={name} value="" checked={value === null} onChange={() => onChange(null)} />
          None
        </label>
        {SCORES.map((score) => (
          <label key={score} className={s.ratingPill}>
            <input type="radio" name={name} value={score} checked={value === score} onChange={() => onChange(score)} aria-label={`${score} out of 10`} />
            <span aria-hidden="true">{score}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
