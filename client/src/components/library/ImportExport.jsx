import { Download, Upload } from 'lucide-react'
import { useId, useState } from 'react'
import { libraryStore } from '../../stores/libraryStore.js'
import { describeSummary, downloadText, exportCsv, exportJson, mergeLibrary, parseImport } from '../../services/library/transfer.js'
import { pluralize } from '../../utils/format.js'
import ConfirmButton from './ConfirmButton.jsx'
import s from './library.module.css'

const MAX_ERRORS_SHOWN = 10
const today = () => new Date().toISOString().slice(0, 10)

// Back up and restore. Export happens entirely in the browser. Import checks the whole file first
// and changes nothing if any part of it is invalid, listing what is wrong and where.
export default function ImportExport() {
  const [pending, setPending] = useState(null) // a checked file waiting to be imported: { library, counts, fileName }
  const [mode, setMode] = useState('merge')
  const [errors, setErrors] = useState([])
  const [result, setResult] = useState('')
  const fileId = useId()

  const current = () => libraryStore.getState()
  const isEmpty = Object.keys(current().entries).length === 0 && current().collections.length === 0

  async function chooseFile(event) {
    const file = event.target.files?.[0]
    setResult('')
    setErrors([])
    setPending(null)
    if (!file) return

    const checked = parseImport(await file.text())
    if (checked.ok) setPending({ ...checked, fileName: file.name })
    else setErrors(checked.errors)
    event.target.value = '' // choosing the same file again should run the check again
  }

  function runImport() {
    if (mode === 'replace') {
      current().setLibrary(pending.library)
      setResult(`Replaced your library with ${pluralize(pending.counts.albums, 'album')} and ${pluralize(pending.counts.collections, 'collection')}.`)
    } else {
      const { library, summary } = mergeLibrary(current(), pending.library)
      current().setLibrary(library)
      setResult(describeSummary(summary))
    }
    setPending(null)
  }

  return (
    <details className={s.transfer}>
      <summary>Back up or restore your library</summary>
      <div className={s.transferBody}>
        <div>
          <p className={s.message}>Your library lives only in this browser. Export a copy to keep it safe or move it to another device.</p>
          <div className={s.inlineForm} style={{ marginTop: 8 }}>
            <button type="button" className={s.smallButton} onClick={() => downloadText(`albumly-library-${today()}.json`, exportJson(current()), 'application/json')}>
              <Download size={16} aria-hidden="true" />
              Export JSON (backup)
            </button>
            <button type="button" className={s.smallButton} onClick={() => downloadText(`albumly-library-${today()}.csv`, exportCsv(current()), 'text/csv')}>
              <Download size={16} aria-hidden="true" />
              Export CSV (spreadsheet)
            </button>
          </div>
        </div>

        <div className={s.fieldset}>
          <label htmlFor={fileId} className={s.legend}>
            <Upload size={14} aria-hidden="true" /> Import a JSON backup
          </label>
          <input id={fileId} type="file" accept=".json,application/json" className={s.fileInput} onChange={chooseFile} />
        </div>

        {errors.length > 0 && (
          <div role="alert">
            <p className={s.error}>This file was not imported. Nothing in your library changed. Problems found:</p>
            <ul className={s.errorList}>
              {errors.slice(0, MAX_ERRORS_SHOWN).map((error, index) => (
                <li key={index}>
                  <code>{error.path}</code>: {error.message}
                </li>
              ))}
              {errors.length > MAX_ERRORS_SHOWN && <li>and {errors.length - MAX_ERRORS_SHOWN} more</li>}
            </ul>
          </div>
        )}

        {pending && (
          <div className={s.fieldset}>
            <p>
              <strong>{pending.fileName}</strong> is valid: {pluralize(pending.counts.albums, 'album')} and {pluralize(pending.counts.collections, 'collection')}.
            </p>
            <fieldset className={s.fieldset}>
              <legend className={s.legend}>How to import</legend>
              <label className={s.check}>
                <input type="radio" name="import-mode" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                Merge: keep everything you have and add what is new. Where both have the same album, the more recently edited copy wins.
              </label>
              <label className={s.check}>
                <input type="radio" name="import-mode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                Replace: delete your current library and use only this file.
              </label>
            </fieldset>
            <div className={s.inlineForm}>
              <ConfirmButton
                needsConfirm={mode === 'replace' && !isEmpty}
                message="Replace your whole library with this file? Albums and collections that are not in the file will be deleted."
                confirmLabel="Replace library"
                onConfirm={runImport}
                className={s.smallButton}
              >
                {mode === 'replace' ? 'Replace library' : 'Merge into library'}
              </ConfirmButton>
              <button type="button" className={s.subtle} onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className={s.message} role="status">
          {result}
        </p>
      </div>
    </details>
  )
}
