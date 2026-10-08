'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, LogoMark, StatusBadge } from '@/components/mk'
import { Input, Label } from '@/components/mk/forms'

export function ActivationForm({ minLength, maxLength }: { minLength: number; maxLength: number }) {
  const token = useRef('')
  const attempt = useRef(0)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    function captureFragment() {
      // Empty on Strict Mode's second setup after replaceState: retain the
      // token already captured in memory. New nonempty fragments replace it.
      if (!window.location.hash) { setReady(Boolean(token.current)); return }
      const value = new URLSearchParams(window.location.hash.slice(1)).get('token')
      token.current = value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : ''
      attempt.current += 1
      setPassword('')
      setConfirm('')
      setUsername(null)
      setError(null)
      setBusy(false)
      setReady(Boolean(token.current))
      // Fragment never reaches HTTP logs/referrers; remove browser history too.
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
    captureFragment()
    window.addEventListener('hashchange', captureFragment)
    return () => window.removeEventListener('hashchange', captureFragment)
  }, [])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || busy) return
    if (password !== confirm) { setError('Ulangan kata sandi belum sama.'); return }
    const currentAttempt = ++attempt.current
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/activate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', referrerPolicy: 'no-referrer',
        body: JSON.stringify({ token: token.current, password }),
      })
      const result = await response.json().catch(() => ({}))
      if (attempt.current !== currentAttempt) return
      if (!response.ok) {
        setError(result.error ?? 'Aktivasi belum selesai. Coba lagi.')
        return
      }
      token.current = ''
      setPassword('')
      setConfirm('')
      setUsername(result.username)
    } catch { if (attempt.current === currentAttempt) setError('Server tidak terjangkau. Periksa koneksi Anda lalu coba lagi.') }
    finally { if (attempt.current === currentAttempt) setBusy(false) }
  }

  return (
    <main className="mk-login">
      <div className="mk-login__inner animate-fade-in">
        <div className="mk-login__brand">
          <LogoMark size={64} label="Monitor Karya" />
          <h1 className="t-title-1 mt-5">Aktivasi akun</h1>
          <p className="t-body-lg text-ink-2 mt-1">Buat kata sandi Anda untuk mulai menggunakan Monitor Karya.</p>
        </div>
        <section className="mk-card mk-login__card" aria-label="Aktivasi akun">
          {username ? (
            <div className="flex flex-col gap-4" role="status">
              <StatusBadge status="done">Akun siap digunakan</StatusBadge>
              <p className="t-body">Masuk dengan username <strong>{username}</strong> dan kata sandi yang baru Anda buat.</p>
              <Link href="/login" className="mk-btn mk-btn--primary">Buka halaman masuk</Link>
            </div>
          ) : !ready ? (
            <p className="t-body text-ink-2" role="status">Buka tautan aktivasi lengkap dari pengelola akun. Jika tautan hilang, minta pengelola menerbitkan tautan baru.</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <p className="t-footnote text-ink-2">Tautan berlaku 24 jam dan hanya dapat dipakai sekali.</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activation-password">Kata sandi baru</Label>
                <Input id="activation-password" type="password" autoComplete="new-password" required
                  minLength={minLength} maxLength={maxLength} value={password} onChange={(e) => setPassword(e.target.value)}
                  disabled={busy} aria-describedby="activation-password-hint" />
                <p id="activation-password-hint" className="t-footnote text-ink-2">Minimal {minLength} karakter.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activation-confirm">Ulangi kata sandi baru</Label>
                <Input id="activation-confirm" type="password" autoComplete="new-password" required
                  maxLength={maxLength} value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy}
                  aria-invalid={confirm.length > 0 && password !== confirm || undefined} />
              </div>
              {error && <div className="mk-note-box mk-soft--late" role="alert">{error}</div>}
              <Button type="submit" variant="primary" size="lg" full disabled={busy || password.length < minLength || password !== confirm}>
                {busy ? 'Mengaktifkan…' : 'Aktifkan akun'}
              </Button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
