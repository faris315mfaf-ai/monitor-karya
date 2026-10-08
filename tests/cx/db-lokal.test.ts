import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const local = 'postgresql://dev:dev@127.0.0.1:54329/monitor_karya_local?schema=public'
function run(database: string, direct = local, action = 'migrasi') {
  return spawnSync('bash', ['scripts/db-lokal.sh', action], {
    cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: database, DIRECT_URL: direct },
  })
}
describe('pagar basis data lokal CX4', () => {
  it.each([
    'postgresql://x:y@supabase.example:54329/monitor_karya_local',
    'postgresql://x:y@127.0.0.1:5432/monitor_karya_local',
    'postgresql://x:y@127.0.0.1:54329/production',
    'postgresql://x:y@127.0.0.1:54329/monitor_karya_local?host=remote.example',
    'postgresql://x:y@127.0.0.1:54329/monitor_karya_local?schema=private',
    'https://127.0.0.1:54329/monitor_karya_local',
  ])('menolak tujuan berbahaya sebelum migrasi: %s', database => {
    const result = run(database)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('DATABASE_URL ditolak')
    expect(result.stdout).not.toContain('Prisma')
  })
  it('juga memeriksa DIRECT_URL saat DATABASE_URL lokal', () => {
    const result = run(local, 'postgresql://x:y@remote.example:5432/db')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('DIRECT_URL ditolak')
  })
  it('ulang membutuhkan flag penghapusan data lokal', () => {
    const result = run(local, local, 'ulang')
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--hapus-data-lokal')
  })
})
