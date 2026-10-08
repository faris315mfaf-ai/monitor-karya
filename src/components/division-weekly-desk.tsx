'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import {
  Button, Card as MkCard, Chip, EmptyNote, ErrorNote, Icon, ProgressBar, SegmentedControl, Sheet, Skeleton, StatusBadge, cx,
  type IconName, type Status,
} from '@/components/mk'
import { Field, selectCls, useConfirm } from '@/components/companies/parts'
import { WeeklyHeaderBadge, WeeklyItemStatusBadge, PriorityBadge, weeklyItemStatus } from '@/components/status-badges'
import { EvidencePanel, type EvidenceItem } from '@/components/evidence-panel'
import { WeeklyBoard, WEEKLY_LANE, boardSignature, movesFor, wibKey, type BoardMove } from '@/components/weekly-board'
import { WEEKLY_STATUS_META } from '@/lib/constants'
import { formatDate, formatDateLong, formatTime } from '@/lib/format'

export type Ref = { id: string; code: string; name: string }

export type Item = {
  id: string
  workItem: string
  targetOutput: string
  picName: string
  picTitle: string
  status: string
  progressPct: number
  achievementThisWeek: string
  obstacleFollowUp: string | null
  followUp: string | null
  workDate: string | null
  position: number
  evidenceCount: number
  tags: string[]
  subtasks: { id?: string; title: string; isDone: boolean }[]
  escalationRaised?: boolean
  evidence?: EvidenceItem[]
  aspectCategory: Ref
  priority: Ref
}

export type DivisionRow = {
  id: string
  name: string
  type: string
  headName: string | null
  /** Boleh ditulis sekarang (minggu terbuka, atau buka kunci berlaku). Kosong pada data lama. */
  writable?: boolean
  /** Alasan terkunci dalam satu kalimat, bila tidak bisa ditulis. */
  lockReason?: string | null
  /** Sudah diteruskan ke holding dan dibekukan. */
  frozen?: boolean
  /** Buka kunci yang sedang berlaku, sampai kapan. */
  unlockUntil?: string | null
  report: {
    id: string
    statusHeader: string
    submittedAt: string | null
    approvedAt: string | null
    forwardedAt: string | null
    isLocked: boolean
    items: Item[]
  } | null
}

export type Data = {
  week: { key: string; isoYear: number; isoWeek: number; start: string; end: string; handoverBy: string; lockAt: string; current: boolean }
  locked: boolean
  days: string[]
  weeks: { key: string; start: string; end: string; current: boolean }[]
  entities: Ref[]
  entityId: string | null
  entityPinned: boolean
  aspects: Ref[]
  priorities: Ref[]
  canApprove: boolean
  canRemind: boolean
  divisions: DivisionRow[]
}

type Card = Item & { lane: string }

const STATUSES = ['SELESAI', 'ON_PROGRESS', 'BELUM_MULAI', 'TERKENDALA', 'NA']

/** Prioritas → nada tepi kartu (sama dengan PriorityBadge). */
const PRIORITY_EDGE: Record<string, Status> = { TINGGI: 'late', SEDANG: 'risk', RENDAH: 'info' }

/** Catatan sebaris bernada: ikon + kalimat. */
function Note({ tone, icon, children, className }: { tone: Status; icon: IconName; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('mk-wb-note', `is-${tone}`, className)}>
      <Icon name={icon} size={16} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Kerangka memuat seukuran isi asli: kalimat, pilihan, satu papan divisi. */
function DeskSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat capaian mingguan">
      <Skeleton h={28} w="70%" r={10} />
      <div className="mk-card grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton h={14} w={120} />
            <Skeleton h={44} r={10} />
          </div>
        ))}
      </div>
      <div className="mk-card space-y-3">
        <Skeleton h={22} w={220} />
        <Skeleton h={14} w="50%" />
        <div className="mk-wb">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={160} r={14} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Divisi dianggap sudah menyerahkan bila laporannya bukan draf lagi. */
const handedOver = (d: DivisionRow) => Boolean(d.report && d.report.statusHeader !== 'DRAFT')

/**
 * Meja mingguan divisi (8 Sep 2026): pilih entitas & divisi yang dilaporkan
 * dan minggunya, lalu susun capaian per hari di papan seret-lepas. Setiap item
 * memuat status, capaian minggu ini, kendala, tindak lanjut, dan prioritas.
 * Kepala Divisi memakai meja ini untuk divisinya; Admin PT untuk semua divisi
 * entitasnya (dari Modul Divisi); TI untuk PT mana pun.
 */
