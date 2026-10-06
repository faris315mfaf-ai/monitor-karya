'use client'

/**
 * [F2-DIREKTUR] Persetujuan materi, anggaran, dan cuti.
 *
 * Sisi pemutus (Direktur entitas, Manajemen, Direksi holding, Super Admin, TI):
 *  - `useApprovalDecisions` + `ApprovalRequestItems` = baris ApprovalItem
 *    Setujui/Tolak di antrean keputusan (01-manajemen.md baris 4, 02-direktur.md
 *    butir 7); Setujui memberi toast "Urungkan" (15 menit).
 *  - `RejectApprovalSheet` = alasan penolakan wajib untuk pengaju.
 *
 * Sisi pengaju (kepala divisi, PIC):
 *  - `ApprovalRequestsCard` = "Permintaan persetujuan": daftar milik sendiri +
 *    "Ajukan persetujuan" (Sheet formulir, lampiran berkas ke Supabase Storage).
 */

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ApprovalItem, Button, Card, EmptyNote, ErrorNote, SegmentedControl, Sheet, Skeleton, StatusBadge, type Status,
} from '@/components/mk'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useResource } from '@/hooks/use-resource'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import { formatDateShort, formatRelative, initials } from '@/lib/format'
import {
  APPROVAL_LIMITS, APPROVAL_STATUS_LABELS, APPROVAL_TYPE_LABELS, formatAmountShort, type ApprovalType,
} from '@/lib/oversight-shared'
import type { ApprovalRequestLite } from './types'

type Decision = 'approved' | 'rejected'

async function call(method: string, body: unknown, url = '/api/approval-requests') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Belum tersimpan. Coba lagi.')
  return j
}

/** "12–14 Okt" untuk cuti; nominal untuk anggaran/materi. */
export function approvalMeta(a: ApprovalRequestLite): string {
  if (a.type === 'CUTI' && a.startDate) {
    return a.endDate && a.endDate !== a.startDate ? `${formatDateShort(a.startDate)}–${formatDateShort(a.endDate)}` : formatDateShort(a.startDate)
  }
  if (a.amount !== null) return formatAmountShort(a.amount)
  return a.divisionName ? `Divisi ${a.divisionName}` : a.entityCode
}

export function approvalTitle(a: ApprovalRequestLite): string {
  return a.type === 'CUTI' ? `${a.title}` : `${APPROVAL_TYPE_LABELS[a.type]}: ${a.title}`
}

/** Buka berkas pendukung lewat tautan bertanda tangan (jendela dibuka dulu agar tidak diblokir). */
export async function openApprovalFile(id: string) {
  const win = window.open('about:blank', '_blank')
  try {
    const res = await fetch(`/api/approval-requests/berkas?id=${encodeURIComponent(id)}`)
    const j = await res.json().catch(() => ({}))
    if (!res.ok || typeof j.url !== 'string') throw new Error(typeof j.error === 'string' ? j.error : 'Berkas belum bisa dibuka.')
    if (win) win.location.href = j.url
    else window.location.assign(j.url)
  } catch (e) {
    win?.close()
    toast.error(e instanceof Error ? e.message : 'Berkas belum bisa dibuka.')
  }
}

