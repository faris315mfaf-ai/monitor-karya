'use client'

/**
 * [BERALIH] Modul pengujian Super Admin — berpindah ke akun lain untuk mencoba
 * seluruh fitur per peran (keputusan pemilik 10 Okt 2026).
 * Hanya terpasang untuk SUPERADMIN di sidebar.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Avatar, Button, Card, Chip, EmptyNote, ErrorNote, SegmentedControl, Skeleton, StatusBadge,
  Sheet,
} from '@/components/mk'
import { ROLE_LABELS } from '@/lib/constants'
import { formatNumber } from '@/lib/format'
import { initialsOf } from '@/lib/accounts'
import { useApp } from '@/components/app-provider'

type BeralihData = {
  entities: { id: string; name: string; code: string; type: string }[]
  users: { id: string; name: string; email: string; username: string | null; role: string; entityId: string | null }[]
  peran: string[]
}

export function BeralihView() {
  const { user } = useApp()
  const router = useRouter()
  const [data, setData] = useState<BeralihData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [entitas, setEntitas] = useState<string>('semua')
  const [peran, setPeran] = useState<string>('semua')
  const [sedangBeralih, setSedangBeralih] = useState<string | null>(null)
  const [kembali, setKembali] = useState(false)

  // Muat daftar sekali; saring di klien (Super Admin melihat seluruh grup).
  async function muat() {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/admin/beralih', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Gagal memuat daftar akun.')
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat.')
    } finally { setLoading(false) }
  }
  useEffect(() => { const t = setTimeout(muat, 0); return () => clearTimeout(t) }, [])

  const sedangMeniru = user?.role !== 'SUPERADMIN'

  async function beralih(userId: string) {
    setSedangBeralih(userId)
    try {
      const r = await fetch('/api/admin/beralih', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Gagal beralih.')
      toast.success(`Anda sekarang ${j.user.name} (${ROLE_LABELS[j.user.role] ?? j.user.role}).`)
      router.push('/')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal beralih.')
      setSedangBeralih(null)
    }
  }

  async function pulihkan() {
    setKembali(true)
    try {
      const r = await fetch('/api/admin/beralih', { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Gagal kembali.')
      toast.success(`Anda kembali sebagai ${j.user.name}.`)
      router.push('/')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal kembali.')
      setKembali(false)
    }
  }

  const entitasTerfilter = useMemo(() => data?.entities.filter(e => e.type === 'PT') ?? [], [data])
  const penggunaTerfilter = useMemo(() => {
    if (!data) return []
    return data.users.filter(u =>
      (entitas === 'semua' || u.entityId === entitas) &&
      (peran === 'semua' || u.role === peran),
    )
  }, [data, entitas, peran])

  const namaEntitas = (id: string | null) => data?.entities.find(e => e.id === id)?.name ?? 'Holding'

  return (
    <>
      <p className="t-title-3 text-ink">Beralih akun untuk pengujian</p>
      <p className="t-footnote text-ink-2">
        Pilih akun untuk mencoba fitur dari peran mereka. Sesi Super Admin tetap tersimpan.
      </p>

      {sedangMeniru ? (
        <Card title="Anda sedang tidak sebagai Super Admin">
          <p className="t-body text-ink-2">
            Anda sedang mencoba sebagai <strong>{user?.name}</strong> ({ROLE_LABELS[user?.role ?? ''] ?? user?.role}).
            Klik untuk kembali ke akun Super Admin Anda.
          </p>
          <div className="mt-3">
            <Button variant="primary" icon="kembali" disabled={kembali} onClick={pulihkan}>
              {kembali ? 'Memulihkan…' : 'Kembali ke Super Admin'}
            </Button>
          </div>
        </Card>
      ) : null}

      {loading ? (
        <Card><Skeleton h={200} /></Card>
      ) : error ? (
        <Card><ErrorNote message={error} onRetry={muat} /></Card>
      ) : !data ? null : (
        <>
          <Card title="Saring akun" subtitle="Pilih perusahaan dan peran untuk mempersempit daftar">
            <div className="flex flex-col gap-3">
              <div className="mk-chips" role="group" aria-label="Saring perusahaan">
                <Chip selected={entitas === 'semua'} onClick={() => setEntitas('semua')}>Semua</Chip>
                {entitasTerfilter.map(e => (
                  <Chip key={e.id} selected={entitas === e.id} onClick={() => setEntitas(e.id)}>
                    {e.name}
                  </Chip>
                ))}
              </div>
              <div className="mk-chips" role="group" aria-label="Saring peran">
                <Chip selected={peran === 'semua'} onClick={() => setPeran('semua')}>Semua peran</Chip>
                {data.peran.map(p => (
                  <Chip key={p} selected={peran === p} onClick={() => setPeran(p)}>
                    {ROLE_LABELS[p] ?? p}
                  </Chip>
                ))}
              </div>
            </div>
          </Card>

          <Card
            title="Pilih akun"
            subtitle={`${formatNumber(penggunaTerfilter.length)} akun aktif · ketuk untuk beralih`}
          >
            {penggunaTerfilter.length === 0 ? (
              <EmptyNote icon="tim">Tidak ada akun yang cocok dengan saringan ini.</EmptyNote>
            ) : (
              <div className="mk-list">
                {penggunaTerfilter.map(u => (
                  <button key={u.id} type="button" className="mk-userrow" disabled={sedangBeralih !== null} onClick={() => beralih(u.id)}>
                    <Avatar initials={initialsOf(u.name)} size={36} name={u.name} />
                    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <span className="t-body-strong truncate">{u.name}</span>
                      <span className="mk-userrow__meta">
                        {ROLE_LABELS[u.role] ?? u.role} · {namaEntitas(u.entityId)}
                      </span>
                      <span className="mk-userrow__meta truncate">{u.username ?? u.email}</span>
                    </span>
                    <span className="mk-userrow__status">
                      {sedangBeralih === u.id ? <span className="t-footnote text-ink-2">Memindahkan…</span> : <StatusBadge status="on" size="sm">Beralih</StatusBadge>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  )
}
