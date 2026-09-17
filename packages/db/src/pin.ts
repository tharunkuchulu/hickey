import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/** Hash a 4–6 digit login PIN. Format: scrypt$<salt hex>$<hash hex>. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, 32)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [algo, saltHex, hashHex] = stored.split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
