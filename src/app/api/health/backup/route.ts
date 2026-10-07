import { bounded, startJob, finishJob, privateJson, refuseOperational } from '@/lib/operational-health'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const refused = refuseOperational(req, 'BACKUP_REPORT_SECRET')
  if (refused) return refused
  // Tiny fixed payload; enforce bytes while reading even without Content-Length.
  let body: { status?: unknown; runId?: unknown }
  try {
    const reader = req.body?.getReader()
    if (!reader) return privateJson({ error: 'Laporan tidak sah' }, 400)
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      await bounded((async () => {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          length += part.value.byteLength
          if (length > 256) throw new Error('size')
          chunks.push(part.value)
        }
      })())
    } finally { void reader.cancel().catch(() => undefined) }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(key => !['status', 'runId'].includes(key)) ||
        !['running', 'success', 'failure'].includes(String(body.status)) ||
        typeof body.runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.runId)) {
      return privateJson({ error: 'Laporan tidak sah' }, 400)
    }
  } catch { return privateJson({ error: 'Laporan tidak sah' }, 400) }
  try {
    if (body.status === 'running') await startJob('backup', body.runId as string)
    else if (!await finishJob('backup', body.runId as string, body.status as 'success' | 'failure')) {
      return privateJson({ error: 'Laporan kedaluwarsa atau sudah selesai' }, 409)
    }
    return privateJson({ ok: true })
  } catch { return privateJson({ ok: false, error: 'Laporan belum tersimpan' }, 503) }
}
