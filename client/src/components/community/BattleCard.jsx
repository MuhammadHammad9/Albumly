import { ExternalLink } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { artistNames, choiceFromKey } from '../../utils/battles.js'
import { safeImageUrl, safeSpotifyUrl } from '../../utils/safeUrl.js'
import Artwork from '../common/Artwork.jsx'
import c from '../common/common.module.css'
import BattleResult from './BattleResult.jsx'
import s from './community.module.css'

// Typing in a field, or moving between tabs (which also use the arrow keys), must never cast a vote
const isBusyElsewhere = (target) => target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="tablist"]')

// One battle: two albums side by side and a button under each.
// - canVote: signed in and not voted yet. Signed-out visitors see "Sign in to vote".
// - keyboard: ← and → vote too (only turn this on for the one battle in focus on the page).
// - The result appears once you have voted, or straight away when showResult is set.
export default function BattleCard({ battle, onVote, signedIn, voting = false, keyboard = false, showResult = false, footer }) {
  const { albumA, albumB, votesA, votesB, myVote } = battle
  const canVote = signedIn && !myVote && !voting

  useEffect(() => {
    if (!keyboard || !canVote) return undefined
    function onKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isBusyElsewhere(event.target)) return
      const choice = choiceFromKey(event.key)
      if (choice) {
        event.preventDefault()
        onVote(choice)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [keyboard, canVote, onVote])

  const side = (choice, album) => {
    const artists = artistNames(album)
    const spotifyUrl = safeSpotifyUrl(album.spotifyUrl)
    return (
      <div className={`${s.side} ${myVote === choice ? s.sidePicked : ''}`}>
        <Artwork src={safeImageUrl(album.coverUrl)} alt={`${album.name} by ${artists || 'unknown artist'} cover`} name={album.name} />
        <Link className={s.albumName} to={`/album/${encodeURIComponent(album.id)}`}>
          {album.name}
        </Link>
        <span className={s.albumMeta}>{[artists, album.year].filter(Boolean).join(' · ')}</span>
        {spotifyUrl && (
          <a className={s.link} href={spotifyUrl} target="_blank" rel="noopener noreferrer">
            Open in Spotify <ExternalLink size={12} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        {signedIn ? (
          <button
            type="button"
            className={`${myVote === choice ? c.buttonAccent : c.button} ${s.voteButton}`}
            disabled={!canVote}
            aria-pressed={myVote === choice}
            onClick={() => onVote(choice)}
          >
            {myVote === choice ? 'Your pick' : `Pick ${choice === 'a' ? 'left' : 'right'}`}
            <span className="sr-only">: {album.name}</span>
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <article className={s.battle} aria-label={`${albumA.name} versus ${albumB.name}`}>
      <div className={s.sides}>
        {side('a', albumA)}
        <span className={s.versus} aria-hidden="true">
          VS
        </span>
        {side('b', albumB)}
      </div>
      {!signedIn && (
        <p className={s.note}>
          <Link to="/account" className={s.link}>
            Sign in
          </Link>{' '}
          to vote.
        </p>
      )}
      {keyboard && canVote && <p className={s.note}>Tip: press ← or → to pick.</p>}
      <div aria-live="polite">{(myVote || showResult) && <BattleResult albumA={albumA} albumB={albumB} votesA={votesA} votesB={votesB} myVote={myVote} />}</div>
      {footer}
    </article>
  )
}
