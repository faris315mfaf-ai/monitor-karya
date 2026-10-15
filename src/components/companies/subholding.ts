/**
 * Model laporan subholding di meja Super Admin (kontrak 16 Okt 2026):
 * PT BIKE Tbk (holding) → subholding → PT. Logika murni (tanpa React) untuk
 * pohon struktur, label jenis entitas, dan posisi yang boleh dipilih per
 * penempatan — sama dengan aturan roleScopeProblem di API.
 */

import { positionsFor, type Company, type UserRow } from '@/lib/accounts'

export const SUBHOLDING_TYPE = 'SUB_HOLDING'
export const ADMIN_SUBHOLDING = 'ADMIN_SUBHOLDING'

/** Peran model laporan subholding yang dibuat Super Admin, berlabel Indonesia. */
export const SH_ROLE_OPTIONS: { role: string; label: string; hint: string }[] = [
  { role: 'SUPERVISOR', label: 'Supervisor', hint: 'Menyetujui laporan seluruh subholding' },
  { role: 'KETUA_UMUM', label: 'Ketua Umum', hint: 'Dashboard laporan yang sudah disetujui' },
  { role: 'MANAJEMEN', label: 'Manajemen', hint: 'Dashboard laporan yang sudah disetujui' },
  { role: ADMIN_SUBHOLDING, label: 'Admin subholding', hint: 'Satu akun bersama per subholding untuk menambah laporan' },
]

export const SH_ROLES = SH_ROLE_OPTIONS.map((o) => o.role)

/** Jenis entitas dari API bisa SUB_HOLDING walau tipe lama hanya HOLDING | PT. */
type Kinded = { type: string }

export function isSubholding(c: Kinded | null | undefined): boolean {
  return (c?.type as string | undefined) === SUBHOLDING_TYPE
}

export function isHoldingLike(c: Kinded | null | undefined): boolean {
  return c?.type === 'HOLDING' || isSubholding(c)
}

export function entityKindLabel(c: Kinded): string {
  if (c.type === 'HOLDING') return 'Holding'
  if (isSubholding(c)) return 'Subholding'
  return 'Anak perusahaan'
}

export type SubholdingNode = {
  subholding: Company
  pts: Company[]
  /** Akun Admin subholding (aktif lebih dulu). */
  admins: UserRow[]
}

export type HoldingNode = { holding: Company; subholdings: SubholdingNode[]; directPts: Company[] }

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'id-ID')

/**
 * Pohon holding → subholding → PT. PT yang induknya subholding masuk ke
 * subholding itu; PT langsung di bawah holding tercatat di `directPts`.
 */
export function subholdingTree(companies: Company[]): HoldingNode[] {
  const holdings = companies.filter((c) => c.type === 'HOLDING').sort(byName)
  const subs = companies.filter(isSubholding).sort(byName)
  const pts = companies.filter((c) => c.type === 'PT')
  return holdings.map((h) => ({
    holding: h,
    subholdings: subs
      .filter((s) => s.parentId === h.id)
      .map((s) => ({
        subholding: s,
        pts: pts.filter((p) => p.parentId === s.id).sort(byName),
        admins: s.users
          .filter((u) => u.role === ADMIN_SUBHOLDING)
          .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)),
      })),
    directPts: pts.filter((p) => p.parentId === h.id).sort(byName),
  }))
}

/** Subholding yang induknya bukan holding yang dikenal (data lama/aneh). */
export function strayCompanies(companies: Company[]): Company[] {
  const known = new Set(companies.map((c) => c.id))
  return companies.filter((c) => c.type !== 'HOLDING' && (!c.parentId || !known.has(c.parentId)))
}

/**
 * Posisi yang boleh dipilih per penempatan (cermin roleScopeProblem di API):
 * subholding → hanya Admin subholding (+ Direktur); tingkat grup/holding →
 * posisi lama + Supervisor, Ketua Umum, Manajemen; PT → posisi perusahaan.
 */
