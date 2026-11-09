import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'
import { exportJson } from '../../services/library/transfer.js'
import { libraryStore } from '../../stores/libraryStore.js'
import { collection, entry, resetLibrary } from '../../test/libraryFixtures.js'
import ImportExport from './ImportExport.jsx'

const fileWith = (text) => new File([text], 'backup.json', { type: 'application/json' })

async function choose(text) {
  fireEvent.change(screen.getByLabelText(/Import a JSON backup/), { target: { files: [fileWith(text)] } })
}

const backup = exportJson({ entries: { b: entry('b'), c: entry('c') }, collections: [collection('mix', ['b'], { name: 'Mix' })] })

beforeEach(() => resetLibrary({ version: 1, entries: { a: entry('a') }, collections: [] }))

test('an invalid file is reported with paths and nothing changes', async () => {
  render(<ImportExport />)
  await choose(JSON.stringify({ version: 1, entries: { a: entry('a', { rating: 42 }) }, collections: [] }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('This file was not imported. Nothing in your library changed.')
  expect(alert).toHaveTextContent('entries.a.rating: Must be 1 to 10')
  expect(libraryStore.getState().entries.a.rating).toBeNull()
})

test('merge keeps current albums and adds the new ones', async () => {
  render(<ImportExport />)
  await choose(backup)

  expect(await screen.findByText(/is valid: 2 albums and 1 collection/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Merge into library' }))

  expect(Object.keys(libraryStore.getState().entries).sort()).toEqual(['a', 'b', 'c'])
  expect(screen.getByRole('status')).toHaveTextContent('Added 2 albums, 1 new collection.')
})

test('replace needs a confirmation in the page before deleting the current library', async () => {
  render(<ImportExport />)
  await choose(backup)
  await screen.findByText(/is valid/)

  fireEvent.click(screen.getByRole('radio', { name: /Replace/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Replace library' }))
  expect(libraryStore.getState().entries.a).toBeDefined() // not yet

  fireEvent.click(screen.getAllByRole('button', { name: 'Replace library' }).at(-1))
  expect(Object.keys(libraryStore.getState().entries).sort()).toEqual(['b', 'c'])
  expect(screen.getByRole('status')).toHaveTextContent('Replaced your library with 2 albums and 1 collection.')
})
