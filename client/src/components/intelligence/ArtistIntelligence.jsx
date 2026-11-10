import { Network } from 'lucide-react'
import { Link } from 'react-router'
import { useDiscography } from '../../hooks/catalog.js'
import pages from '../../pages/pages.module.css'
import EraExplorer from './EraExplorer.jsx'
import s from './intelligence.module.css'

// The artist page's "Eras" section. It reuses the discography the page already loaded (same
// query key), so it costs no extra request, and shows nothing until that has arrived.
export default function ArtistIntelligence({ artistId }) {
  const discography = useDiscography(artistId)
  if (!discography.data) return null

  return (
    <section className={pages.section} aria-labelledby="eras">
      <div className={pages.sectionHeader}>
        <h2 id="eras" className={pages.sectionTitle}>
          Eras
        </h2>
        <Link className={s.inlineLink} to={`/discover/connections?artist=${encodeURIComponent(artistId)}`}>
          <Network size={16} aria-hidden="true" style={{ verticalAlign: 'middle' }} /> See connections
        </Link>
      </div>
      <EraExplorer releases={discography.data.releases} />
    </section>
  )
}
