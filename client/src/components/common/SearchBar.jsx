import { History, Search } from 'lucide-react'
import { useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { MIN_QUERY_LENGTH, useArtistSearch } from '../../hooks/catalog.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import { useRecents } from '../../hooks/useRecents.js'
import { parseQuery } from '../../utils/queryParser.js'
import Artwork from './Artwork.jsx'
import s from './SearchBar.module.css'

const MAX_SUGGESTIONS = 5

// A search box with a dropdown, following the ARIA "combobox" pattern: focus stays in the input
// while the arrow keys move a highlighted option. The dropdown shows recent searches while the
// box is empty, and live artist suggestions once there is something to search for.
// A structured query ("neon harbor 2015 album") skips the suggestions: they would not match it,
// and skipping them saves a request. Enter still runs the full search.
export default function SearchBar() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') ?? ''
  const [value, setValue] = useState(urlQuery)
  // When the search page rewrites ?q= (for example after a filter is changed), show the new text.
  // Adjusting state during render like this is React's recommended alternative to an effect.
  const [shownUrlQuery, setShownUrlQuery] = useState(urlQuery)
  if (urlQuery !== shownUrlQuery) {
    setShownUrlQuery(urlQuery)
    if (urlQuery) setValue(urlQuery)
  }
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listId = useId()
  const { searches: recentSearches } = useRecents()

  const query = value.trim()
  const debouncedQuery = useDebounce(query)
  const parsed = parseQuery(query)
  const isStructured = Boolean(parsed.tab || parsed.yearFrom !== undefined || parsed.artist)
  const search = useArtistSearch(isStructured ? '' : debouncedQuery)

  // Still "searching" while the debounce timer is running or the request is in flight
  const isSearching = query !== debouncedQuery || search.isLoading
  const isSuggesting = query.length >= MIN_QUERY_LENGTH && !isStructured
  const suggestions = isSuggesting && !isSearching ? (search.data?.pages[0].items.slice(0, MAX_SUGGESTIONS) ?? []) : []

  // One flat list of options, whatever they are, so keyboard handling stays simple
  let options = []
  if (isSuggesting) {
    options = [...suggestions.map((artist) => ({ kind: 'artist', key: artist.id, artist })), { kind: 'all', key: 'all' }]
  } else if (isStructured) {
    options = [{ kind: 'all', key: 'all' }]
  } else if (query === '') {
    options = recentSearches.map((text) => ({ kind: 'recent', key: text, text }))
  }

  const showList = open && options.length > 0
  const optionId = (index) => `${listId}-option-${index}`

  function goToSearch(text) {
    setValue(text)
    navigate(`/search?q=${encodeURIComponent(text)}`)
  }

  function choose(option) {
    setOpen(false)
    setActiveIndex(-1)
    if (option?.kind === 'artist') navigate(`/artist/${option.artist.id}`)
    else if (option?.kind === 'recent') goToSearch(option.text)
    else if (query) goToSearch(query) // "see all", or Enter with nothing highlighted
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return
      event.preventDefault() // keep the text cursor from jumping to the start/end
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + step + options.length) % options.length)
    } else if (event.key === 'Escape') {
      // While the list is open, Escape only closes it (Chromium would otherwise also clear the text)
      if (showList) event.preventDefault()
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <form
      role="search"
      className={s.form}
      onSubmit={(event) => {
        event.preventDefault()
        choose(options[activeIndex])
      }}
    >
      <Search className={s.icon} size={18} aria-hidden="true" />
      <input
        type="search"
        className={s.input}
        placeholder="Search artists, albums, tracks"
        aria-label="Search artists, albums and tracks"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />

      {showList && (
        // preventDefault on mousedown keeps focus in the input, so clicking an option does not blur-close the list first
        <ul
          id={listId}
          role="listbox"
          aria-label={isSuggesting ? 'Artist suggestions' : isStructured ? 'Search' : 'Recent searches'}
          className={s.list}
          onMouseDown={(event) => event.preventDefault()}
        >
          {!isSuggesting && !isStructured && (
            <li role="presentation" className={s.heading}>
              Recent searches
            </li>
          )}

          {isSuggesting && isSearching && (
            <li role="presentation" className={s.status}>
              Searching…
            </li>
          )}
          {isSuggesting && !isSearching && search.isError && (
            <li role="presentation" className={s.status}>
              Suggestions are unavailable right now
            </li>
          )}
          {isSuggesting && !isSearching && search.isSuccess && suggestions.length === 0 && (
            <li role="presentation" className={s.status}>
              No artists match “{query}”
            </li>
          )}

          {options.map((option, index) => {
            const optionProps = {
              id: optionId(index),
              role: 'option',
              'aria-selected': index === activeIndex,
              onClick: () => choose(option),
              onMouseEnter: () => setActiveIndex(index),
            }

            if (option.kind === 'artist') {
              return (
                <li key={option.key} {...optionProps} className={s.option}>
                  <span className={s.thumb}>
                    <Artwork src={option.artist.imageUrl} name={option.artist.name} alt="" round />
                  </span>
                  <span className={s.optionText}>
                    <span className={s.optionName}>{option.artist.name}</span>
                    <span className={s.optionMeta}>{option.artist.genres.slice(0, 2).join(', ') || 'Artist'}</span>
                  </span>
                </li>
              )
            }

            if (option.kind === 'recent') {
              return (
                <li key={option.key} {...optionProps} className={`${s.option} ${s.recent}`}>
                  <History size={16} aria-hidden="true" />
                  {option.text}
                </li>
              )
            }

            return (
              <li key={option.key} {...optionProps} className={`${s.option} ${s.seeAll}`}>
                <Search size={16} aria-hidden="true" />
                See all results for “{query}”
              </li>
            )
          })}
        </ul>
      )}
    </form>
  )
}
