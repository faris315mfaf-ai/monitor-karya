/**
 * CX14 — HTTP sungguhan + PostgreSQL khusus, tanpa dotenv/reset/seed produksi.
 * Siapkan fixture (aditif, kredensial acak, mode 0600):
 *   npx tsx scripts/uji-alur-lokal.ts --prepare --fixture /tmp/cx14-fixture.json
 * Jalankan server TERPISAH pada namespace DB, tests di-mount baca-saja:
 *   MK_E2E_NOW=2026-10-08T09:30:00.000Z node tests/e2e-lokal/server.mjs
 *   npx tsx scripts/uji-alur-lokal.ts --phase before --fixture /tmp/cx14-fixture.json --report /tmp/cx14-before.json
 * Hentikan hanya server uji itu, mulai ulang dengan MK_E2E_NOW=2026-10-08T10:05:00.000Z:
 *   npx tsx scripts/uji-alur-lokal.ts --phase after --fixture /tmp/cx14-fixture.json --report /tmp/cx14-after.json
 * Semua proses membutuhkan DATABASE_URL, DIRECT_URL, MK_E2E_BASE_URL dan
 * MK_E2E_ISOLATED=1 eksplisit. DB: monitor_karya_local/user mk_local; port
 * 54329 hanya di kontainer, host 54339 selalu ditolak. Tidak ada opsi reset.
 * Hasil FAIL memberi exit 1; Supabase external-pending tidak pernah disebut lulus.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { assertLocalTarget } from '../tests/e2e-lokal/guard.mjs'
import { prepareFixture, type Fixture } from '../tests/e2e-lokal/fixture'
import { Report } from '../tests/e2e-lokal/harness'
import { runScenarios } from '../tests/e2e-lokal/scenarios'

async function main() {
  const { values } = parseArgs({ options: { prepare: { type: 'boolean' }, fixture: { type: 'string' }, phase: { type: 'string' }, report: { type: 'string' }, help: { type: 'boolean' } }, strict: true })
  if (values.help) {
    console.log('CX14: --prepare --fixture /tmp/cx14-fixture.json, lalu --phase before|after --fixture PATH --report PATH.json. Lihat kepala scripts/uji-alur-lokal.ts untuk env dan server jam uji.')
    return
  }
  assertLocalTarget() // Sebelum Prisma/HTTP dipanggil dan sebelum berkas kredensial dibaca.
  if (!values.fixture) throw new Error('--fixture wajib diberikan.')
  const fixturePath = resolve(values.fixture)
  if (values.prepare) {
    if (values.phase) throw new Error('--prepare tidak digabung --phase.')
    // Reservasi eksklusif sebelum mutasi DB: pengulangan tidak menimpa manifest lama.
    await writeFile(fixturePath, '', { flag: 'wx', mode: 0o600 })
    const fixture = await prepareFixture()
    await writeFile(fixturePath, JSON.stringify(fixture, null, 2) + '\n', { mode: 0o600 })
    console.log(`Fixture ${fixture.runId} dibuat secara aditif. Manifest privat: ${fixturePath}`)
    return
  }
  if (!['before', 'after'].includes(values.phase || '')) throw new Error('--phase wajib before atau after.')
  if (!values.report?.endsWith('.json')) throw new Error('--report wajib berkas .json.')
  const path = resolve(values.report)
  if (path === fixturePath || path.replace(/\.json$/, '') + '.txt' === fixturePath) throw new Error('Laporan tidak boleh menimpa manifest fixture.')
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture
  if (!/^cx14-[a-f0-9]{12}$/.test(fixture.runId) || fixture.database !== 'monitor_karya_local' || fixture.projectIds.length !== 3 || fixture.projectIds.some(id => !id.startsWith(`${fixture.runId}-`))) throw new Error('Manifest bukan fixture CX14 yang dikenal.')
  const report = new Report(values.phase!, fixture.runId)
  try {
    await runScenarios(fixture, values.phase as 'before' | 'after', report)
  } catch (err) {
    await report.scenario('HARNESS', 'Runner menyelesaikan pengujian', async () => { throw err })
  } finally {
    await report.save(path)
    console.log(`Laporan JSON: ${path}; laporan manusia: ${path.replace(/\.json$/, '')}.txt`)
    if (report.failed) process.exitCode = 1
  }
}
main().catch(err => {
  // Pesan guard tidak memuat URL DB/kredensial. Galat Prisma dapat memuatnya;
  // laporkan nama galat saja bila bukan pesan terkontrol runner.
  console.error(`CX14 berhenti: ${err instanceof Error && err.name === 'Error' ? err.message : 'persiapan gagal; periksa lingkungan lokal dan migrasi'}`)
  process.exitCode = 1
})
