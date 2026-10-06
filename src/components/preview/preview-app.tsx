'use client'

import { AppShell } from '@/components/app-shell'
import * as mock from '@/components/preview/mock-data'
import * as mockPic from '@/components/preview/mock-pic'
import * as mockKadiv from '@/components/preview/mock-kadiv'
import * as mockAdmin from '@/components/preview/mock-admin'
import * as mockOversight from '@/components/preview/mock-oversight'
import * as mockGroup from '@/components/preview/mock-group' // [F2-GRUP]
import * as mockSistem from '@/components/preview/mock-sistem' // [F3-B]
import * as mockLaporan from '@/components/preview/mock-laporan' // [F3-A]
import * as mockProyek from '@/components/preview/mock-proyek' // [F3-A]

// [F2-GRUP] mockGroup di depan: antrean buka kunci/cuti peran grup menimpa data Admin hanya untuk peran grup.
// [F3-A] mockLaporan paling depan: laporan harian non-PIC, task, bukti, penerimaan, dan efek samping
// buka kunci (mengembalikan null untuk yang ditangani mock lain). mockProyek di belakang: proyek,
// eskalasi, arsip mingguan; /api/deadline-proposals tetap milik mockPic/mockOversight.
const AREA_MOCKS = [mockLaporan, mockGroup, mockPic, mockKadiv, mockAdmin, mockOversight, mockSistem, mockProyek]

const ROLES: Record<string, { name: string; dash: unknown }> = {
  MANAJEMEN: { name: 'Ris Hartanto', dash: { kind: 'OVERSIGHT' } },
  DIREKTUR_ENTITAS: { name: 'Hadi Santoso', dash: { kind: 'OVERSIGHT' } },
  KEPALA_DIVISI: { name: 'Andi Wijaya', dash: mock.kadiv },
  ADMIN_PT: { name: 'Maya Lestari', dash: mock.admin },
  PIC_PROYEK: { name: 'Rina Kartika', dash: mock.pic },
  SUPERADMIN: { name: 'Super Admin', dash: { kind: 'OVERSIGHT' } },
  // [P2-D] peran grup lain: layar pengawas (docs/design/peran/06–08)
  DIREKTUR_SDM_GA: { name: 'Dewi Kartika', dash: { kind: 'OVERSIGHT' } },
  TI: { name: 'Tim TI', dash: { kind: 'OVERSIGHT' } },
  AUDITOR: { name: 'Yusuf Pratama', dash: { kind: 'OVERSIGHT' } },
}

/** Peran tanpa lingkup PT (membaca seluruh grup). */
const GROUP_ROLES = ['MANAJEMEN', 'SUPERADMIN', 'DIREKTUR_SDM_GA', 'TI', 'AUDITOR']

let installed = false
function installMock(role: string) {
  if (installed || typeof window === 'undefined') return
  installed = true
  const real = window.fetch.bind(window)
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = url.replace(window.location.origin, '').split('?')[0]
    for (const m of AREA_MOCKS) {
      const r = m.handle(path, url, init, role)
      if (r) return r
    }
    if (path === '/api/ringkasan') return json(mock.ringkasan)
    if (path === '/api/my-dashboard') return json(ROLES[role]?.dash ?? { kind: 'OVERSIGHT' })
    if (path === '/api/notifications') return json(init?.method === 'PATCH' ? { ok: true } : mock.notifications)
    if (path === '/api/entity-activity') return json(mock.entityActivity)
    if (path === '/api/companies' || path === '/api/companies/users') {
      return json(!init?.method || init.method === 'GET' ? mock.companies : { ok: true, entity: { id: 'c-ratu' } })
    }
    // [F2-URUNGKAN] tiket contoh agar toast "Urungkan" bisa dicoba di pratinjau.
    if (path === '/api/projects/approve') return json({ ok: true, undoToken: 'pratinjau' })
    if (path === '/api/undo') return json({ ok: true, message: 'Persetujuan proyek diurungkan.' })
    if (path === '/api/work-desk') return workDesk(role, init)
    if (path === '/api/tasks') return tasks(url, init)
    if (path === '/api/weekly-input') {
      if (init?.method === 'POST') {
        const b = JSON.parse(String(init.body ?? '{}')) as { action?: string }
        const r = mock.weeklyInput.divisions[0].report
        if (b.action === 'approve') Object.assign(r, { statusHeader: 'DISETUJUI', approvedAt: new Date().toISOString() })
        else Object.assign(r, { statusHeader: 'MENUNGGU_PERSETUJUAN', submittedAt: new Date().toISOString() })
        return json({ ok: true })
      }
      return json(init?.method && init.method !== 'GET' ? { ok: true } : mock.weeklyInput)
    }
    if (path.startsWith('/api/')) {
      // [F3-B] endpoint tanpa data contoh dicatat agar mudah dilacak (window.__pratinjauMiss).
      const miss = `${init?.method ?? 'GET'} ${path}`
      const w = window as unknown as { __pratinjauMiss?: string[] }
      ;(w.__pratinjauMiss ??= []).push(miss)
      console.warn(`[pratinjau] belum ada data contoh: ${miss}`)
      return json({ error: 'Pratinjau tanpa basis data' }, 503)
    }
    return real(input, init)
  }
}

