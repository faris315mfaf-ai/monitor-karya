'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Activity, AlertTriangle, Eye, EyeOff, Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * Masuk dengan username (atau email) dan kata sandi — satu-satunya jalur sejak
 * jalan pintas demo dihapus (10 Sep 2026).
 */
export function LoginForm({ dbReachable }: { dbReachable: boolean }) {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Gagal masuk. Coba lagi.')
        setSubmitting(false)
        return
      }
      // Full navigation so the server component re-reads the new session cookie.
      router.replace('/')
      router.refresh()
    } catch {
      setError('Tidak dapat menghubungi server. Periksa koneksi Anda.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm sm:max-w-md animate-fade-in">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 flex items-center justify-center shadow-glow-blue">
            <Activity className="h-7 w-7 text-white" strokeWidth={2.5} />
            <div className="absolute -inset-1.5 -z-10 rounded-2xl bg-blue-400/30 blur-lg" />
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            MonitorKarya
          </h1>
          <p className="mt-1 text-base text-slate-500 dark:text-slate-400">Pemantauan Bisnis Holding</p>
        </div>

        {!dbReachable && (
          <Alert variant="destructive" className="mb-4 bg-amber-500/10 border-amber-500/40">
            <AlertDescription className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Database belum terhubung di server ini, jadi tombol masuk akan gagal.
                Variabel <code>DATABASE_URL</code> perlu diisi lalu situs dideploy ulang.
              </span>
            </AlertDescription>
          </Alert>
        )}

        <div className="glass-strong rounded-2xl p-5 sm:p-7">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Masuk ke akun Anda</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Gunakan username dan kata sandi yang diberikan Super Admin.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="identifier" className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Username
              </Label>
              <Input
                id="identifier"
                name="username"
                type="text"
                inputMode="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                required
                placeholder="username Anda"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={submitting}
                className="bg-white/70 dark:bg-slate-900/50 h-11 font-mono"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500">Email juga bisa dipakai.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Kata sandi
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="bg-white/70 dark:bg-slate-900/50 h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:bg-slate-500/10 dark:hover:bg-slate-400/15 transition-colors"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/30">
                <AlertDescription className="text-sm text-rose-700 dark:text-rose-300">{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold shadow-glow-blue"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memeriksa…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Masuk
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[13px] text-slate-400 dark:text-slate-500">
          Lupa kata sandi? Hubungi Super Admin untuk menyetel ulang.
        </p>
      </div>
    </div>
  )
}
