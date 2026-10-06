import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/password'
import { resolveSeedPassword } from '../src/lib/password-policy'

let db: PrismaClient | undefined

// Helper functions
const pad = (n: number) => String(n).padStart(2, '0')
const todayISO = () => new Date().toISOString().slice(0, 10)

function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week: weekNum }
}

function requireLocalDatabase() {
  const localPort = process.env.LOCAL_DB_PORT ?? '54329'
  if (!['54329', '54339'].includes(localPort)) {
    throw new Error('Seed ditolak: LOCAL_DB_PORT hanya boleh 54329 atau 54339.')
  }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('Seed ditolak: DATABASE_URL lokal wajib diisi.')
  for (const [name, value] of [['DATABASE_URL', databaseUrl], ['DIRECT_URL', process.env.DIRECT_URL]] as const) {
    if (value === undefined) continue
    let url: URL
    try { url = new URL(value) } catch { throw new Error(`Seed ditolak: ${name} tidak sah.`) }
    const allowedParams = new Set(['schema', 'connection_limit', 'connect_timeout', 'pool_timeout', 'sslmode', 'pgbouncer'])
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost'].includes(url.hostname)
      || url.port !== localPort
      || url.pathname !== '/monitor_karya_local'
      || [...url.searchParams.keys()].some((key) => !allowedParams.has(key))) {
      throw new Error(`Seed ditolak: ${name} harus menunjuk monitor_karya_local di localhost:${localPort} tanpa pengalihan koneksi.`)
    }
  }
  return databaseUrl
}

