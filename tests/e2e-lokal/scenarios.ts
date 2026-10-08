import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { assertFixtureComplianceScope, HttpActor, Report } from './harness'
import { DAY_KEY, WEEK, type Fixture } from './fixture'
import { assertLocalTarget } from './guard.mjs'

type Row = Record<string, any>
export async function runScenarios(f: Fixture, phase: 'before' | 'after', report: Report) {
  const target = assertLocalTarget()
  const db = new PrismaClient({ datasourceUrl: target.databaseUrl })
  const actors = new Map<string, HttpActor>()
  async function actor(key: string) {
    if (!actors.has(key)) {
      assert(f.users[key], `Akun fixture ${key} harus ada`)
      const a = new HttpActor(target.baseUrl, report)
      await a.login(f.users[key].username, f.password)
      actors.set(key, a)
    }
    return actors.get(key)!
  }
  const find = (rows: Row[], id: string) => {
    const row = rows.find(r => r.id === id || r.projectId === id || r.divisionId === id)
    assert(row, `Baris ${id} harus tampak pada API lintas peran`)
    return row
  }
  async function evidence(a: HttpActor, targetType: string, targetId: string, expected = 200) {
    return a.request('POST', '/api/evidence', { targetType, targetId, fileName: `Bukti lokal ${f.runId}`, url: `${target.baseUrl}/login` }, expected)
  }
  const dailyBody = (projectId: string) => ({ projectId, reportDate: DAY_KEY, action: 'submit', status: 'ON_PROGRESS', achievementToday: 'Integrasi layanan diuji dan dicatat.', followUp: 'Lanjutkan validasi data.', progressPct: 35 })
  const getReport = (projectId: string) => db.dailyProjectReport.findUniqueOrThrow({ where: { projectId_reportDate: { projectId, reportDate: new Date(`${DAY_KEY}T00:00:00+07:00`) } } })
  try {
    await report.scenario('A2-00', 'Sesi HTTP sungguhan dan jam server uji', async () => {
      const p = await actor('pic')
      const data = await p.request('GET', '/api/daily-input')
      assert.equal(data.todayKey, DAY_KEY, 'Server wajib memakai preload tanggal uji')
      assert.equal(data.locked, phase === 'after', 'Server harus sesuai fase sebelum/sesudah 17.00 WIB')
      assert.equal(data.projects.length, 3)
      report.evidence(`Tanggal WIB ${data.todayKey}; locked=${data.locked}; 3 proyek PIC.`)
    })
    if (report.failed) return // Jangan mutasi aplikasi pada jam/target yang keliru.
    if (phase === 'after') {
      await report.scenario('A2-10', 'Setelah 17.00 WIB: tugas, laporan, bukti dan pengingat terkunci', async () => {
        const pic = await actor('pic'); const admin = await actor('admin')
        const projectId = f.projectIds[2] // tidak punya buka kunci aktif
        const before = await getReport(projectId)
        const task = await db.task.findFirstOrThrow({ where: { projectId, scope: 'HARIAN' } })
        await pic.request('PUT', '/api/tasks', { id: task.id, title: 'Percobaan perubahan lewat tenggat', status: 'SELESAI', progressPct: 100 }, 409)
        await pic.request('PUT', '/api/daily-input', dailyBody(projectId), 409)
        await evidence(pic, 'DAILY_REPORT', before.id, 409)
        const remindersBefore = await db.notificationLog.count({ where: { userId: f.users.pic.id } })
        await admin.request('POST', '/api/work-desk', { action: 'remind-pic', projectId }, 409)
        assert.equal(await db.notificationLog.count({ where: { userId: f.users.pic.id } }), remindersBefore)
        const desk = await pic.request('GET', '/api/work-desk')
        assert.equal(desk.locked, true); assert.equal(desk.countdown.passed, true)
        const input = await pic.request('GET', '/api/daily-input')
        assert.equal(find(input.projects, projectId).lockReason, 'TIME')
        assert.equal(find(input.projects, projectId).editable, false)
        assert.equal((await getReport(projectId)).updatedAt.toISOString(), before.updatedAt.toISOString())
        report.evidence('HTTP 409 untuk 4 mutasi; report.updatedAt dan jumlah notifikasi tetap; countdown.passed=true. Label cincin diuji parent di browser.')
      })
      await report.scenario('A2-04b', 'Setelah serah 17.00, Ringkasan Direktur memuat minggu berjalan dan poin kepala divisi', async () => {
        const director = await actor('director')
        const summary = await director.request('GET', '/api/ringkasan')
        assert.equal(summary.reportWeek.isoWeek, 41)
        assert.equal(summary.reportWeek.current, true)
        const weekly = find(summary.divisions, f.divisionId).weekly
        assert.equal(weekly.statusHeader, 'DISETUJUI')
        assert.equal(weekly.state, 'sent')
        assert.deepEqual(weekly.headSummary.points, [`Tiga proyek diperiksa ${f.runId}`, 'Satu output diterima kepala divisi.'])
        assert.equal(weekly.comments, 2)
        report.evidence('M41 tampil setelah Kamis 17.00; poin identik, lencana sent dan 2 tanggapan Direktur/kepala divisi.')
      })
      return
    }

    await report.scenario('A2-01', 'PIC membuat progres 3 proyek, mengirim laporan, angka Admin konsisten', async () => {
      const pic = await actor('pic'); const admin = await actor('admin')
      for (const [i, projectId] of f.projectIds.entries()) {
        const created = await pic.request('POST', '/api/tasks', { projectId, title: `Validasi proyek ${i + 1}`, status: 'ON_PROGRESS', progressPct: 35, picUserId: f.users.pic.id })
        assert.equal(created.task.progressPct, 35)
        await evidence(pic, 'TASK', created.task.id)
        await pic.request('PUT', '/api/tasks', { id: created.task.id, title: `Validasi proyek ${i + 1}`, status: 'ON_PROGRESS', progressPct: 45 })
        const submitted = await pic.request('PUT', '/api/daily-input', dailyBody(projectId))
        assert.equal(submitted.submitted, true)
        const inbox = await admin.request('GET', '/api/inbox')
        const row = find(inbox.daily, projectId)
        assert(row.submittedAt); assert.equal(row.progressPct, 45); assert.equal(row.readyToForward, true)
        const desk = await admin.request('GET', '/api/work-desk')
        const dashboard = await admin.request('GET', '/api/my-dashboard')
        assert.equal(desk.intake.received, i + 1)
        assert.equal(dashboard.summary.dailyReceived, desk.intake.received)
        assert.equal(desk.intake.missing, 2 - i)
        const compliance = await admin.request('GET', '/api/admin/compliance')
        assert.equal(compliance.totals.expected, 1)
        assert.equal(compliance.totals.reported, i === 2 ? 1 : 0, 'Satu PIC baru lengkap setelah ketiga proyek terkirim')
      }
      const progress = await pic.request('PUT', '/api/progress-reports', { projectId: f.projectIds[1], cadence: 'MINGGUAN', periodKey: WEEK, status: 'ON_PROGRESS', summary: 'Kemajuan mingguan tiga proyek.', progressPct: 45, action: 'save' })
      await evidence(pic, 'PROGRESS_REPORT', progress.reportId)
      await pic.request('PUT', '/api/progress-reports', { projectId: f.projectIds[1], cadence: 'MINGGUAN', periodKey: WEEK, status: 'ON_PROGRESS', summary: 'Kemajuan mingguan tiga proyek.', progressPct: 45, action: 'submit' })
      const count = await db.dailyProjectReport.count({ where: { projectId: { in: f.projectIds }, submittedAt: { not: null }, progressPct: 45 } })
      assert.equal(count, 3)
      report.evidence('3 laporan PostgreSQL bernilai 45%; Meja kerja dan hero Admin 3 masuk; kepatuhan 1/1 PIC setelah laporan ketiga.')
    })

    await report.scenario('A2-02', 'Penerusan membekukan laporan; Urungkan; PIC → SDM → TI membuka koreksi dan bukti', async () => {
      const pic = await actor('pic'); const admin = await actor('admin'); const projectId = f.projectIds[0]
      const row = await getReport(projectId)
      const task = await db.task.findFirstOrThrow({ where: { projectId } })
      const forward = await admin.request('POST', '/api/inbox', { kind: 'daily', id: row.id })
      assert.equal(typeof forward.undoToken, 'string')
      for (const action of ['save', 'submit']) await pic.request('PUT', '/api/daily-input', { ...dailyBody(projectId), action }, 409)
      await pic.request('PUT', '/api/tasks', { id: task.id, title: task.title, status: 'ON_PROGRESS', progressPct: 65 }, 409)
      await evidence(pic, 'DAILY_REPORT', row.id, 409)
      let input = await pic.request('GET', '/api/daily-input')
      assert.equal(find(input.projects, projectId).lockReason, 'FORWARDED')
      assert((await getReport(projectId)).isLocked)
      await admin.request('POST', '/api/undo', { token: forward.undoToken })
      assert.equal((await getReport(projectId)).forwardedAt, null)
      assert.equal((await getReport(projectId)).isLocked, false)
      await admin.request('POST', '/api/inbox', { kind: 'daily', id: row.id })
      const unlock = await pic.request('POST', '/api/unlock-requests', { targetType: 'DAILY_REPORT', targetId: row.id, reason: 'Perlu memperbaiki capaian dan menambah bukti terbaru.' }, 201)
      const sdm = await actor('sdm'); const ti = await actor('ti')
      await sdm.request('PATCH', '/api/unlock-requests', { id: unlock.item.id, action: 'approve' })
      await ti.request('PATCH', '/api/unlock-requests', { id: unlock.item.id, action: 'execute', hours: 1 })
      input = await pic.request('GET', '/api/daily-input')
      assert.equal(find(input.projects, projectId).editable, true)
      assert.equal(find(input.projects, projectId).unlock.status, 'DIEKSEKUSI')
      await pic.request('PUT', '/api/tasks', { id: task.id, title: task.title, status: 'ON_PROGRESS', progressPct: 65 })
      await evidence(pic, 'DAILY_REPORT', row.id)
      await pic.request('PUT', '/api/daily-input', { ...dailyBody(projectId), achievementToday: 'Koreksi capaian melalui buka kunci yang disetujui.' })
      const corrected = await getReport(projectId)
      assert.equal(corrected.progressPct, 65); assert(corrected.forwardedAt)
      const proof = await pic.request('GET', `/api/evidence?targetType=DAILY_REPORT&targetId=${row.id}`)
      assert.equal(proof.items.length, 1)
      const audit = await db.auditLog.findFirst({ where: { targetId: row.id, action: 'SUBMIT_DAILY_REPORT', afterData: { contains: unlock.item.id } } })
      assert(audit, 'Koreksi pascapenerusan harus tercatat bersama pengajuan buka kunci')
      report.evidence(`Laporan ${row.id}: beku 409, Urungkan berhasil, buka kunci ${unlock.item.id}, koreksi 65% dan bukti tersimpan dengan audit.`)
    })

    await report.scenario('A2-05', 'Output dikirim dengan bukti, diterima kepala divisi, angka PIC dan Direktur berubah', async () => {
      const pic = await actor('pic'); const head = await actor('head'); const director = await actor('director')
      const out = await pic.request('POST', '/api/outputs', { projectId: f.projectIds[0], title: `Laporan hasil ${f.runId}`, dueDate: '2026-10-15' }, 201)
      const id = out.output.id
      await pic.request('PATCH', '/api/outputs', { id, action: 'submit' }, 422)
      await evidence(pic, 'OUTPUT', id)
      await pic.request('PATCH', '/api/outputs', { id, action: 'submit' })
      const queue = await head.request('GET', `/api/outputs/review?divisionId=${f.divisionId}`)
      assert.equal(find(queue.queue, id).status, 'MENUNGGU_REVIEW')
      await head.request('POST', '/api/outputs/review', { id, action: 'accept' })
      const mine = await pic.request('GET', `/api/outputs?projectId=${f.projectIds[0]}`)
      assert.equal(mine.counts.DITERIMA, 1); assert.equal(find(mine.items, id).status, 'DITERIMA')
      const summary = await director.request('GET', `/api/ringkasan?week=${WEEK}`)
      assert.equal(summary.outputs.done, 1)
      assert.equal(find(summary.projects, f.projectIds[0]).outputsDone, 1)
      const stored = await db.output.findUniqueOrThrow({ where: { id } })
      assert.equal(stored.reviewerId, f.users.head.id); assert.equal(stored.status, 'DITERIMA')
      report.evidence(`Output ${id}: DITERIMA; counts PIC=1 dan outputsDone Direktur=1; reviewerId tersimpan.`)
    })

    let weeklyId: string | undefined
    const weeklyBody = { divisionId: f.divisionId, week: WEEK, workItem: 'Validasi integrasi tiga proyek', targetOutput: 'Laporan pengujian', picName: 'PIC uji', picTitle: 'Pelaksana', status: 'ON_PROGRESS', progressPct: 45, achievementThisWeek: 'Integrasi telah diuji.', followUp: 'Selesaikan evaluasi.', aspectCategoryId: f.aspectId, priorityId: f.priorityId }
    await report.scenario('A2-03', 'Serah Kamis sebelum 17.00 dan persetujuan mingguan', async () => {
      const head = await actor('head'); const admin = await actor('admin')
      const item = await head.request('PUT', '/api/weekly-input', weeklyBody)
      weeklyId = item.reportId
      await evidence(head, 'WEEKLY_ITEM', item.itemId)
      const submit = await head.request('POST', '/api/weekly-input', { divisionId: f.divisionId, week: WEEK, action: 'submit' })
      assert.equal(submit.statusHeader, 'MENUNGGU_PERSETUJUAN')
      const approved = await head.request('POST', '/api/weekly-input', { divisionId: f.divisionId, week: WEEK, action: 'approve' })
      assert.equal(approved.statusHeader, 'DISETUJUI')
      const inbox = await admin.request('GET', '/api/inbox')
      assert.equal(find(inbox.weekly, f.divisionId).readyToForward, true)
      report.evidence(`Laporan ${weeklyId}: DRAFT → MENUNGGU_PERSETUJUAN → DISETUJUI; siap diteruskan Admin.`)
    })

    await report.scenario('A2-04', 'Ringkasan kepala divisi diterima Direktur dan tanggapan dibalas', async () => {
      assert(weeklyId, 'Skenario serah mingguan harus menghasilkan laporan')
      const head = await actor('head'); const director = await actor('director')
      const points = [`Tiga proyek diperiksa ${f.runId}`, 'Satu output diterima kepala divisi.']
      await head.request('PUT', '/api/kadiv/weekly-summary', { divisionId: f.divisionId, points })
      await head.request('POST', '/api/kadiv/weekly-summary', { divisionId: f.divisionId, action: 'send', points })
      const duplicate = await head.request('POST', '/api/kadiv/weekly-summary', { divisionId: f.divisionId, action: 'send', points }, 409)
      assert.equal(duplicate.code, 'SENT')
      const sent = await db.weeklyDivisionSummary.findUniqueOrThrow({ where: { divisionId_isoYear_isoWeek: { divisionId: f.divisionId, isoYear: 2026, isoWeek: 41 } } })
      assert.equal(sent.status, 'TERKIRIM'); assert.deepEqual(sent.points, points)
      const comment = `Mohon lanjutkan verifikasi ${f.runId}`
      await director.request('POST', '/api/weekly-comments', { weeklyReportId: weeklyId, body: comment }, 201)
      const deskComments = await head.request('GET', `/api/weekly-comments?divisionId=${f.divisionId}`)
      assert(deskComments.reports.some((r: Row) => r.comments.some((c: Row) => c.body === comment)))
      const reply = `Verifikasi sudah dijadwalkan ${f.runId}`
      await head.request('POST', '/api/weekly-comments', { weeklyReportId: weeklyId, body: reply }, 201)
      const received = await director.request('GET', `/api/weekly-comments?weeklyReportId=${weeklyId}`)
      assert(received.items.some((c: Row) => c.body === reply))
      assert.equal(await db.weeklyReportComment.count({ where: { weeklyReportId: weeklyId } }), 2)
      report.evidence('Poin ringkasan tersimpan; 2 tanggapan terbaca lintas peran; kirim ulang SENT. Kemunculan poin Direktur diperiksa sesudah 17.00 pada A2-04b.')
    })

    await report.scenario('A2-03b', 'Admin meneruskan mingguan, status Direktur berubah dan isi membeku', async () => {
      assert(weeklyId)
      const admin = await actor('admin'); const head = await actor('head'); const director = await actor('director')
      await admin.request('POST', '/api/inbox', { kind: 'weekly', id: weeklyId })
      const stored = await db.weeklyDivisionReport.findUniqueOrThrow({ where: { id: weeklyId } })
      assert(stored.forwardedAt)
      const desk = await admin.request('GET', '/api/work-desk')
      assert(find(desk.divisions, f.divisionId).report.forwardedAt)
      const archive = await director.request('GET', `/api/weekly-reports?entityId=${f.entityId}`)
      const row = find(archive.items, weeklyId)
      assert.equal(row.statusHeader, 'DISETUJUI'); assert(row.forwardedAt)
      await head.request('PUT', '/api/weekly-input', weeklyBody, 409)
      await head.request('POST', '/api/kadiv/weekly-summary', { divisionId: f.divisionId, action: 'unsend' }, 409)
      assert.equal((await db.weeklyDivisionReport.findUniqueOrThrow({ where: { id: weeklyId } })).updatedAt.toISOString(), stored.updatedAt.toISOString())
      report.evidence('forwardedAt tersimpan dan terlihat di arsip Direktur; perubahan mingguan dan penarikan ringkasan ditolak 409. Lencana sent diperiksa A2-04b.')
    })

    await report.scenario('A2-06', 'Direktur menyetujui usulan tenggat dan PIC melihat tanggal baru', async () => {
      const pic = await actor('pic'); const director = await actor('director')
      const proposal = await pic.request('POST', '/api/deadline-proposals', { projectId: f.projectIds[1], proposedDate: '2026-10-22', reason: 'Verifikasi tambahan membutuhkan jadwal yang diperpanjang.' }, 201)
      await director.request('PATCH', '/api/deadline-proposals', { id: proposal.proposal.id, action: 'approve' })
      const project = await db.project.findUniqueOrThrow({ where: { id: f.projectIds[1] } })
      assert.equal(project.targetEndDate?.toISOString(), '2026-10-21T17:00:00.000Z')
      const progress = await pic.request('GET', `/api/project-progress?projectId=${f.projectIds[1]}`)
      assert.equal(progress.deadlines.find((d: Row) => d.kind === 'PROJECT').date, project.targetEndDate.toISOString())
      report.evidence('Project.targetEndDate dan blok tenggat PIC sama: 22 Oktober 2026 WIB.')
    })

    await report.scenario('A2-07', 'Persetujuan cuti membuat Attendance CUTI; Urungkan menghapus efeknya', async () => {
      const pic = await actor('pic'); const director = await actor('director')
      const leave = await pic.request('POST', '/api/approval-requests', { type: 'CUTI', title: 'Cuti pengujian terjadwal', startDate: '2026-10-09', endDate: '2026-10-09' }, 201)
      await director.request('PATCH', '/api/approval-requests', { id: leave.item.id, action: 'approve' })
      const attendance = await pic.request('GET', '/api/attendance?from=2026-10-09&to=2026-10-09')
      assert.equal(attendance.rows.length, 1); assert.equal(attendance.rows[0].status, 'CUTI')
      assert.equal(await db.attendance.count({ where: { userId: f.users.pic.id, status: 'CUTI' } }), 1)
      await director.request('PATCH', '/api/approval-requests', { id: leave.item.id, action: 'undo' })
      assert.equal((await pic.request('GET', '/api/attendance?from=2026-10-09&to=2026-10-09')).rows.length, 0)
      assert.equal(await db.attendance.count({ where: { userId: f.users.pic.id, status: 'CUTI' } }), 0)
      report.evidence('1 Attendance CUTI sesudah approve; 0 sesudah undo; terbukti lewat HTTP dan PostgreSQL.')
    })

    await report.scenario('A2-09', 'Akun baru, reset dan AKUN_BARU memaksa ganti sandi', async () => {
      const admin = await actor('admin'); const ti = await actor('ti')
      const pass = randomBytes(24).toString('base64url'); const changed = randomBytes(24).toString('base64url')
      const username = `${f.runId}-new`
      const created = await admin.request('POST', '/api/companies/users', { entityId: f.entityId, name: 'Akun uji baru', username, email: `${username}@example.test`, role: 'PIC_PROYEK', password: pass })
      const fresh = new HttpActor(target.baseUrl, report)
      assert.equal((await fresh.login(username, pass)).mustChangePassword, true)
      assert.equal((await fresh.request('GET', '/', undefined, 307)).location, '/login/ganti-sandi')
      await fresh.request('GET', '/api/work-desk', undefined, 403)
      await fresh.request('POST', '/api/profile/password', { currentPassword: pass, newPassword: changed })
      assert.equal((await fresh.request('GET', '/api/auth/me')).user.mustChangePassword, false)
      await fresh.request('GET', '/api/work-desk')
      await admin.request('PATCH', '/api/companies/users', { id: created.account.id, password: pass })
      const reset = new HttpActor(target.baseUrl, report)
      assert.equal((await reset.login(username, pass)).mustChangePassword, true)
      assert.equal((await reset.request('GET', '/', undefined, 307)).location, '/login/ganti-sandi')
      await reset.request('GET', '/api/work-desk', undefined, 403)
      const requestedName = `${f.runId}-access`
      const access = await admin.request('POST', '/api/access-requests', { type: 'AKUN_BARU', entityId: f.entityId, payload: { name: 'Akun dari permintaan', username: requestedName, email: `${requestedName}@example.test`, role: 'PIC_PROYEK' } }, 201)
      const decision = await ti.request('PATCH', '/api/access-requests', { id: access.item.id, decision: 'approve' })
      const newUser = await db.user.findUniqueOrThrow({ where: { username: requestedName } })
      assert(newUser.mustChangePassword); assert(newUser.passwordHash)
      assert(!JSON.stringify(decision).includes(newUser.passwordHash), 'Hash tidak boleh keluar ke klien')
      await admin.request('PATCH', '/api/companies/users', { id: newUser.id, password: pass })
      const requested = new HttpActor(target.baseUrl, report)
      assert.equal((await requested.login(requestedName, pass)).mustChangePassword, true)
      await requested.request('POST', '/api/profile/password', { currentPassword: pass, newPassword: changed })
      await requested.request('GET', '/api/work-desk')
      report.evidence('Create/reset/AKUN_BARU menghasilkan mustChangePassword; halaman / memberi 307 ke /login/ganti-sandi; API kerja 403 sampai ganti sandi; sesi baru dapat membuka Meja kerja.')
    })

    await report.scenario('A2-11', 'Peran kosong dan penolakan lintas proyek/PT', async () => {
      const emptyPic = await actor('emptyPic'); const emptyHead = await actor('emptyHead'); const emptyAdmin = await actor('emptyAdmin'); const pic = await actor('pic'); const admin = await actor('admin')
      assert.deepEqual((await emptyPic.request('GET', '/api/work-desk')).projects, [])
      assert.deepEqual((await emptyPic.request('GET', '/api/daily-input')).projects, [])
      assert.deepEqual((await emptyHead.request('GET', '/api/work-desk')).divisions, [])
      await emptyAdmin.request('GET', '/api/work-desk', undefined, 400)
      await emptyAdmin.request('GET', '/api/admin/compliance', undefined, 403)
      const foreign = await db.project.findUniqueOrThrow({ where: { id: f.foreignProjectId } })
      await pic.request('PUT', '/api/daily-input', dailyBody(f.foreignProjectId), 403)
      const ownCompliance = await admin.request('GET', '/api/admin/compliance')
      const requestedCompliance = await admin.request('GET', `/api/admin/compliance?entityId=${f.otherEntityId}`)
      assertFixtureComplianceScope(ownCompliance, requestedCompliance, {
        entityId: f.entityId, divisionId: f.divisionId,
        forbiddenIds: [f.otherEntityId, f.foreignProjectId, f.users.outsider.id],
      })
      assert.equal(await db.dailyProjectReport.count({ where: { projectId: foreign.id } }), 0)
      assert.equal((await db.project.findUniqueOrThrow({ where: { id: foreign.id } })).updatedAt.toISOString(), foreign.updatedAt.toISOString())
      report.evidence('PIC/Kadiv kosong; Admin tanpa PT ditolak tertutup; mutasi proyek luar 403 dan data tetap. Query PT luar 200 identik dengan baseline PT sendiri: satu divisi, satu entitas, kepatuhan 1/1 PIC, tanpa ID entitas/proyek/akun luar.')
    })
    report.pending('A2-08', 'Unggah berkas bukti dan persetujuan ke Supabase Storage', 'Belum dijalankan: akses Supabase sungguhan tidak diotorisasi. Tautan bukti lokal diuji pada TASK, DAILY_REPORT, PROGRESS_REPORT, WEEKLY_ITEM dan OUTPUT; tidak disamakan dengan unggah berkas.')
  } finally { await db.$disconnect() }
}
