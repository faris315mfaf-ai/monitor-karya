import { operationalStatus, privateJson, refuseOperational } from '@/lib/operational-health'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const refused = refuseOperational(req, 'OPS_HEALTH_SECRET')
  if (refused) return refused
  try {
    const status = await operationalStatus()
    return privateJson(status, status.ok ? 200 : 503)
  } catch {
    return privateJson({ ok: false, error: 'Status operasional tidak tersedia' }, 503)
  }
}