async function main() {
  const databaseUrl = requireLocalDatabase()
  // Diperiksa sebelum data dihapus: SEED_PASSWORD lemah menghentikan seed sejak awal.
  const seedPw = resolveSeedPassword(process.env.SEED_PASSWORD)
  // URL eksplisit mencegah konfigurasi .env mengalihkan koneksi seed.
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  db = client
  console.log('🌱 Seeding business monitoring database...')

  // Zona CX5: bersihkan anak sebelum induk, termasuk tabel tanpa FK.
  await client.$transaction([
    client.undoToken.deleteMany(),
    client.dailyReportRead.deleteMany(),
    client.weeklyReportRead.deleteMany(),
    client.weeklyReportComment.deleteMany(),
    client.weeklyDivisionSummary.deleteMany(),
    client.projectReview.deleteMany(),
    client.approvalRequest.deleteMany(),
    client.accessRequest.deleteMany(),
    client.reminderRule.deleteMany(),
    client.attendance.deleteMany(),
    client.noteRead.deleteMany(),
    client.outputRevision.deleteMany(),
    client.output.deleteMany(),
    client.projectNote.deleteMany(),
    client.projectStage.deleteMany(),
    client.deadlineProposal.deleteMany(),
    client.subtask.deleteMany(),
    client.task.deleteMany(),
    client.projectApproval.deleteMany(),
    client.projectProgressReport.deleteMany(),
    client.projectEntity.deleteMany(),
    client.kpiSnapshot.deleteMany(),
    client.weeklyReportItem.deleteMany(),
    client.weeklyDivisionReport.deleteMany(),
    client.dailyProjectReport.deleteMany(),
    client.escalation.deleteMany(),
    client.evidence.deleteMany(),
    client.note.deleteMany(),
    client.unlockRequest.deleteMany(),
    client.auditLog.deleteMany(),
    client.lateIncident.deleteMany(),
    client.spotCheck.deleteMany(),
    client.notificationLog.deleteMany(),
    client.adminAppointment.deleteMany(),
    client.project.deleteMany(),
    // User.divisionId ↔ Division.headUserId membentuk dependensi melingkar.
    client.user.updateMany({ data: { divisionId: null } }),
    client.division.deleteMany(),
    client.holiday.deleteMany(),
    client.workCalendar.deleteMany(),
    client.priority.deleteMany(),
    client.aspectCategory.deleteMany(),
    client.divisionType.deleteMany(),
    client.user.deleteMany(),
    client.entity.updateMany({ data: { parentId: null } }),
    client.entity.deleteMany(),
  ])

  // ============================================================
  // REFERENCE DATA — Daftar Induk Grup
  // ============================================================
  const aspectCategories = await Promise.all([
    client.aspectCategory.create({ data: { code: 'OPS', name: 'Operasional' } }),
    client.aspectCategory.create({ data: { code: 'KEU', name: 'Keuangan' } }),
    client.aspectCategory.create({ data: { code: 'PAT', name: 'Kepatuhan' } }),
    client.aspectCategory.create({ data: { code: 'SDM', name: 'SDM' } }),
    client.aspectCategory.create({ data: { code: 'HSE', name: 'HSE' } }),
    client.aspectCategory.create({ data: { code: 'PRJ', name: 'Proyek' } }),
    client.aspectCategory.create({ data: { code: 'SYS', name: 'Sistem' } }),
    client.aspectCategory.create({ data: { code: 'KOM', name: 'Komersial' } }),
  ])

  const priorities = await Promise.all([
    client.priority.create({ data: { code: 'TINGGI', name: 'Tinggi', weight: 3 } }),
    client.priority.create({ data: { code: 'SEDANG', name: 'Sedang', weight: 2 } }),
    client.priority.create({ data: { code: 'RENDAH', name: 'Rendah', weight: 1 } }),
  ])

  const divisionTypes = await Promise.all([
    client.divisionType.create({ data: { code: 'PROD', name: 'Produksi' } }),
    client.divisionType.create({ data: { code: 'FIN', name: 'Keuangan' } }),
    client.divisionType.create({ data: { code: 'HRD', name: 'SDM' } }),
    client.divisionType.create({ data: { code: 'OPS', name: 'Operasional' } }),
    client.divisionType.create({ data: { code: 'HSE', name: 'K3 & Lingkungan' } }),
    client.divisionType.create({ data: { code: 'IT', name: 'Teknologi Informasi' } }),
    client.divisionType.create({ data: { code: 'ENG', name: 'Teknik' } }),
    client.divisionType.create({ data: { code: 'LOG', name: 'Logistik' } }),
  ])

  const workCalendar = await client.workCalendar.create({
    data: { code: 'CAL-ID', name: 'Kalender Kerja Indonesia', region: 'Nasional' },
  })

  const year = new Date().getFullYear()
  const holidays = [
    { date: `${year}-01-01`, name: 'Tahun Baru Masehi' },
    { date: `${year}-03-11`, name: 'Hari Raya Nyepi' },
    { date: `${year}-03-29`, name: 'Wafat Isa Al Masih' },
    { date: `${year}-03-31`, name: 'Idul Fitri' },
    { date: `${year}-04-01`, name: 'Idul Fitri' },
    { date: `${year}-05-01`, name: 'Hari Buruh Internasional' },
    { date: `${year}-05-20`, name: 'Hari Kebangkitan Nasional' },
    { date: `${year}-06-01`, name: 'Hari Lahir Pancasila' },
    { date: `${year}-06-17`, name: 'Hari Raya Idul Adha' },
    { date: `${year}-08-17`, name: 'Hari Proklamasi Kemerdekaan RI' },
    { date: `${year}-12-25`, name: 'Hari Raya Natal' },
  ]
  await Promise.all(
    holidays.map((h) =>
      client.holiday.create({
        data: {
          workCalendarId: workCalendar.id,
          date: new Date(h.date),
          name: h.name,
          scope: 'GRUP',
        },
      })
    )
  )

  const aspectMap = Object.fromEntries(aspectCategories.map((a) => [a.code, a.id]))
  const divTypeMap = Object.fromEntries(divisionTypes.map((d) => [d.code, d.id]))

  // ============================================================
  // ENTITY HIERARCHY (org tree)
  // ============================================================
  console.log('🏢 Creating entity hierarchy...')
  const holding = await client.entity.create({
    data: { type: 'HOLDING', code: 'HOLDING-01', name: 'PT Karya Nusantara Holding', path: '/holding/' },
  })

  const subHoldings = [
    { code: 'SH-ENERGI', name: 'Karya Energi Nusantara' },
    { code: 'SH-AGRO', name: 'Karya Agro Lestari' },
  ]
  const sh = await Promise.all(
    subHoldings.map((s) =>
      client.entity.create({
        data: {
          type: 'SUB_HOLDING',
          code: s.code,
          name: s.name,
          parentId: holding.id,
          path: `${holding.path}${s.code}/`,
        },
      })
    )
  )

  const sectorsData = [
    { subIdx: 0, code: 'S-MIGAS', name: 'Sektor Migas & Energi' },
    { subIdx: 0, code: 'S-EBT', name: 'Sektor Energi Baru Terbarukan' },
    { subIdx: 1, code: 'S-SAWIT', name: 'Sektor Perkebunan Sawit' },
    { subIdx: 1, code: 'S-TEH', name: 'Sektor Perkebunan Teh' },
  ]
  const sectors = await Promise.all(
    sectorsData.map((s) =>
      client.entity.create({
        data: {
          type: 'SECTOR',
          code: s.code,
          name: s.name,
          parentId: sh[s.subIdx].id,
          path: `${sh[s.subIdx].path}${s.code}/`,
        },
      })
    )
  )

  const regionsData = [
    { secIdx: 0, code: 'R-SUMUT', name: 'Sumatera Utara' },
    { secIdx: 0, code: 'R-KALTIM', name: 'Kalimantan Timur' },
    { secIdx: 1, code: 'R-JATIM', name: 'Jawa Timur' },
    { secIdx: 1, code: 'R-SULSEL', name: 'Sulawesi Selatan' },
    { secIdx: 2, code: 'R-RIAU', name: 'Riau' },
    { secIdx: 2, code: 'R-JAMBI', name: 'Jambi' },
    { secIdx: 3, code: 'R-JABAR', name: 'Jawa Barat' },
  ]
  const regions = await Promise.all(
    regionsData.map((r) =>
      client.entity.create({
        data: {
          type: 'REGION',
          code: r.code,
          name: r.name,
          parentId: sectors[r.secIdx].id,
          path: `${sectors[r.secIdx].path}${r.code}/`,
          region: r.name,
        },
      })
    )
  )

  const ptsData = [
    { regIdx: 0, code: 'PT-001', name: 'PT Energi Migas Sumut' },
    { regIdx: 0, code: 'PT-002', name: 'PT Kilang Utara Mandiri' },
    { regIdx: 1, code: 'PT-003', name: 'PT Gas Kaltim Pratama' },
    { regIdx: 1, code: 'PT-004', name: 'PT Petro Kaltim Energi' },
    { regIdx: 2, code: 'PT-005', name: 'PT Surya Panel Jatim' },
    { regIdx: 2, code: 'PT-006', name: 'PT Baterai Hijau Surabaya' },
    { regIdx: 3, code: 'PT-007', name: 'PT Turbin Angin Sulsel' },
    { regIdx: 4, code: 'PT-008', name: 'PT Sawit Riau Lestari' },
    { regIdx: 5, code: 'PT-009', name: 'PT Karet Jambi Makmur' },
    { regIdx: 6, code: 'PT-010', name: 'PT Teh Gunung Wangi' },
  ]
  const pts = await Promise.all(
    ptsData.map((p) =>
      client.entity.create({
        data: {
          type: 'PT',
          code: p.code,
          name: p.name,
          parentId: regions[p.regIdx].id,
          path: `${regions[p.regIdx].path}${p.code}/`,
          region: regions[p.regIdx].name,
        },
      })
    )
  )

  // ============================================================
  // USERS
  // ============================================================
  console.log('👥 Creating users...')
  const avatarColors = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#16a34a', '#ea580c', '#0d9488', '#4f46e5']

  const managementUser = await client.user.create({
    data: { email: 'manajemen@karya.co.id', name: 'Bpk. Hartono Wijaya', role: 'MANAJEMEN', avatarColor: avatarColors[0] },
  })
  const direkturSDM = await client.user.create({
    data: { email: 'sdmga@karya.co.id', name: 'Ibu Ratna Sari', role: 'DIREKTUR_SDM_GA', avatarColor: avatarColors[1] },
  })
  const auditorUser = await client.user.create({
    data: { email: 'auditor@karya.co.id', name: 'Bpk. Dimas Pratama', role: 'AUDITOR', avatarColor: avatarColors[2] },
  })
  const tiUser = await client.user.create({
    data: { email: 'ti@karya.co.id', name: 'Bpk. Rudi Santoso', role: 'TI', avatarColor: avatarColors[3] },
  })

  const direkturEntitas = await Promise.all(
    sh.map((s, i) =>
      client.user.create({
        data: {
          email: `direktur.${s.code.toLowerCase()}@karya.co.id`,
          name: i === 0 ? 'Bpk. Andi Kurniawan' : 'Ibu Sri Wahyuni',
          role: 'DIREKTUR_ENTITAS',
          scopeEntityId: s.id,
          avatarColor: avatarColors[(i + 4) % avatarColors.length],
        },
      })
    )
  )

  const adminNames = ['Bpk. Budi', 'Ibu Dewi', 'Bpk. Eko', 'Ibu Fitri', 'Bpk. Gilang', 'Ibu Hana', 'Bpk. Iwan', 'Ibu Juni', 'Bpk. Krisna', 'Ibu Lina']
  const adminPts = await Promise.all(
    pts.map((p, i) =>
      client.user.create({
        data: {
          email: `admin.${p.code.toLowerCase()}@karya.co.id`,
          name: adminNames[i],
          role: 'ADMIN_PT',
          scopeEntityId: p.id,
          avatarColor: avatarColors[i % avatarColors.length],
          lastLoginAt: new Date(Date.now() - Math.random() * 86400000 * 3),
        },
      })
    )
  )

  const allUsers = [managementUser, direkturSDM, auditorUser, tiUser, ...direkturEntitas, ...adminPts]

  // ============================================================
  // DIVISIONS, ADMIN APPOINTMENTS, PROJECTS per PT
  // ============================================================
  console.log('🏗️  Creating divisions, projects, admin appointments...')

  const divTypeForPt = (idx: number) => {
    const sets = [
      ['PROD', 'FIN', 'HSE', 'ENG'],
      ['PROD', 'OPS', 'HSE', 'FIN'],
      ['ENG', 'OPS', 'FIN', 'HSE'],
      ['PROD', 'LOG', 'FIN', 'HRD'],
      ['PROD', 'ENG', 'FIN', 'HSE'],
      ['OPS', 'FIN', 'HRD', 'IT'],
      ['PROD', 'FIN', 'HSE', 'ENG'],
      ['PROD', 'HRD', 'FIN', 'LOG'],
      ['PROD', 'ENG', 'FIN', 'HSE'],
      ['PROD', 'OPS', 'FIN', 'HRD'],
    ]
    return sets[idx % sets.length]
  }

  const divTypeNames: Record<string, string> = {
    PROD: 'Produksi', FIN: 'Keuangan', HRD: 'SDM', OPS: 'Operasional',
    HSE: 'K3 & Lingkungan', IT: 'Teknologi Informasi', ENG: 'Teknik', LOG: 'Logistik',
  }

  const allDivisions: { id: string; entityId: string; name: string }[] = []
  const allProjects: { id: string; entityId: string; divisionId: string; picUserId: string; name: string; phase: string; lifecycle: string }[] = []

  const projectNames = [
    ['Pembangunan Pembangkit Baru', 'Optimasi Jaringan Distribusi', 'Renovasi Substation', 'Pengadaan Trafo 50 MVA'],
    ['Integrasi Sistem SCADA', 'Audit Energi Tahunan', 'Rehabilitasi Sumur Minyak', 'Pengembangan Kilang Mini'],
    ['Instalasi Panel Surya 5 MW', 'Pengembangan Baterai Storage', 'Pilot Project Hybrid', 'Pelatihan Operator EBT'],
    ['Sertifikasi ISO 50001', 'Pengembangan Smart Grid', 'Pemasangan Inverter Smart', 'Studi Kelayakan Wind Farm'],
    ['Ekspansi Kebun 200 Ha', 'Pembangunan Pabrik CPO', 'Sertifikasi ISPO', 'Peningkatan Kapasitas Mill'],
    ['Renovasi Pabrik Karet', 'Pengembangan Lateks', 'Sertifikasi FSC', 'Pengadaan Mesin Creper'],
    ['Modernisasi Pabrik Teh', 'Pengembangan Varietas Unggul', 'Sertifikasi Rainforest Alliance', 'Pembangunan Warehouse'],
    ['Digitalisasi Produksi', 'Implementasi ERP', 'Pengembangan E-Commerce', 'Optimasi Rantai Pasok'],
    ['Sistem Manajemen Mutu', 'Pengembangan SDM', 'Green Factory Initiative', 'Penghematan Energi'],
    ['Ekspansi Pasar Ekspor', 'Pengembangan Brand Premium', 'Pengembangan R&D', 'Modernisasi Pabrik'],
  ]

  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i]
    const adminUser = adminPts[i]
    const divTypeCodes = divTypeForPt(i)

    await client.adminAppointment.create({
      data: {
        entityId: pt.id,
        userName: adminUser.name,
        userEmail: adminUser.email,
        kind: 'UTAMA',
        skNumber: `SK/${year}/${pad(i + 1)}/HR`,
        validFrom: new Date(`${year}-01-01`),
        validUntil: new Date(`${year + 2}-12-31`),
        status: 'AKTIF',
      },
    })

    for (const dtCode of divTypeCodes) {
      const div = await client.division.create({
        data: {
          entityId: pt.id,
          divisionTypeId: divTypeMap[dtCode],
          name: divTypeNames[dtCode],
        },
      })
      allDivisions.push({ id: div.id, entityId: pt.id, name: div.name })

      const head = await client.user.create({
        data: {
          email: `kadv.${div.name.toLowerCase().replace(/[^a-z]/g, '')}.${pt.code.toLowerCase()}@karya.co.id`,
          name: ['Bpk. Yudi', 'Ibu Mira', 'Bpk. Tono', 'Ibu Vera'][Math.floor(Math.random() * 4)],
          role: 'KEPALA_DIVISI',
          scopeEntityId: pt.id,
          divisionId: div.id,
          avatarColor: avatarColors[Math.floor(Math.random() * avatarColors.length)],
        },
      })
      await client.division.update({ where: { id: div.id }, data: { headUserId: head.id } })
    }

    const projPhases = ['PERENCANAAN', 'PELAKSANAAN', 'PELAKSANAAN', 'PENYELESAIAN']
    for (let j = 0; j < 4; j++) {
      const division = allDivisions.filter((div) => div.entityId === pt.id)[j]
      const pic = await client.user.create({ data: {
        email: `pic.${pt.code.toLowerCase()}.${j + 1}@karya.co.id`,
        name: `PIC ${projectNames[i][j]}`,
        role: 'PIC_PROYEK', scopeEntityId: pt.id, divisionId: division.id,
      } })
      allUsers.push(pic)
      const proj = await client.project.create({
        data: {
          entityId: pt.id,
          code: `${pt.code}-PRJ-${pad(j + 1)}`,
          name: projectNames[i][j],
          phase: projPhases[j],
          lifecycle: 'AKTIF',
          picName: pic.name,
          picUserId: pic.id,
          divisionId: division.id,
          startDate: new Date(year, j % 12, 1),
          targetEndDate: new Date(year, (j + 6) % 12, 28),
          approvedByName: direkturEntitas[i % 2].name,
          approvedAt: new Date(year, j % 12, 5),
        },
      })
      allProjects.push({ id: proj.id, entityId: pt.id, divisionId: division.id, picUserId: pic.id, name: proj.name, phase: proj.phase, lifecycle: proj.lifecycle })
    }
  }

  // ============================================================
  // DAILY PROJECT REPORTS (last 30 days)
  // ============================================================
  console.log('📋 Creating daily project reports...')
  const statuses = ['SELESAI', 'ON_PROGRESS', 'TERKENDALA', 'MENUNGGU_KEPUTUSAN', 'TIDAK_ADA_PERUBAHAN']
  const obstacles = [
    'Keterlambatan pengiriman material dari pemasok',
    'Cuaca buruk menghambat pekerjaan lapangan',
    'Kendala teknis pada peralatan survey',
    'Permitting dari pemerintah daerah belum selesai',
    'Kekurangan tenaga kerja terampil',
    'Masalah akses ke lokasi proyek',
    'Harga material naik melebihi anggaran',
    'Perubahan spesifikasi dari klien',
  ]
  const achievements = [
    'Menyelesaikan pemasangan panel surya 200 unit',
    'Installasi 4 unit trafo distribusi',
    'Penyelesaian trenching 1.2 km',
    'Commissioning sistem SCADA selesai',
    'Training 25 operator teknis',
    'Pengujian beban penuh sukses',
    'Pemasangan struktur tower 5 unit',
    'Final inspection lulus tanpa temuan',
    'Pencapaian 95% target penyelesaian',
    'Penyerahan dokumen as-built lengkap',
  ]

  let dailyCount = 0
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const reportDate = new Date()
    reportDate.setHours(0, 0, 0, 0)
    reportDate.setDate(reportDate.getDate() - dayOffset)
    const dow = reportDate.getDay()
    if (dow === 0 || dow === 6) continue

    for (let pi = 0; pi < allProjects.length; pi++) {
      const proj = allProjects[pi]
      const adminUser = adminPts.find((a) => a.scopeEntityId === proj.entityId)!
      if (dayOffset !== 0 && Math.random() < 0.15) continue

      const isToday = dayOffset === 0
      const isLate = isToday && Math.random() < 0.12
      const statusIdx = Math.floor(Math.random() * statuses.length)
      const status = statuses[statusIdx]
      const progressBase = Math.max(0, Math.min(100, Math.floor((30 - dayOffset) * 3.3) + Math.floor(Math.random() * 8)))

      await client.dailyProjectReport.create({
        data: {
          projectId: proj.id,
          entityId: proj.entityId,
          reportDate,
          status,
          progressPct: progressBase,
          phase: proj.phase,
          achievementToday: achievements[Math.floor(Math.random() * achievements.length)],
          obstacle: (status === 'TERKENDALA' || status === 'MENUNGGU_KEPUTUSAN') ? obstacles[Math.floor(Math.random() * obstacles.length)] : null,
          followUp: (status === 'TERKENDALA' || status === 'MENUNGGU_KEPUTUSAN') ? 'Eskalasi ke manajemen dan jadwalkan rapat koordinasi minggu depan' : null,
          followUpTargetDate: (status === 'TERKENDALA' || status === 'MENUNGGU_KEPUTUSAN') ? new Date(Date.now() + 7 * 86400000) : null,
          decisionRequestedFrom: status === 'MENUNGGU_KEPUTUSAN' ? 'Direktur Entitas / Direktur SDM&GA' : null,
          needsEscalation: status === 'TERKENDALA' || status === 'MENUNGGU_KEPUTUSAN',
          evidenceCount: status === 'SELESAI' ? 1 + Math.floor(Math.random() * 3) : 0,
          isLocked: !isToday,
          lockedAt: !isToday ? new Date(reportDate.getTime() + 17 * 3600 * 1000) : null,
          isLate,
          submittedById: adminUser.id,
          submittedAt: new Date(reportDate.getTime() + 16 * 3600 * 1000),
        },
      })
      dailyCount++
    }
  }
  console.log(`  ✓ Created ${dailyCount} daily reports`)

  // ============================================================
  // WEEKLY DIVISION REPORTS (last 4 weeks)
  // ============================================================
  console.log('📅 Creating weekly division reports...')
  const weeklyItemWork = [
    { aspect: 'OPS', work: 'Optimasi throughput produksi harian', pic: 'Operator Senior' },
    { aspect: 'KEU', work: 'Closing laporan keuangan bulanan', pic: 'Manajer Keuangan' },
    { aspect: 'PAT', work: 'Audit kepatuhan internal SOP', pic: 'Compliance Officer' },
    { aspect: 'SDM', work: 'Rekrutmen tenaga operator baru', pic: 'HR Business Partner' },
    { aspect: 'HSE', work: 'Inspeksi PPE & alat keselamatan', pic: 'Safety Officer' },
    { aspect: 'PRJ', work: 'Milestone pengiriman modul proyek', pic: 'Project Manager' },
    { aspect: 'SYS', work: 'Update sistem ERP modul produksi', pic: 'IT Support Lead' },
    { aspect: 'KOM', work: 'Peluncuran kampanye pelanggan baru', pic: 'Sales Manager' },
  ]
  const weeklyStatuses = ['SELESAI', 'ON_PROGRESS', 'BELUM_MULAI', 'TERKENDALA', 'NA']

  let weeklyCount = 0
  for (let weekOffset = 3; weekOffset >= 0; weekOffset--) {
    const periodEnd = new Date()
    periodEnd.setHours(0, 0, 0, 0)
    periodEnd.setDate(periodEnd.getDate() - weekOffset * 7)
    const periodStart = new Date(periodEnd)
    periodStart.setDate(periodStart.getDate() - 6)
    const { year: isoYear, week: isoWeekNum } = isoWeek(periodEnd)
    const isCurrentWeek = weekOffset === 0

    for (const div of allDivisions) {
      if (!isCurrentWeek && Math.random() < 0.1) continue

      const kdv = await client.user.findFirst({ where: { role: 'KEPALA_DIVISI', divisionId: div.id } })
      const approved = !isCurrentWeek || Math.random() < 0.6
      const locked = !isCurrentWeek
      const statusHeader = locked ? 'TERKUNCI' : approved ? 'DISETUJUI' : Math.random() < 0.5 ? 'MENUNGGU_PERSETUJUAN' : 'DRAFT'

      const wr = await client.weeklyDivisionReport.create({
        data: {
          divisionId: div.id,
          entityId: div.entityId,
          isoYear,
          isoWeek: isoWeekNum,
          periodStart,
          periodEnd,
          statusHeader,
          approvedById: approved && kdv ? kdv.id : null,
          approvedAt: approved ? new Date(periodEnd.getTime() - 86400000) : null,
          approvalHash: approved ? `sha256:${Math.random().toString(36).slice(2, 18)}` : null,
          isLocked: locked,
          lockedAt: locked ? new Date(periodEnd.getTime() + 16 * 3600 * 1000) : null,
          isLate: !isCurrentWeek && Math.random() < 0.08,
        },
      })

      const itemCount = 4 + Math.floor(Math.random() * 3)
      for (let ii = 0; ii < itemCount; ii++) {
        const workTemplate = weeklyItemWork[ii % weeklyItemWork.length]
        const st = weeklyStatuses[Math.floor(Math.random() * weeklyStatuses.length)]
        const priIdx = Math.floor(Math.random() * priorities.length)
        await client.weeklyReportItem.create({
          data: {
            weeklyReportId: wr.id,
            aspectCategoryId: aspectMap[workTemplate.aspect],
            workItem: workTemplate.work,
            targetOutput: `Target minggu ke-${isoWeekNum}: ${10 + Math.floor(Math.random() * 40)} unit`,
            picName: workTemplate.pic,
            picTitle: workTemplate.pic,
            targetDate: new Date(periodEnd.getTime() + Math.floor(Math.random() * 14) * 86400000),
            status: st,
            progressPct: st === 'SELESAI' ? 100 : st === 'BELUM_MULAI' ? 0 : Math.floor(Math.random() * 90) + 5,
            achievementThisWeek: st === 'SELESAI' ? achievements[Math.floor(Math.random() * achievements.length)] : st === 'BELUM_MULAI' ? 'Persiapan tahap awal' : `Progress ${Math.floor(Math.random() * 80) + 10}% dari target`,
            obstacleFollowUp: st === 'TERKENDALA' ? obstacles[Math.floor(Math.random() * obstacles.length)] : null,
            priorityId: priorities[priIdx].id,
            needsEscalation: st === 'TERKENDALA' && priorities[priIdx].code === 'TINGGI',
            evidenceCount: st === 'SELESAI' ? 1 + Math.floor(Math.random() * 2) : 0,
          },
        })
      }
      weeklyCount++
    }
  }
  console.log(`  ✓ Created ${weeklyCount} weekly reports`)

  // ============================================================
  // ESCALATIONS
  // ============================================================
  console.log('🚨 Creating escalations...')
  const escalationTemplates = [
    { summary: 'Keterlambatan signifikan pada milestone pengiriman modul - diperlukan keputusan alokasi anggaran tambahan', needed: 'KEPUTUSAN' },
    { summary: 'Kebutuhan dukungan fungsi logistik lintas entitas untuk percepatan pengiriman material', needed: 'DUKUNGAN_LINTAS_FUNGSI' },
    { summary: 'Permohonan realokasi anggaran Rp 2.5M untuk penyelesaian tahap commissioning', needed: 'ANGGARAN' },
    { summary: 'Eskalasi kebijakan: persetujuan izin lingkungan terhambat proses birokrasi', needed: 'KEPUTUSAN' },
    { summary: 'Konflik jadwal kontraktor - diperlukan koordinasi lintas proyek', needed: 'DUKUNGAN_LINTAS_FUNGSI' },
    { summary: 'Defisit anggaran Q4 untuk penyelesaian tahap commissioning dan testing', needed: 'ANGGARAN' },
    { summary: 'Persetujuan perubahan scope proyek pasca-review engineering', needed: 'KEPUTUSAN' },
    { summary: 'Dukungan teknis khusus dari tim engineering holding', needed: 'DUKUNGAN_LINTAS_FUNGSI' },
  ]
  const escStatuses = ['DIAJUKAN', 'DITINJAU', 'DIPUTUSKAN', 'DITUTUP']

  const escalationsToCreate = 12
  for (let i = 0; i < escalationsToCreate; i++) {
    const pt = pts[Math.floor(Math.random() * pts.length)]
    const adminUser = adminPts.find((a) => a.scopeEntityId === pt.id)!
    const tmpl = escalationTemplates[i % escalationTemplates.length]
    const statusIdx = i < 3 ? 0 : i < 6 ? 1 : i < 9 ? 2 : 3
    const status = escStatuses[statusIdx]
    const raisedAt = new Date(Date.now() - (i + 1) * 86400000 * 2)

    const sourceType = i % 2 === 0 ? 'DAILY_REPORT' : 'WEEKLY_ITEM'
    const source = sourceType === 'DAILY_REPORT'
      ? await client.dailyProjectReport.findFirstOrThrow({ where: { entityId: pt.id } })
      : await client.weeklyReportItem.findFirstOrThrow({ where: { weeklyReport: { entityId: pt.id } } })
    await client.escalation.create({
      data: {
        sourceType,
        sourceId: source.id,
        entityId: pt.id,
        raisedById: adminUser.id,
        raisedAt,
        summary: tmpl.summary,
        needed: tmpl.needed,
        status,
        decidedById: (status === 'DIPUTUSKAN' || status === 'DITUTUP') ? managementUser.id : null,
        decidedAt: (status === 'DIPUTUSKAN' || status === 'DITUTUP') ? new Date(raisedAt.getTime() + 4 * 86400000) : null,
        decisionText: (status === 'DIPUTUSKAN' || status === 'DITUTUP') ? 'Disetujui dengan catatan: eksekusi segera dengan pemantauan mingguan oleh Direktur Entitas.' : null,
        slaDays: 7,
      },
    })
  }
  console.log(`  ✓ Created ${escalationsToCreate} escalations`)

  // ============================================================
  // UNLOCK REQUESTS
  // ============================================================
  console.log('🔓 Creating unlock requests...')
  const unlockReasons = [
    'Koreksi capaian harian yang salah input - perlu update progress',
    'Penambahan bukti pendukung yang tertinggal',
    'Revisi target date item mingguan setelah koordinasi dengan PIC',
    'Koreksi status dari TERKENDALA menjadi SELESAI setelah verifikasi',
  ]
  const unlockStatuses = ['DIAJUKAN', 'DISETUJUI', 'DITOLAK', 'DIEKSEKUSI']
  for (let i = 0; i < 6; i++) {
    const pt = pts[Math.floor(Math.random() * pts.length)]
    const adminUser = adminPts.find((a) => a.scopeEntityId === pt.id)!
    const status = unlockStatuses[i % unlockStatuses.length]
    const targetType = i % 2 === 0 ? 'DAILY_REPORT' : 'WEEKLY_REPORT'
    const target = targetType === 'DAILY_REPORT'
      ? await client.dailyProjectReport.findFirstOrThrow({ where: { entityId: pt.id, isLocked: true } })
      : await client.weeklyDivisionReport.findFirstOrThrow({ where: { entityId: pt.id, isLocked: true } })
    await client.unlockRequest.create({
      data: {
        targetType,
        targetId: target.id,
        requestedById: adminUser.id,
        reason: unlockReasons[i % unlockReasons.length],
        status,
        approvedById: status !== 'DIAJUKAN' ? direkturSDM.id : null,
        approvedAt: status !== 'DIAJUKAN' ? new Date(Date.now() - i * 86400000) : null,
        executedById: status === 'DIEKSEKUSI' ? tiUser.id : null,
        executedAt: status === 'DIEKSEKUSI' ? new Date(Date.now() - i * 86400000 + 3600000) : null,
        unlockUntil: status === 'DIEKSEKUSI' ? new Date(Date.now() + 86400000) : null,
      },
    })
  }

  // ============================================================
  // KPI SNAPSHOTS (last 6 months per PT)
  // ============================================================
  console.log('📊 Creating KPI snapshots...')
  for (let m = 5; m >= 0; m--) {
    const monthDate = new Date()
    monthDate.setMonth(monthDate.getMonth() - m)
    const periodKey = `${monthDate.getFullYear()}-${pad(monthDate.getMonth() + 1)}`
    for (const pt of pts) {
      const complianceScore = 70 + Math.random() * 28
      await client.kpiSnapshot.create({
        data: {
          entityId: pt.id,
          periodType: 'BULANAN',
          periodKey,
          onTimeDailyPct: 80 + Math.random() * 18,
          weeklyCompletenessPct: 85 + Math.random() * 15,
          evidenceCompletenessPct: 88 + Math.random() * 12,
          highPriorityCompletionPct: 75 + Math.random() * 22,
          avgEscalationDays: 3 + Math.random() * 6,
          totalProjects: 4,
          activeProjects: 4,
          reportsToday: m === 0 ? 3 + Math.floor(Math.random() * 2) : 4,
          lateToday: m === 0 ? Math.floor(Math.random() * 2) : 0,
          pendingReports: m === 0 ? Math.floor(Math.random() * 2) : 0,
          complianceScore,
        },
      })
    }
  }

  // ============================================================
  // LATE INCIDENTS (this month)
  // ============================================================
  console.log('⏰ Creating late incidents...')
  const periodKeyMonth = todayISO().slice(0, 7)
  for (let i = 0; i < 8; i++) {
    const pt = pts[Math.floor(Math.random() * pts.length)]
    const cycle = Math.random() < 0.5 ? 'HARIAN' : 'MINGGUAN'
    await client.lateIncident.create({
      data: {
        entityId: pt.id,
        cycle,
        period: periodKeyMonth,
        occurrenceInMonth: 1 + Math.floor(Math.random() * 3),
        actionTaken: i < 2 ? 'Tindakan: evaluasi penunjukan Admin PT' : 'Tindakan: notifikasi ke Direktur Entitas',
      },
    })
  }

  // ============================================================
  // NOTIFICATION LOGS
  // ============================================================
  console.log('🔔 Creating notification logs...')
  const notifTemplates = [
    'DAILY_REMINDER_1715', 'WEEKLY_REMINDER_FRI_1615', 'APPROVAL_REQUESTED',
    'LATE_INCIDENT_1', 'LATE_INCIDENT_2', 'LATE_INCIDENT_3',
    'ESCALATION_RAISED', 'ESCALATION_DECIDED', 'UNLOCK_REQUESTED', 'UNLOCK_APPROVED',
  ]
  for (let i = 0; i < 15; i++) {
    const u = allUsers[Math.floor(Math.random() * allUsers.length)]
    const template = notifTemplates[Math.floor(Math.random() * notifTemplates.length)]
    const channel = Math.random() < 0.6 ? 'EMAIL' : 'WHATSAPP'
    const status = Math.random() < 0.85 ? 'SENT' : 'FAILED'
    await client.notificationLog.create({
      data: {
        userId: u.id,
        channel,
        // F1-C: recipient selalu email akun, apa pun kanalnya.
        recipient: u.email,
        template,
        payload: JSON.stringify({ template, entityId: u.scopeEntityId }),
        status,
        error: status === 'FAILED' ? 'Connection timeout' : null,
        sentAt: status === 'SENT' ? new Date(Date.now() - i * 3600000) : null,
      },
    })
  }

  // ============================================================
  // AUDIT LOGS
  // ============================================================
  console.log('📝 Creating audit logs...')
  const auditActions = ['CREATE_REPORT', 'UPDATE_REPORT', 'APPROVE_WEEKLY', 'LOCK_REPORT', 'UNLOCK_EXECUTE', 'CREATE_ESCALATION', 'DECIDE_ESCALATION', 'LOGIN', 'LOGOUT']
  for (let i = 0; i < 20; i++) {
    const u = allUsers[Math.floor(Math.random() * allUsers.length)]
    const action = auditActions[Math.floor(Math.random() * auditActions.length)]
    const targetType = action.includes('ESCALATION') ? 'ESCALATION' : action.includes('WEEKLY') ? 'WEEKLY_REPORT' : ['LOGIN', 'LOGOUT'].includes(action) ? 'USER' : 'DAILY_REPORT'
    const target = targetType === 'ESCALATION' ? await client.escalation.findFirstOrThrow()
      : targetType === 'WEEKLY_REPORT' ? await client.weeklyDivisionReport.findFirstOrThrow()
      : targetType === 'USER' ? u : await client.dailyProjectReport.findFirstOrThrow()
    await client.auditLog.create({
      data: {
        actorId: u.id,
        action,
        targetType,
        targetId: target.id,
        beforeData: action.startsWith('UPDATE') ? JSON.stringify({ progressPct: 50 }) : null,
        afterData: JSON.stringify({ progressPct: 75, status: 'ON_PROGRESS' }),
        ip: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Sandbox Browser)',
        at: new Date(Date.now() - i * 3600000 * 3),
      },
    })
  }

  // ============================================================
  // CX5 — contoh terhubung untuk seluruh model operasional terbaru
  // Tanggal harian memakai tengah malam WIB, terlepas zona waktu mesin.
  // ============================================================
  const now = new Date()
  const wibDay = new Date(new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10) + 'T00:00:00+07:00')
  const later = (days: number) => new Date(wibDay.getTime() + days * 86400000)
  const currentWeek = isoWeek(new Date(now.getTime() + 7 * 3600000))

  for (const [index, project] of allProjects.entries()) {
    const division = await client.division.findUniqueOrThrow({ where: { id: project.divisionId } })
    const headId = division.headUserId!
    const admin = adminPts.find((user) => user.scopeEntityId === project.entityId)!
    const outputStatus = ['DIKERJAKAN', 'MENUNGGU_REVIEW', 'PERLU_REVISI', 'DITERIMA'][index % 4]
    const reviewed = ['PERLU_REVISI', 'DITERIMA'].includes(outputStatus)
    const output = await client.output.create({ data: {
      projectId: project.id, title: `Dokumen hasil ${project.name}`,
      description: 'Dokumen contoh untuk alur review hasil kerja.', status: outputStatus,
      ownerId: project.picUserId, reviewerId: reviewed ? headId : null,
      dueDate: later(7), submittedAt: outputStatus === 'DIKERJAKAN' ? null : now,
      reviewedAt: reviewed ? now : null,
      revisionNote: outputStatus === 'PERLU_REVISI' ? 'Lengkapi rincian hasil pengujian.' : null,
    } })
    // Bukti tautan saja: seed tidak mengunggah ke Supabase atau penyimpanan lain.
    await client.evidence.create({ data: {
      targetType: 'OUTPUT', targetId: output.id, storageKey: `link:OUTPUT:${output.id}:seed`,
      fileName: 'Dokumen hasil contoh', mime: 'text/uri-list', size: 0,
      url: 'https://example.com/hasil-proyek', uploadedById: project.picUserId,
    } })
    if (reviewed) await client.outputRevision.create({ data: {
      outputId: output.id, reviewerId: headId, note: 'Lengkapi rincian hasil pengujian.',
      // Output diterima telah melewati putaran revisi sebelumnya.
      createdAt: new Date(now.getTime() - 86400000),
    } })
    const note = await client.projectNote.create({ data: {
      projectId: project.id, authorId: headId,
      body: 'Anda dapat melanjutkan tahap berikutnya setelah hasil pengujian diperiksa.',
    } })
    await client.noteRead.create({ data: { noteId: note.id, userId: project.picUserId } })
    await client.projectStage.createMany({ data: [
      { projectId: project.id, name: 'Persiapan', position: 0, status: 'SELESAI', startDate: later(-14), dueDate: later(-7) },
      { projectId: project.id, name: 'Pelaksanaan', position: 1, status: 'BERJALAN', startDate: later(-6), dueDate: later(7) },
      { projectId: project.id, name: 'Serah terima', position: 2, status: 'BELUM_MULAI', startDate: later(8), dueDate: later(14) },
    ] })
    const deadlineStatus = ['DIAJUKAN', 'DISETUJUI', 'DITOLAK'][index % 3]
    const oldDeadline = (await client.project.findUniqueOrThrow({ where: { id: project.id } })).targetEndDate
    const proposedDate = new Date((oldDeadline ?? wibDay).getTime() + 14 * 86400000)
    await client.deadlineProposal.create({ data: {
      projectId: project.id, previousDate: oldDeadline, proposedDate,
      reason: 'Penyesuaian jadwal pengiriman material.', status: deadlineStatus,
      proposedById: project.picUserId, decidedById: deadlineStatus === 'DIAJUKAN' ? null : managementUser.id,
      decidedAt: deadlineStatus === 'DIAJUKAN' ? null : now,
      decisionNote: deadlineStatus === 'DISETUJUI' ? 'Jadwal pengiriman material telah diverifikasi.' : deadlineStatus === 'DITOLAK' ? 'Gunakan pemasok alternatif sesuai tenggat awal.' : null,
    } })
    if (deadlineStatus === 'DISETUJUI') await client.project.update({ where: { id: project.id }, data: { targetEndDate: proposedDate } })
    await client.attendance.create({ data: {
      userId: project.picUserId, date: wibDay,
      status: ['HADIR', 'TERLAMBAT', 'CUTI', 'SAKIT', 'IZIN'][index % 5], recordedById: headId,
      note: 'Data kehadiran contoh lokal.',
    } })
    await client.accessRequest.create({ data: {
      type: 'AKSES_SEMENTARA', payload: JSON.stringify({ userId: project.picUserId, role: 'PIC_PROYEK', days: 3 }),
      reason: 'Pendampingan sementara proyek.', entityId: project.entityId,
      requestedById: headId, targetUserId: project.picUserId,
    } })
    await client.projectReview.create({ data: { projectId: project.id, reviewerId: managementUser.id, note: 'Kemajuan proyek telah ditinjau.' } })
    const approvalType = ['MATERI', 'ANGGARAN', 'CUTI'][index % 3]
    await client.approvalRequest.create({ data: {
      type: approvalType, title: `Persetujuan ${approvalType.toLowerCase()} untuk ${project.name}`,
      description: 'Pengajuan contoh untuk keputusan pengawas.',
      amount: approvalType === 'ANGGARAN' ? BigInt(25000000) : null,
      entityId: project.entityId, divisionId: project.divisionId, projectId: project.id,
      requestedById: project.picUserId,
      startDate: approvalType === 'CUTI' ? later(7) : null,
      endDate: approvalType === 'CUTI' ? later(8) : null,
    } })
    const task = await client.task.create({ data: {
      projectId: project.id, entityId: project.entityId, workDate: wibDay,
      title: 'Periksa hasil pengujian', picUserId: project.picUserId,
      createdById: headId, status: 'BERJALAN', progressPct: 50,
      subtasks: { create: [{ title: 'Periksa dokumen', isDone: true }, { title: 'Periksa hasil lapangan', position: 1 }] },
    } })
    await client.projectProgressReport.create({ data: {
      projectId: project.id, entityId: project.entityId, cadence: 'MINGGUAN',
      periodKey: `${currentWeek.year}-W${pad(currentWeek.week)}`,
      periodStart: later(-6), periodEnd: wibDay, status: 'ON_PROGRESS', progressPct: 50,
      summary: `Pengujian ${task.title.toLowerCase()} sedang berjalan.`, submittedById: project.picUserId, submittedAt: now,
    } })
    await client.projectApproval.create({ data: {
      projectId: project.id, role: 'ADMIN_PT', decision: 'DISETUJUI', decidedById: admin.id,
    } })
    await client.project.update({ where: { id: project.id }, data: { approvalChain: ['ADMIN_PT'], proposedById: project.picUserId, proposedAt: later(-14) } })
    const nextEntity = pts[(pts.findIndex((pt) => pt.id === project.entityId) + 1) % pts.length]
    await client.projectEntity.create({ data: { projectId: project.id, entityId: nextEntity.id } })
    const daily = await client.dailyProjectReport.findFirst({ where: { projectId: project.id }, orderBy: { reportDate: 'desc' } })
    if (daily) await client.dailyReportRead.create({ data: { dailyReportId: daily.id, userId: headId } })
  }
  for (const pt of pts) {
    const admin = adminPts.find((user) => user.scopeEntityId === pt.id)!
    await client.reminderRule.createMany({ data: [
      { entityId: pt.id, kind: 'HARIAN', time: '16:30', updatedById: admin.id },
      { entityId: pt.id, kind: 'MINGGUAN', time: '15:30', weekday: 5, updatedById: admin.id },
      { entityId: pt.id, kind: 'ESKALASI_KADIV', time: '09:00', params: JSON.stringify({ days: 2 }), updatedById: admin.id },
      { entityId: pt.id, kind: 'RINGKASAN_MANAJEMEN', time: '16:45', weekday: 5, updatedById: admin.id },
    ] })
  }
  for (const division of allDivisions) {
    const report = await client.weeklyDivisionReport.findFirst({ where: { divisionId: division.id }, orderBy: [{ isoYear: 'desc' }, { isoWeek: 'desc' }] })
    if (!report) continue
    const head = await client.division.findUniqueOrThrow({ where: { id: division.id } })
    await client.weeklyReportRead.create({ data: { weeklyReportId: report.id, userId: managementUser.id } })
    await client.weeklyReportComment.create({ data: { weeklyReportId: report.id, authorId: managementUser.id, body: 'Anda dapat memprioritaskan penyelesaian hasil pengujian minggu berikutnya.' } })
    const projects = allProjects.filter((project) => project.divisionId === division.id)
    const accepted = await client.output.count({ where: { projectId: { in: projects.map((project) => project.id) }, status: 'DITERIMA' } })
    const pending = await client.output.count({ where: { projectId: { in: projects.map((project) => project.id) }, status: 'MENUNGGU_REVIEW' } })
    await client.weeklyDivisionSummary.create({ data: {
      divisionId: division.id, weeklyReportId: report.id, isoYear: report.isoYear, isoWeek: report.isoWeek,
      status: 'TERKIRIM', points: ['Pengujian berjalan.', 'Material dipantau.', 'Dokumen hasil sedang diperiksa.'],
      outputsAccepted: accepted, outputsTarget: projects.length, projectsTotal: projects.length,
      pendingReview: pending, sentAt: now, sentById: head.headUserId, updatedById: head.headUserId,
    } })
  }
  console.log('  ✓ Contoh model terbaru dan relasi divisi selesai dibuat')

  // ============================================================
  // KATA SANDI (F1-C, 6 Okt 2026): tanpa "1234" bawaan. SEED_PASSWORD wajib
  // >= 8 karakter, atau kosong = dibuat acak lalu dicetak sekali di bawah.
  // ============================================================
  await client.user.updateMany({ data: { passwordHash: await hashPassword(seedPw.password) } })

  console.log('\n✅ Seed completed successfully!')
  console.log(`  - ${pts.length} PT entities in hierarchy`)
  console.log(`  - ${allDivisions.length} divisions`)
  console.log(`  - ${allProjects.length} active projects`)
  console.log(`  - ${dailyCount} daily project reports`)
  console.log(`  - ${weeklyCount} weekly division reports`)
  console.log(
    seedPw.generated
      ? `  - kata sandi semua akun (acak, SEED_PASSWORD kosong): ${seedPw.password}`
      : '  - kata sandi semua akun = SEED_PASSWORD'
  )
}

main()
  .then(() => db?.$disconnect())
  .catch(async (e) => {
    console.error('❌ Seed failed:', e)
    await db?.$disconnect()
    process.exit(1)
  })
