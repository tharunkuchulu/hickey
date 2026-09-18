/** "Updated 01:30 ↻" — tells the owner how fresh the page is and refreshes on tap. */
export function Freshness({ at, busy, onRefresh }: { at: Date | null; busy: boolean; onRefresh: () => void }) {
  const hhmm = at ? at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'
  return (
    <button
      onClick={onRefresh}
      disabled={busy}
      title="Refreshes every minute by itself; tap to refresh now"
      className="h-8 px-2 rounded-full border border-gray-200 bg-white text-xs text-gray-600 flex items-center gap-1 disabled:opacity-60"
    >
      <span className={busy ? 'animate-spin' : ''}>↻</span>
      {busy ? 'Updating…' : `Updated ${hhmm}`}
    </button>
  )
}
