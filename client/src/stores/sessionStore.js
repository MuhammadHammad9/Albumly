// Who is signed in and how syncing is going. Only services/session.js changes it; components read it.
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

export const initialSession = {
  // disabled: accounts not configured · loading: checking for a saved session ·
  // signedOut · signedIn · expired: the session ended, changes wait on this device
  status: 'disabled',
  user: null, // { id, email }
  sync: 'idle', // idle | syncing | offline | error | expired
  syncMessage: '',
  pending: 0, // changes not yet sent to the account
  loadingLibrary: false, // first download of the account library on this device
  importOffer: null, // { albums, collections } waiting in this browser's own library
  recovery: false, // arrived from a password-reset email: ask for a new password
}

export const sessionStore = createStore(() => ({ ...initialSession }))

export const useSession = (selector) => useStore(sessionStore, selector)
