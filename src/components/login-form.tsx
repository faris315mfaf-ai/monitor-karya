'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Activity, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

type DemoAccount = { email: string; name: string; roleLabel: string }

export function LoginForm({ demoAccounts }: { demoAccounts: DemoAccount[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
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
        body: JSON.stringify({ email, password }),
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

        {/* Card */}
        <div className="glass-strong rounded-2xl p-5 sm:p-7">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Masuk ke akun Anda</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Gunakan email kantor dan kata sandi yang diberikan administrator.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                required
                placeholder="nama@karya.co.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="bg-white/70 dark:bg-slate-900/50 h-11"
              />
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

        {demoAccounts.length > 0 && (
          <div className="glass rounded-xl mt-4 p-4">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-blue-700 dark:text-blue-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Akun contoh (data seed)
            </div>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              Ketuk salah satu untuk mengisi email, lalu masukkan kata sandi seed.
            </p>
            <div className="mt-2 grid gap-1">
              {demoAccounts.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => setEmail(a.email)}
                  disabled={submitting}
                  className="text-left rounded-lg px-2.5 py-2 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                >
                  <div className="text-[13px] font-medium text-slate-700 dark:text-slate-200 truncate">
                    {a.roleLabel} · {a.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{a.email}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[13px] text-slate-400 dark:text-slate-500">
          Lupa kata sandi? Hubungi Tim TI holding.
        </p>
      </div>
    </div>
  )
}
