import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test, vi } from 'vitest'
import BattleCard from './BattleCard.jsx'
import CreateBattle from './CreateBattle.jsx'
import Leaderboard from './Leaderboard.jsx'
import PublicAlbumList from './PublicAlbumList.jsx'
import ReportButton from './ReportButton.jsx'
import ShareLink from './ShareLink.jsx'
import ShareSettings from './ShareSettings.jsx'

const album = (id, name, overrides = {}) => ({
  id,
  name,
  artists: [{ id: 'daft', name: 'Daft Punk' }],
  year: 2001,
  coverUrl: `https://i.scdn.co/image/${id}`,
  spotifyUrl: `https://open.spotify.com/album/${id}`,
  ...overrides,
})

const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

// ---------- shared collection list ----------

test('a public album list shows snapshots and never renders an unsafe link', () => {
  inRouter(
    <PublicAlbumList
      includeReviews
      albums={[
        { position: 0, album: album('a1', 'Discovery'), rating: 9, review: 'Still great <script>alert(1)</script>' },
        { position: 1, album: album('a2', 'Homework', { coverUrl: 'https://tracker.example/p.gif', spotifyUrl: 'javascript:alert(1)' }) },
      ]}
      renderReport={(item) => <button type="button">Report review of {item.album.name}</button>}
    />,
  )

  const items = screen.getAllByRole('listitem')
  expect(within(items[0]).getByRole('img', { name: 'Discovery by Daft Punk cover' })).toHaveAttribute('src', 'https://i.scdn.co/image/a1')
  expect(within(items[0]).getByText('9/10')).toBeInTheDocument()
  // The review is text, not HTML
  expect(within(items[0]).getByText('Still great <script>alert(1)</script>')).toBeInTheDocument()
  expect(within(items[0]).getByRole('button', { name: 'Report review of Discovery' })).toBeInTheDocument()

  // Bad cover → initials fallback, bad Spotify link → no link at all
  expect(within(items[1]).queryByRole('link', { name: /spotify/i })).not.toBeInTheDocument()
  expect(items[1].querySelector('img')).toBeNull()
  expect(document.querySelector('a[href^="javascript"]')).toBeNull()
})

test('reviews stay hidden unless the owner turned them on', () => {
  inRouter(<PublicAlbumList albums={[{ position: 0, album: album('a1', 'Discovery'), rating: 9, review: 'secret-ish' }]} />)
  expect(screen.queryByText('secret-ish')).not.toBeInTheDocument()
})

// ---------- report ----------

