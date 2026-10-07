/** HTTP + PostgreSQL sungguhan, hanya fixture Docker terisolasi CX16 port 54349. */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/password'

const database = new URL(process.env.DATABASE_URL ?? '')
const base = process.env.CX16_APP_URL ?? 'http://127.0.0.1:3211'
assert.equal(process.env.CX16_ISOLATED, '1')
assert.equal(database.hostname, '127.0.0.1')
assert.equal(database.port, '54349')
assert.equal(database.pathname, '/monitor_karya_local')
assert.equal(database.username, 'mk_local')
assert.equal(database.search, '')
assert.equal(process.env.DIRECT_URL, database.href)
assert.equal(base, 'http://127.0.0.1:3211')
const db = new PrismaClient()
const run = randomUUID()
const password = randomBytes(24).toString('base64url')
const results: string[] = []

async function call(path: string, method = 'GET', body?: unknown, cookie = '', secret?: string) {
  const response = await fetch(base + path, { method, headers: {
    'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}),
    ...(secret ? { authorization: `Bearer ${secret}` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { response, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
async function login(username: string, pass = password) {
  const r = await call('/api/auth/login', 'POST', { identifier: username, password: pass })
  assert.equal(r.response.status, 200); assert(r.cookie); return r.cookie
}
async function main() {
  const pt = await db.entity.create({ data: { code: `cx16-${run}`, name: 'PT uji terisolasi', type: 'PT', path: `/cx16-${run}/` } })
  const hash = await hashPassword(password)
  const admin = await db.user.create({ data: { email: `${run}-admin@test.invalid`, username: `a${run.slice(0, 12)}`, name: 'Admin uji', role: 'SUPERADMIN', passwordHash: hash } })
  const pic = await db.user.create({ data: { email: `${run}-pic@test.invalid`, username: `p${run.slice(0, 12)}`, name: 'PIC uji', role: 'PIC_PROYEK', scopeEntityId: pt.id, passwordHash: hash } })
  const adminCookie = await login(admin.username!)
  const picCookie = await login(pic.username!)
  const other = await login(pic.username!)
  assert.equal((await call('/api/auth/logout', 'POST', {}, picCookie)).response.status, 200)
  assert.equal((await call('/api/auth/me', 'GET', undefined, picCookie)).response.status, 401)
  assert.equal((await call('/api/auth/me', 'GET', undefined, other)).response.status, 200)
  results.push('PASS logout mencabut token; sesi perangkat kedua tetap sah')

  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION cx16_reject_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'uji kegagalan sesi'; END $$`)
  await db.$executeRawUnsafe('CREATE TRIGGER cx16_session_failure BEFORE INSERT ON "AuthSession" FOR EACH ROW EXECUTE FUNCTION cx16_reject_session()')
  try {
    const failed = await call('/api/profile/password', 'POST', { currentPassword: password, newPassword: randomBytes(24).toString('base64url') }, other)
    assert.equal(failed.response.status, 503)
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: pic.id } })).passwordHash, hash)
    assert.equal((await call('/api/auth/me', 'GET', undefined, other)).response.status, 200)
    assert.equal(await db.auditLog.count({ where: { targetId: pic.id, action: 'CHANGE_OWN_PASSWORD' } }), 0)
  } finally { await db.$executeRawUnsafe('DROP TRIGGER cx16_session_failure ON "AuthSession"'); await db.$executeRawUnsafe('DROP FUNCTION cx16_reject_session()') }
  results.push('PASS insert sesi PostgreSQL gagal: perubahan sandi dan audit rollback; sesi lama tetap sah')

  await db.user.update({ where: { id: pic.id }, data: { role: 'MANAJEMEN' } })
  const ar = await db.accessRequest.create({ data: { type: 'AKSES_SEMENTARA', payload: '{}', status: 'DISETUJUI', targetUserId: pic.id,
    expiresAt: new Date(Date.now() - 1000), appliedData: JSON.stringify({ role: 'PIC_PROYEK', isActive: true, grantedRole: 'MANAJEMEN' }) } })
  const parallel = await Promise.all([call('/api/auth/me', 'GET', undefined, other), call('/api/auth/me', 'GET', undefined, other)])
  parallel.forEach(r => { assert.equal(r.response.status, 200); assert.equal(r.data.user.role, 'PIC_PROYEK') })
  assert((await db.accessRequest.findUniqueOrThrow({ where: { id: ar.id } })).revertedAt)
  assert.equal(await db.auditLog.count({ where: { targetId: pic.id, action: 'TEMP_ACCESS_EXPIRED' } }), 1)
  results.push('PASS akses kedaluwarsa dipulihkan tanpa cron; dua request menghasilkan satu audit')

  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION cx16_reject_logout() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'LOGOUT' THEN RAISE EXCEPTION 'uji kegagalan audit'; END IF; RETURN NEW; END $$`)
  await db.$executeRawUnsafe('CREATE TRIGGER cx16_logout_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION cx16_reject_logout()')
  try {
    const r = await call('/api/auth/logout', 'POST', {}, other)
    assert.equal(r.response.status, 200)
    assert.equal((await call('/api/auth/me', 'GET', undefined, other)).response.status, 401)
  } finally { await db.$executeRawUnsafe('DROP TRIGGER cx16_logout_audit ON "AuditLog"'); await db.$executeRawUnsafe('DROP FUNCTION cx16_reject_logout()') }
  results.push('PASS audit PostgreSQL gagal tetap mencabut sesi')

  const currentPic = await login(pic.username!)
  const divType = await db.divisionType.create({ data: { code: `cx16-${run}`, name: 'Divisi uji' } })
  const division = await db.division.create({ data: { entityId: pt.id, divisionTypeId: divType.id, name: 'Divisi A' } })
  const kadiv = await db.user.create({ data: { email: `${run}-kadiv@test.invalid`, username: `k${run.slice(0, 12)}`, name: 'Kepala uji', role: 'KEPALA_DIVISI', scopeEntityId: pt.id, divisionId: division.id, passwordHash: hash } })
  await db.division.update({ where: { id: division.id }, data: { headUserId: kadiv.id } })
  const project = await db.project.create({ data: { entityId: pt.id, code: `cx16-${run}`, name: 'Proyek tanpa divisi', lifecycle: 'AKTIF', phase: 'PELAKSANAAN', picUserId: pic.id, picName: pic.name } })
  const kadivCookie = await login(kadiv.username!)
  const requester = await db.user.create({ data: { email: `${run}-requester@test.invalid`, username: `r${run.slice(0, 12)}`, name: 'Admin PT uji', role: 'ADMIN_PT', scopeEntityId: pt.id, passwordHash: hash } })
  const requesterCookie = await login(requester.username!)
  const tempRequest = await call('/api/access-requests', 'POST', { type: 'AKSES_SEMENTARA', reason: 'Penugasan PIC sementara untuk uji lokal',
    payload: { userId: kadiv.id, role: 'PIC_PROYEK', projectId: project.id, days: 1 } }, requesterCookie)
  assert.equal(tempRequest.response.status, 201, 'Admin PT dapat mengajukan PIC sementara dengan proyek')
  const tempId = tempRequest.data.item.id
  assert.equal((await call('/api/access-requests', 'PATCH', { id: tempId, decision: 'approve' }, adminCookie)).response.status, 200)
  assert.equal((await db.project.findUniqueOrThrow({ where: { id: project.id } })).picUserId, kadiv.id)
  await db.accessRequest.update({ where: { id: tempId }, data: { expiresAt: new Date(Date.now() - 1000) } })
  assert.equal((await call('/api/auth/me', 'GET', undefined, kadivCookie)).data.user.role, 'KEPALA_DIVISI')
  assert.equal((await db.project.findUniqueOrThrow({ where: { id: project.id } })).picUserId, pic.id)
  assert.equal((await db.division.findUniqueOrThrow({ where: { id: division.id } })).headUserId, kadiv.id)
  results.push('PASS PIC sementara: PIC asal dan kepala divisi dipulihkan saat tenggat')

  const requested = await call('/api/access-requests', 'POST', { type: 'AKUN_BARU', reason: 'Uji aktivasi akun baru lokal',
    payload: { name: 'Pengguna baru', username: `n${run.slice(0, 12)}`, email: `${run}-new@test.invalid`, role: 'PIC_PROYEK' } }, currentPic)
  assert.equal(requested.response.status, 201)
  const approved = await call('/api/access-requests', 'PATCH', { id: requested.data.item.id, decision: 'approve' }, adminCookie)
  assert.equal(approved.response.status, 200)
  const activation = approved.data.activation
  assert(activation?.path)
  const firstToken = new URLSearchParams(activation.path.split('#')[1]).get('token')!
  const renewed = await call('/api/companies/users/activation', 'POST', { userId: activation.userId }, adminCookie)
  assert.equal(renewed.response.status, 200)
  const newToken = new URLSearchParams(renewed.data.activation.path.split('#')[1]).get('token')!
  const newPassword = randomBytes(24).toString('base64url')
  assert.equal((await call('/api/auth/activate', 'POST', { token: firstToken, password: newPassword })).response.status, 400)
  const consumed = await Promise.all([call('/api/auth/activate', 'POST', { token: newToken, password: newPassword }), call('/api/auth/activate', 'POST', { token: newToken, password: newPassword })])
  assert.deepEqual(consumed.map(r => r.response.status).sort(), [200, 400])
  const activatedCookie = await login(activation.username, newPassword)
  assert.equal((await call('/api/auth/me', 'GET', undefined, activatedCookie)).data.user.mustChangePassword, false)
  const stored = await db.accountActivation.findUniqueOrThrow({ where: { userId: activation.userId } })
  assert(!JSON.stringify(stored).includes(newToken))
  const audit = JSON.stringify(await db.auditLog.findMany({ where: { targetId: activation.userId } }))
  assert(!audit.includes(newToken)); assert(!audit.includes(newPassword))
  results.push('PASS persetujuan → tautan aktivasi → reissue → konsumsi satu kali bersamaan → login')

  const readiness = await call('/api/health/ready')
  assert.equal(readiness.response.status, 200)
  assert.equal((await call('/api/health/internal')).response.status, 401)
  const ops = await call('/api/health/internal', 'GET', undefined, '', process.env.OPS_HEALTH_SECRET)
  assert.equal(ops.response.status, 503); assert.equal(ops.data.checks.database, true)
  for (const job of ['remind-divisions', 'reminder-rules', 'kpi-snapshot']) {
    assert.equal((await call(`/api/cron/${job}`, 'GET', undefined, '', process.env.CRON_SECRET)).response.status, 200)
  }
  const backupId = randomUUID()
  for (const status of ['running', 'success']) {
    assert.equal((await call('/api/health/backup', 'POST', { status, runId: backupId }, '', process.env.BACKUP_REPORT_SECRET)).response.status, 200)
  }
  assert.equal((await call('/api/health/backup', 'POST', { status: 'success', runId: backupId }, '', process.env.BACKUP_REPORT_SECRET)).response.status, 409)
  const status = await call('/api/health/internal', 'GET', undefined, '', process.env.OPS_HEALTH_SECRET)
  assert(status.data.jobs.every((job: { status: string }) => job.status === 'success'))
  results.push('PASS readiness DB, proteksi status privat, heartbeat tiga cron, laporan backup anti-replay')
  await writeFile('/private/tmp/mk-cx16-http-results.json', JSON.stringify({ at: new Date().toISOString(), results, productionStorage: 'NOT_TESTED' }, null, 2))
  console.log(results.join('\n'))
}
main().catch((error) => { console.error(error instanceof assert.AssertionError ? error.message : 'Pengujian gagal; periksa layanan lokal.'); process.exitCode = 1 }).finally(() => db.$disconnect())