export function DivisionWeeklyDesk() {
  const [entityId, setEntityId] = useState('')
  const [weekKey, setWeekKey] = useState('')
  const [divisionId, setDivisionId] = useState('ALL')

  const url = useMemo(() => {
    const p = new URLSearchParams()
    if (entityId) p.set('entityId', entityId)
    if (weekKey) p.set('week', weekKey)
    const q = p.toString()
    return `/api/weekly-input${q ? `?${q}` : ''}`
  }, [entityId, weekKey])
  const { data, loading, error, reload } = useResource<Data>(url)

  if (loading && !data) return <DeskSkeleton />
  if (error || !data) return <ErrorNote message={error ?? 'Data capaian mingguan belum termuat.'} onRetry={reload} />

  const shown = divisionId === 'ALL' ? data.divisions : data.divisions.filter((d) => d.id === divisionId)
  // Tenggat mingguan: serah Kamis 17.00 WIB, kunci Jumat 17.00 WIB (src/lib/lock.ts).
  const deadline = (at: string) => `${formatDateLong(at)} pukul ${formatTime(at)} WIB`
  const handoverPassed = Date.now() >= Date.parse(data.week.handoverBy)
  const weekNo = (key: string) => Number(key.split('-W')[1])
  const handed = data.divisions.filter(handedOver).length
  const answer =
    data.divisions.length === 0
      ? 'Belum ada divisi yang bisa dilaporkan.'
      : data.divisions.length === 1
        ? `${data.divisions[0].name} ${handed ? 'sudah' : 'belum'} menyerahkan capaian minggu ${data.week.isoWeek}.`
        : `${handed} dari ${data.divisions.length} divisi sudah menyerahkan capaian minggu ${data.week.isoWeek}.`

  return (
    <div className={cx('space-y-4', loading && 'opacity-60 pointer-events-none transition-opacity')} aria-busy={loading || undefined}>
      <p className="t-title-3 text-ink">{answer}</p>

      {/* Pilihan entitas · divisi · minggu */}
      <MkCard>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Entitas yang dilaporkan" htmlFor="desk-entity">
            <select id="desk-entity" value={data.entityId ?? ''} onChange={(e) => setEntityId(e.target.value)} disabled={data.entityPinned} className={selectCls}>
              {data.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Divisi" htmlFor="desk-division">
            <select id="desk-division" value={divisionId} onChange={(e) => setDivisionId(e.target.value)} className={selectCls}>
              {data.divisions.length !== 1 && <option value="ALL">Semua divisi ({data.divisions.length})</option>}
              {data.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Minggu" htmlFor="desk-week">
            <select id="desk-week" value={data.week.key} onChange={(e) => setWeekKey(e.target.value)} className={selectCls}>
              {data.weeks.map((w) => (
                <option key={w.key} value={w.key}>
                  Minggu {weekNo(w.key)} · {formatDate(w.start)}–{formatDate(w.end)}
                  {w.current ? ' (berjalan)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Note
            className="md:col-span-3"
            tone={!data.week.current ? 'neutral' : data.locked ? 'late' : handoverPassed ? 'risk' : 'info'}
            icon={!data.week.current || data.locked ? 'kunci' : 'kalender'}
          >
            {!data.week.current
              ? `M${data.week.isoWeek} ${data.week.isoYear} sudah lewat, hanya dapat dibaca kecuali dibuka lewat permohonan buka kunci.`
              : data.locked
                ? `Minggu ini dikunci sejak ${deadline(data.week.lockAt)}. Perubahan memerlukan permohonan buka kunci.`
                : handoverPassed
                  ? `Tenggat serah ${deadline(data.week.handoverBy)} sudah lewat. Minggu ini dikunci ${deadline(data.week.lockAt)}.`
                  : `Serahkan paling lambat ${deadline(data.week.handoverBy)}. Minggu ini dikunci ${deadline(data.week.lockAt)}.`}
          </Note>
        </div>
      </MkCard>

      {data.canRemind && data.week.current && (
        <ReminderPanel entityId={data.entityId} weekKey={data.week.key} divisions={data.divisions} />
      )}

      {shown.length === 0 ? (
        <MkCard>
          <EmptyNote icon="tim">Belum ada divisi. Hubungi Admin PT atau Tim TI untuk penugasan divisi.</EmptyNote>
        </MkCard>
      ) : (
        shown.map((d) => <DivisionBoard key={`${d.id}:${data.week.key}`} division={d} data={data} onChanged={reload} />)
      )}
    </div>
  )
}

/** Siapa yang belum menyerahkan minggu ini, dan tombol untuk mengingatkan mereka. */
function ReminderPanel({ entityId, weekKey, divisions }: { entityId: string | null; weekKey: string; divisions: DivisionRow[] }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ sent: number; results: { divisionName: string; outcome: string; head: { name: string } | null }[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const unreported = divisions.filter((d) => !d.report || d.report.statusHeader === 'DRAFT')

  async function send() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/notifications/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, week: weekKey }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Pengingat belum terkirim. Coba lagi.')
      else setResult(json)
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  const OUTCOME: Record<string, string> = {
    TERKIRIM: 'terkirim',
    SUDAH_HARI_INI: 'sudah diingatkan hari ini',
    TANPA_KEPALA: 'belum punya kepala divisi',
  }

  return (
    <MkCard
      title={
        unreported.length > 0
          ? `${unreported.length} dari ${divisions.length} divisi belum menyerahkan laporan minggu ini`
          : 'Semua divisi sudah menyerahkan laporan minggu ini'
      }
      subtitle={
        unreported.length > 0
          ? `${unreported.map((d) => d.name).join(' · ')}. Sistem juga mengingatkan otomatis tiap pagi hari kerja.`
          : undefined
      }
      action={
        unreported.length > 0 ? (
          <Button variant="primary" icon="notifikasi" onClick={send} disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Mengirim…' : 'Kirim pengingat'}
          </Button>
        ) : (
          <StatusBadge status="done" size="sm">
            Lengkap
          </StatusBadge>
        )
      }
    >
      {err && (
        <Note tone="late" icon="peringatan">
          {err}
        </Note>
      )}
      {result && (
        <Note tone="done" icon="selesai">
          <p className="font-semibold">{result.sent} pengingat terkirim ke lonceng aplikasi kepala divisi.</p>
          <ul className="mt-1 space-y-0.5">
            {result.results.map((r, i) => (
              <li key={i}>
                {r.divisionName}
                {r.head ? ` (${r.head.name})` : ''}: {OUTCOME[r.outcome] ?? r.outcome}
              </li>
            ))}
          </ul>
        </Note>
      )}
    </MkCard>
  )
}

function DivisionBoard({ division, data, onChanged }: { division: DivisionRow; data: Data; onChanged: () => void }) {
  const items = useMemo(() => division.report?.items ?? [], [division.report])
  // Server menghitung kunci per divisi (minggu, jam, diteruskan, buka kunci);
  // data lama tanpa `writable` memakai aturan minggu & jam saja.
  const locked =
    division.writable !== undefined
      ? !division.writable
      : data.locked || !data.week.current || Boolean(division.report?.isLocked)
  const unlocked = !locked && Boolean(division.unlockUntil)
  const forwarded = Boolean(division.report?.forwardedAt)
  const status = division.report?.statusHeader ?? 'DRAFT'
  const dayKeys = useMemo(() => data.days.map(wibKey), [data.days])
  // Kartu ringkas secara bawaan supaya papan tidak memanjang; detail dibuka per kartu
  // atau sekaligus lewat sakelar Ringkas/Detail (diingat per peramban).
  const [detailAll, setDetailAll] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(DETAIL_KEY) === '1'
    } catch {
      return false
    }
  })
  const setDetail = (on: boolean) => {
    setDetailAll(on)
    try {
      window.localStorage.setItem(DETAIL_KEY, on ? '1' : '0')
    } catch {
      /* penyimpanan peramban tidak tersedia */
    }
  }
  // Minggu lalu yang dibuka kunci tidak memuat hari ini: kartu baru ke lajur Mingguan.
  const todayKey = wibKey(new Date().toISOString())
  const todayLane = dayKeys.includes(todayKey) ? todayKey : WEEKLY_LANE
  const cards = useMemo<Card[]>(
    () =>
      items.map((i) => {
        const key = i.workDate ? wibKey(i.workDate) : null
        return { ...i, lane: key && dayKeys.includes(key) ? key : WEEKLY_LANE }
      }),
    [items, dayKeys]
  )
  const [dialog, setDialog] = useState<{ item: Item | null; lane: string } | null>(null)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ text: string; list: string[] } | null>(null)
  const [escalating, setEscalating] = useState<Item | null>(null)
  const [confirmEl, confirm] = useConfirm()

  const done = items.filter((i) => i.status === 'SELESAI').length
  const blocked = items.filter((i) => i.status === 'TERKENDALA').length
  const avg = items.length ? Math.round(items.reduce((s, i) => s + i.progressPct, 0) / items.length) : 0
  const missingEvidence = items.filter((i) => i.evidenceCount === 0 && !['BELUM_MULAI', 'NA'].includes(i.status)).length

  /** Kirim susunan ke server; true bila tersimpan. */
  async function persist(moves: BoardMove[]): Promise<boolean> {
    try {
      const res = await fetch('/api/weekly-input', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          divisionId: division.id,
          week: data.week.key,
          moves: moves.map((m) => ({ itemId: m.id, workDate: m.lane === WEEKLY_LANE ? null : m.lane, position: m.index })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Kartu belum berpindah. Coba lagi.')
        return false
      }
      return true
    } catch {
      toast.error('Tidak dapat menghubungi server.')
      return false
    } finally {
      setVersion((v) => v + 1)
      onChanged()
    }
  }

  async function move(moves: BoardMove[]) {
    // Susunan sebelum dipindah, untuk "Urungkan": lajur yang sama, urutan lama.
    const undo = movesFor(cards, moves.map((m) => m.lane))
    if (!(await persist(moves))) return
    toast('Susunan tersimpan.', {
      action: {
        label: 'Urungkan',
        onClick: () => {
          void persist(undo).then((ok) => ok && toast('Susunan dikembalikan.'))
        },
      },
    })
  }

  async function remove(it: Item) {
    const ok = await confirm({
      title: 'Hapus item ini?',
      description: `"${it.workItem}" beserta lampirannya akan dihapus permanen.`,
      confirmLabel: 'Hapus item',
      destructive: true,
    })
    if (!ok) return
    setBusy(it.id)
    try {
      const res = await fetch(`/api/weekly-input?itemId=${it.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(json.error || 'Item belum terhapus.')
      else {
        toast.success('Item dihapus.')
        onChanged()
      }
    } catch {
      toast.error('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  async function act(action: 'submit' | 'approve') {
    setBusy(action)
    setErrors(null)
    try {
      const res = await fetch('/api/weekly-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ divisionId: division.id, week: data.week.key, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const list: string[] = Array.isArray(json.errors) ? json.errors : []
        if (list.length) setErrors({ text: json.error || 'Laporan belum lengkap.', list })
        else toast.error(json.error || 'Laporan belum terkirim. Coba lagi.')
      } else {
        toast.success(
          action === 'submit'
            ? 'Diserahkan, menunggu persetujuan kepala divisi.'
            : 'Disetujui. Admin PT dapat meneruskannya ke holding.'
        )
        onChanged()
      }
    } catch {
      toast.error('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <MkCard
      title={division.name}
      subtitle={`${division.type}${division.headName ? ` · Kepala: ${division.headName}` : ''} · ${items.length} item`}
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <WeeklyHeaderBadge status={status} />
          {division.report?.forwardedAt && (
            <StatusBadge status="done" size="sm">
              Diteruskan
            </StatusBadge>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {/* Tinjauan ringkas minggu ini */}
        <div className="mk-wb-sum">
          <span>
            <strong>{done}</strong> selesai
          </span>
          {blocked > 0 && (
            <span className="mk-text--risk">
              <strong className="mk-text--risk">{blocked}</strong> terkendala
            </span>
          )}
          {missingEvidence > 0 && (
            <span className="mk-text--risk">
              <strong className="mk-text--risk">{missingEvidence}</strong> tanpa bukti
            </span>
          )}
          <span className="mk-wb-sum__bar">
            <ProgressBar value={avg} label={`Rata-rata progres ${division.name}`} />
          </span>
        </div>

        {locked && (division.frozen || data.week.current) && (
          <Note tone={division.frozen ? 'done' : 'late'} icon="kunci">
            {division.lockReason ?? 'Minggu ini sudah dikunci. Perubahan memerlukan permohonan buka kunci.'}
          </Note>
        )}

        {unlocked && division.unlockUntil && (
          <Note tone="risk" icon="kunci">
            Dibuka untuk koreksi sampai {formatDateLong(division.unlockUntil)} pukul {formatTime(division.unlockUntil)} WIB.
            {forwarded ? ' Laporan ini sudah diteruskan; koreksi tersimpan langsung tanpa diserahkan ulang.' : ''}
          </Note>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <Button icon="tambah" onClick={() => setDialog({ item: null, lane: todayLane })}>
              Tambah capaian
            </Button>
          )}
          <SegmentedControl
            size="sm"
            label="Tampilan kartu"
            value={detailAll ? 'detail' : 'ringkas'}
            onChange={(v) => setDetail(v === 'detail')}
            options={[
              { value: 'ringkas', label: 'Ringkas' },
              { value: 'detail', label: 'Detail' },
            ]}
          />
          {!locked && (
            <p className="t-footnote text-ink-2">Seret pegangan ⋮ untuk memindahkan antar hari. Di ponsel, tahan kartu sebentar lalu geser.</p>
          )}
        </div>

        <WeeklyBoard<Card>
          key={`${data.week.key}:${version}:${boardSignature(cards)}`}
          days={data.days}
          today={data.week.current ? new Date().toISOString() : null}
          cards={cards}
          disabled={locked}
          onMove={move}
          onAdd={(lane) => setDialog({ item: null, lane })}
          emptyText="Belum ada capaian."
          renderCard={(it, dragging) => (
            <ItemCard
              item={it}
              dragging={dragging}
              locked={locked}
              busy={busy === it.id}
              onEdit={() => setDialog({ item: it, lane: it.lane })}
              onDelete={() => remove(it)}
              onEscalate={() => setEscalating(it)}
              onChanged={onChanged}
              detailAll={detailAll}
            />
          )}
        />

        {errors && (
          <Note tone="late" icon="peringatan">
            <p className="font-semibold">{errors.text}</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              {errors.list.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Note>
        )}

        {/* Alur: Draf → serah → Menunggu persetujuan → kepala divisi menyetujui →
            Admin PT meneruskan. Satu tombol primer: langkah berikutnya saja. */}
        {!locked && !forwarded && status === 'DRAFT' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="primary"
              icon="kirim"
              disabled={busy !== null || items.length === 0}
              aria-busy={busy === 'submit' || undefined}
              onClick={() => act('submit')}
            >
              {busy === 'submit' ? 'Menyerahkan…' : 'Serahkan ke Admin PT'}
            </Button>
            {data.canApprove && (
              <p className="t-footnote text-ink-2">Laporan bisa disetujui setelah diserahkan.</p>
            )}
          </div>
        )}
        {!locked && !forwarded && status === 'MENUNGGU_PERSETUJUAN' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {data.canApprove ? (
              <Button
                variant="primary"
                icon="persetujuan"
                disabled={busy !== null}
                aria-busy={busy === 'approve' || undefined}
                onClick={() => act('approve')}
              >
                {busy === 'approve' ? 'Menyetujui…' : 'Setujui laporan'}
              </Button>
            ) : (
              <p className="t-footnote text-ink-2">Menunggu persetujuan kepala divisi.</p>
            )}
          </div>
        )}
        {!locked && !forwarded && status === 'DISETUJUI' && (
          <p className="t-footnote text-ink-2 pt-1">Disetujui, menunggu diteruskan Admin PT ke holding.</p>
        )}
      </div>

      {dialog && (
        <ItemDialog
          key={dialog.item?.id ?? `baru-${dialog.lane}`}
          divisionId={division.id}
          divisionName={division.name}
          data={data}
          item={dialog.item}
          lane={dialog.lane}
          locked={locked}
          onClose={() => setDialog(null)}
          onSaved={onChanged}
        />
      )}

      {escalating && (
        <WeeklyEscalationDialog
          item={escalating}
          onClose={() => setEscalating(null)}
          onDone={() => {
            setEscalating(null)
            onChanged()
          }}
        />
      )}
      {confirmEl}
    </MkCard>
  )
}

function ItemCard({
  item,
  dragging,
  locked,
  busy,
  onEdit,
  onDelete,
  onEscalate,
  onChanged,
  detailAll = false,
}: {
  item: Card
  dragging: boolean
  locked: boolean
  busy: boolean
  onEdit: () => void
  onDelete: () => void
  onEscalate: () => void
  onChanged: () => void
  detailAll?: boolean
}) {
  const [showFiles, setShowFiles] = useState(false)
  const [open, setOpen] = useState(false)
  const needsEvidence = !['BELUM_MULAI', 'NA'].includes(item.status)
  const expanded = detailAll || open
  const panelId = `wb-detail-${item.id}`

  if (!expanded) {
    return (
      <article className={cx('mk-wb-card', 'is-compact', `is-${PRIORITY_EDGE[item.priority.code] ?? 'risk'}`, dragging && 'is-dragging')} aria-label={item.workItem}>
        <button
          type="button"
          className="mk-wb-card__toggle"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={panelId}
          disabled={dragging}
        >
          <span className="mk-wb-card__top">
            <span className="mk-wb-card__title">{item.workItem}</span>
            <span className="shrink-0">
              <WeeklyItemStatusBadge status={item.status} />
            </span>
          </span>
          <span className="mk-wb-card__mini">
            <span className="mk-wb-card__minibar" aria-hidden>
              <span style={{ width: `${Math.max(0, Math.min(100, item.progressPct))}%` }} />
            </span>
            <span className="tabular-nums">{item.progressPct}%</span>
            <span className="truncate">{item.picName}</span>
            <span
              className={item.evidenceCount > 0 ? 'mk-text--done' : needsEvidence ? 'mk-text--risk' : undefined}
              aria-label={`${item.evidenceCount} bukti`}
            >
              <Icon name="dokumen" size={14} /> {item.evidenceCount}
            </span>
            <Icon name="bawah" size={16} className="mk-wb-card__chev" />
          </span>
          <span className="sr-only">Buka detail</span>
        </button>
      </article>
    )
  }

  return (
    <article id={panelId} className={cx('mk-wb-card', `is-${PRIORITY_EDGE[item.priority.code] ?? 'risk'}`, dragging && 'is-dragging')} aria-label={item.workItem}>
      <div className="mk-wb-card__top">
        <div className="mk-wb-card__title">{item.workItem}</div>
        <span className="mk-wb-card__side">
          <WeeklyItemStatusBadge status={item.status} />
          {!detailAll && (
            <button type="button" className="mk-wb-card__collapse" onClick={() => setOpen(false)} aria-expanded aria-controls={panelId} aria-label={`Ringkas ${item.workItem}`}>
              <Icon name="bawah" size={16} />
            </button>
          )}
        </span>
      </div>
      <div className="mk-wb-card__meta">
        <PriorityBadge priority={item.priority.code} />
        <span>{item.aspectCategory.name}</span>
        <span>PIC {item.picName}</span>
        <span
          className={item.evidenceCount > 0 ? 'mk-text--done' : needsEvidence ? 'mk-text--risk' : undefined}
          aria-label={`${item.evidenceCount} bukti`}
        >
          <Icon name="dokumen" size={14} /> {item.evidenceCount}
        </span>
      </div>
      <ProgressBar value={item.progressPct} label={`Progres ${item.workItem}`} />
      {item.achievementThisWeek && <p className="mk-wb-card__text">{item.achievementThisWeek}</p>}
      {item.obstacleFollowUp && (
        <p className="mk-wb-note mk-wb-note--clamp is-late">
          <Icon name="peringatan" size={14} />
          <span>
            <strong>Kendala:</strong> {item.obstacleFollowUp}
          </span>
        </p>
      )}
      {item.followUp && (
        <p className="mk-wb-note mk-wb-note--clamp is-info">
          <Icon name="alur" size={14} />
          <span>
            <strong>Tindak lanjut:</strong> {item.followUp}
          </span>
        </p>
      )}
      {!dragging && (
        <div className="mk-wb-card__actions">
          {!locked && (
            <Button size="sm" icon="catatan" className="mk-wk-tap" onClick={onEdit}>
              Ubah capaian
            </Button>
          )}
          <Button size="sm" variant="plain" icon="dokumen" className="mk-wk-tap" onClick={() => setShowFiles((v) => !v)} aria-expanded={showFiles}>
            {showFiles ? 'Tutup bukti' : 'Lihat bukti'}
          </Button>
          {item.status === 'TERKENDALA' && !item.escalationRaised && !locked && (
            <Button size="sm" variant="destructive" icon="peringatan" className="mk-wk-tap" onClick={onEscalate}>
              Ajukan eskalasi
            </Button>
          )}
          {!locked && !item.escalationRaised && (
            <Button size="sm" variant="plain" className="mk-wk-tap" onClick={onDelete} disabled={busy} aria-busy={busy || undefined}>
              {busy ? 'Menghapus…' : 'Hapus'}
            </Button>
          )}
        </div>
      )}
      {showFiles && !dragging && (
        <EvidencePanel targetType="WEEKLY_ITEM" targetId={item.id} items={item.evidence ?? []} required={needsEvidence} disabled={locked} onChanged={onChanged} compact />
      )}
    </article>
  )
}

const DETAIL_KEY = 'mk-wb-detail'

/** Formulir satu item — Sheet lebar (desktop 640, tablet form, ponsel layar didorong). */
export function ItemDialog({
  divisionId,
  divisionName,
  data,
  item,
  lane,
  locked,
  onClose,
  onSaved,
}: {
  divisionId: string
  divisionName: string
  data: Data
  item: Item | null
  lane: string
  locked: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const editing = Boolean(item)
  const [day, setDay] = useState(lane)
  const [f, setF] = useState({
    workItem: item?.workItem ?? '',
    targetOutput: item?.targetOutput ?? '',
    picName: item?.picName ?? '',
    status: item?.status ?? '',
    progressPct: item?.progressPct ?? 0,
    achievementThisWeek: item?.achievementThisWeek ?? '',
    obstacleFollowUp: item?.obstacleFollowUp ?? '',
    followUp: item?.followUp ?? '',
    aspectCategoryId: item?.aspectCategory.id ?? data.aspects[0]?.id ?? '',
    priorityId: item?.priority.id ?? data.priorities[0]?.id ?? '',
  })
  const [tags, setTags] = useState<string[]>(item?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [subtasks, setSubtasks] = useState<{ title: string; isDone: boolean }[]>(item?.subtasks ?? [])
  const [subDraft, setSubDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }))
  const canSave = f.workItem.trim() && f.targetOutput.trim() && f.picName.trim() && f.status && f.achievementThisWeek.trim() && (f.status !== 'TERKENDALA' || f.obstacleFollowUp.trim())

  function addSubtask() {
    const v = subDraft.trim()
    if (v) setSubtasks([...subtasks, { title: v, isDone: false }])
    setSubDraft('')
  }

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/weekly-input', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          divisionId,
          itemId: item?.id,
          week: data.week.key,
          workDate: day === WEEKLY_LANE ? null : day,
          ...f,
          tags,
          subtasks,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Capaian belum tersimpan. Coba lagi.')
      else {
        toast.success(editing ? 'Perubahan capaian tersimpan.' : 'Capaian tersimpan.')
        onSaved()
        onClose()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      size="wide"
      backLabel="Capaian"
      title={editing ? 'Ubah capaian' : 'Tambah capaian'}
      subtitle={`${day === WEEKLY_LANE ? 'Capaian mingguan' : formatDateLong(day)} · ${divisionName} · Minggu ${data.week.isoWeek}`}
      footer={
        <>
          <Button variant="plain" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" icon="selesai" onClick={save} disabled={busy || locked || !canSave} aria-busy={busy || undefined}>
            {busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan capaian'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="mk-wk-panel" aria-label="Pekerjaan">
          <div className="mk-formgrid">
            <Field label="Uraian pekerjaan / item" htmlFor="item-work" required className="is-full">
              <input id="item-work" value={f.workItem} onChange={(e) => set('workItem', e.target.value)} disabled={locked} className="mk-wk-input" placeholder="mis. Closing laporan keuangan bulanan" />
            </Field>
            <Field label="Target output" htmlFor="item-target" required>
              <input id="item-target" value={f.targetOutput} onChange={(e) => set('targetOutput', e.target.value)} disabled={locked} className="mk-wk-input" />
            </Field>
            <Field label="PIC" htmlFor="item-pic" required>
              <input id="item-pic" value={f.picName} onChange={(e) => set('picName', e.target.value)} disabled={locked} className="mk-wk-input" />
            </Field>
            <Field label="Aspek" htmlFor="item-aspect">
              <select id="item-aspect" value={f.aspectCategoryId} onChange={(e) => set('aspectCategoryId', e.target.value)} disabled={locked} className={selectCls}>
                {data.aspects.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tingkat prioritas" htmlFor="item-priority">
              <select id="item-priority" value={f.priorityId} onChange={(e) => set('priorityId', e.target.value)} disabled={locked} className={selectCls}>
                {data.priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hari pengerjaan" htmlFor="item-day" className="is-full">
              <select id="item-day" value={day} onChange={(e) => setDay(e.target.value)} disabled={locked} className={selectCls}>
                {data.days.map((d) => (
                  <option key={d} value={wibKey(d)}>
                    {formatDateLong(d)}
                  </option>
                ))}
                <option value={WEEKLY_LANE}>Capaian mingguan (tanpa hari)</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="mk-wk-panel" aria-label="Capaian">
          <Field label="Status" required>
            <div className="mk-wk-choices" role="group" aria-label="Status">
              {STATUSES.map((s) => (
                <Chip key={s} selected={f.status === s} status={weeklyItemStatus(s)} className="mk-wk-tap" onClick={() => set('status', s)} disabled={locked}>
                  {WEEKLY_STATUS_META[s]?.label ?? s}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={`Progres: ${f.progressPct}%`} htmlFor="item-progress">
            <input id="item-progress" type="range" min={0} max={100} step={5} value={f.progressPct} onChange={(e) => set('progressPct', Number(e.target.value))} disabled={locked} className="mk-wk-range" />
          </Field>
          <Field label="Capaian minggu ini" htmlFor="item-ach" required>
            <textarea id="item-ach" rows={3} value={f.achievementThisWeek} onChange={(e) => set('achievementThisWeek', e.target.value)} disabled={locked} className="mk-wk-textarea" placeholder="Apa yang tercapai pada periode ini." />
          </Field>
          <div className="mk-formgrid">
            <Field label="Kendala" htmlFor="item-obs" required={f.status === 'TERKENDALA'}>
              <textarea id="item-obs" rows={3} value={f.obstacleFollowUp} onChange={(e) => set('obstacleFollowUp', e.target.value)} disabled={locked} className="mk-wk-textarea" placeholder="Apa yang menghambat." />
            </Field>
            <Field label="Tindak lanjut" htmlFor="item-fu">
              <textarea id="item-fu" rows={3} value={f.followUp} onChange={(e) => set('followUp', e.target.value)} disabled={locked} className="mk-wk-textarea" placeholder="Langkah berikutnya, oleh siapa, kapan." />
            </Field>
          </div>
        </section>

        <section className="mk-wk-panel" aria-label="Tag dan langkah kerja">
          <Field label="Tag" htmlFor="item-tag" hint={tags.length >= 8 ? 'Maksimal 8 tag.' : 'Ketik lalu tekan Enter atau koma.'}>
            {tags.length > 0 && (
              <div className="mk-wk-tags">
                {tags.map((t) => (
                  <span key={t} className="mk-wk-tag">
                    {t}
                    {!locked && (
                      <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Hapus tag ${t}`}>
                        <Icon name="tutup" size={14} strokeWidth={2.2} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <input
              id="item-tag"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  const v = tagDraft.trim()
                  if (v && !tags.includes(v) && tags.length < 8) setTags([...tags, v])
                  setTagDraft('')
                }
              }}
              placeholder="Ketik lalu Enter"
              disabled={locked || tags.length >= 8}
              className="mk-wk-input"
            />
          </Field>
          <Field label="Langkah kerja" htmlFor="item-step">
            {subtasks.length > 0 && (
              <ul className="space-y-0.5">
                {subtasks.map((st, i) => (
                  <li key={i} className="mk-wk-step">
                    <button
                      type="button"
                      onClick={() => setSubtasks(subtasks.map((x, j) => (i === j ? { ...x, isDone: !x.isDone } : x)))}
                      disabled={locked}
                      role="checkbox"
                      aria-checked={st.isDone}
                      aria-label={st.isDone ? `Batalkan ${st.title}` : `Tandai selesai ${st.title}`}
                      className={cx('mk-wk-step__check', st.isDone && 'is-on')}
                    >
                      <span>{st.isDone && <Icon name="selesai" size={16} strokeWidth={2.6} />}</span>
                    </button>
                    <span className={cx('mk-wk-step__title', st.isDone && 'is-done')}>{st.title}</span>
                    {!locked && (
                      <Button size="sm" variant="plain" className="mk-wk-tap" onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))} aria-label={`Hapus langkah ${st.title}`}>
                        Hapus
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!locked && (
              <div className="mk-wk-addrow">
                <input
                  id="item-step"
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSubtask()
                    }
                  }}
                  placeholder="Tambah langkah kerja"
                  className="mk-wk-input"
                />
                <Button icon="tambah" onClick={addSubtask} disabled={!subDraft.trim()}>
                  Tambah langkah
                </Button>
              </div>
            )}
            {locked && subtasks.length === 0 && <p className="t-footnote text-ink-2">Belum ada langkah kerja.</p>}
          </Field>
        </section>

        {editing ? (
          <section className="mk-wk-panel" aria-label="Bukti">
            <EvidencePanel targetType="WEEKLY_ITEM" targetId={item!.id} items={item!.evidence ?? []} required={!['BELUM_MULAI', 'NA'].includes(f.status)} disabled={locked} onChanged={onSaved} />
          </section>
        ) : (
          <p className="t-footnote text-ink-2 px-1">Dokumen dan foto dapat dilampirkan setelah item disimpan.</p>
        )}

        {err && (
          <Note tone="late" icon="peringatan">
            <span role="alert">{err}</span>
          </Note>
        )}
      </div>
    </Sheet>
  )
}

/** Raising one weekly item to the next level up. */
function WeeklyEscalationDialog({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const [summary, setSummary] = useState(item.obstacleFollowUp ?? '')
  const [needed, setNeeded] = useState('DUKUNGAN_LINTAS_FUNGSI')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/escalations/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'raise', sourceType: 'WEEKLY_ITEM', sourceId: item.id, summary, needed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Eskalasi belum terkirim. Coba lagi.')
      else {
        toast.success('Eskalasi diajukan.')
        onDone()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      backLabel="Capaian"
      eyebrow={<StatusBadge status="risk" size="sm">Terkendala</StatusBadge>}
      title="Ajukan eskalasi"
      subtitle={item.workItem}
      footer={
        <>
          <Button variant="plain" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" icon="kirim" onClick={submit} disabled={busy || summary.trim().length < 10} aria-busy={busy || undefined}>
            {busy ? 'Mengajukan…' : 'Ajukan eskalasi'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Yang dibutuhkan">
          <div className="mk-wk-choices" role="group" aria-label="Yang dibutuhkan">
            {[
              { value: 'KEPUTUSAN', label: 'Keputusan' },
              { value: 'ANGGARAN', label: 'Anggaran' },
              { value: 'DUKUNGAN_LINTAS_FUNGSI', label: 'Dukungan lintas fungsi' },
            ].map((o) => (
              <Chip key={o.value} selected={needed === o.value} className="mk-wk-tap" onClick={() => setNeeded(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Ringkasan untuk pengambil keputusan" htmlFor="wesc-summary" required hint="Minimal 10 karakter.">
          <textarea
            id="wesc-summary"
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Jelaskan hambatannya, dampaknya, dan opsi yang Anda usulkan."
            className="mk-wk-textarea"
          />
        </Field>
        {err && (
          <Note tone="late" icon="peringatan">
            <span role="alert">{err}</span>
          </Note>
        )}
      </div>
    </Sheet>
  )
}
