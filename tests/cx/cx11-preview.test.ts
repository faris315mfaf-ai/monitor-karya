import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/components/app-shell', () => ({ AppShell: () => null }))

let handle: typeof import('@/components/preview/mock-api').handlePreview
beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-06T02:00:00.000Z'))
  handle = (await import('@/components/preview/mock-api')).handlePreview
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
async function request(role: string, url: string, method = 'GET', body?: unknown) {
  const response = await handle(url.split('?')[0], url, { method, ...(body ? { body: JSON.stringify(body) } : {}) }, role)
  expect(response, `${method} ${url} harus ditangani`).not.toBeNull()
  return { status: response!.status, data: await response!.json() }
}
const send = () => request('PIC_PROYEK', '/api/daily-input', 'PUT', { projectId: 'p2', action: 'submit', achievementToday: 'Integrasi data cuti selesai', obstacle: 'Perangkat belum tiba', followUp: 'Hubungi vendor besok' })

async function unlock(targetType: string, targetId: string, requester = 'PIC_PROYEK') {
  const created = await request(requester, '/api/unlock-requests', 'POST', { targetType, targetId, reason: 'Perbaikan bukti laporan yang tertukar' })
  expect(created.status).toBe(201)
  const id = created.data.item.id
  expect((await request('DIREKTUR_SDM_GA', '/api/unlock-requests', 'PATCH', { id, action: 'approve' })).status).toBe(200)
  expect((await request('TI', '/api/unlock-requests', 'PATCH', { id, action: 'execute', hours: 2 })).status).toBe(200)
  return id
}

