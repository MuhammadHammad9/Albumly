import s from './intelligence.module.css'

// The Music DNA card: a short portrait of the library, built by utils/musicDna.js
export default function MusicDnaCard({ dna }) {
  if (!dna) return null
  return (
    <section className={s.dna} aria-labelledby="dna-title">
      <h2 id="dna-title" className={s.tileLabel}>
        Your Music DNA
      </h2>
      <p className={s.dnaHeadline}>{dna.headline}</p>
      <dl className={s.traits}>
        {dna.traits.map((trait) => (
          <div key={trait.key}>
            <dt>{trait.label}</dt>
            <dd>
              <span className={s.traitValue}>{trait.value}</span>
              <span className={s.traitDetail}>{trait.detail}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
