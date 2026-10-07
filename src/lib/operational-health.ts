import 'server-only'

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { safeEqual } from '@/lib/security'
import { storageConfigured, EVIDENCE_BUCKET } from '@/lib/storage'
import { signedS3EvidenceUrl } from '@/lib/storage-s3'

export const PROBE_TIMEOUT_MS = 4_000
export const STORAGE_PROBE_KEY = '_health/readiness.txt'
export const STORAGE_PROBE_CONTENT = 'monitor-karya-storage-v1'
const TARGET = 'OPERATIONAL_JOB'
const ACTION = { running: 'OPS_RUNNING', success: 'OPS_SUCCESS', failure: 'OPS_FAILURE' } as const
// reminder-rules runs all day; remind-divisions runs every weekday (allow weekend).
export const JOBS = {
  'reminder-rules': { maxAgeMs: 90 * 60_000, maxRunMs: 10 * 60_000 },
  'remind-divisions': { maxAgeMs: 74 * 3_600_000, maxRunMs: 10 * 60_000 },
  'kpi-snapshot': { maxAgeMs: 26 * 3_600_000, maxRunMs: 10 * 60_000 },
  backup: { maxAgeMs: 30 * 3_600_000, maxRunMs: 6 * 3_600_000 },
} as const
export type Job = keyof typeof JOBS
export type JobResult = 'success' | 'failure'

export function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } })
}

/** Separate credentials: a backup reporter cannot run cron or inspect internal status. */
export function refuseOperational(req: Request, name: 'OPS_HEALTH_SECRET' | 'BACKUP_REPORT_SECRET') {
  const secret = process.env[name]
  if (!secret || secret.length < 32) return privateJson({ error: 'Layanan belum dikonfigurasi' }, 503)
  if (!safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return privateJson({ error: 'Tidak terautentikasi' }, 401)
  }
  return null
}

/** Bounds response time. Prisma queries may finish later; configure pool/connect limits too. */
export async function bounded<T>(work: PromiseLike<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('operational timeout')), ms) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function probeStorage(): Promise<void> {
  if (!storageConfigured()) throw new Error('storage unavailable')
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS)
  let url: URL
  let headers: Record<string, string> = {}
  if (process.env.STORAGE_DRIVER === 's3') {
    url = new URL(signedS3EvidenceUrl(STORAGE_PROBE_KEY, 30))
  } else {
    url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw new Error('storage configuration')
    url.pathname = `/storage/v1/object/authenticated/${EVIDENCE_BUCKET}/${STORAGE_PROBE_KEY}`
    headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` }
  }
  const response = await fetch(url, { headers, signal, cache: 'no-store', redirect: 'error' })
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel()
    throw new Error('storage probe failed')
  }
  // Compare bounded bytes; HTML login pages, missing objects and oversized bodies fail closed.
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > 128) throw new Error('storage probe size')
      chunks.push(part.value)
    }
    if (Buffer.concat(chunks).toString('utf8') !== STORAGE_PROBE_CONTENT) throw new Error('storage probe content')
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

// Share only in-flight checks in one process; never cache a successful result.
let checking: Promise<{ database: boolean; storage: boolean; storageStatus: 'ok' | 'degraded' | 'configmissing'; ok: boolean }> | undefined
export function readiness() {
  if (!checking) {
    const configured = storageConfigured()
    checking = Promise.allSettled([
      bounded(db.$queryRaw`SELECT 1`), bounded(probeStorage()),
    ]).then(([database, storage]) => ({
      database: database.status === 'fulfilled', storage: storage.status === 'fulfilled',
      storageStatus: storage.status === 'fulfilled' ? 'ok' as const : configured ? 'degraded' as const : 'configmissing' as const,
      ok: database.status === 'fulfilled',
    })).finally(() => { checking = undefined })
  }
  return checking
}

export async function startJob(job: Job, id: string = randomUUID()): Promise<string> {
  await bounded(db.auditLog.create({ data: {
    id, actorId: null, action: ACTION.running, targetType: TARGET, targetId: job,
    userAgent: 'operational-health',
  } }))
  return id
}

export async function finishJob(job: Job, id: string, result: JobResult): Promise<boolean> {
  // No free text, timestamps or counts accepted from a remote reporter. Late/replayed
  // completion cannot turn a failed or timed-out run into a fresh success.
  const updated = await bounded(db.auditLog.updateMany({
    where: { id, targetType: TARGET, targetId: job, action: ACTION.running,
      at: { gte: new Date(Date.now() - JOBS[job].maxRunMs), lte: new Date() } },
    data: { action: ACTION[result] },
  }))
  return updated.count === 1
}

/** Fail closed before work if its heartbeat cannot be persisted. */
export async function runOperationalJob<T extends { ok: boolean }>(job: Exclude<Job, 'backup'>, work: () => Promise<T>) {
  let id: string | undefined
  try {
    id = await startJob(job)
    const result = await bounded(work(), JOBS[job].maxRunMs)
    if (!await finishJob(job, id, result.ok ? 'success' : 'failure')) throw new Error('heartbeat not saved')
    return privateJson(result, result.ok ? 200 : 503)
  } catch {
    if (id) await finishJob(job, id, 'failure').catch(() => false)
    // Provider errors may contain URLs/credentials. Persist and expose only fixed states.
    return privateJson({ ok: false, error: 'Pekerjaan operasional gagal' }, 503)
  }
}

export async function operationalStatus(now = new Date()) {
  const checks = await readiness()
  const jobs = await Promise.all((Object.keys(JOBS) as Job[]).map(async job => {
    const row = await bounded(db.auditLog.findFirst({
      where: { targetType: TARGET, targetId: job }, orderBy: [{ at: 'desc' }, { id: 'desc' }],
      select: { action: true, at: true },
    }))
    const ageMs = row ? now.getTime() - row.at.getTime() : null
    let status = 'missing'
    if (row && ageMs !== null) {
      if (ageMs < 0) status = 'invalid'
      else if (row.action === ACTION.failure) status = 'failure'
      else if (row.action === ACTION.running) status = ageMs > JOBS[job].maxRunMs ? 'stalled' : 'running'
      else if (row.action === ACTION.success) status = ageMs > JOBS[job].maxAgeMs ? 'stale' : 'success'
      else status = 'invalid'
    }
    let ok = status === 'success'
    // An in-progress run is healthy only if a previous completed run is still fresh.
    if (status === 'running') {
      const success = await bounded(db.auditLog.findFirst({
        where: { targetType: TARGET, targetId: job, action: { in: [ACTION.success, ACTION.failure] },
          at: { lte: now } },
        orderBy: [{ at: 'desc' }, { id: 'desc' }], select: { action: true, at: true },
      }))
      ok = success?.action === ACTION.success && now.getTime() - success.at.getTime() <= JOBS[job].maxAgeMs
    }
    return { job, status, ok, lastStartedAt: row?.at.toISOString() ?? null, maxAgeSeconds: JOBS[job].maxAgeMs / 1000 }
  }))
  return { ok: checks.ok && checks.storage && jobs.every(job => job.ok), checks, jobs }
}