/** Keputusan dipegang pemanggil supaya KPI & badge ikut berkurang seketika. */
export function useApprovalDecisions(onDecided?: () => void) {
  const [decided, setDecided] = useState<Record<string, Decision>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<ApprovalRequestLite | null>(null)

  function undo(a: ApprovalRequestLite) {
    call('PATCH', { id: a.id, action: 'undo' })
      .then(() => {
        setDecided((d) => {
          const n = { ...d }
          delete n[a.id]
          return n
        })
        refreshNavBadges()
        toast('Keputusan diurungkan. Permintaan kembali menunggu.')
      })
      .catch((e: Error) => toast.error(e.message))
  }

  async function run(a: ApprovalRequestLite, action: 'approve' | 'reject', note?: string) {
    setBusy(a.id)
    try {
      await call('PATCH', { id: a.id, action, note })
      setDecided((d) => ({ ...d, [a.id]: action === 'approve' ? 'approved' : 'rejected' }))
      setRejecting(null)
      refreshNavBadges()
      toast.success(
        action === 'approve'
          ? a.type === 'CUTI'
            ? `Cuti ${a.requester} disetujui dan dicatat di kehadiran.`
            : `${APPROVAL_TYPE_LABELS[a.type]} "${a.title}" disetujui.`
          : `Permintaan ${a.requester} ditolak. Alasannya terkirim.`,
        { action: { label: 'Urungkan', onClick: () => undo(a) }, duration: 8000 }
      )
      onDecided?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Keputusan belum tersimpan. Coba lagi.')
    } finally {
      setBusy(null)
    }
  }

  return {
    decided,
    busy,
    rejecting,
    approve: (a: ApprovalRequestLite) => run(a, 'approve'),
    askReject: (a: ApprovalRequestLite) => setRejecting(a),
    reject: (a: ApprovalRequestLite, note: string) => run(a, 'reject', note),
    cancelReject: () => setRejecting(null),
  }
}

export type ApprovalDecisions = ReturnType<typeof useApprovalDecisions>

export function ApprovalRequestItems({
  items,
  ctl,
  size = 'sm',
  canDecide = true,
}: {
  items: ApprovalRequestLite[]
  ctl: ApprovalDecisions
  size?: 'sm' | 'md'
  canDecide?: boolean
}) {
  if (!canDecide) {
    // Peran pantau: tanpa tombol keputusan.
    return (
      <>
        {items.map((a) => (
          <div key={a.id} className="mk-listrow">
            <div className="min-w-0 flex-1">
              <div className="t-body-strong truncate">{approvalTitle(a)}</div>
              <div className="t-footnote text-ink-2 truncate">
                {a.requester} · {formatRelative(a.createdAt)} · {approvalMeta(a)}
              </div>
            </div>
            <StatusBadge status="neutral" size="sm">
              Menunggu keputusan
            </StatusBadge>
          </div>
        ))}
      </>
    )
  }
  return (
    <>
      {items.map((a) => (
        <ApprovalItem
          approveVariant="secondary"
          key={a.id}
          size={size}
          title={approvalTitle(a)}
          requester={a.requester}
          initials={initials(a.requester)}
          time={formatRelative(a.createdAt)}
          amount={approvalMeta(a)}
          state={ctl.decided[a.id] ?? 'pending'}
          busy={ctl.busy === a.id}
          onApprove={() => ctl.approve(a)}
          onReject={() => ctl.askReject(a)}
        />
      ))}
    </>
  )
}

