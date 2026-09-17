import { describe, expect, it } from 'vitest'
import { salesByFourHours, salesStats } from './analytics'

const o = (id: string, total: number, status = 'printed', hour = 14, type = 'pick_up') => ({
  id,
  business_date: '2026-09-16',
  order_type: type,
  status,
  total,
  subtotal: total,
  discount: 0,
  created_at: `2026-09-16T${String(hour).padStart(2, '0')}:00:00`,
  printed_at: null
})

describe('analytics', () => {
  it('counts only billed orders and derives not-paid', () => {
    const s = salesStats([o('a', 100), o('b', 200), o('c', 50, 'cancelled')], [{ order_id: 'a', mode: 'card', amount: 100 }])
    expect(s.orders).toBe(2)
    expect(s.total).toBe(300)
    expect(s.cancelled).toBe(1)
    expect(s.byPayment.find((p) => p.key === 'not_paid')?.total).toBe(200)
  })
  it('buckets sales into 4-hour slots like Petpooja', () => {
    const b = salesByFourHours([o('a', 100, 'printed', 5), o('b', 200, 'printed', 13), o('c', 300, 'printed', 1)])
    expect(b[0]!.total).toBe(100) // 04-08
    expect(b[2]!.total).toBe(200) // 12-16
    expect(b[5]!.total).toBe(300) // 00-04
  })
})
