'use client'

import { useState } from 'react'
import { Button, Icon, LogoMark } from '@/components/mk'
import { Input } from '@/components/mk/forms'
import { Label } from '@/components/mk/forms'

/**
 * Formulir wajib ganti kata sandi (F1-C). Memakai /api/profile/password yang
 * sama dengan panel Pengaturan; setelah berhasil server menghapus tanda
 * mustChangePassword dan memasang cookie sesi baru, lalu aplikasi dimuat ulang.
 */
export function ForcedPasswordForm({ name, minLength }: { name: string; minLength: number }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = next.length > 0 && next.length < minLength
  const mismatch = confirm.length > 0 && next !== confirm
  const ready = current.length > 0 && next.length >= minLength && next === confirm && !busy

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Kata sandi belum berubah. Coba lagi.')
        setBusy(false)
        return
      }
      // Muat penuh supaya komponen server membaca sesi yang baru.
      window.location.replace('/')
    } catch {
      setError('Server tidak terjangkau. Periksa koneksi Anda lalu coba lagi.')
      setBusy(false)
    }
  }

  async function signOut() {
    setLeaving(true)
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    window.location.replace('/login')
  }

  const type = show ? 'text' : 'password'

  return (
    <main className="mk-login">
      <div className="mk-login__inner animate-fade-in">
        <div className="mk-login__brand">
          <LogoMark size={64} label="Monitor Karya" />
          <h1 className="t-title-1 mt-5">Ganti kata sandi</h1>
          <p className="t-body-lg text-ink-2 mt-1">Halo {name}, buat kata sandi Anda sendiri sebelum mulai.</p>
        </div>

        <section className="mk-card mk-login__card" aria-labelledby="judul-ganti-sandi">
          <h2 id="judul-ganti-sandi" className="t-title-3">
            Kata sandi dari admin perlu diganti
          </h2>
          <p className="t-footnote text-ink-2 mt-1">
            Kata sandi ini dibuat atau disetel ulang oleh admin. Ganti dengan kata sandi baru minimal {minLength} karakter
            yang hanya Anda ketahui.
          </p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fp-current" className="t-callout text-ink">
                Kata sandi saat ini
              </Label>
              <div className="relative">
                <Input
                  id="fp-current"
                  type={type}
                  autoComplete="current-password"
                  autoFocus
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  disabled={busy}
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 size-11 grid place-items-center rounded-sm text-ink-2 hover:text-ink hover:bg-fill-2"
                  aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  aria-pressed={show}
                >
                  <Icon name={show ? 'sembunyi' : 'lihat'} size={18} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fp-new" className="t-callout text-ink">
                Kata sandi baru
              </Label>
              <Input
                id="fp-new"
                type={type}
                autoComplete="new-password"
                required
                minLength={minLength}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                disabled={busy}
                aria-invalid={tooShort || undefined}
                aria-describedby="fp-new-hint"
              />
              <p id="fp-new-hint" className={tooShort ? 't-footnote text-bahaya' : 't-footnote text-ink-2'}>
                Minimal {minLength} karakter.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fp-confirm" className="t-callout text-ink">
                Ulangi kata sandi baru
              </Label>
              <Input
                id="fp-confirm"
                type={type}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
                aria-invalid={mismatch || undefined}
                aria-describedby={mismatch ? 'fp-confirm-err' : undefined}
              />
              {mismatch ? (
                <p id="fp-confirm-err" className="t-footnote text-bahaya">
                  Ulangan kata sandi belum sama.
                </p>
              ) : null}
            </div>

            {error ? (
              <div className="mk-note-box mk-soft--late" role="alert">
                {error}
              </div>
            ) : null}

            <Button type="submit" variant="primary" size="lg" full disabled={!ready} className="mt-2">
              {busy ? 'Menyimpan…' : 'Simpan kata sandi'}
            </Button>
          </form>
        </section>

        <div className="flex justify-center mt-6">
          <Button type="button" variant="plain" onClick={signOut} disabled={leaving || busy}>
            {leaving ? 'Keluar…' : 'Keluar dari akun'}
          </Button>
        </div>
      </div>
    </main>
  )
}
