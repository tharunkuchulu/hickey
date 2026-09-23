import { describe, expect, it } from 'vitest'
import { appSettingsSchema } from './settings'

describe('settings defaults', () => {
  it('turns KOT-bills-the-order on for counters that update from an older version', () => {
    // The counter stores the whole settings object as JSON. A version that predates a key (v0.3.1 and older
    // never wrote kotBillsOrder) must still come up with the new default, not with `undefined` = off.
    const stored = { cafe: {}, receipt: {}, printer: {}, sync: {}, billing: { taxPercent: 0, dayStartMinutes: 210 } }
    expect(appSettingsSchema.parse(stored).billing.kotBillsOrder).toBe(true)
  })

  it('keeps an explicit choice', () => {
    const stored = { cafe: {}, receipt: {}, printer: {}, sync: {}, billing: { kotBillsOrder: false } }
    expect(appSettingsSchema.parse(stored).billing.kotBillsOrder).toBe(false)
  })
})
