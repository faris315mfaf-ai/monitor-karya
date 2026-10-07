import { readiness, privateJson } from '@/lib/operational-health'
export const dynamic = 'force-dynamic'
export async function GET() {
  const { ok, storage } = await readiness()
  return privateJson({ ok, status: ok ? (storage ? 'ready' : 'degraded') : 'unavailable' }, ok ? 200 : 503)
}