export function positionsForPlacement(
  company: Kinded | null,
  allowed?: readonly string[]
): { role: string; label: string; hint: string }[] {
  const ok = (r: string) => !allowed || allowed.length === 0 || allowed.includes(r)
  if (isSubholding(company)) {
    const director = positionsFor({ type: 'PT' }, allowed).filter((o) => o.role === 'DIREKTUR_ENTITAS')
    return [...SH_ROLE_OPTIONS.filter((o) => o.role === ADMIN_SUBHOLDING && ok(o.role)), ...director]
  }
  const base = positionsFor(company && company.type === 'HOLDING' ? { type: 'HOLDING' } : company ? { type: 'PT' } : null, allowed)
  if (company && company.type !== 'HOLDING') return base
  // Tingkat grup / holding: pastikan Supervisor, Ketua Umum, Manajemen tersedia dan berlabel Indonesia.
  const extra = SH_ROLE_OPTIONS.filter((o) => o.role !== ADMIN_SUBHOLDING && ok(o.role) && !base.some((b) => b.role === o.role))
  return [...base, ...extra].map((o) => SH_ROLE_OPTIONS.find((s) => s.role === o.role && s.role !== ADMIN_SUBHOLDING) ?? o)
}

/** Pesan bila peran tidak cocok dengan penempatannya (null = cocok). */
export function placementProblem(role: string, company: Kinded | null): string | null {
  if (role === ADMIN_SUBHOLDING) return isSubholding(company) ? null : 'Pilih subholding untuk akun Admin subholding.'
  if (['SUPERVISOR', 'KETUA_UMUM', 'MANAJEMEN'].includes(role) && company && company.type !== 'HOLDING') {
    return 'Supervisor, Ketua Umum, dan Manajemen tidak ditempatkan di perusahaan mana pun.'
  }
  return null
}

/* ------------------------------------------------------------------
   Pindahkan PT ke subholding (SH-PINDAH-PT) — PATCH /api/companies { id, parentId }
   ------------------------------------------------------------------ */

export type MoveTarget = { id: string; name: string; kind: 'subholding' | 'holding' }

/** PT yang bisa dipindah dari meja Super Admin. */
export function canMoveCompany(c: Kinded | null | undefined): boolean {
  return c?.type === 'PT'
}

/**
 * Induk tujuan untuk memindah PT: subholding aktif dulu (urut nama), lalu
 * holding aktif. Induk sekarang tidak ditawarkan.
 */
export function moveTargets(companies: Company[], pt: Pick<Company, 'id' | 'parentId'>): MoveTarget[] {
  const ok = (c: Company) => c.isActive && c.id !== pt.id && c.id !== pt.parentId
  return [
    ...companies.filter((c) => isSubholding(c) && ok(c)).sort(byName).map((c) => ({ id: c.id, name: c.name, kind: 'subholding' as const })),
    ...companies.filter((c) => c.type === 'HOLDING' && ok(c)).sort(byName).map((c) => ({ id: c.id, name: c.name, kind: 'holding' as const })),
  ]
}

/** Pesan sukses setelah pindah; menyebut laporan terbuka yang tetap milik subholding lama. */
export function moveSuccessText(input: { pt: string; to: string; open?: number }): string {
  const base = `${input.pt} dipindah ke ${input.to}.`
  return input.open
    ? `${base} ${input.open} laporan yang masih terbuka tetap milik subholding lamanya.`
    : base
}

/** Teks yang disalin untuk kredensial awal Admin subholding. */
export function credentialText(input: { subholding: string; username: string; password: string }): string {
  return [
    `Akun Admin subholding ${input.subholding}`,
    `Username: ${input.username}`,
    `Sandi awal: ${input.password}`,
    'Wajib ganti sandi saat masuk pertama.',
  ].join('\n')
}

/** Usulan username admin seperti yang dibuat server: admin.<slug> (tanpa awalan PT/Subholding). */
export function previewAdminUsername(name: string): string {
  const slug = name
    .replace(/^(pt|sub[\s-]?holding|holding)\s+/i, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
  return slug ? `admin.${slug}` : 'admin.<nama>'
}