/** Meja kerja contoh; pengingat & centang task mengubah data contoh agar muat ulang tetap konsisten. */
function workDesk(role: string, init?: RequestInit) {
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  if (init?.method === 'POST') {
    const b = JSON.parse(String(init.body ?? '{}')) as { action?: string; projectId?: string }
    const at = new Date().toISOString()
    const targets = mock.deskAdmin.projects.filter((p) => p.pic && !p.report?.submittedAt && !p.remindedAt && (b.action === 'remind-all-pics' || p.id === b.projectId))
    targets.forEach((p) => (p.remindedAt = at))
    if (b.action === 'remind-all-pics') return json({ ok: true, sent: targets.map((p) => ({ projectId: p.id, picName: p.picName, remindedAt: at })), skipped: 0 })
    const p = targets[0]
    return p ? json({ ok: true, projectId: p.id, picName: p.picName, remindedAt: at }) : json({ error: 'Sudah diingatkan hari ini' }, 409)
  }
  if (role === 'PIC_PROYEK') return json(mock.deskPic)
  if (role === 'KEPALA_DIVISI') return json(mock.deskKadiv)
  return json(mock.deskAdmin)
}

function tasks(url: string, init?: RequestInit) {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }))
  if (init?.method === 'PUT') {
    const b = JSON.parse(String(init.body ?? '{}')) as { id: string; status: string; progressPct: number }
    for (const [pid, list] of Object.entries(mock.deskTasks)) {
      const t = list.find((x) => x.id === b.id)
      if (!t) continue
      Object.assign(t, { status: b.status, progressPct: b.progressPct })
      const p = mock.deskPic.projects.find((x) => x.id === pid)
      if (p) p.tasks = { total: list.length, done: list.filter((x) => x.status === 'SELESAI').length, blocked: list.filter((x) => x.status === 'TERKENDALA').length }
    }
    return json({ ok: true })
  }
  const pid = new URL(url, window.location.origin).searchParams.get('projectId') ?? ''
  return json({ workDate: mock.deskPic.today, locked: mock.deskPic.locked, tasks: mock.deskTasks[pid] ?? [] })
}

export function PreviewApp({ role }: { role: string }) {
  const r = ROLES[role] ? role : 'MANAJEMEN'
  installMock(r)
  return (
    <AppShell
      user={{ id: `pratinjau-${r}`, name: ROLES[r].name, email: 'pratinjau@contoh.id', role: r, scopeEntityId: GROUP_ROLES.includes(r) ? null : 'e1', avatarColor: null }}
      branding={{ holding: { id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE', type: 'HOLDING', logoData: null }, entity: GROUP_ROLES.includes(r) ? null : { id: 'e1', name: 'PT Ratu Karya', code: 'RTK', type: 'PT', logoData: null }, lastLoginAt: 'pratinjau' }}
    />
  )
}
