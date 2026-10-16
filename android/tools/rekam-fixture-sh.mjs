// Rekam respons nyata rute model subholding sebagai fixture uji kontrak Android
// (core/network/src/test/resources/sh/*.json, dibaca ShKontrakTest).
//
// HANYA untuk server lokal dengan DB uji (next dev :3100 + .env.e2e.lokal,
// DB e2e 54329). Jangan pernah diarahkan ke produksi. Sandi akun uji dibaca
// dari env SEED_PASSWORD; cookie dan sandi tidak pernah ditulis ke berkas.
//
//   set -a; source .env.e2e.lokal; set +a
//   node android/tools/rekam-fixture-sh.mjs [--base http://localhost:3100]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argBase = process.argv.indexOf('--base')
const BASE = argBase > 0 ? process.argv[argBase + 1] : 'http://localhost:3100'
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Tolak: ${BASE} bukan server lokal.`)
  process.exit(1)
}
const SANDI = process.env.SEED_PASSWORD
if (!SANDI) {
  console.error('SEED_PASSWORD kosong. Muat .env.e2e.lokal dulu.')
  process.exit(1)
}
const TUJUAN = join(dirname(fileURLToPath(import.meta.url)), '..', 'core', 'network', 'src', 'test', 'resources', 'sh')

async function masuk(identifier) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      'X-Forwarded-For': `10.80.${Math.floor(Math.random() * 200)}.7`,
    },
    body: JSON.stringify({ identifier, password: SANDI }),
  })
  if (r.status !== 200) throw new Error(`Masuk ${identifier} gagal: HTTP ${r.status}`)
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

async function ambil(cookie, path) {
  const r = await fetch(BASE + path, { headers: { Cookie: cookie } })
  if (r.status !== 200) throw new Error(`${path}: HTTP ${r.status}`)
  return r.json()
}

function simpan(nama, json) {
  writeFileSync(join(TUJUAN, nama), JSON.stringify(json, null, 2) + '\n')
  console.log('tersimpan', nama)
}

mkdirSync(TUJUAN, { recursive: true })
const admin = await masuk('admin.karyaenerginusantara')
const supervisor = await masuk('supervisor')
const superuser = await masuk('superuser')

simpan('options.json', await ambil(admin, '/api/sh/options'))
const laporan = await ambil(admin, '/api/sh/reports?pageSize=5')
simpan('reports.json', laporan)
const satu = laporan.items?.[0]
if (!satu) throw new Error('Akun admin uji belum punya laporan; jalankan scratchpad/e2e-sh.mjs dulu.')
simpan('report.json', await ambil(admin, `/api/sh/reports/${encodeURIComponent(satu.id)}`))
simpan('inbox.json', await ambil(admin, '/api/sh/inbox'))
simpan('review-menunggu.json', await ambil(supervisor, '/api/sh/review?status=MENUNGGU'))
const disetujui = await ambil(supervisor, '/api/sh/review?status=DISETUJUI')
simpan('review-disetujui.json', disetujui)

// Ringkasan: tanggal laporan disetujui terbaru supaya `pts[].reports` terisi.
const tanggal = disetujui.items?.[0]?.reportDate
simpan('overview.json', await ambil(superuser, `/api/sh/overview${tanggal ? `?date=${tanggal}` : ''}`))
const pekan = await ambil(superuser, `/api/sh/overview/week${tanggal ? `?end=${tanggal}` : ''}`)
simpan('week.json', pekan)
const sub = pekan.subholdings?.[0]?.id
if (sub) simpan('week-sub.json', await ambil(superuser, `/api/sh/overview/week?subholdingId=${encodeURIComponent(sub)}${tanggal ? `&end=${tanggal}` : ''}`))
simpan('nav-badges.json', await ambil(supervisor, '/api/nav-badges'))
