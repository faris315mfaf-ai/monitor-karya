'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BrandLogo } from '@/components/brand-logo'
import { Button, Icon, LogoMark } from '@/components/mk'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Masuk dengan username (atau email) dan kata sandi — satu-satunya jalur sejak
 * jalan pintas demo dihapus (10 Sep 2026).
 *
 * `holding` = pemrakarsa sistem (holding / super-holding). Logonya tampil di
 * atas formulir supaya sejak layar masuk sudah jelas siapa inisiatornya.
 */
export function LoginForm({
  dbReachable,
  holding = null,
}: {
  dbReachable: boolean
  holding?: { name: string; logoData: string | null } | null
}) {
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
        setError(data.error || 'Belum bisa masuk. Periksa username dan kata sandi.')
        setSubmitting(false)
        return
      }
      // Navigasi penuh supaya komponen server membaca cookie sesi yang baru.
      // Akun yang wajib ganti kata sandi langsung ke layarnya (src/app/login/ganti-sandi).
      router.replace(data.mustChangePassword ? '/login/ganti-sandi' : '/')
      router.refresh()
    } catch {
      setError('Server tidak terjangkau. Periksa koneksi Anda lalu coba lagi.')
      setSubmitting(false)
    }
  }

  return (
    <main className="mk-login">
      <div className="mk-login__inner animate-fade-in">
        <div className="mk-login__brand">
          {holding ? (
            <BrandLogo name={holding.name} logoData={holding.logoData} size={72} tone="slate" />
          ) : (
            <LogoMark size={64} label="Monitor Karya" />
          )}
          <h1 className="t-title-1 mt-5">{holding ? holding.name : 'Monitor Karya'}</h1>
          <p className="t-body-lg text-ink-2 mt-1">
            {holding ? 'Monitor Karya · pemantauan kerja berbasis output' : 'Pemantauan kerja berbasis output'}
          </p>
        </div>

        {!dbReachable && (
          <div className="mk-note-box mk-soft--risk flex items-start gap-2 mb-4" role="alert">
            <Icon name="peringatan" size={18} strokeWidth={2.2} className="mt-0.5" />
            <span>
              Basis data belum terhubung di server ini, jadi masuk akan gagal. Isi <code>DATABASE_URL</code> lalu
              deploy ulang.
            </span>
          </div>
        )}

        <section className="mk-card mk-login__card" aria-labelledby="judul-masuk">
          <h2 id="judul-masuk" className="t-title-3">
            Masuk ke akun Anda
          </h2>
          <p className="t-footnote text-ink-2 mt-1">Gunakan username dan kata sandi dari Super Admin.</p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="identifier" className="t-callout text-ink">
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
                placeholder="Username atau email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="t-callout text-ink">
                Kata sandi
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Kata sandi"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 size-11 grid place-items-center rounded-sm text-ink-2 hover:text-ink hover:bg-fill-2"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  <Icon name={showPassword ? 'sembunyi' : 'lihat'} size={18} />
                </button>
              </div>
            </div>

            {error && (
              <div className="mk-note-box mk-soft--late" role="alert">
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" full disabled={submitting} className="mt-2">
              {submitting ? 'Memeriksa…' : 'Masuk'}
            </Button>
          </form>
        </section>

        <p className="t-footnote text-ink-2 text-center mt-6">Lupa kata sandi? Minta Super Admin menyetel ulang.</p>
      </div>
    </main>
  )
}
