'use client'

import { AppShell } from '@/components/app-shell'
import { handlePreview, ROLES, GROUP_ROLES } from './mock-api'

let installed = false
let previewRole = 'MANAJEMEN'
export function installMock(role: string) {
  previewRole = role
  if (installed || typeof window === 'undefined') return
  installed = true
  const real = window.fetch.bind(window)
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = url.replace(window.location.origin, '').split('?')[0]
    const response = handlePreview(path, url, init, previewRole)
    if (response) return response
    if (path.startsWith('/api/')) {
      // [F3-B] endpoint tanpa data contoh dicatat agar mudah dilacak (window.__pratinjauMiss).
      const miss = `${init?.method ?? 'GET'} ${path}`
      const w = window as unknown as { __pratinjauMiss?: string[] }
      ;(w.__pratinjauMiss ??= []).push(miss)
      console.warn(`[pratinjau] belum ada data contoh: ${miss}`)
      return json({ error: 'Pratinjau tanpa basis data' }, 503)
    }
    return real(input, init)
  }
}

export function PreviewApp({ role }: { role: string }) {
  const r = ROLES[role] ? role : 'MANAJEMEN'
  installMock(r)
  return (
    <AppShell
      user={{ id: `pratinjau-${r}`, name: ROLES[r].name, email: 'pratinjau@contoh.id', role: r, scopeEntityId: GROUP_ROLES.includes(r) ? null : 'e1', avatarColor: null }}
      branding={{ holding: { id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE', type: 'HOLDING', logoData: null }, entity: GROUP_ROLES.includes(r) ? null : { id: 'e1', name: 'PT Ratu Karya', code: 'RTK', type: 'PT', logoData: null }, lastLoginAt: 'pratinjau' }}
    />
  )
}
