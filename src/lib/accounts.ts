import { HOLDING_POSITION_OPTIONS, POSITION_OPTIONS, ROLE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Bentuk data & pembantu tampilan untuk meja akun (15 Sep 2026). Dipakai
 * bersama oleh tab "Perusahaan & Akun" dan panel akun di Pengaturan, supaya
 * aturan tampilannya satu dan tidak berbeda antar layar.
 *
 * Berkas ini aman dipanggil dari komponen klien — validasi & penulisan
 * sesungguhnya tetap di `src/lib/companies.ts` (server-only) dan API-nya.
 */

export type UserRow = {
  id: string
  name: string
  username: string | null
  email: string
  role: string
  title: string | null
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
  avatarColor: string | null
  hasPassword: boolean
  scopeEntityId: string | null
  divisionId: string | null
  divisionName: string | null
  projectId: string | null
  projectName: string | null
}

export type Company = {
  id: string
  code: string
  name: string
  type: 'HOLDING' | 'PT'
  parentId: string | null
  parentName: string | null
  logoData: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  isActive: boolean
  users: UserRow[]
  divisions: { id: string; name: string; headUserId: string | null; headName: string | null }[]
  projects: { id: string; code: string; name: string; lifecycle: string; picUserId: string | null; picName: string | null }[]
  counts: { users: number; divisions: number; projects: number; dailyReports: number; weeklyReports: number }
}

export type CompaniesData = {
  companies: Company[]
  holdingUsers: UserRow[]
  totals: { companies: number; users: number; divisions: number; projects: number }
  me: string
  /** ALL = seluruh grup (Super Admin); ENTITY = satu PT saja (Admin PT). */
  scope?: 'ALL' | 'ENTITY'
  canManageCompanies?: boolean
  /** Posisi yang boleh dibuat/diubah pemegang meja ini. */
  manageableRoles?: string[]
}

/** F1-C: sama dengan MIN_PASSWORD_LENGTH di src/lib/password-policy.ts (berkas itu khusus server). */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Kata sandi awal yang diusulkan saat pemegang meja membuat akun baru (F1-C,
 * 6 Okt 2026): acak 12 karakter per muatan halaman, bukan lagi "1234".
 * Pemilik akun wajib menggantinya saat masuk pertama (mustChangePassword).
 */
export const DEFAULT_PASSWORD = randomInitialPassword()

function randomInitialPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint32Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export const field = 'bg-surface/80 h-11 text-base'
export const selectClass =
  'h-11 w-full rounded-md border border-line bg-surface/80 px-3 text-base text-ink disabled:opacity-70'

// `sm:max-w-none` mengalahkan `sm:max-w-lg` bawaan DialogContent — tanpa itu
// lembar ini tertahan 512 px di desktop.
export const sheetClass = cn(
  'glass-modal p-0 gap-0 flex flex-col overflow-hidden',
  'w-screen h-dvh max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0',
  'sm:w-[min(96vw,60rem)] sm:max-w-none sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2'
)

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 24)
}

export function initialsOf(name: string): string {
  return (
    name
      .replace(/^(PT\.?|Holding)\s+/i, '')
      .replace(/^(Bpk\.|Ibu)\s*/i, '')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase() || '?'
  )
}

export function roleLabel(role: string): string {
  return (
    POSITION_OPTIONS.find((o) => o.role === role)?.label ??
    HOLDING_POSITION_OPTIONS.find((o) => o.role === role)?.label ??
    ROLE_LABELS[role] ??
    role
  )
}

export function roleHint(role: string): string {
  return (
    POSITION_OPTIONS.find((o) => o.role === role)?.hint ??
    HOLDING_POSITION_OPTIONS.find((o) => o.role === role)?.hint ??
    ''
  )
}

/**
 * Posisi yang boleh dipilih untuk sebuah penempatan. Akun tingkat grup hanya
 * boleh peran holding; PT hanya peran perusahaan; holding boleh keduanya —
 * persis aturan yang dijaga API.
 */
export function positionsFor(
  company: Pick<Company, 'type'> | null,
  allowed?: readonly string[]
): { role: string; label: string; hint: string }[] {
  const base = !company
    ? HOLDING_POSITION_OPTIONS
    : company.type === 'HOLDING'
      ? [...POSITION_OPTIONS, ...HOLDING_POSITION_OPTIONS]
      : POSITION_OPTIONS
  return allowed && allowed.length ? base.filter((o) => allowed.includes(o.role)) : base
}

/** Peran yang wajib menempel pada sebuah perusahaan. */
export function isEntityRole(role: string): boolean {
  return POSITION_OPTIONS.some((o) => o.role === role)
}

export async function call(
  url: string,
  method: string,
  body?: unknown
): Promise<{ ok: boolean; error?: string; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, error: res.ok ? undefined : ((json.error as string) || 'Gagal'), json }
  } catch {
    return { ok: false, error: 'Tidak dapat menghubungi server.', json: {} }
  }
}
