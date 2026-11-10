import { useId, useState, useSyncExternalStore } from 'react'

// Page transitions where a clicked cover glides into the header of the page it opens. The
// browser pairs the two by a shared name ("cover"), and cancels the whole transition if two
// elements on screen carry that name at once. So exactly one element may hold it at a time:
// the clicked card on the page being left, then the header on the page being opened.

let activeId = null // the card that was clicked last
let clicks = 0 // goes up with every clicked card
const listeners = new Set()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setActive(id) {
  activeId = id
  clicks += 1
  for (const listener of listeners) listener()
}

const NAMED = { viewTransitionName: 'cover' }

// For a card that links to a page with a big cover. Call `mark` when the card is clicked and put
// `style` on its artwork.
export function useCoverTransition() {
  const id = useId()
  const active = useSyncExternalStore(
    subscribe,
    () => activeId === id,
    () => false,
  )
  return { style: active ? NAMED : undefined, mark: () => setActive(id) }
}

// The style for a header image that covers glide into. It holds the name from the moment its
// page opens until a card on that same page is clicked (that card then needs the name itself).
export function useCoverTarget() {
  const [openedAt] = useState(() => clicks)
  const current = useSyncExternalStore(
    subscribe,
    () => clicks === openedAt,
    () => true,
  )
  return current ? NAMED : undefined
}
