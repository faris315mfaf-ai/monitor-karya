import { createSessionToken as signSession, readSessionToken } from '@/lib/auth'
import { seed } from './admin-fake-db'

/** Sesi uji mengikuti penyimpanan server, bukan hanya membuat cookie sah. */
export function createSessionToken(userId: string, passwordHash: string | null) {
  const result = signSession(userId, passwordHash)
  const payload = readSessionToken(result.token)!
  seed('authSession', [{ id: payload.sid, userId, expiresAt: new Date(payload.exp * 1000), revokedAt: null }])
  return result
}
