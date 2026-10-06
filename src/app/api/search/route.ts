import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds, scopeUserIds, type SessionUser } from '@/lib/auth'
import { canSeeTab, isMasterRole } from '@/lib/rbac'
import { projectScopeWhere } from '@/lib/pic-access'
import { ledDivisions, teamUserIds } from '@/lib/kadiv'
import { cleanText, hit, tooManyRequests } from '@/lib/security'
import { serverError } from '@/lib/api-error'
import { ROLE_LABELS, PROJECT_LIFECYCLE_LABELS } from '@/lib/constants'
import { isWeeklyReader, type SearchHit } from '@/lib/oversight-shared'
import type { NavTabId } from '@/lib/constants'

/**
 * [F2-DIREKTUR] Pencarian header (⌘K / Ctrl+K): proyek, divisi, orang, dan
 * laporan mingguan dalam cakupan akun.
 *
 *   GET ?q=  — 2–80 huruf; paling banyak 6 hasil per jenis.
 *
 * Cakupan sama dengan modul lain: proyek lewat projectScopeWhere, divisi &
 * laporan mingguan lewat cakupan entitas (kepala divisi: divisinya sendiri; PIC
 * tidak mencari divisi), orang lewat scopeUserIds (kepala divisi: timnya; PIC:
 * tidak mencari orang). Kontak (email/telepon) hanya untuk pengawas, Admin PT,
 * Super Admin/TI, dan kepala divisi untuk timnya.
 */

const PER_KIND = 6
const WEEKS_BACK = 12

const WEEKLY_STATUS: Record<string, string> = {
  DRAFT: 'Draf',
  MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan',
  DISETUJUI: 'Disetujui',
  TERKUNCI: 'Terkunci',
}

const tabIf = (user: SessionUser, tab: NavTabId) => (canSeeTab(user.role, tab) ? tab : null)

/** Saringan divisi yang boleh dicari akun ini; null = tidak mencari divisi (PIC). */
async function divisionScope(user: SessionUser): Promise<{ where: Record<string, unknown> } | null> {
  if (user.role === 'PIC_PROYEK') return null
  if (user.role === 'KEPALA_DIVISI') {
    const led = await ledDivisions(user.id)
    return { where: { id: { in: led.map((d) => d.id) } } }
  }
  const ids = await scopeEntityIds(user)
  return { where: ids === null ? {} : { entityId: { in: ids } } }
}

/** Orang yang boleh dicari, dan apakah kontaknya boleh ditampilkan. */
async function peopleScope(user: SessionUser): Promise<{ ids: string[] | null; contact: boolean } | null> {
  if (user.role === 'PIC_PROYEK') return null
  if (user.role === 'KEPALA_DIVISI') {
    const led = await ledDivisions(user.id)
    const ids = new Set<string>()
    for (const d of led) for (const id of await teamUserIds(d)) ids.add(id)
    return { ids: [...ids], contact: true }
  }
  const contact = isWeeklyReader(user.role) || user.role === 'ADMIN_PT' || isMasterRole(user.role)
  return { ids: await scopeUserIds(user), contact }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const rate = hit(`search:${user.id}`, 90, 60000)
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec, 'Terlalu banyak pencarian. Tunggu sebentar.')

  const q = cleanText(req.nextUrl.searchParams.get('q'), 80)
  if (q.length < 2) return NextResponse.json({ q, hits: [] })
  const like = { contains: q, mode: 'insensitive' as const }
  const weekMatch = /^m(?:inggu)?(?:\s*ke)?[-\s]*(\d{1,2})$/i.exec(q) ?? /^(\d{1,2})$/.exec(q)
  const weekNo = weekMatch ? Number(weekMatch[1]) : null

  try {
    const [divScope, people] = await Promise.all([divisionScope(user), peopleScope(user)])

    const [projects, divisions, users, weekly] = await Promise.all([
      db.project.findMany({
        where: {
          AND: [await projectScopeWhere(user), { lifecycle: { not: 'DIARSIPKAN' } }, { OR: [{ name: like }, { code: like }] }],
        },
        select: {
          id: true, name: true, code: true, lifecycle: true,
          entity: { select: { code: true } }, picUser: { select: { name: true } }, picName: true,
        },
        orderBy: { name: 'asc' },
        take: PER_KIND,
      }),
      divScope
        ? db.division.findMany({
            where: { AND: [divScope.where, { isActive: true }, { name: like }] },
            select: { id: true, name: true, entity: { select: { name: true } }, headUser: { select: { name: true } } },
            orderBy: { name: 'asc' },
            take: PER_KIND,
          })
        : Promise.resolve([]),
      people
        ? db.user.findMany({
            where: {
              AND: [
                people.ids === null ? {} : { id: { in: people.ids } },
                { isActive: true },
                { OR: [{ name: like }, { username: like }, { title: like }] },
              ],
            },
            select: { id: true, name: true, role: true, title: true, email: true, phone: true },
            orderBy: { name: 'asc' },
            take: PER_KIND,
          })
        : Promise.resolve([]),
      divScope
        ? db.weeklyDivisionReport.findMany({
            where: {
              AND: [
                { division: { AND: [divScope.where, { isActive: true }] } },
                { periodStart: { gte: new Date(Date.now() - WEEKS_BACK * 7 * 86400000) } },
                weekNo !== null ? { isoWeek: weekNo } : { division: { name: like } },
              ],
            },
            select: { id: true, isoWeek: true, isoYear: true, statusHeader: true, divisionId: true, division: { select: { name: true } }, entity: { select: { code: true } } },
            orderBy: [{ isoYear: 'desc' }, { isoWeek: 'desc' }],
            take: PER_KIND,
          })
        : Promise.resolve([]),
    ])

    const hits: SearchHit[] = [
      ...projects.map<SearchHit>((p) => ({
        kind: 'project' as const,
        id: p.id,
        title: p.name,
        sub: [p.code, p.entity.code, p.picUser?.name ?? p.picName ?? null, p.lifecycle !== 'AKTIF' ? (PROJECT_LIFECYCLE_LABELS[p.lifecycle] ?? p.lifecycle) : null]
          .filter(Boolean)
          .join(' · '),
        tab: tabIf(user, 'projects'),
      })),
      ...divisions.map<SearchHit>((d) => ({
        kind: 'division' as const,
        id: d.id,
        title: `Divisi ${d.name}`,
        sub: `${d.entity.name} · ${d.headUser?.name ?? 'kepala divisi belum ditetapkan'}`,
        tab: tabIf(user, 'divisions'),
        divisionId: d.id,
      })),
      ...users.map<SearchHit>((u) => ({
        kind: 'user' as const,
        id: u.id,
        title: u.name,
        sub: [ROLE_LABELS[u.role] ?? u.role, u.title].filter(Boolean).join(' · '),
        tab: null,
        email: people?.contact ? u.email : null,
        phone: people?.contact ? u.phone : null,
      })),
      ...weekly.map<SearchHit>((w) => ({
        kind: 'weekly' as const,
        id: w.id,
        title: `Laporan mingguan M${w.isoWeek} · Divisi ${w.division.name}`,
        sub: `${w.entity.code} · ${w.isoYear} · ${WEEKLY_STATUS[w.statusHeader] ?? w.statusHeader}`,
        tab: tabIf(user, 'divisions') ?? tabIf(user, 'weekly-input'),
        divisionId: w.divisionId,
      })),
    ]
    return NextResponse.json({ q, hits })
  } catch (err) {
    return serverError(err, 'Pencarian belum berhasil. Coba lagi.', 'search GET')
  }
}
