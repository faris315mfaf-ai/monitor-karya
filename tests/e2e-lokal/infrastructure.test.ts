import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
describe('CX13 konfigurasi yang dapat direproduksi', () => {
  it('Prisma CLI dan client dipatok pada 6.19.3', () => {
    expect(pkg.dependencies.prisma).toBe('6.19.3')
    expect(pkg.dependencies['@prisma/client']).toBe('6.19.3')
  })
  it('engine mengikuti dukungan Vitest 5, bukan Node 20', () => {
    expect(pkg.engines.node).toBe('^22.12.0 || ^24.0.0 || >=26.0.0')
  })
  it('kebijakan npm mencakup skrip native yang dipakai', () => {
    for (const name of ['prisma', '@prisma/client', '@prisma/engines', 'esbuild', 'sharp', '@swc/core']) {
      expect(pkg.allowScripts?.[name], name).toBe(true)
    }
  })
  it('konfigurasi Prisma berada dalam berkas khusus', () => {
    expect(pkg.prisma).toBeUndefined()
    expect(existsSync(resolve(root, 'prisma.config.ts'))).toBe(true)
  })
  it('Prisma menolak URL implisit walaupun .env lokal ada', () => {
    const env = { ...process.env }
    delete env.DATABASE_URL
    delete env.DIRECT_URL
    const r = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'validate'], {
      cwd: root, env, encoding: 'utf8', timeout: 30_000,
    })
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toMatch(/DATABASE_URL/)
    expect(r.stdout + r.stderr).not.toMatch(/Environment variables loaded from/)
  })
  it('DIRECT_URL tidak boleh mewarisi URL .env atau fallback', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: 'postgresql://build:build@127.0.0.1:1/build' }
    delete env.DIRECT_URL
    const r = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'validate'], { cwd: root, env, encoding: 'utf8', timeout: 30_000 })
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toMatch(/DIRECT_URL/)
    expect(r.stdout + r.stderr).not.toMatch(/Environment variables loaded from/)
  })
  it('validasi eksplisit tidak memuat dotenv atau menyambung DB', () => {
    const r = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'validate'], {
      cwd: root, env: { ...process.env, DATABASE_URL: 'postgresql://build:build@127.0.0.1:1/build', DIRECT_URL: 'postgresql://build:build@127.0.0.1:1/build' },
      encoding: 'utf8', timeout: 30_000,
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout + r.stderr).not.toMatch(/Environment variables loaded from|package.json#prisma/)
  })
})
