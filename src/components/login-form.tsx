'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function LoginForm({
  demoOn,
  demoPassword,
  dbReachable,
  quickAccounts = [],
  children,
}: {
  /** Whether the one-click account picker is live on this server. */
  demoOn: boolean
  /** The shared sample password, shown openly, or null when demo mode is off. */
  demoPassword: string | null
  /** False when the login page could not reach the database. */
  dbReachable: boolean
  /** Usernames offered for quick-fill in the manual form. */
  quickAccounts?: { username: string; label: string }[]
  /** Slot for the one-click picker. */
  children?: React.ReactNode
}) {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // With one-click entry available the password form is the rarer path, so it
  // starts folded away rather than competing with the account buttons.
  const [manualOpen, setManualOpen] = useState(!demoOn)
  const [copied, setCopied] = useState(false)

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

  function copyPassword() {
    if (!demoPassword) return
    navigator.clipboard?.writeText(demoPassword).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      },
      () => setCopied(false)
    )
  }

  /** Fill both fields so the manual path is one tap away from submitting. */
  function fillAccount(username: string) {
    setIdentifier(username)
    if (demoPassword) setPassword(demoPassword)
    setManualOpen(true)
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
                Database belum terhubung di server ini, jadi tombol di bawah akan gagal.
                Variabel <code>DATABASE_URL</code> perlu diisi lalu situs dideploy ulang.
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* One-click entry comes first when it is available. */}
        {demoOn && children}

        {/* Password sign-in: primary when there is no demo, folded away otherwise. */}
        <div className={demoOn ? 'glass rounded-2xl mt-4 p-4 sm:p-5' : 'glass-strong rounded-2xl p-5 sm:p-7'}>
          {demoOn ? (
            <button
              type="button"
              onClick={() => setManualOpen((v) => !v)}
              aria-expanded={manualOpen}
              className="flex w-full items-center gap-2 text-left min-h-11"
            >
              <KeyRound className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400 shrink-0" />
              <span className="flex-1 text-base font-semibold text-slate-800 dark:text-slate-100">
                Masuk dengan username &amp; kata sandi
              </span>
              <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${manualOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Masuk ke akun Anda</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Gunakan username dan kata sandi yang diberikan Super Admin.
              </p>
            </>
          )}

          {manualOpen && (
            <>
              {demoPassword && (
                <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                  <div className="text-sm font-medium text-blue-800 dark:text-blue-200">Kata sandi semua akun contoh</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="flex-1 select-all rounded-lg bg-white/70 dark:bg-slate-900/60 px-2.5 py-2 font-mono text-base text-slate-800 dark:text-slate-100 break-all">
                      {demoPassword}
                    </code>
                    <button
                      type="button"
                      onClick={copyPassword}
                      aria-label="Salin kata sandi"
                      className="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg text-blue-700 dark:text-blue-300 hover:bg-blue-500/15 transition-colors"
                    >
                      {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                    </button>
                  </div>
                  {quickAccounts.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {quickAccounts.map((a) => (
                        <button
                          key={a.username}
                          type="button"
                          onClick={() => fillAccount(a.username)}
                          disabled={submitting}
                          title={a.label}
                          className="rounded-lg bg-white/60 dark:bg-slate-900/50 px-2.5 py-1.5 font-mono text-sm text-slate-700 dark:text-slate-200 hover:bg-blue-500/15 transition-colors disabled:opacity-50"
                        >
                          {a.username}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
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
                    required
                    placeholder="mis. superadmin"
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
                      placeholder="••••"
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
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[13px] text-slate-400 dark:text-slate-500">
          Lupa kata sandi? Hubungi Super Admin untuk menyetel ulang.
        </p>
      </div>
    </div>
  )
}