/** Rincian permintaan (deskripsi, proyek, berkas) — dipakai Sheet tolak & halaman Persetujuan. */
export function ApprovalDetail({ a }: { a: ApprovalRequestLite }) {
  return (
    <div className="mk-inset flex flex-col gap-2 t-body text-ink">
      <div className="t-footnote text-ink-2">
        {APPROVAL_TYPE_LABELS[a.type]} · {[a.divisionName ? `Divisi ${a.divisionName}` : null, a.projectName, a.entityName].filter(Boolean).join(' · ')}
      </div>
      {a.amount !== null ? <div className="t-headline tabular-nums">Rp {a.amount.toLocaleString('id-ID')}</div> : null}
      {a.type === 'CUTI' && a.startDate ? <div className="t-body-strong">{approvalMeta(a)}</div> : null}
      {a.description ? <p className="whitespace-pre-wrap">{a.description}</p> : null}
      {a.file ? (
        <div>
          <Button size="sm" variant="secondary" icon="dokumen" onClick={() => openApprovalFile(a.id)}>
            Buka {a.file.name}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Sheet alasan penolakan; dipasang sekali per layar. */
export function RejectApprovalSheet({ ctl }: { ctl: ApprovalDecisions }) {
  const a = ctl.rejecting
  const [last, setLast] = useState<ApprovalRequestLite | null>(a)
  const [note, setNote] = useState('')
  if (a && a !== last) {
    setLast(a)
    setNote('')
  }
  const cur = a ?? last
  const valid = note.trim().length >= 5
  return (
    <Sheet
      open={!!a}
      onOpenChange={(o) => !o && ctl.cancelReject()}
      title="Tolak permintaan"
      subtitle={cur ? `${cur.title} · ${cur.requester}` : undefined}
      backLabel="Kembali"
      footer={
        <>
          <Button variant="secondary" onClick={ctl.cancelReject}>
            Batal
          </Button>
          <Button variant="destructive" disabled={!valid || !cur || ctl.busy === cur.id} onClick={() => cur && ctl.reject(cur, note.trim())}>
            Tolak permintaan
          </Button>
        </>
      }
    >
      {cur && (
        <>
          <ApprovalDetail a={cur} />
          <div className="mk-field">
            <label htmlFor="mk-appr-reject" className="mk-field__label">
              Alasan penolakan untuk {cur.requester.split(/\s+/)[0]}
            </label>
            <Textarea
              id="mk-appr-reject"
              rows={4}
              value={note}
              maxLength={APPROVAL_LIMITS.note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mis. Anggaran kuartal ini sudah terpakai 92%. Ajukan lagi Januari."
            />
            <p className="mk-field__hint">Minimal 5 huruf. Pengaju menerima alasan ini di lonceng notifikasinya.</p>
          </div>
        </>
      )}
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Sisi pengaju                                                         */
/* ------------------------------------------------------------------ */

type MineData = {
  canRequest: boolean
  undoMinutes: number
  options: { divisions: { id: string; name: string; entityName: string }[]; projects: { id: string; name: string; code: string }[] }
  items: ApprovalRequestLite[]
  pendingMigration?: boolean
}

const STATUS_BADGE: Record<ApprovalRequestLite['status'], Status> = {
  DIAJUKAN: 'neutral',
  DISETUJUI: 'done',
  DITOLAK: 'late',
  DITARIK: 'neutral',
}

/**
 * "Permintaan persetujuan" untuk kepala divisi & PIC: ajukan materi/anggaran/cuti
 * dan pantau keputusannya. `divisionId` = divisi yang sedang dipilih di meja kerja.
 */
export function ApprovalRequestsCard({ className, divisionId }: { className?: string; divisionId?: string | null }) {
  const { data, loading, error, reload } = useResource<MineData>('/api/approval-requests?mine=1')
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  if (data && !data.canRequest) return null
  const items = data?.items ?? []
  const open = items.filter((i) => i.status === 'DIAJUKAN')
  const recent = items.slice(0, 5)

  async function withdraw(a: ApprovalRequestLite) {
    setBusy(a.id)
    try {
      await call('PATCH', { id: a.id, action: 'withdraw' })
      reload()
      toast.success('Permintaan ditarik.', {
        action: {
          label: 'Urungkan',
          onClick: () => {
            call('PATCH', { id: a.id, action: 'reopen' })
              .then(() => reload())
              .catch((e: Error) => toast.error(e.message))
          },
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belum tersimpan. Coba lagi.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`flex ${className ?? ''}`}>
      <Card
        className="flex-1"
        title="Permintaan persetujuan"
        subtitle={open.length ? `${open.length} menunggu keputusan direktur` : 'Materi, anggaran, dan cuti'}
        action={
          <Button size="sm" variant="secondary" icon="tambah" disabled={!data || data.pendingMigration} onClick={() => setFormOpen(true)}>
            Ajukan persetujuan
          </Button>
        }
      >
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <Skeleton h={44} />
            <Skeleton h={44} />
          </div>
        ) : error ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : data?.pendingMigration ? (
          <EmptyNote icon="kunci">Fitur persetujuan menunggu pembaruan basis data. Hubungi Tim TI.</EmptyNote>
        ) : recent.length === 0 ? (
          <EmptyNote icon="persetujuan">Belum ada permintaan. Ajukan materi, anggaran, atau cuti untuk diputuskan direktur.</EmptyNote>
        ) : (
          <div className="mk-list">
            {recent.map((a) => (
              <div key={a.id} className="mk-listrow flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="t-body-strong">{approvalTitle(a)}</span>
                    <StatusBadge status={STATUS_BADGE[a.status]} size="sm">
                      {APPROVAL_STATUS_LABELS[a.status]}
                    </StatusBadge>
                  </div>
                  <div className="t-footnote text-ink-2">
                    {approvalMeta(a)} · {formatRelative(a.createdAt)}
                    {a.decidedBy ? ` · ${a.decidedBy}` : ''}
                  </div>
                  {a.decisionNote ? <div className="t-footnote text-ink mt-1">{a.decisionNote}</div> : null}
                </div>
                {a.status === 'DIAJUKAN' ? (
                  <Button size="sm" variant="plain" disabled={busy === a.id} onClick={() => withdraw(a)}>
                    Tarik permintaan
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
      {data ? (
        <ApprovalRequestSheet
          open={formOpen}
          onClose={() => setFormOpen(false)}
          options={data.options}
          divisionId={divisionId ?? null}
          onCreated={() => {
            setFormOpen(false)
            reload()
          }}
        />
      ) : null}
    </div>
  )
}

const TYPE_OPTIONS: { value: ApprovalType; label: string }[] = [
  { value: 'MATERI', label: 'Materi' },
  { value: 'ANGGARAN', label: 'Anggaran' },
  { value: 'CUTI', label: 'Cuti' },
]

function fileSizeLabel(n: number) {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
}

function ApprovalRequestSheet({
  open,
  onClose,
  options,
  divisionId,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  options: MineData['options']
  divisionId: string | null
  onCreated: () => void
}) {
  const [type, setType] = useState<ApprovalType>('MATERI')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [start, setStart] = useState(todayKey())
  const [end, setEnd] = useState(todayKey())
  const [projectId, setProjectId] = useState('')
  const [division, setDivision] = useState(divisionId ?? '')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  // Bersihkan formulir setiap kali dibuka.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setType('MATERI')
      setTitle('')
      setDesc('')
      setAmount('')
      setStart(todayKey())
      setEnd(todayKey())
      setProjectId('')
      setDivision(divisionId ?? options.divisions[0]?.id ?? '')
      setFile(null)
      setProblem(null)
    }
  }

  const amountNum = useMemo(() => Number(amount.replace(/[^\d]/g, '')) || 0, [amount])
  const valid =
    (type === 'CUTI' || title.trim().length >= 5) &&
    (type !== 'ANGGARAN' || amountNum > 0) &&
    (type !== 'CUTI' || (start && end && end >= start))

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setProblem(null)
    try {
      const j = (await call('POST', {
        type,
        title: title.trim(),
        description: desc.trim() || undefined,
        amount: type === 'CUTI' || !amountNum ? undefined : amountNum,
        startDate: type === 'CUTI' ? start : undefined,
        endDate: type === 'CUTI' ? end : undefined,
        projectId: projectId || undefined,
        divisionId: division || undefined,
      })) as { item: ApprovalRequestLite }
      if (file) {
        const fd = new FormData()
        fd.set('id', j.item.id)
        fd.set('file', file)
        const up = await fetch('/api/approval-requests/berkas', { method: 'POST', body: fd })
        if (!up.ok) {
          const e = await up.json().catch(() => ({}))
          toast.error(`Permintaan terkirim, tetapi berkas belum terunggah. ${typeof e.error === 'string' ? e.error : ''}`.trim())
        }
      }
      toast.success('Permintaan terkirim ke direktur.')
      onCreated()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Permintaan belum terkirim. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Ajukan persetujuan"
      subtitle="Diputuskan direktur PT Anda"
      backLabel="Kembali"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? 'Mengirim…' : 'Kirim permintaan'}
          </Button>
        </>
      }
    >
      <form
        className="mk-form-grid"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <SegmentedControl full label="Jenis persetujuan" value={type} onChange={(v) => setType(v as ApprovalType)} options={TYPE_OPTIONS} />
        <div className="mk-field">
          <label htmlFor="appr-title" className="mk-field__label">
            {type === 'CUTI' ? 'Keterangan cuti (opsional)' : 'Judul'}
          </label>
          <Input
            id="appr-title"
            value={title}
            maxLength={APPROVAL_LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'MATERI' ? 'Mis. Materi video Kampanye Oktober' : type === 'ANGGARAN' ? 'Mis. Revisi anggaran Renovasi Ruang IT' : 'Mis. Cuti tahunan'}
          />
        </div>
        {type === 'CUTI' ? (
          <div className="mk-form-row mk-form-row--2">
            <div className="mk-field">
              <label htmlFor="appr-start" className="mk-field__label">
                Mulai
              </label>
              <Input id="appr-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="mk-field">
              <label htmlFor="appr-end" className="mk-field__label">
                Selesai
              </label>
              <Input id="appr-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <p className="mk-field__hint">Paling lama {APPROVAL_LIMITS.leaveDays} hari. Setelah disetujui, hari kerja di rentang ini tercatat cuti.</p>
          </div>
        ) : (
          <div className="mk-field">
            <label htmlFor="appr-amount" className="mk-field__label">
              Nominal (Rp){type === 'MATERI' ? ' · opsional' : ''}
            </label>
            <Input
              id="appr-amount"
              inputMode="numeric"
              value={amountNum ? amountNum.toLocaleString('id-ID') : amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 14))}
              placeholder="Mis. 48.500.000"
            />
          </div>
        )}
        <div className="mk-field">
          <label htmlFor="appr-desc" className="mk-field__label">
            Penjelasan
          </label>
          <Textarea
            id="appr-desc"
            rows={4}
            value={desc}
            maxLength={APPROVAL_LIMITS.description}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Apa yang perlu diputuskan, kenapa sekarang, dan dampaknya bila ditunda."
          />
        </div>
        {options.divisions.length > 1 ? (
          <div className="mk-field">
            <label htmlFor="appr-div" className="mk-field__label">
              Divisi
            </label>
            <select id="appr-div" className="mk-select" value={division} onChange={(e) => setDivision(e.target.value)}>
              {options.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.entityName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {type !== 'CUTI' && options.projects.length > 0 ? (
          <div className="mk-field">
            <label htmlFor="appr-project" className="mk-field__label">
              Proyek terkait (opsional)
            </label>
            <select id="appr-project" className="mk-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Tidak terkait proyek</option>
              {options.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="mk-field">
          <span id="appr-file-label" className="mk-field__label">
            Berkas pendukung (opsional)
          </span>
          <input
            ref={fileRef}
            key={wasOpen ? 'open' : 'closed'}
            id="appr-file"
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-labelledby="appr-file-label"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" icon="unggah" aria-describedby="appr-file-label" onClick={() => fileRef.current?.click()}>
              {file ? 'Ganti berkas' : 'Pilih berkas'}
            </Button>
            {file ? (
              <>
                <span className="t-footnote text-ink-2 min-w-0 truncate">
                  {file.name} · {fileSizeLabel(file.size)}
                </span>
                <Button
                  type="button"
                  variant="plain"
                  onClick={() => {
                    setFile(null)
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                >
                  Lepas berkas
                </Button>
              </>
            ) : null}
          </div>
          <p className="mk-field__hint">Gambar, PDF, dokumen Office, atau teks; paling besar 20 MB.</p>
        </div>
        {problem ? (
          <p className="mk-field__error" role="alert">
            {problem}
          </p>
        ) : null}
      </form>
    </Sheet>
  )
}
