/**
 * UUID v7: time-ordered UUIDs. Generated on the POS (offline), globally unique,
 * and sortable by creation time — ideal primary keys for sync to the cloud.
 * Uses the platform's crypto (Node 22+ / browsers).
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // 48-bit big-endian unix ms timestamp
  bytes[0] = (now / 2 ** 40) & 0xff
  bytes[1] = (now / 2 ** 32) & 0xff
  bytes[2] = (now / 2 ** 24) & 0xff
  bytes[3] = (now / 2 ** 16) & 0xff
  bytes[4] = (now / 2 ** 8) & 0xff
  bytes[5] = now & 0xff
  bytes[6] = (bytes[6]! & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variant RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
