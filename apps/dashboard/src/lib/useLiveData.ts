import { useCallback, useEffect, useRef, useState } from 'react'

/** The dashboard re-fetches this often while the tab is visible. The POS pushes within 30 s of a bill. */
export const REFRESH_MS = 60_000

/**
 * Fetch + keep fresh. Until 19 Sep 2026 every screen loaded once and then sat on stale data until the owner
 * pressed reload — a bill made at 01:30 was in the cloud at 01:30 and on the phone whenever the page was next
 * opened. Now: refetch every minute while the tab is visible, immediately when the tab/app comes back to the
 * foreground, and on demand (the ↻ button). A refresh never blanks the page; a failed refresh keeps the last data.
 */
export function useLiveData<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; err: string | null; at: Date | null; busy: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [at, setAt] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)
  const loadRef = useRef(load)
  loadRef.current = load
  const gen = useRef(0)

  const refresh = useCallback(() => {
    const my = ++gen.current
    setBusy(true)
    loadRef.current()
      .then((d) => {
        if (my !== gen.current) return
        setData(d)
        setErr(null)
        setAt(new Date())
      })
      .catch((e) => {
        if (my !== gen.current) return
        setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (my === gen.current) setBusy(false)
      })
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setData(null)
    refresh()
  }, deps)

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const t = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [refresh])

  return { data, err, at, busy, refresh }
}
