import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import Account from './Account.jsx'
import Privacy from './Privacy.jsx'
import ImportPrompt from '../components/account/ImportPrompt.jsx'
import SessionBanner from '../components/account/SessionBanner.jsx'
import { PRIVACY_CONTACT } from '../config/privacy.js'
import { initialSession, sessionStore } from '../stores/sessionStore.js'

const USER = { id: 'u1', email: 'a@example.com' }

function fakeSession(overrides = {}) {
  return {
    signIn: vi.fn(async () => ({ ok: false, message: 'That email and password do not match an account.' })),
    signUp: vi.fn(async () => ({ ok: true, needsConfirmation: true })),
    resetPassword: vi.fn(async () => ({ ok: true })),
    updatePassword: vi.fn(async () => ({ ok: true })),
    request: vi.fn(async () => ({ user: USER, profile: { createdAt: '2026-01-01T00:00:00.000Z' }, counts: { albums: 3, collections: 1 } })),
    signOut: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => {}),
    pendingChanges: () => 0,
    localLibrarySize: () => ({ albums: 0, collections: 0 }),
    importLocal: vi.fn(async () => ({ added: 2, updated: 0, collectionsAdded: 0, collectionsMerged: 0 })),
    dismissImport: vi.fn(() => sessionStore.setState({ importOffer: null })),
    ...overrides,
  }
}

function renderPage(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => sessionStore.setState({ ...initialSession }))

test('without account settings, the page says accounts are not set up and shows no form', () => {
  renderPage(<Account session={fakeSession()} />)
  expect(screen.getByRole('heading', { name: "Accounts aren't set up on this server." })).toBeInTheDocument()
  expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
})

describe('signed out', () => {
  beforeEach(() => sessionStore.setState({ status: 'signedOut' }))

  test('checks the form before asking Supabase', async () => {
    const session = fakeSession()
    renderPage(<Account session={session} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters')
    expect(session.signUp).not.toHaveBeenCalled()
  })

  test('after sign-up, asks the user to check their email', async () => {
    renderPage(<Account session={fakeSession()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long enough pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument()
  })

  test('shows a plain message when sign-in fails', async () => {
    renderPage(<Account session={fakeSession()} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match an account')
  })

  test('"Forgot password?" sends a reset link', async () => {
    const session = fakeSession()
    renderPage(<Account session={session} />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('reset link is on its way')
    expect(session.resetPassword).toHaveBeenCalledWith('a@example.com')
  })
})

describe('signed in', () => {
  beforeEach(() => sessionStore.setState({ status: 'signedIn', user: USER }))

  test('shows the account and library counts', async () => {
    renderPage(<Account session={fakeSession()} />)
    expect(await screen.findByText('3 albums · 1 collection')).toBeInTheDocument()
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
  })

  test('says accounts are not set up when the server has no account settings', async () => {
    const session = fakeSession({ request: vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { code: 'accounts_unavailable', status: 503 }))) })
    renderPage(<Account session={session} />)
    expect(await screen.findByRole('heading', { name: "Accounts aren't set up on this server." })).toBeInTheDocument()
  })

  test('deleting the account needs the email typed exactly', async () => {
    const session = fakeSession()
    renderPage(<Account session={session} />)
    const button = screen.getByRole('button', { name: 'Delete my account' })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Type your email/), { target: { value: 'A@example.com ' } })
    expect(button).toBeEnabled()
    await act(async () => fireEvent.click(button))
    expect(session.deleteAccount).toHaveBeenCalledOnce()
  })

  test('sign-out asks first when changes have not synced', async () => {
    const session = fakeSession({ pendingChanges: () => 2 })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage(<Account session={session} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('2 changes'))
    expect(session.signOut).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})

describe('banners', () => {
  test('nothing is shown normally', () => {
    const { container } = renderPage(<SessionBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  test('an ended session says changes are kept and links to sign in', () => {
    sessionStore.setState({ status: 'expired', user: USER })
    renderPage(<SessionBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Your session has ended')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/account?reason=expired')
  })

  test('the import prompt moves the browser library and reports what happened', async () => {
    sessionStore.setState({ status: 'signedIn', user: USER, importOffer: { albums: 2, collections: 1 } })
    const session = fakeSession()
    renderPage(<ImportPrompt session={session} />)

    expect(screen.getByText(/2 albums and 1 collection saved in this browser/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to account' }))
    expect(await screen.findByText(/Moved into your account. Added 2 albums./)).toBeInTheDocument()
  })

  test('"Not now" hides the import prompt', () => {
    sessionStore.setState({ status: 'signedIn', user: USER, importOffer: { albums: 1, collections: 0 } })
    const session = fakeSession()
    renderPage(<ImportPrompt session={session} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(session.dismissImport).toHaveBeenCalled()
    expect(screen.queryByText(/saved in this browser/)).not.toBeInTheDocument()
  })
})

test('the privacy page explains deletion and shows the contact placeholder', () => {
  renderPage(<Privacy />)
  expect(screen.getByRole('heading', { name: 'Deleting your data' })).toBeInTheDocument()
  expect(screen.getByText(new RegExp(PRIVACY_CONTACT.replace(/[[\]]/g, '\\$&')))).toBeInTheDocument()
})
