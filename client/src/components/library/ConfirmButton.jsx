import { useEffect, useId, useRef, useState } from 'react'
import s from './library.module.css'

// A button for actions that delete something. When `needsConfirm` is true, the first click opens
// a small confirm step on the page (not a browser pop-up), with focus moved to "Cancel" so a
// stray Enter cannot delete anything. Escape or Cancel closes it and returns focus to the button.
export default function ConfirmButton({
  needsConfirm = true,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  popover = false,
  className,
  children,
  ...buttonProps
}) {
  const [asking, setAsking] = useState(false)
  const triggerRef = useRef(null)
  const cancelRef = useRef(null)
  const messageId = useId()

  useEffect(() => {
    if (asking) cancelRef.current?.focus()
  }, [asking])

  function cancel() {
    setAsking(false)
    triggerRef.current?.focus()
  }

  function confirm() {
    setAsking(false)
    onConfirm()
  }

  return (
    <span
      className={s.confirmWrap}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && asking) {
          event.stopPropagation()
          cancel()
        }
      }}
      // A pop-up confirm closes when focus moves somewhere else on the page
      onBlur={(event) => {
        if (popover && asking && !event.currentTarget.contains(event.relatedTarget)) setAsking(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-expanded={needsConfirm ? asking : undefined}
        onClick={() => (needsConfirm ? setAsking((open) => !open) : onConfirm())}
        {...buttonProps}
      >
        {children}
      </button>

      {asking && (
        <span role="group" aria-labelledby={messageId} className={`${s.confirm} ${popover ? s.confirmPopover : ''}`}>
          <span id={messageId}>{message}</span>
          <span className={s.confirmButtons}>
            <button type="button" className={s.danger} onClick={confirm}>
              {confirmLabel}
            </button>
            <button ref={cancelRef} type="button" className={s.subtle} onClick={cancel}>
              Cancel
            </button>
          </span>
        </span>
      )}
    </span>
  )
}
