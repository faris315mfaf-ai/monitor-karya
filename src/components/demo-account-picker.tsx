'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export type DemoAccount = {
  username: string
  label: string
  role: string
  name: string | null
  avatarColor: string
  scope: string
}

/**
 * Masuk satu klik ke empat jenjang pelaporan (10 Sep 2026). Yang ditonjolkan
 * adalah username-nya — itulah yang diketik orang di formulir biasa — dengan
 * jenjangnya sebagai keterangan kecil.
 */
export function DemoAccountPicker({ accounts }: { accounts: DemoAccount[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function enter(username: string) {
    setBusy(username)
    setError(null)
    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Gagal masuk sebagai akun ini.')
        setBusy(null)
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('Tidak dapat menghubungi server. Periksa koneksi Anda.')
      setBusy(null)
    }
  }

  return (
    <div className="glass-strong rounded-2xl p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Masuk sebagai</h2>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Pilih username untuk langsung masuk.</p>

      <div className="mt-4 grid gap-2">
        {accounts.map((a) => {
          const initials = a.username.slice(0, 2).toUpperCase()
          const loading = busy === a.username
          return (
            <button
              key={a.username}
              type="button"
              onClick={() => enter(a.username)}
              disabled={busy !== null}
              className="group glass rounded-xl px-3 py-3 flex items-center gap-3 text-left transition-all hover:bg-blue-500/10 hover:border-blue-500/30 disabled:opacity-60"
            >
              <span
                className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm"
                style={{ background: a.avatarColor }}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-lg font-semibold text-slate-800 dark:text-slate-100 leading-tight">{a.username}</span>
                <span className="block text-[13px] text-slate-500 dark:text-slate-400 truncate">
                  {a.label} · {a.scope}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 text-slate-400 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
            </button>
          )
        })}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-3 bg-rose-500/10 border-rose-500/30">
          <AlertDescription className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
