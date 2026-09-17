import { describe, expect, it } from 'vitest'
import { addDays, businessDate, businessDayEnd, resolveBusinessDay, type DayExtension } from './time'

const S = 210 // 03:30
const at = (s: string) => new Date(s) // local time
const ext = (businessDate: string, endsAt: Date): DayExtension => ({ businessDate, endsAt: endsAt.toISOString(), setBy: null, setAt: '' })
const E = at('2026-09-19T05:30:00') // extended end of 18 Sep

describe('business day basics', () => {
  it('03:29 belongs to the previous date, 03:30 to the new one', () => {
    expect(businessDate(at('2026-09-19T03:29:00'), S)).toBe('2026-09-18')
    expect(businessDate(at('2026-09-19T03:30:00'), S)).toBe('2026-09-19')
  })
  it('day end is the next calendar day at the boundary', () => {
    expect(businessDayEnd('2026-09-18', S).getTime()).toBe(at('2026-09-19T03:30:00').getTime())
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
  })
})

describe('resolveBusinessDay', () => {
  it('no extension: naive day, normal end', () => {
    const r = resolveBusinessDay(at('2026-09-18T22:00:00'), S, null)
    expect(r).toMatchObject({ businessDate: '2026-09-18', extended: false, extensionStale: false, reopenable: null })
    expect(new Date(r.endsAt).getTime()).toBe(at('2026-09-19T03:30:00').getTime())
  })
  it('extension set before the boundary keeps the date and moves the end', () => {
    const r = resolveBusinessDay(at('2026-09-19T02:00:00'), S, ext('2026-09-18', E))
    expect(r).toMatchObject({ businessDate: '2026-09-18', extended: true, extensionStale: false })
    expect(r.endsAt).toBe(E.toISOString())
  })
  it('after 03:30 but before the extended end the old date is still in force', () => {
    const r = resolveBusinessDay(at('2026-09-19T04:00:00'), S, ext('2026-09-18', E))
    expect(r).toMatchObject({ businessDate: '2026-09-18', extended: true })
  })
  it('after the extended end the new date applies and the row is stale', () => {
    const r = resolveBusinessDay(at('2026-09-19T05:31:00'), S, ext('2026-09-18', E))
    expect(r).toMatchObject({ businessDate: '2026-09-19', extended: false, extensionStale: true })
  })
  it('an old extension row is stale', () => {
    const r = resolveBusinessDay(at('2026-09-18T12:00:00'), S, ext('2026-09-16', at('2026-09-17T06:00:00')))
    expect(r).toMatchObject({ businessDate: '2026-09-18', extensionStale: true })
  })
  it('clock moved back: row ignored but kept', () => {
    const r = resolveBusinessDay(at('2026-09-17T12:00:00'), S, ext('2026-09-18', E))
    expect(r).toMatchObject({ businessDate: '2026-09-17', extended: false, extensionStale: false })
  })
  it('an end at or before the normal end is malformed → stale', () => {
    const r = resolveBusinessDay(at('2026-09-18T22:00:00'), S, ext('2026-09-18', at('2026-09-19T03:00:00')))
    expect(r).toMatchObject({ businessDate: '2026-09-18', extended: false, extensionStale: true })
  })
  it('previous day is reopenable for an hour after it ended', () => {
    expect(resolveBusinessDay(at('2026-09-19T04:10:00'), S, null).reopenable).toMatchObject({ businessDate: '2026-09-18' })
    expect(resolveBusinessDay(at('2026-09-19T04:31:00'), S, null).reopenable).toBeNull()
  })
})