test('reporting asks for a reason, sends it and thanks the user', async () => {
  const onSubmit = vi.fn(async () => {})
  inRouter(<ReportButton label="Report this collection" signedIn onSubmit={onSubmit} />)

  fireEvent.click(screen.getByRole('button', { name: 'Report this collection' }))
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a reason.')
  expect(onSubmit).not.toHaveBeenCalled()

  fireEvent.click(screen.getByLabelText('Spam or advertising'))
  fireEvent.change(screen.getByLabelText(/More details/), { target: { value: '  buy now  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

  expect(await screen.findByRole('status')).toHaveTextContent('A moderator will take a look')
  expect(onSubmit).toHaveBeenCalledWith({ reason: 'spam', details: 'buy now' })
})

test('a failed report shows the error and keeps the form', async () => {
  inRouter(<ReportButton label="Report" signedIn onSubmit={() => Promise.reject(new Error('Too many requests.'))} />)
  fireEvent.click(screen.getByRole('button', { name: 'Report' }))
  fireEvent.click(screen.getByLabelText('Something else'))
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests.')
  expect(screen.getByRole('button', { name: 'Send report' })).toBeInTheDocument()
})

test('signed-out visitors are asked to sign in instead', () => {
  inRouter(<ReportButton label="Report" signedIn={false} onSubmit={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Report' }))
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/account')
  expect(screen.queryByRole('button', { name: 'Send report' })).not.toBeInTheDocument()
})

// ---------- battle ----------

const battle = { id: 'b1', albumA: album('a1', 'Discovery'), albumB: album('a2', 'Homework'), votesA: 3, votesB: 1, myVote: null }

test('voting by button and by arrow key; results stay hidden until you vote', () => {
  const onVote = vi.fn()
  inRouter(<BattleCard battle={battle} signedIn keyboard onVote={onVote} />)

  expect(screen.queryByText(/is ahead/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Pick left: Discovery/ }))
  expect(onVote).toHaveBeenLastCalledWith('a')

  fireEvent.keyDown(document.body, { key: 'ArrowRight' })
  expect(onVote).toHaveBeenLastCalledWith('b')
})

test('arrow keys do nothing while typing in a field', () => {
  const onVote = vi.fn()
  render(
    <MemoryRouter>
      <input aria-label="search" />
      <BattleCard battle={battle} signedIn keyboard onVote={onVote} />
    </MemoryRouter>,
  )
  fireEvent.keyDown(screen.getByLabelText('search'), { key: 'ArrowLeft' })
  expect(onVote).not.toHaveBeenCalled()
})

test('after voting the result shows and the buttons are disabled', () => {
  const onVote = vi.fn()
  inRouter(<BattleCard battle={{ ...battle, myVote: 'a', votesA: 4 }} signedIn keyboard onVote={onVote} />)

  expect(screen.getByText('Discovery is ahead')).toBeInTheDocument()
  expect(screen.getByText('80% · 4 votes')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Your pick/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /Pick right/ })).toBeDisabled()
  fireEvent.keyDown(document.body, { key: 'ArrowRight' })
  expect(onVote).not.toHaveBeenCalled()
})

test('signed-out visitors see results but no vote buttons', () => {
  inRouter(<BattleCard battle={battle} signedIn={false} showResult onVote={vi.fn()} />)
  expect(screen.queryByRole('button', { name: /Pick/ })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.getByText('75% · 3 votes')).toBeInTheDocument()
})

// ---------- leaderboard and create ----------

test('the leaderboard lists ranked albums, or explains why it is empty', () => {
  const { unmount } = inRouter(<Leaderboard albums={[{ rank: 1, album: album('a1', 'Discovery'), wins: 9, votes: 10, winRate: 0.9 }]} />)
  const row = screen.getAllByRole('row')[1]
  expect(within(row).getByText('Discovery')).toBeInTheDocument()
  expect(within(row).getByText('90%')).toBeInTheDocument()
  unmount()

  inRouter(<Leaderboard albums={[]} minVotes={5} />)
  expect(screen.getByText('No rankings yet')).toBeInTheDocument()
})

test('creating a battle needs two different albums', () => {
  const onCreate = vi.fn()
  render(<CreateBattle albums={[album('a1', 'Discovery'), album('a2', 'Homework'), album('a3', 'Alive')]} onCreate={onCreate} />)

  const start = screen.getByRole('button', { name: 'Start battle' })
  expect(start).toBeDisabled()
  fireEvent.change(screen.getByLabelText('First album'), { target: { value: 'a1' } })
  fireEvent.change(screen.getByLabelText('Second album'), { target: { value: 'a1' } })
  expect(screen.getByText('Pick two different albums.')).toBeInTheDocument()
  expect(start).toBeDisabled()

  fireEvent.change(screen.getByLabelText('Second album'), { target: { value: 'a3' } })
  fireEvent.click(start)
  expect(onCreate).toHaveBeenCalledWith(['a1', 'a3'])

  fireEvent.click(screen.getByRole('button', { name: 'Random pair' }))
  expect(screen.getByLabelText('First album').value).not.toBe(screen.getByLabelText('Second album').value)
})

test('creating a battle explains what is needed with fewer than two albums', () => {
  render(<CreateBattle albums={[album('a1', 'Discovery')]} onCreate={vi.fn()} />)
  expect(screen.getByText(/Save at least two albums/)).toBeInTheDocument()
})

// ---------- share ----------

test('share settings: turning the link on and showing it', () => {
  const onChange = vi.fn()
  const { rerender } = render(<ShareSettings share={null} onChange={onChange} origin="https://albumly.test" />)

  expect(screen.getByLabelText('Show my ratings and reviews')).toBeDisabled()
  fireEvent.click(screen.getByLabelText(/Anyone with the link/))
  expect(onChange).toHaveBeenCalledWith({ visibility: 'public', includeReviews: false })

  rerender(<ShareSettings share={{ slug: 'road-trip-abc12345', visibility: 'public', includeReviews: false }} onChange={onChange} origin="https://albumly.test" />)
  expect(screen.getByLabelText('Share link')).toHaveValue('https://albumly.test/shared/road-trip-abc12345')
  fireEvent.click(screen.getByLabelText('Show my ratings and reviews'))
  expect(onChange).toHaveBeenLastCalledWith({ visibility: 'public', includeReviews: true })
})

test('a hidden collection explains why and shows no link', () => {
  render(<ShareSettings share={{ slug: 'x-abc12345', visibility: 'public', includeReviews: false, hidden: true, hiddenReason: 'Spam' }} onChange={vi.fn()} origin="https://albumly.test" />)
  expect(screen.getByRole('alert')).toHaveTextContent('Moderators hid this collection')
  expect(screen.getByRole('alert')).toHaveTextContent('Reason: Spam')
  expect(screen.queryByLabelText('Share link')).not.toBeInTheDocument()
})

test('copying the link uses the clipboard and says so', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  render(<ShareLink url="https://albumly.test/shared/x-abc12345" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Link copied'))
  expect(writeText).toHaveBeenCalledWith('https://albumly.test/shared/x-abc12345')
})
