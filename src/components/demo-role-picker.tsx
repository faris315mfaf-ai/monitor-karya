'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ROLE_LABELS } from '@/lib/constants'
import { ROLE_DUTIES } from '@/lib/rbac'
import { AlertTriangle, ChevronRight, Loader2, Sparkles } from 'lucide-react'

export type DemoRole = {
  role: string
  name: string
  email: string
  avatarColor: string | null
  scope: string
  moduleCount: number
}

function initials(name: string) {
  return name
    .replace(/^(Bpk\.|Ibu)\s*/i, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/**
 * Sign in as one of the demo roles without typing a password, so the reporting
 * chain can be walked end to end. Only rendered when the server reports the
 * demo switch is on.
 */
export function DemoRolePicker({ roles }: { roles: DemoRole[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function enter(role: string) {
    setBusy(role)
    setError(null)
    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data.error ||
            (res.status >= 500
              ? 'Server tidak dapat membaca database. Hubungi Tim TI holding.'
              : 'Gagal masuk sebagai peran ini')
        )
        setBusy(null)
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('Tidak dapat menghubungi server.')
      setBusy(null)
    }
  }

  if (roles.length === 0) return null

  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-7">
      <div className="flex items-center gap-2 text-xl font-semibold text-slate-800 dark:text-slate-100">
        <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        Masuk langsung sebagai
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Masuk langsung tanpa kata sandi. Setiap peran membuka modul dan dashboard
        yang berbeda — urut dari pelaksana di lapangan sampai manajemen.
      </p>

      <div className="mt-3 grid gap-2">
        {roles.map((r) => (
          <button
            key={r.role}
            onClick={() => enter(r.role)}
            disabled={busy !== null}
            className="group flex items-center gap-3 rounded-xl px-3 py-3 text-left border border-transparent hover:border-blue-500/40 hover:bg-blue-500/10 transition-colors disabled:opacity-50 min-h-14"
          >
            <Avatar className="h-10 w-10 shrink-0 ring-2 ring-white/70 dark:ring-white/10">
              <AvatarFallback
                className="text-white text-sm font-semibold"
                style={{ background: r.avatarColor || '#2563eb' }}
              >
                {initials(r.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-slate-800 dark:text-slate-100">
                {ROLE_LABELS[r.role] ?? r.role}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                {ROLE_DUTIES[r.role] ?? r.name}
              </div>
              <div className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
                {r.scope} · {r.moduleCount} modul
              </div>
            </div>

            {busy === r.role ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-600 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0" />
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-2 text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
        Mode demo aktif di server ini. Matikan dengan menghapus <code>DEMO_LOGIN</code>
        {' '}dari environment sebelum memuat data sungguhan.
      </p>
    </div>
  )
}
