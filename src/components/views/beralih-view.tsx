'use client'

/**
 * [BERALIH] Modul pratinjau peran Super Admin (10 Okt 2026).
 * Murni klien: sesi tetap Super Admin, hanya UI/UX yang berganti peran.
 * Tidak ada pergantian cookie/login — aman untuk inspeksi desain.
 */

import { useEffect, useState } from 'react'
import {
  Avatar, Button, Card, Chip, EmptyNote, ErrorNote, Skeleton, StatusBadge,
} from '@/components/mk'
import { ROLE_LABELS } from '@/lib/constants'
import { formatNumber } from '@/lib/format'
import { initialsOf } from '@/lib/accounts'
import { useApp } from '@/components/app-provider'

type BeralihData = {
  entities: { id: string; name: string; code: string; type: string }[]
  users: { id: string; name: string; email: string; username: string | null; role: string; entityId: string | null }[]
}

export function BeralihView() {
  const { user, viewAsRole, setViewAsRole } = useApp()
  const [data, setData] = useState<BeralihData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [entitas, setEntitas] = useState<string>('semua')
  const [peran, setPeran] = useState<string>('semua')

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true); setError(null)
      try {
        const r = await fetch('/api/admin/beralih', { cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Gagal memuat daftar akun.')
        setData(j)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat.')
      } finally { setLoading(false) }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const entitasPt = data?.entities.filter(e => e.type === 'PT') ?? []
  const daftar = data?.users.filter(u =>
    (entitas === 'semua' || u.entityId === entitas) &&
    (peran === 'semua' || u.role === peran),
  ) ?? []
  const namaEntitas = (id: string | null) => data?.entities.find(e => e.id === id)?.name ?? 'Holding'

  return (
    <>
      <p className="t-title-3 text-ink">Pratinjau peran</p>
      <p className="t-footnote text-ink-2">
        Lihat tampilan aplikasi dari sudut pandang tiap peran tanpa keluar dari sesi Super Admin Anda.
      </p>

      {viewAsRole ? (
        <Card title="Sedang mempratinjau">
          <p className="t-body text-ink-2">
            Anda melihat UI/UX sebagai <strong>{ROLE_LABELS[viewAsRole] ?? viewAsRole}</strong>.
            Data tetap milik Super Admin (cakupan seluruh grup) — fokus pada tata letak, tab, dan komponen.
          </p>
          <div className="mt-3">
            <Button variant="primary" onClick={() => setViewAsRole(null)}>
              Kembali ke tampilan Super Admin
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title="Pilih peran untuk dipratinjau" subtitle="UI berganti seketika — tanpa keluar dari sesi">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Peran pratinjau">
          {['PIC_PROYEK', 'KEPALA_DIVISI', 'ADMIN_PT', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'MANAJEMEN', 'TI', 'AUDITOR'].map(r => (
            <Chip key={r} selected={viewAsRole === r} onClick={() => setViewAsRole(r)}>
              {ROLE_LABELS[r] ?? r}
            </Chip>
          ))}
        </div>
      </Card>

      {loading ? (
        <Card><Skeleton h={120} /></Card>
      ) : error ? (
        <Card><ErrorNote message={error} /></Card>
      ) : data ? (
        <Card title="Daftar akun per peran" subtitle="Ketuk akun untuk mempratinjau perannya">
          <div className="flex flex-col gap-2 mb-3">
            <div className="mk-chips" role="group" aria-label="Saring perusahaan">
              <Chip selected={entitas === 'semua'} onClick={() => setEntitas('semua')}>Semua</Chip>
              {entitasPt.map(e => (
                <Chip key={e.id} selected={entitas === e.id} onClick={() => setEntitas(e.id)}>{e.name}</Chip>
              ))}
            </div>
            <div className="mk-chips" role="group" aria-label="Saring peran">
              <Chip selected={peran === 'semua'} onClick={() => setPeran('semua')}>Semua peran</Chip>
              {['PIC_PROYEK', 'KEPALA_DIVISI', 'ADMIN_PT', 'DIREKTUR_ENTITAS', 'MANAJEMEN'].map(p => (
                <Chip key={p} selected={peran === p} onClick={() => setPeran(p)}>{ROLE_LABELS[p] ?? p}</Chip>
              ))}
            </div>
          </div>
          {daftar.length === 0 ? (
            <EmptyNote icon="tim">Tidak ada akun yang cocok.</EmptyNote>
          ) : (
            <div className="mk-list">
              {daftar.map(u => (
                <button key={u.id} type="button" className="mk-userrow" onClick={() => setViewAsRole(u.role)}>
                  <Avatar initials={initialsOf(u.name)} size={36} name={u.name} />
                  <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <span className="t-body-strong truncate">{u.name}</span>
                    <span className="mk-userrow__meta">
                      {ROLE_LABELS[u.role] ?? u.role} · {namaEntitas(u.entityId)}
                    </span>
                  </span>
                  <span className="mk-userrow__status">
                    <StatusBadge status={viewAsRole === u.role ? 'on' : 'neutral'} size="sm">
                      {viewAsRole === u.role ? 'Dipratinjau' : 'Pratinjau'}
                    </StatusBadge>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </>
  )
}
