import { privateJson } from '@/lib/operational-health'
export const dynamic = 'force-dynamic'
export function GET() { return privateJson({ ok: true, status: 'alive' }) }
