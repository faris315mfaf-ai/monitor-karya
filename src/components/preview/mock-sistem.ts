/**
 * [F3-B] Data contoh /pratinjau untuk endpoint akun & sistem yang belum
 * ditangani area lain: panel Pengaturan (/api/profile, /api/profile/password)
 * dan keluar akun (/api/auth/logout). Tanpa basis data; perubahan hanya hidup
 * selama halaman terbuka. Aturan validasi mengikuti route aslinya agar pesan
 * galat di pratinjau sama dengan produksi.
 */

import { ROLE_LABELS } from '@/lib/constants'
import { MAX_PASSWORD_LENGTH, passwordProblem } from '@/lib/password-policy'
import * as mock from '@/components/preview/mock-data'
import { actor, people, groupRoles as GROUP_ROLES } from './mock-catalog'

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
const H = 3600000
const ago = (h: number) => new Date(Date.now() - h * H).toISOString()
const body = (init?: RequestInit) => {
  try {
    return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
  } catch {
    return null
  }
}

const HOLDING = { id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE', type: 'HOLDING', logoData: null }
const ENTITY = { id: 'e1', name: 'PT Ratu Karya', code: 'RTK', type: 'PT', logoData: null }

/** Ubahan profil per peran (nama/telepon) selama halaman terbuka. */
const edits: Record<string, { name?: string; phone?: string | null }> = {}

function profile(role: string) {
  const p = { ...people.find((p) => p.id === actor(role).id)!, ...edits[role] }
  return {
    id: `pratinjau-${role}`,
    name: p.name,
    email: p.email,
    phone: p.phone,
    role,
    roleLabel: ROLE_LABELS[role] ?? role,
    avatarColor: null,
    entity: GROUP_ROLES.includes(role) ? null : ENTITY,
    holding: HOLDING.name,
    holdingBrand: { id: HOLDING.id, name: HOLDING.name, logoData: HOLDING.logoData },
    projects:
      role === 'PIC_PROYEK'
        ? mock.deskPic.projects.map((x) => ({ id: x.id, code: x.code, name: x.name, phase: x.phase })).sort((a, b) => a.code.localeCompare(b.code))
        : [],
    divisions: role === 'KEPALA_DIVISI' ? [{ id: 'dv-tek', name: 'Teknologi' }] : [],
    lastLoginAt: ago(2),
    memberSince: '2026-07-01T02:00:00.000Z',
  }
}

/** PATCH /api/profile — aturan sama dengan src/app/api/profile/route.ts. */
function patchProfile(role: string, init?: RequestInit) {
  const b = body(init)
  if (!b) return json({ error: 'Permintaan tidak valid' }, 400)
  const data: { name?: string; phone?: string | null } = {}
  if (typeof b.name === 'string') {
    const name = b.name.trim()
    if (name.length < 2 || name.length > 80) return json({ error: 'Nama harus 2–80 karakter' }, 422)
    data.name = name
  }
  if (typeof b.phone === 'string') {
    const phone = b.phone.trim()
    if (phone && !/^\+?[0-9\s-]{8,20}$/.test(phone)) return json({ error: 'Nomor telepon tidak valid' }, 422)
    data.phone = phone || null
  }
  if (Object.keys(data).length === 0) return json({ error: 'Tidak ada yang diubah' }, 400)
  edits[role] = { ...edits[role], ...data }
  const user = people.find((p) => p.id === actor(role).id)
  if (user) Object.assign(user, data)
  const p = profile(role)
  return json({ ok: true, name: p.name, phone: p.phone })
}

/**
 * POST /api/profile/password — aturan sama dengan route aslinya. Pratinjau
 * tidak menyimpan kata sandi: kata sandi saat ini "salah" sengaja ditolak agar
 * keadaan galat bisa dicoba.
 */
function changePassword(init?: RequestInit) {
  const b = body(init)
  if (!b) return json({ error: 'Permintaan tidak valid' }, 400)
  const current = typeof b.currentPassword === 'string' ? b.currentPassword : ''
  const next = typeof b.newPassword === 'string' ? b.newPassword : ''
  if (current.length > MAX_PASSWORD_LENGTH || next.length > MAX_PASSWORD_LENGTH) {
    return json({ error: `Kata sandi maksimal ${MAX_PASSWORD_LENGTH} karakter.` }, 422)
  }
  const problem = passwordProblem(next, { current })
  if (problem) return json({ error: problem }, 422)
  if (!current || current.toLowerCase() === 'salah') return json({ error: 'Kata sandi saat ini salah.' }, 422)
  return json({ ok: true })
}

export function handle(path: string, _url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const method = init?.method ?? 'GET'
  if (path === '/api/profile') {
    if (method === 'GET') return json(profile(role))
    if (method === 'PATCH') return patchProfile(role, init)
    return json({ error: 'Metode tidak didukung' }, 405)
  }
  if (path === '/api/profile/password') {
    return method === 'POST' ? changePassword(init) : json({ error: 'Metode tidak didukung' }, 405)
  }
  // Pratinjau tidak punya sesi; keluar cukup dijawab ok agar alurnya bisa dicoba.
  if (path === '/api/auth/logout') return json({ ok: true })
  return null
}