describe('CX11 pratinjau: API yang sama, state lintas peran', () => {
  it.each(['2026-10-05T16:59:59.999Z', '2026-10-05T17:00:00.000Z', '2026-12-31T17:00:00.000Z'])('kunci tanggal WIB pada %s', async (instant) => {
    vi.setSystemTime(new Date(instant)); vi.resetModules()
    handle = (await import('@/components/preview/mock-api')).handlePreview
    const expected = new Date(Date.parse(instant) + 7 * 3600000).toISOString().slice(0, 10)
    const { data } = await request('PIC_PROYEK', '/api/daily-input')
    expect(data.todayKey).toBe(expected)
    expect(data.reportDateKey).toBe(expected)
    expect(data.reportDate).toBe(new Date(`${expected}T00:00:00+07:00`).toISOString())
  })

  it('Rina ditemukan peran yang boleh mencari orang, PIC tidak mencari orang/divisi', async () => {
    for (const role of ['KEPALA_DIVISI', 'ADMIN_PT', 'DIREKTUR_ENTITAS', 'MANAJEMEN', 'DIREKTUR_SDM_GA', 'TI', 'SUPERADMIN', 'AUDITOR']) {
      const { data } = await request(role, '/api/search?q=rina')
      expect(data.hits.some((h: { kind: string; title: string }) => h.kind === 'user' && h.title === 'Rina Kartika'), role).toBe(true)
    }
    expect((await request('PIC_PROYEK', '/api/search?q=rina')).data.hits).toEqual([])
    expect((await request('PIC_PROYEK', '/api/search?q=teknologi')).data.hits).toEqual([])
    expect((await request('ADMIN_PT', '/api/search?q=Renovasi%20Ruang')).data.hits).toEqual([])
    expect((await request('KEPALA_DIVISI', '/api/search?q=Audit%20Pajak')).data.hits).toEqual([])
  })

  it('identitas proyek/divisi dan total Ringkasan sama dengan Proyek, Divisi, dan Sheet entitas', async () => {
    const dir = (await request('DIREKTUR_ENTITAS', '/api/ringkasan')).data
    const grp = (await request('MANAJEMEN', '/api/ringkasan')).data
    const projects = (await request('DIREKTUR_ENTITAS', '/api/projects?pageSize=200')).data.items.filter((p: { lifecycle: string }) => p.lifecycle === 'AKTIF')
    expect(dir.projects.map((p: { id: string }) => p.id).sort()).toEqual(projects.map((p: { id: string }) => p.id).sort())
    for (const p of dir.projects) {
      expect(projects.find((q: { id: string }) => q.id === p.id)?.name).toBe(p.name)
      expect(grp.projects.find((q: { id: string }) => q.id === p.id)).toMatchObject({ name: p.name, progress: p.progress, status: p.status, divisionId: p.divisionId })
    }
    expect(dir.daily.expected).toBe(dir.projects.length)
    expect(Object.values(dir.counts).reduce((a, b) => Number(a) + Number(b), 0)).toBe(dir.projects.length)
    const detail = (await request('DIREKTUR_ENTITAS', '/api/entities/e1')).data
    const tree = (await request('MANAJEMEN', '/api/entities')).data.tree[0].children
    expect(detail.divisions.map((d: { id: string }) => d.id).sort()).toEqual(dir.divisions.map((d: { id: string }) => d.id).sort())
    expect(detail.currentKpi.complianceScore).toBe(tree.find((e: { id: string }) => e.id === 'e1').kpi.complianceScore)
    const team = (await request('KEPALA_DIVISI', '/api/kadiv/team')).data
    const pic = (await request('PIC_PROYEK', '/api/work-desk')).data
    expect(team.projects.find((p: { id: string }) => p.id === 'p2')?.progress).toBe(dir.projects.find((p: { id: string }) => p.id === 'p2').progress)
    expect(pic.projects.find((p: { id: string }) => p.id === 'p2')?.name).toBe(dir.projects.find((p: { id: string }) => p.id === 'p2').name)
  })

  it('kirim PIC → Admin → beku, kemudian unlock execute membuka laporan, task dan bukti sampai kedaluwarsa', async () => {
    expect((await send()).status).toBe(200)
    const inbox = (await request('ADMIN_PT', '/api/inbox')).data
    const row = inbox.daily.find((p: { projectId: string }) => p.projectId === 'p2')
    expect(row.readyToForward).toBe(true)
    expect((await request('ADMIN_PT', '/api/inbox', 'POST', { kind: 'daily', id: row.reportId })).status).toBe(200)
    expect((await send()).status).toBe(409)
    const day = (await request('PIC_PROYEK', '/api/daily-input')).data
    expect(day.projects.find((p: { id: string }) => p.id === 'p2')).toMatchObject({ editable: false, lockReason: 'FORWARDED' })
    expect((await request('PIC_PROYEK', '/api/tasks?projectId=p2')).data.locked).toBe(true)
    expect((await request('PIC_PROYEK', '/api/tasks?projectId=p2&week=2026-W41')).data.frozenDays).toContain(day.reportDate)
    const id = await unlock('DAILY_REPORT', row.reportId)
    const open = (await request('PIC_PROYEK', '/api/daily-input')).data.projects.find((p: { id: string }) => p.id === 'p2')
    expect(open).toMatchObject({ editable: true, unlock: { id, status: 'DIEKSEKUSI' } })
    expect((await request('PIC_PROYEK', '/api/tasks?projectId=p2')).data.locked).toBe(false)
    expect((await request('PIC_PROYEK', '/api/tasks?projectId=p2&week=2026-W41')).data.frozenDays).not.toContain(day.reportDate)
    expect((await request('PIC_PROYEK', '/api/evidence', 'POST', { targetType: 'DAILY_REPORT', targetId: row.reportId, url: 'https://example.com/bukti', fileName: 'Bukti perbaikan' })).status).toBe(200)
    expect((await send()).status).toBe(200)
    vi.advanceTimersByTime(2 * 3600000)
    expect((await send()).status).toBe(409)
    expect((await request('PIC_PROYEK', '/api/tasks?projectId=p2')).data.locked).toBe(true)
  })

  it('mingguan terhubung dengan penerimaan dan unlock execute/relock', async () => {
    expect((await request('KEPALA_DIVISI', '/api/weekly-input', 'POST', { action: 'submit', divisionId: 'dv-tek' })).status).toBe(200)
    expect((await request('KEPALA_DIVISI', '/api/weekly-input', 'POST', { action: 'approve', divisionId: 'dv-tek' })).status).toBe(200)
    const week = (await request('KEPALA_DIVISI', '/api/weekly-input')).data.divisions[0].report
    const inb = (await request('ADMIN_PT', '/api/inbox')).data.weekly.find((r: { reportId: string }) => r.reportId === week.id)
    expect(inb.readyToForward).toBe(true)
    expect((await request('ADMIN_PT', '/api/inbox', 'POST', { kind: 'weekly', id: week.id })).status).toBe(200)
    expect((await request('KEPALA_DIVISI', '/api/weekly-input')).data.divisions[0]).toMatchObject({ editable: false, writable: false, frozen: true })
    const id = await unlock('WEEKLY_REPORT', week.id, 'ADMIN_PT')
    expect((await request('KEPALA_DIVISI', '/api/weekly-input')).data.divisions[0]).toMatchObject({ editable: true, writable: true, frozen: false })
    expect((await request('KEPALA_DIVISI', '/api/evidence', 'POST', { targetType: 'WEEKLY_ITEM', targetId: 'i2', url: 'https://example.com/koreksi', fileName: 'Hasil koreksi' })).status).toBe(200)
    expect((await request('KEPALA_DIVISI', '/api/weekly-input', 'PUT', { divisionId: 'dv-tek', itemId: 'i2', workItem: 'Uji absensi selesai', status: 'SELESAI', aspectCategoryId: 'a1', priorityId: 'pr1' })).status).toBe(200)
    expect((await request('TI', '/api/unlock-requests', 'PATCH', { id, action: 'relock' })).status).toBe(200)
    expect((await request('KEPALA_DIVISI', '/api/evidence', 'POST', { targetType: 'WEEKLY_ITEM', targetId: 'i2', url: 'https://example.com/koreksi', fileName: 'Hasil koreksi' })).status).toBe(409)
    expect((await request('KEPALA_DIVISI', '/api/weekly-input?itemId=i2', 'DELETE')).status).toBe(409)
    expect((await request('KEPALA_DIVISI', '/api/weekly-input')).data.divisions[0].editable).toBe(false)
  })

  it('status baca catatan per akun, posting kepala divisi tampil pada PIC', async () => {
    const post = await request('KEPALA_DIVISI', '/api/project-notes', 'POST', { projectId: 'p2', body: 'Konfirmasi jadwal perangkat terbaru.' })
    expect(post.status).toBe(201)
    const before = (await request('PIC_PROYEK', '/api/project-notes?projectId=p2')).data
    expect(before.items.some((n: { body: string }) => n.body === 'Konfirmasi jadwal perangkat terbaru.')).toBe(true)
    expect(before.unread).toBeGreaterThan(0)
    const director = (await request('DIREKTUR_ENTITAS', '/api/project-notes?projectId=p2')).data.unread
    await request('PIC_PROYEK', '/api/project-notes', 'PATCH', { projectId: 'p2' })
    expect((await request('PIC_PROYEK', '/api/project-notes?projectId=p2')).data.unread).toBe(0)
    expect((await request('DIREKTUR_ENTITAS', '/api/project-notes?projectId=p2')).data.unread).toBe(director)
  })

  it('review output sama dengan PIC; Urungkan revisi putaran kedua memulihkan catatan sebelumnya', async () => {
    const initial = (await request('PIC_PROYEK', '/api/outputs?projectId=p2')).data.items.find((o: { id: string }) => o.id === 'o1')
    expect((await request('PIC_PROYEK', '/api/outputs', 'PATCH', { id: 'o1', action: 'submit' })).status).toBe(200)
    expect((await request('KEPALA_DIVISI', '/api/outputs/review')).data.queue.some((o: { id: string }) => o.id === 'o1')).toBe(true)
    const rev = await request('KEPALA_DIVISI', '/api/outputs/review', 'POST', { id: 'o1', action: 'revise', note: 'Lengkapi hasil uji versi terbaru.' })
    expect(rev.status).toBe(200)
    expect((await request('PIC_PROYEK', '/api/outputs?projectId=p2')).data.items.find((o: { id: string }) => o.id === 'o1').revisionNote).toBe('Lengkapi hasil uji versi terbaru.')
    expect((await request('KEPALA_DIVISI', '/api/outputs/review', 'POST', { ids: ['o1'], action: 'undo' })).status).toBe(200)
    expect((await request('PIC_PROYEK', '/api/outputs?projectId=p2')).data.items.find((o: { id: string }) => o.id === 'o1')).toMatchObject({ status: 'MENUNGGU_REVIEW', revisionNote: initial.revisionNote })
  })

  it.each(['/api/project-notes', '/api/unlock-requests', '/api/ringkasan/laporan-dibaca', '/api/approval-requests'])('Auditor menolak mutasi %s', async (url) => {
    expect((await request('AUDITOR', url, 'POST', { projectId: 'p2', body: 'Catatan tanpa hak tulis', weeklyReportId: 'w1', targetType: 'DAILY_REPORT', targetId: 'r-p2', reason: 'Alasan pembukaan laporan' })).status).toBe(403)
  })

  it('semua peran memiliki ID unik dan identitas proyek yang sama, termasuk PIC kosong', async () => {
    const canonical = (await request('SUPERADMIN', '/api/projects?lifecycle=ALL&pageSize=200')).data.items
    expect(canonical.find((p: { id: string }) => p.id === 'p6').picName).toBeNull()
    for (const role of ['PIC_PROYEK', 'KEPALA_DIVISI', 'ADMIN_PT', 'DIREKTUR_ENTITAS', 'MANAJEMEN', 'DIREKTUR_SDM_GA', 'TI', 'SUPERADMIN', 'AUDITOR']) {
      const list = (await request(role, '/api/projects?lifecycle=ALL&pageSize=200')).data.items
      const ids = list.map((p: { id: string }) => p.id)
      expect(new Set(ids).size, role).toBe(ids.length)
      for (const p of list) expect(canonical.find((c: { id: string }) => c.id === p.id)).toMatchObject({ name: p.name, entity: p.entity, divisionId: p.divisionId, picName: p.picName })
      const summary = (await request(role, '/api/ringkasan')).data
      const summaryIds = summary.projects.map((p: { id: string }) => p.id)
      expect(new Set(summaryIds).size, role).toBe(summaryIds.length)
      expect(summary.outputs.total).toBe(summary.divisions.reduce((n: number, d: { outputs: { total: number } }) => n + d.outputs.total, 0))
    }
  })

  it('progres task memakai computeRollup produksi dan propagasi PUT terlihat lintas peran', async () => {
    const { computeRollup } = await import('@/lib/daily-rollup')
    const { data: tasks } = await request('PIC_PROYEK', '/api/tasks?projectId=p2')
    const client = { task: { findMany: vi.fn().mockResolvedValue(tasks.tasks) }, evidence: { count: vi.fn().mockResolvedValue(0) } }
    const expected = await computeRollup('p2', new Date(tasks.workDate), client as unknown as NonNullable<Parameters<typeof computeRollup>[2]>)
    expect(expected?.progressPct).toBe(70)
    expect((await request('PIC_PROYEK', '/api/daily-input')).data.projects[0].report.progressPct).toBe(expected?.progressPct)
    expect((await request('PIC_PROYEK', '/api/tasks', 'PUT', { id: 't3', title: 'Uji coba gelombang 2', status: 'SELESAI', progressPct: 100 })).status).toBe(200)
    const after = (await request('PIC_PROYEK', '/api/daily-input')).data.projects[0].report
    expect(after.progressPct).toBe(85)
    for (const role of ['ADMIN_PT', 'DIREKTUR_ENTITAS', 'MANAJEMEN']) {
      const p = (await request(role, '/api/ringkasan')).data.projects.find((p: { id: string }) => p.id === 'p2')
      expect(p.progress, role).toBe(85)
    }
    const desk = (await request('ADMIN_PT', '/api/work-desk')).data.projects.find((p: { id: string }) => p.id === 'p2')
    expect(desk.tasks).toMatchObject({ total: 4, done: 3 })
  })

  it('kepatuhan per orang, Tim, badge PIC dan total laporan naik bersama setelah kirim', async () => {
    const before = (await request('ADMIN_PT', '/api/admin/compliance')).data
    expect(before.divisions.find((d: { id: string }) => d.id === 'dv-tek').missing.map((m: { name: string }) => m.name)).toContain('Rina Kartika')
    expect((await send()).status).toBe(200)
    const after = (await request('ADMIN_PT', '/api/admin/compliance')).data
    expect(after.totals.reported).toBe(before.totals.reported + 1)
    expect((await request('KEPALA_DIVISI', '/api/kadiv/team')).data.members.find((m: { name: string }) => m.name === 'Rina Kartika').report.state).toBe('TERKIRIM')
    expect((await request('PIC_PROYEK', '/api/nav-badges')).data.badges['daily-input']).toBeUndefined()
    expect((await request('ADMIN_PT', '/api/my-dashboard')).data.summary.dailyReceived).toBe((await request('DIREKTUR_ENTITAS', '/api/ringkasan')).data.daily.submitted)
  })

  it('riwayat hari kerja tidak memakai null libur dan label peran bukan kode mentah', async () => {
    const c = (await request('ADMIN_PT', '/api/admin/compliance')).data
    expect(c.days).toHaveLength(10)
    for (const day of c.days) expect([1, 2, 3, 4, 5]).toContain(new Date(Date.parse(day) + 7 * 3600000).getUTCDay())
    for (const d of c.divisions) {
      expect(d.history).toHaveLength(10)
      expect(d.history.every((v: unknown) => typeof v === 'number')).toBe(true)
      expect(d.history.at(-1)).toBe(d.expected ? Math.round(d.reported / d.expected * 100) : 0)
    }
    const labels = (await request('ADMIN_PT', '/api/admin/overview')).data.usersByRole
    expect(labels.find((r: { role: string }) => r.role === 'KEPALA_DIVISI').label).toBe('Kepala divisi')
    expect(labels.find((r: { role: string }) => r.role === 'PIC_PROYEK').label).not.toBe('PIC_PROYEK')
  })

  it('output diterima mengubah total PIC, kepala divisi, Direktur dan Manajemen; undo kedaluwarsa tidak mengubahnya', async () => {
    const before = (await request('MANAJEMEN', '/api/ringkasan')).data.outputs.done
    expect((await request('KEPALA_DIVISI', '/api/outputs/review', 'POST', { action: 'accept', id: 'o4' })).status).toBe(200)
    expect((await request('PIC_PROYEK', '/api/outputs?projectId=p2')).data.counts.DITERIMA).toBe(5)
    expect((await request('KEPALA_DIVISI', '/api/kadiv/team')).data.summary.outputsAccepted).toBe(5)
    expect((await request('DIREKTUR_ENTITAS', '/api/ringkasan')).data.outputs.done).toBe(before + 1)
    expect((await request('MANAJEMEN', '/api/ringkasan')).data.outputs.done).toBe(before + 1)
    vi.advanceTimersByTime(16 * 60000)
    expect((await request('KEPALA_DIVISI', '/api/outputs/review', 'POST', { action: 'undo', ids: ['o4'] })).data.ids).toEqual([])
    expect((await request('PIC_PROYEK', '/api/outputs?projectId=p2')).data.counts.DITERIMA).toBe(5)
  })

  it('unlock melindungi cakupan, izin keputusan, urutan status, dan lama maksimum', async () => {
    expect((await request('PIC_PROYEK', '/api/unlock-requests', 'POST', { targetType: 'WEEKLY_REPORT', targetId: 'w1', reason: 'Tidak boleh membuka divisi' })).status).toBe(404)
    expect((await request('KEPALA_DIVISI', '/api/unlock-requests', 'POST', { targetType: 'WEEKLY_REPORT', targetId: 'w1', reason: 'Tidak punya kapabilitas' })).status).toBe(403)
    const created = await request('PIC_PROYEK', '/api/unlock-requests', 'POST', { targetType: 'DAILY_REPORT', targetId: 'r-p2', reason: 'Perbaikan laporan proyek' })
    expect(created.status).toBe(201)
    const id = created.data.item.id
    expect((await request('TI', '/api/unlock-requests', 'PATCH', { action: 'execute', id })).status).toBe(409)
    expect((await request('ADMIN_PT', '/api/unlock-requests', 'PATCH', { action: 'approve', id })).status).toBe(403)
    expect((await request('DIREKTUR_SDM_GA', '/api/unlock-requests', 'PATCH', { action: 'approve', id })).status).toBe(200)
    expect((await request('DIREKTUR_SDM_GA', '/api/unlock-requests', 'PATCH', { action: 'approve', id })).status).toBe(409)
    const executed = await request('TI', '/api/unlock-requests', 'PATCH', { action: 'execute', id, hours: 900 })
    expect(Date.parse(executed.data.item.unlockUntil) - Date.now()).toBe(72 * 3600000)
    expect((await request('PIC_PROYEK', '/api/unlock-requests')).data.items).toHaveLength(1)
  })

  it('melewati tengah malam WIB memisahkan hari baru dan mempertahankan laporan lampau yang dibuka', async () => {
    expect((await send()).status).toBe(200)
    const id = (await request('PIC_PROYEK', '/api/daily-input')).data.projects[0].report.id
    vi.setSystemTime(new Date('2026-10-06T17:00:00.000Z'))
    const next = (await request('PIC_PROYEK', '/api/daily-input')).data
    expect(next.todayKey).toBe('2026-10-07')
    expect(next.projects[0].report).toBeNull()
    await unlock('DAILY_REPORT', id)
    const old = (await request('PIC_PROYEK', '/api/daily-input?date=2026-10-06')).data
    expect(old.projects[0]).toMatchObject({ editable: true, report: { id } })
    expect((await request('PIC_PROYEK', '/api/daily-input')).data.openDays).toContainEqual(expect.objectContaining({ reportId: id, date: '2026-10-06' }))
  })

  it('detail proyek exact-id dan ringkasan seluruh filter mengikuti cakupan entitas produksi', async () => {
    const all = (await request('ADMIN_PT', '/api/projects?lifecycle=ALL&pageSize=200')).data
    const paged = (await request('ADMIN_PT', '/api/projects?lifecycle=ALL&pageSize=1&page=2')).data
    expect(paged.items).toHaveLength(1)
    expect(paged.summary).toEqual(all.summary)
    expect(all.summary.running).toBe(all.items.filter((p: { lifecycle: string }) => p.lifecycle === 'AKTIF').length)
    expect((await request('ADMIN_PT', '/api/projects?id=p6&lifecycle=ALL')).data.items.map((p: { id: string }) => p.id)).toEqual(['p6'])
    expect((await request('ADMIN_PT', '/api/projects?id=sg1&lifecycle=ALL')).data.items).toEqual([])
    // Proyek e2 terkait e1 dapat dibaca melalui Projects, sesuai kontrak produksi.
    expect((await request('ADMIN_PT', '/api/projects?id=d2&lifecycle=ALL')).data.items.map((p: { id: string }) => p.id)).toEqual(['d2'])
    const filtered = (await request('MANAJEMEN', '/api/projects?entityId=e2&search=Portal&pageSize=1')).data
    expect(filtered.total).toBe(1)
    expect(filtered.items[0].id).toBe('sg2')
    expect(filtered.summary.running).toBe(1)
  })

  it('perbandingan progres hanya tersedia untuk kohor dengan riwayat laporan terkirim', async () => {
    expect((await request('MANAJEMEN', '/api/ringkasan')).data.progressComparison).toBeNull()
    expect((await send()).status).toBe(200)
    const { summaryFor } = await import('@/components/preview/mock-summary')
    const comparison = summaryFor('PIC_PROYEK').progressComparison
    expect(comparison).toMatchObject({ projects: 1, current: 70, asOf: '2026-10-04T17:00:00.000Z' })
    expect(comparison!.delta).toBe(comparison!.current - comparison!.previous)
    expect((await request('PIC_PROYEK', '/api/project-progress?projectId=p2')).data.plan.weeks.at(-1).actual).toBe(70)
  })

  it('bukti output dapat dibaca reviewer tetapi mutasi mematuhi cakupan dan status review', async () => {
    const review = await request('KEPALA_DIVISI', '/api/evidence?targetType=OUTPUT&targetId=o4')
    expect(review.status).toBe(200)
    expect(review.data.items.length).toBeGreaterThan(0)
    expect((await request('PIC_PROYEK', '/api/evidence?targetType=OUTPUT&targetId=p7o2')).status).toBe(404)
    expect((await request('PIC_PROYEK', '/api/evidence', 'POST', { targetType: 'OUTPUT', targetId: 'o4', url: 'https://example.com/bukti' })).status).toBe(409)
    expect((await request('KEPALA_DIVISI', '/api/evidence', 'POST', { targetType: 'OUTPUT', targetId: 'o1', url: 'https://example.com/bukti' })).status).toBe(403)
  })

  it('total akun dan proyek panel TI/Auditor berasal dari katalog yang sama', async () => {
    const system = (await request('TI', '/api/system')).data
    const companies = (await request('SUPERADMIN', '/api/companies')).data
    expect(system.data).toMatchObject({ entities: companies.totals.companies, projects: companies.totals.projects, divisions: companies.totals.divisions })
    expect(system.access.users).toHaveLength(companies.totals.users)
    expect(system.access.byRole.reduce((n: number, r: { count: number }) => n + r.count, 0)).toBe(companies.totals.users)
    const audit = (await request('AUDITOR', '/api/system/grup')).data
    // [T3-A4] PT. SPKD (e4) ikut terhitung sejak menjadi PT contoh drill-down Manajemen.
    expect(audit.late.byEntity.map((e: { id: string }) => e.id).sort()).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(audit.audit.total).toBe((await request('AUDITOR', '/api/audit-logs')).data.total)
  })

  it('drill-down per perusahaan: proyek PT. SPKD, eskalasi proyek, dan arsip laporan harian per proyek', async () => {
    const mgr = (await request('MANAJEMEN', '/api/ringkasan')).data
    const spkd = mgr.projects.filter((p: { entityName: string }) => p.entityName === 'PT. SPKD')
    expect(spkd.map((p: { name: string }) => p.name).sort()).toEqual(['MEDCREATIX', 'MEDPAY', 'SIM RS'])
    expect(mgr.byEntity.map((e: { id: string }) => e.id)).toContain('e4')
    // Eskalasi menempel pada beberapa proyek: campur DIAJUKAN/DITINJAU, tepat satu overdue.
    const withEsc = mgr.projects.filter((p: { escalations?: unknown[] }) => (p.escalations ?? []).length > 0)
    expect(withEsc.map((p: { name: string }) => p.name).sort()).toEqual(['MEDCREATIX', 'MEDPAY', 'Renovasi Gudang Cikarang', 'SIM RS'])
    const escalations = withEsc.flatMap((p: { escalations: { status: string; overdue: boolean; ageDays: number; raisedAt: string }[] }) => p.escalations)
    expect(new Set(escalations.map((e) => e.status))).toEqual(new Set(['DIAJUKAN', 'DITINJAU']))
    expect(escalations.filter((e) => e.overdue)).toHaveLength(1)
    for (const e of escalations) expect(e.ageDays).toBe(Math.floor((Date.now() - Date.parse(e.raisedAt)) / 86400000))
    // Arsip laporan harian: filter per proyek + halaman, status beragam, satu terlambat.
    const sim = (await request('MANAJEMEN', '/api/daily-reports?projectId=sp1&pageSize=14')).data
    expect(sim).toMatchObject({ total: 12, page: 1, pageSize: 14 })
    expect(sim.items).toHaveLength(12)
    expect(sim.items.every((i: { projectId: string }) => i.projectId === 'sp1')).toBe(true)
    expect(new Set(sim.items.map((i: { status: string }) => i.status))).toEqual(new Set(['SELESAI', 'ON_PROGRESS', 'TERKENDALA', 'TIDAK_ADA_PERUBAHAN']))
    expect(sim.items.filter((i: { isLate: boolean }) => i.isLate)).toHaveLength(1)
    expect(Date.parse(sim.items[0].reportDate)).toBeGreaterThan(Date.parse(sim.items.at(-1).reportDate))
    expect(sim.items[0].project).toMatchObject({ id: 'sp1', name: 'SIM RS' })
    const paged = (await request('MANAJEMEN', '/api/daily-reports?projectId=sp1&pageSize=5&page=2')).data
    expect(paged.items).toHaveLength(5)
    expect(paged.items[0].id).toBe(sim.items[5].id)
    expect((await request('SUPERADMIN', '/api/daily-reports?projectId=sp2')).data.total).toBe(10)
    // Parameter lama tetap berfungsi dan cakupan entitas tetap dijaga.
    const done = (await request('MANAJEMEN', '/api/daily-reports?projectId=sp1&status=SELESAI')).data
    expect(done.items.every((i: { status: string }) => i.status === 'SELESAI')).toBe(true)
    expect(done.total).toBe(sim.items.filter((i: { status: string }) => i.status === 'SELESAI').length)
    const found = (await request('MANAJEMEN', '/api/daily-reports?search=sim%20rs&pageSize=50')).data
    expect(new Set(found.items.map((i: { projectId: string }) => i.projectId))).toEqual(new Set(['sp1']))
    expect((await request('ADMIN_PT', '/api/daily-reports?projectId=sp1')).data.total).toBe(0)
    const unlock = (await request('ADMIN_PT', '/api/daily-reports?for=unlock&pageSize=40')).data
    expect(unlock.items.length).toBeGreaterThan(0)
  })

  it('butir mingguan dibuat, dipindah dan dihapus dengan total penerimaan yang sama', async () => {
    const put = { divisionId: 'dv-tek', workItem: 'Uji pemulihan arsip', status: 'ON_PROGRESS', progressPct: 25, aspectCategoryId: 'a1', priorityId: 'pr1', workDate: '2026-10-06' }
    const created = await request('KEPALA_DIVISI', '/api/weekly-input', 'PUT', put)
    expect(created.status).toBe(200)
    const itemId = created.data.itemId
    const inbox = (await request('ADMIN_PT', '/api/inbox')).data.weekly.find((r: { reportId: string }) => r.reportId === 'w1')
    expect(inbox.itemCount).toBe(7)
    expect((await request('KEPALA_DIVISI', '/api/weekly-input', 'PATCH', { divisionId: 'dv-tek', moves: [{ itemId, workDate: '2026-10-07', position: 3 }] })).status).toBe(200)
    expect((await request('KEPALA_DIVISI', '/api/weekly-input')).data.divisions[0].report.items.find((i: { id: string }) => i.id === itemId).workDate).toBe('2026-10-06T17:00:00.000Z')
    expect((await request('KEPALA_DIVISI', `/api/weekly-input?itemId=${itemId}`, 'DELETE')).status).toBe(200)
    expect((await request('ADMIN_PT', '/api/inbox')).data.weekly.find((r: { reportId: string }) => r.reportId === 'w1').itemCount).toBe(6)
  })

  it('interceptor mengikuti pergantian peran klien tanpa kehilangan laporan PIC', async () => {
    const realFetch = vi.fn()
    vi.stubGlobal('window', { fetch: realFetch, location: { origin: 'http://localhost:3200' } })
    const { installMock } = await import('@/components/preview/preview-app')
    installMock('PIC_PROYEK')
    const sent = await window.fetch('/api/daily-input', { method: 'PUT', body: JSON.stringify({ projectId: 'p2', action: 'submit', achievementToday: 'Uji perangkat selesai', obstacle: 'Perangkat belum tiba', followUp: 'Hubungi vendor besok' }) })
    expect(sent.status).toBe(200)
    installMock('ADMIN_PT')
    const inbox = await window.fetch('/api/inbox').then((r) => r.json())
    const row = inbox.daily.find((p: { projectId: string }) => p.projectId === 'p2')
    expect(row.readyToForward).toBe(true)
    expect((await window.fetch('/api/inbox', { method: 'POST', body: JSON.stringify({ kind: 'daily', id: row.reportId }) })).status).toBe(200)
    installMock('AUDITOR')
    expect((await window.fetch('/api/inbox', { method: 'POST', body: JSON.stringify({ kind: 'daily', id: row.reportId }) })).status).toBe(403)
    expect(realFetch).not.toHaveBeenCalled()
  })

})
