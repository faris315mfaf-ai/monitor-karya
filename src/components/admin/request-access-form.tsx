'use client'

/**
 * "Ajukan permintaan akses" untuk Kepala divisi dan PIC proyek [F2-ADMIN]
 * (04-admin-pt.md: perubahan peran/akses selalu lewat permintaan yang
 * disetujui Admin PT). Kartu berisi permintaan milik akun ini beserta
 * statusnya, dan satu tombol yang membuka formulir di Sheet.
 *
 * Pilihan akun dan divisi dari /api/access-requests/options — daftar minimal
 * (nama, peran, divisi), tanpa email/telepon. Server membatasi sasaran ke tim
 * pengaju (src/lib/access-requesters.ts).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button, Card, EmptyNote, ErrorNote, Sheet, Skeleton, StatusBadge, cx } from '@/components/mk'
import { Field, selectCls } from '@/components/companies/parts'
import { formatDateShort, formatRelative } from '@/lib/format'
import { ACCESS_REQUEST_LABELS, MAX_TEMP_ACCESS_DAYS, type AccessRequestItem, type AccessRequestList, type AccessRequestType } from '@/lib/admin-meta'
import { send, useFetch } from './use-fetch'

type Options = {
  entity: { id: string; name: string } | null
  divisions: { id: string; name: string }[]
  users: { id: string; name: string; role: string; roleLabel: string; divisionName: string | null; isActive: boolean; isSelf: boolean }[]
  roles: { role: string; label: string }[]
}

const HINTS: Record<AccessRequestType, string> = {
  AKUN_BARU: 'Anggota baru tim yang perlu masuk ke aplikasi',
  PINDAH_PERAN: 'Mengganti peran akun di tim Anda',
  AKSES_SEMENTARA: 'Peran atau akun aktif untuk jangka waktu tertentu',
}

function statusOf(item: AccessRequestItem) {
  if (item.status === 'DIAJUKAN') return { status: 'info' as const, text: 'Menunggu Admin PT' }
  if (item.status === 'DITOLAK') return { status: 'late' as const, text: 'Ditolak' }
  if (item.type === 'AKSES_SEMENTARA' && item.expiresAt) {
    return item.revertedAt ? { status: 'neutral' as const, text: 'Berakhir' } : { status: 'on' as const, text: `Aktif s.d. ${formatDateShort(item.expiresAt)}` }
  }
  return { status: 'done' as const, text: 'Disetujui' }
}

export function RequestAccessCard({ className, limit = 5 }: { className?: string; limit?: number }) {
  const { data, setData, error, loading, reload } = useFetch<AccessRequestList>('/api/access-requests?status=all')
  const [open, setOpen] = useState(false)
  const items = (data?.items ?? []).slice(0, limit)
  const pending = (data?.items ?? []).filter((i) => i.status === 'DIAJUKAN').length

  return (
    <Card
      className={className}
      title="Permintaan akses"
      subtitle={pending ? `${pending} menunggu keputusan Admin PT` : 'Akun baru, pindah peran, atau akses sementara untuk tim Anda'}
      action={
        <Button size="sm" variant="secondary" icon="tambah" onClick={() => setOpen(true)}>
          Ajukan permintaan
        </Button>
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
        <EmptyNote icon="pengguna">Belum ada permintaan. Perubahan peran dan akses tim diajukan di sini lalu diputuskan Admin PT.</EmptyNote>
      ) : (
        <div className="mk-list">
          {items.map((item) => {
            const st = statusOf(item)
            return (
              <div key={item.id} className="mk-listrow">
                <div className="min-w-0 flex-1">
                  <div className="t-body-strong truncate">{item.title}</div>
                  <div className="t-footnote text-ink-2 truncate">
                    {[item.detail, formatRelative(item.createdAt), item.decisionNote ? `Catatan: ${item.decisionNote}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <StatusBadge status={st.status} size="sm">
                  {st.text}
                </StatusBadge>
              </div>
            )
          })}
        </div>
      )}
      <RequestAccessSheet
        open={open}
        onOpenChange={setOpen}
        onCreated={(item) => setData((d) => (d ? { ...d, items: [item, ...d.items], pending: d.pending + 1 } : { items: [item], pending: 1, canDecide: false }))}
      />
    </Card>
  )
}

export function RequestAccessSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (item: AccessRequestItem) => void
}) {
  const opts = useFetch<Options>(open ? '/api/access-requests/options' : null)
  const o = opts.data
  const [type, setType] = useState<AccessRequestType>('AKUN_BARU')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState('PIC_PROYEK')
  const [divisionId, setDivisionId] = useState('')
  const [userId, setUserId] = useState('')
  const [days, setDays] = useState('30')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const divisions = o?.divisions ?? []
  const division = divisionId || (divisions.length === 1 ? divisions[0].id : '')
  const users = (o?.users ?? []).filter((u) => (type === 'PINDAH_PERAN' ? !u.isSelf : true))

  function reset() {
    setName('')
    setEmail('')
    setTitle('')
    setUserId('')
    setReason('')
    setDays('30')
    setErr(null)
  }

  async function submit() {
    setErr(null)
    let payload: Record<string, unknown>
    if (type === 'AKUN_BARU') {
      if (!name.trim()) return setErr('Nama pemilik akun wajib diisi.')
      if (name.trim().length > 120) return setErr('Nama terlalu panjang.')
      payload = { name: name.trim(), role, email: email.trim() || undefined, title: title.trim() || undefined, divisionId: division || undefined }
    } else {
      if (!userId) return setErr('Pilih akun yang dimaksud.')
      if (type === 'PINDAH_PERAN') payload = { userId, role, divisionId: role === 'KEPALA_DIVISI' && division ? division : undefined }
      else {
        const n = parseInt(days, 10)
        if (!Number.isFinite(n) || n < 1 || n > MAX_TEMP_ACCESS_DAYS) return setErr(`Lama akses 1–${MAX_TEMP_ACCESS_DAYS} hari.`)
        payload = { userId, days: n, role: role === '__same__' ? undefined : role }
      }
    }
    if (!reason.trim()) return setErr('Tulis alasannya supaya Admin PT bisa memutuskan.')
    setSaving(true)
    const r = await send('/api/access-requests', 'POST', { type, payload, reason: reason.trim() })
    setSaving(false)
    if (!r.ok) return setErr(r.error)
    onCreated(r.json.item as AccessRequestItem)
    toast.success('Permintaan diajukan ke Admin PT. Tercatat di log aktivitas.')
    reset()
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ajukan permintaan akses"
      subtitle={o?.entity ? `${o.entity.name} · diputuskan Admin PT` : 'Perubahan peran dan akses selalu lewat persetujuan'}
      backLabel="Permintaan akses"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving || !o}>
            {saving ? 'Mengajukan…' : 'Ajukan permintaan'}
          </Button>
        </>
      }
    >
      {opts.error ? (
        <ErrorNote message={opts.error} onRetry={opts.reload} />
      ) : !o ? (
        <div className="flex flex-col gap-3">
          <Skeleton h={64} />
          <Skeleton h={44} />
          <Skeleton h={44} />
        </div>
      ) : (
        <div className="mk-formsec">
          <div className="mk-choices" role="radiogroup" aria-label="Jenis permintaan">
            {(Object.keys(ACCESS_REQUEST_LABELS) as AccessRequestType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                className={cx('mk-choice', type === t && 'is-on')}
                onClick={() => {
                  setType(t)
                  setErr(null)
                  setUserId('')
                  if (t === 'AKSES_SEMENTARA') setRole('__same__')
                  else if (role === '__same__') setRole('PIC_PROYEK')
                }}
              >
                <span className="mk-choice__radio" aria-hidden />
                <span>
                  <span className="mk-choice__title">{ACCESS_REQUEST_LABELS[t]}</span>
                  <span className="mk-choice__hint">{HINTS[t]}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mk-formgrid">
            {type === 'AKUN_BARU' ? (
              <>
                <Field label="Nama lengkap" htmlFor="ra-name" required className="is-full">
                  <Input id="ra-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="mis. Galih Pratama" autoComplete="off" />
                </Field>
                <Field label="Email" htmlFor="ra-email" hint="Kosongkan untuk dibuat otomatis">
                  <Input id="ra-email" type="email" maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
                </Field>
                <Field label="Jabatan" htmlFor="ra-title">
                  <Input id="ra-title" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Staf operasional" />
                </Field>
              </>
            ) : (
              <Field label="Akun" htmlFor="ra-user" required className="is-full" hint={users.length === 0 ? 'Belum ada akun di tim Anda.' : undefined}>
                <select id="ra-user" className={selectCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">Pilih akun</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.isSelf ? ' (Anda)' : ''} · {u.roleLabel}
                      {u.divisionName ? ` · ${u.divisionName}` : ''}
                      {u.isActive ? '' : ' · nonaktif'}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={type === 'AKSES_SEMENTARA' ? 'Peran sementara' : type === 'PINDAH_PERAN' ? 'Peran tujuan' : 'Peran'} htmlFor="ra-role">
              <select id="ra-role" className={selectCls} value={role} onChange={(e) => setRole(e.target.value)}>
                {type === 'AKSES_SEMENTARA' ? <option value="__same__">Tetap peran sekarang, aktifkan akun</option> : null}
                {o.roles.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            {type === 'AKSES_SEMENTARA' ? (
              <Field label="Lama akses (hari)" htmlFor="ra-days" hint={`Dicabut otomatis setelahnya, maks ${MAX_TEMP_ACCESS_DAYS} hari`}>
                <Input id="ra-days" type="number" inputMode="numeric" min={1} max={MAX_TEMP_ACCESS_DAYS} value={days} onChange={(e) => setDays(e.target.value)} />
              </Field>
            ) : (type === 'AKUN_BARU' || role === 'KEPALA_DIVISI') && divisions.length > 0 ? (
              <Field label="Divisi" htmlFor="ra-division">
                <select id="ra-division" className={selectCls} value={division} onChange={(e) => setDivisionId(e.target.value)}>
                  {divisions.length > 1 ? <option value="">Tanpa divisi</option> : null}
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Alasan" htmlFor="ra-reason" required className="is-full" error={err}>
              <Textarea id="ra-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Bergabung di proyek gudang mulai Senin" maxLength={500} />
            </Field>
          </div>
        </div>
      )}
    </Sheet>
  )
}
