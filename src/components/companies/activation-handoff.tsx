'use client'

import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button, StatusBadge } from '@/components/mk'
import { Input, Label } from '@/components/mk/forms'

export type ActivationHandoffData = { userId: string; username: string; path: string; expiresAt: string }

/** Secrets live only in the enclosing sheet's state and are dropped on close. */
export function ActivationHandoff({ value }: { value: ActivationHandoffData }) {
  const id = useId()
  const url = typeof window !== 'undefined' ? `${window.location.origin}${value.path}` : ''
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success('Tautan aktivasi disalin.') }
    catch { toast.error('Browser menolak menyalin. Pilih tautan lalu salin manual.') }
  }
  return (
    <div className="flex flex-col gap-3">
      <StatusBadge status="info">Menunggu aktivasi</StatusBadge>
      <p className="t-body">Sampaikan tautan ini kepada pemilik akun <strong>{value.username}</strong>.</p>
      <p className="t-footnote text-ink-2">Tautan hanya ditampilkan saat ini. Berlaku sekali hingga {new Date(value.expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB. Tautan sebelumnya tidak berlaku lagi.</p>
      <Label htmlFor={id}>Tautan aktivasi</Label>
      <Input id={id} value={url} readOnly autoComplete="off" spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
      <Button type="button" variant="secondary" onClick={copy}>Salin tautan aktivasi</Button>
    </div>
  )
}

/** Metadata fetch exposes no token. Only an explicit POST returns a new handoff. */
export function ActivationPanel({ userId, showUnavailable = false }: { userId: string; showUnavailable?: boolean }) {
  const [available, setAvailable] = useState(false)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [value, setValue] = useState<ActivationHandoffData | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`/api/companies/users/activation?id=${encodeURIComponent(userId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((result) => { if (alive) { setAvailable(result?.canActivate === true); setUnavailable(result?.error ?? null) } })
      .catch(() => { if (alive) setUnavailable('Aktivasi belum termuat. Tutup lalu buka kembali.') })
    return () => { alive = false }
  }, [userId])
  async function issue() {
    setBusy(true)
    setValue(null)
    try {
      const response = await fetch('/api/companies/users/activation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }), cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) { toast.error(result.error ?? 'Tautan belum diterbitkan.'); return }
      setValue(result.activation)
    } catch { toast.error('Server tidak terjangkau. Coba lagi.') }
    finally { setBusy(false) }
  }
  if (!available) return showUnavailable ? <p className="t-body text-ink-2" role="status">{unavailable ?? 'Memuat aktivasi…'}</p> : null
  return (
    <section className="mk-formsec">
      <h3 className="t-title-3">Aktivasi akun</h3>
      {value ? <ActivationHandoff value={value} /> : (
        <>
          <p className="t-footnote text-ink-2">Akun baru sudah disetujui. Terbitkan tautan untuk pemilik akun membuat kata sandinya. Tautan sebelumnya akan berhenti berlaku.</p>
          <Button type="button" variant="secondary" onClick={issue} disabled={busy}>{busy ? 'Menerbitkan…' : 'Terbitkan tautan aktivasi'}</Button>
        </>
      )}
    </section>
  )
}
