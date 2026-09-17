import type { HickeyApi } from '../../preload/index'

declare global {
  interface Window {
    /** Typed bridge exposed by the preload script (see src/preload/index.ts). */
    hickey: HickeyApi
  }
}

export {}
