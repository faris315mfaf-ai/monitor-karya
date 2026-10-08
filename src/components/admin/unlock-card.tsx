'use client'

/**
 * Kartu "Buka kunci": pengajuan membuka laporan yang sudah terkunci. Admin PT
 * mengajukan; Direksi Holding/TI/Super Admin menyetujui; TI/Super Admin
 * menjalankan (laporan terbuka sampai batas waktu, lalu terkunci lagi).
 * Tombol hanya muncul sesuai izin di src/lib/rbac.ts — server tetap memeriksa.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, EmptyNote, ErrorNote, SegmentedControl, Sheet, Skeleton, StatusBadge, type Status } from '@/components/mk'
import { Textarea } from '@/components/mk/forms'
import { Field, selectCls } from '@/components/companies/parts'
import { formatDateShort, formatRelative, formatTime } from '@/lib/format'
import type { UnlockItem } from '@/lib/admin-meta'
import { send, useFetch } from './use-fetch'

type UnlockList = {
  items: UnlockItem[]
  total: number
  can: { request: boolean; approve: boolean; execute: boolean }
  me: string
}

function statusOf(u: UnlockItem): { status: Status; text: string } {
  if (u.status === 'DIAJUKAN') return { status: 'info', text: 'Diajukan' }
  if (u.status === 'DITOLAK') return { status: 'late', text: 'Ditolak' }
  if (u.status === 'DISETUJUI') return { status: 'risk', text: 'Disetujui, menunggu dibuka' }
  if (u.reLockedAt || (u.unlockUntil && new Date(u.unlockUntil) <= new Date())) return { status: 'done', text: 'Terkunci lagi' }
  return { status: 'on', text: `Terbuka s.d. ${formatDateShort(u.unlockUntil)} ${formatTime(u.unlockUntil)}` }
}

export function UnlockCard({ className, limit = 5 }: { className?: string; limit?: number }) {
  const { data, setData, error, loading, reload } = useFetch<UnlockList>('/api/unlock-requests?pageSize=20')
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function act(u: UnlockItem, action: 'approve' | 'reject' | 'execute' | 'relock') {
    setBusy(u.id)
    const r = await send('/api/unlock-requests', 'PATCH', { id: u.id, action })
    setBusy(null)
    if (!r.ok) {
      toast.error(r.error ?? 'Belum tersimpan')
      if (r.status === 409) reload()
      return
    }
    const item = r.json.item as UnlockItem
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === u.id ? { ...x, ...item } : x)) } : d))
    toast.success(
      { approve: 'Buka kunci disetujui.', reject: 'Buka kunci ditolak.', execute: 'Laporan dibuka 24 jam.', relock: 'Laporan dikunci kembali.' }[action] +
        ' Tercatat di log aktivitas.'
    )
  }

  const items = (data?.items ?? []).slice(0, limit)
  const can = data?.can
  const open = (data?.items ?? []).filter((u) => u.status === 'DIAJUKAN' || u.status === 'DISETUJUI').length

  return (
    <Card
      className={className}
      title="Buka kunci"
      subtitle={data ? (open ? `${open} pengajuan sedang diproses` : 'Laporan yang terkunci dibuka lewat pengajuan') : 'Memuat…'}
      action={
        can?.request ? (
          <Button size="sm" variant="secondary" icon="kunci" onClick={() => setCreating(true)}>
            Ajukan buka kunci
          </Button>
        ) : undefined
      }
    >
      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton h={52} />
          <Skeleton h={52} />
        </div>
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyNote icon="kunci">Belum ada pengajuan buka kunci.</EmptyNote>
      ) : (
        <div className="mk-list">
          {items.map((u) => {
            const st = statusOf(u)
            const mine = u.requestedBy?.id === data?.me
            const actions =
              u.status === 'DIAJUKAN' && can?.approve && !mine ? (
                <>
                  <Button size="sm" variant="secondary" disabled={busy === u.id} onClick={() => act(u, 'reject')}>
                    Tolak
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy === u.id} onClick={() => act(u, 'approve')}>
                    Setujui
                  </Button>
                </>
              ) : u.status === 'DISETUJUI' && can?.execute ? (
                <Button size="sm" variant="secondary" icon="kunci" disabled={busy === u.id} onClick={() => act(u, 'execute')}>
                  Buka laporan
                </Button>
              ) : u.status === 'DIEKSEKUSI' && !u.reLockedAt && can?.execute && st.status === 'on' ? (
                <Button size="sm" variant="secondary" disabled={busy === u.id} onClick={() => act(u, 'relock')}>
                  Kunci lagi
                </Button>
              ) : null
            return (
              <div key={u.id} className="mk-listrow flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="t-body-strong truncate">{u.targetLabel}</div>
                  <div className="t-footnote text-ink-2 truncate">
                    {[u.reason, u.requestedBy?.name, formatRelative(u.createdAt)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <StatusBadge status={st.status} size="sm">
                  {st.text}
                </StatusBadge>
                {actions ? <div className="flex gap-2">{actions}</div> : null}
              </div>
            )
          })}
        </div>
      )}
      <UnlockRequestSheet
        open={creating}
        onOpenChange={setCreating}
        onCreated={(item) => setData((d) => (d ? { ...d, items: [item, ...d.items], total: d.total + 1 } : d))}
      />
    </Card>
  )
}

type Candidate = { id: string; label: string }

function UnlockRequestSheet({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (u: UnlockItem) => void }) {
  const [kind, setKind] = useState<'DAILY_REPORT' | 'WEEKLY_REPORT'>('DAILY_REPORT')
  const daily = useFetch<{ items: { id: string; reportDate: string; project: { name: string } }[] }>(open ? '/api/daily-reports?pageSize=40&for=unlock' : null)
  const weekly = useFetch<{ items: { id: string; isoWeek: number; isoYear: number; division: { name: string } }[] }>(
    open && kind === 'WEEKLY_REPORT' ? '/api/weekly-reports?pageSize=30&for=unlock' : null
  )
  const [targetId, setTargetId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const candidates: Candidate[] =
    kind === 'DAILY_REPORT'
      ? (daily.data?.items ?? []).map((r) => ({ id: r.id, label: `${r.project.name} · ${formatDateShort(r.reportDate)}` }))
      : (weekly.data?.items ?? []).map((r) => ({ id: r.id, label: `Divisi ${r.division.name} · M${r.isoWeek} ${r.isoYear}` }))
  const listLoading = kind === 'DAILY_REPORT' ? daily.loading : weekly.loading

  async function submit() {
    setErr(null)
    if (!targetId) return setErr('Pilih laporan yang ingin dibuka.')
    if (reason.trim().length < 10) return setErr('Tulis alasan minimal 10 karakter.')
    setSaving(true)
    const r = await send('/api/unlock-requests', 'POST', { targetType: kind, targetId, reason: reason.trim() })
    setSaving(false)
    if (!r.ok) return setErr(r.error)
    onCreated(r.json.item as UnlockItem)
    toast.success('Buka kunci diajukan. Tercatat di log aktivitas.')
    setTargetId('')
    setReason('')
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ajukan buka kunci"
      subtitle="Direksi holding atau Tim TI memutuskan; laporan dibuka paling lama 24 jam"
      backLabel="Buka kunci"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant="primary" icon="kirim" onClick={submit} disabled={saving}>
            {saving ? 'Mengajukan…' : 'Ajukan buka kunci'}
          </Button>
        </>
      }
    >
      <div className="mk-formsec">
        <SegmentedControl
          label="Jenis laporan"
          value={kind}
          onChange={(v) => {
            setKind(v as typeof kind)
            setTargetId('')
          }}
          options={[
            { value: 'DAILY_REPORT', label: 'Harian' },
            { value: 'WEEKLY_REPORT', label: 'Mingguan' },
          ]}
        />
        <Field label="Laporan" htmlFor="ul-target" required>
          <select id="ul-target" className={selectCls} value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={listLoading}>
            <option value="">{listLoading ? 'Memuat…' : candidates.length ? 'Pilih laporan' : 'Belum ada laporan'}</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Alasan" htmlFor="ul-reason" required error={err}>
          <Textarea id="ul-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Bukti foto tertukar dengan proyek lain" maxLength={500} />
        </Field>
      </div>
    </Sheet>
  )
}
