import { useCart } from '../store/cart'
import { useSession } from '../store/session'
import { useUpdate } from '../store/update'
import { Modal, PrimaryButton, SecondaryButton } from './Modal'

/**
 * Header pill for the updater: nothing while idle / up to date, grey progress while downloading, a green
 * button once downloaded, red when the download failed (opens Alerts). One tap installs silently; the app
 * comes back on its own.
 */
export function UpdatePill() {
  const status = useUpdate((s) => s.status)
  const openConfirm = useUpdate((s) => s.openConfirm)
  const go = useSession((s) => s.go)
  if (!status) return null
  const base = 'min-h-0 h-9 px-3 rounded text-[12px] font-semibold whitespace-nowrap'
  switch (status.state) {
    case 'downloading':
      return (
        <span className={`${base} bg-gray-100 text-gray-600 flex items-center`} data-testid="update-pill" title={status.message}>
          ↓ Update {status.percent}%
        </span>
      )
    case 'downloaded':
      return (
        <button onClick={openConfirm} className={`${base} bg-green-600 text-white`} data-testid="update-pill" title={status.message}>
          Restart to update
        </button>
      )
    case 'error':
      return (
        <button onClick={() => go('alerts')} className={`${base} bg-red-100 text-red-700`} data-testid="update-pill" title={status.message}>
          Update failed
        </button>
      )
    default:
      return null
  }
}

/** "Install now?" — the only question staff are ever asked about updates, and only if they tapped the pill. */
export function UpdateConfirmModal() {
  const status = useUpdate((s) => s.status)
  const open = useUpdate((s) => s.confirmOpen)
  const close = useUpdate((s) => s.closeConfirm)
  const install = useUpdate((s) => s.install)
  const cartLines = useCart((s) => s.lines.length)
  if (!open || status?.state !== 'downloaded') return null
  return (
    <Modal
      title={`Install Hickey POS ${status.version} now?`}
      onClose={close}
      width="w-[440px]"
      footer={
        <>
          <SecondaryButton onClick={close}>Later</SecondaryButton>
          <PrimaryButton onClick={() => void install('tap')} data-testid="update-confirm">
            Restart now
          </PrimaryButton>
        </>
      }
    >
      <p className="text-sm text-gray-700">The app closes for about a minute and opens again by itself. Bills and settings stay as they are.</p>
      {cartLines > 0 && <p className="mt-2 text-sm font-semibold text-amber-700">There is an unsaved order on the billing screen — finish or hold it first.</p>}
      <p className="mt-2 text-xs text-gray-500">If you tap Later, it installs on its own when the counter has been quiet for 10 minutes.</p>
    </Modal>
  )
}
