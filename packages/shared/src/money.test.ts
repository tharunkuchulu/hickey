import { describe, expect, it } from 'vitest'
import { computeBillTotals, discountAmount, formatMoney, roundOffDelta, toPaise } from './money'

describe('money', () => {
  it('converts rupees to paise without float drift', () => {
    expect(toPaise(10.1)).toBe(1010)
    expect(toPaise('₹1,234.56')).toBe(123456)
    expect(toPaise(0.29)).toBe(29)
  })

  it('formats with Indian grouping', () => {
    expect(formatMoney(123456789)).toBe('₹12,34,567.89')
    expect(formatMoney(5000, { decimals: 0 })).toBe('₹50')
    expect(formatMoney(-150)).toBe('-₹1.50')
  })

  it('rounds off to nearest rupee', () => {
    expect(roundOffDelta(12349, 'nearest_rupee')).toBe(-49)
    expect(roundOffDelta(12350, 'nearest_rupee')).toBe(50)
    expect(roundOffDelta(12350, 'none')).toBe(0)
  })

  it('caps discount at subtotal', () => {
    expect(discountAmount(10000, 'percent', 10)).toBe(1000)
    expect(discountAmount(10000, 'amount', 20000)).toBe(10000)
  })

  it('computes a full bill', () => {
    const t = computeBillTotals({
      lines: [
        { unitPrice: 12000, qty: 2 },
        { unitPrice: 4500, qty: 1, addonsTotal: 1000 }
      ],
      discountType: 'percent',
      discountValue: 10,
      rounding: 'nearest_rupee'
    })
    expect(t.subtotal).toBe(29500)
    expect(t.discount).toBe(2950)
    expect(t.tax).toBe(0)
    expect(t.total).toBe(26600) // 26550 → 266.00 after round-off
    expect(t.roundOff).toBe(50)
  })
})
