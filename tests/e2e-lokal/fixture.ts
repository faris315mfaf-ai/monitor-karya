import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { hashPassword } from '../../src/lib/password'
import { assertLocalTarget } from './guard.mjs'

export const BEFORE = '2026-10-08T09:30:00.000Z' // Kamis 16.30 WIB
export const AFTER = '2026-10-08T10:05:00.000Z' // Kamis 17.05 WIB
export const DAY_KEY = '2026-10-08'
export const WEEK = '2026-W41'
export type Fixture = Awaited<ReturnType<typeof prepareFixture>>

export async function prepareFixture() {
  const target = assertLocalTarget()
  const db = new PrismaClient({ datasourceUrl: target.databaseUrl })
  const runId = `cx14-${randomBytes(6).toString('hex')}`
  const password = randomBytes(24).toString('base64url')
  const id = (suffix: string) => `${runId}-${suffix}`
  try {
    const [identity] = await db.$queryRaw<{ name: string; port: number; username: string }[]>`SELECT current_database()::text AS name, inet_server_port() AS port, current_user::text AS username`
    assert.equal(identity.name, target.databaseName)
    assert.equal(identity.port, target.databasePort)
    assert.equal(identity.username, 'mk_local')
    const passwordHash = await hashPassword(password)
    // Fixture additive dan unik. Tidak pernah truncate, reset, deleteMany, atau upsert data lain.
    const users: Record<string, { id: string; username: string }> = {}
    await db.$transaction(async tx => {
      for (const key of ['pt', 'other']) await tx.entity.create({ data: { id: id(key), code: id(key), name: `PT Uji ${key} ${runId}`, type: 'PT', path: `/${id(key)}/` } })
      await tx.divisionType.create({ data: { id: id('type'), code: id('type'), name: 'Teknologi uji' } })
      await tx.division.create({ data: { id: id('division'), name: 'Divisi uji', entityId: id('pt'), divisionTypeId: id('type') } })
      const roles = { pic: 'PIC_PROYEK', head: 'KEPALA_DIVISI', admin: 'ADMIN_PT', director: 'DIREKTUR_ENTITAS', sdm: 'DIREKTUR_SDM_GA', ti: 'TI', emptyPic: 'PIC_PROYEK', emptyHead: 'KEPALA_DIVISI', emptyAdmin: 'ADMIN_PT', outsider: 'PIC_PROYEK' }
      for (const [key, role] of Object.entries(roles)) {
        const scoped = !['sdm', 'ti', 'emptyHead', 'emptyAdmin'].includes(key)
        const username = id(key.toLowerCase())
        const u = await tx.user.create({ data: { id: id(key), username, email: `${username}@example.test`, name: `Uji ${key}`, role, passwordHash, scopeEntityId: key === 'outsider' ? id('other') : scoped ? id('pt') : null, divisionId: ['pic', 'head'].includes(key) ? id('division') : null } })
        users[key] = { id: u.id, username }
      }
      await tx.division.update({ where: { id: id('division') }, data: { headUserId: users.head.id } })
      for (let n = 1; n <= 3; n++) await tx.project.create({ data: { id: id(`project${n}`), code: id(`p${n}`), name: `Proyek uji ${n} ${runId}`, entityId: id('pt'), divisionId: id('division'), picUserId: users.pic.id, phase: 'PELAKSANAAN', lifecycle: 'AKTIF', startDate: new Date('2026-10-04T17:00:00Z'), targetEndDate: new Date('2026-10-15T17:00:00Z') } })
      await tx.project.create({ data: { id: id('foreign'), code: id('foreign'), name: `Proyek luar ${runId}`, entityId: id('other'), picUserId: users.outsider.id, phase: 'PELAKSANAAN', lifecycle: 'AKTIF' } })
      await tx.aspectCategory.create({ data: { id: id('aspect'), code: id('aspect'), name: 'Operasional uji' } })
      await tx.priority.create({ data: { id: id('priority'), code: id('priority'), name: 'Sedang uji', weight: 2 } })
    }, { timeout: 30_000 })
    return { runId, password, users, entityId: id('pt'), otherEntityId: id('other'), divisionId: id('division'), projectIds: [1, 2, 3].map(n => id(`project${n}`)), foreignProjectId: id('foreign'), aspectId: id('aspect'), priorityId: id('priority'), database: target.databaseName }
  } finally { await db.$disconnect() }
}
