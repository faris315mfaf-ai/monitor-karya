'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useResource } from '@/hooks/use-resource'
import { useApp, type SessionUser } from '@/components/app-provider'
import { NotificationButton } from '@/components/shell'
import {
  Button, Card, Chip, EmptyNote, ErrorNote, FlowDiagram, Hero, PageHeader, Sheet, Skeleton, StatusBadge, cx,
  type FlowStep,
} from '@/components/mk'
import { Field, InfoLine, SectionTitle, selectCls } from '@/components/companies/parts'
import { EscalationStatusBadge } from '@/components/status-badges'
import { can } from '@/lib/rbac'
import { ESCALATION_STATUS_META, ESCALATION_NEEDED_LABELS } from '@/lib/constants'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { toastWithUndo } from '@/lib/undo-client' // [F2-URUNGKAN]

type Escalation = {
  id: string
  sourceType: string
  sourceId: string
  summary: string
  needed: string
  status: string
  raisedAt: string
  slaDays: number
  ageDays: number
  isOverdue: boolean
  decidedAt: string | null
  decisionText: string | null
  entityId: string
  entity: { id: string; name: string; code: string; region: string | null }
  raisedById: string | null
  raisedBy: { id: string; name: string; email: string } | null
  decidedById: string | null
  decidedBy: { id: string; name: string; email: string } | null
}

type EscalationListData = {
  items: Escalation[]
  total: number
  page: number
  pageSize: number
}

const STATUS_COLUMNS = ['DIAJUKAN', 'DITINJAU', 'DIPUTUSKAN', 'DITUTUP'] as const

const NEEDED_OPTIONS = [
  { value: 'ALL', label: 'Semua kebutuhan' },
  { value: 'KEPUTUSAN', label: 'Keputusan' },
  { value: 'ANGGARAN', label: 'Anggaran' },
  { value: 'DUKUNGAN_LINTAS_FUNGSI', label: 'Dukungan lintas fungsi' },
]

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Semua status' },
  { value: 'DIAJUKAN', label: 'Diajukan' },
  { value: 'DITINJAU', label: 'Ditinjau' },
  { value: 'DIPUTUSKAN', label: 'Diputuskan' },
  { value: 'DITUTUP', label: 'Ditutup' },
]

const statusLabel = (s: string) => ESCALATION_STATUS_META[s]?.label ?? s
const neededLabel = (n: string) => ESCALATION_NEEDED_LABELS[n] || n

/**
 * Langkah yang tersedia pada satu eskalasi menurut peran: direktur menandai
 * ditinjau, Manajemen mencatat keputusan, dan keduanya (atau pengaju) menutup
 * setelah diputuskan.
 */
function escalationPerms(user: SessionUser, e: Escalation) {
  const mayReview = can(user.role, 'escalation:followup') && e.status === 'DIAJUKAN'
  const mayDecide = can(user.role, 'escalation:decide') && e.status !== 'DITUTUP' && e.status !== 'DIPUTUSKAN'
  const mayClose =
    e.status === 'DIPUTUSKAN' &&
    (can(user.role, 'escalation:decide') || can(user.role, 'escalation:followup') || e.raisedById === user.id)
  return { mayReview, mayDecide, mayClose }
}

export function EscalationsView() {
  const { user } = useApp()
  const [status, setStatus] = useState<string>('ALL')
  const [needed, setNeeded] = useState<string>('ALL')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [detail, setDetail] = useState<{ id: string; snapshot: Escalation; n: number } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: '1', pageSize: '100' })
    if (status !== 'ALL') p.set('status', status)
    if (needed !== 'ALL') p.set('needed', needed)
    if (overdueOnly) p.set('overdue', 'true')
    return p.toString()
  }, [status, needed, overdueOnly])

  const { data, loading, error, reload } = useResource<EscalationListData>(`/api/escalations?${params}`)
  const items = useMemo(() => data?.items ?? [], [data])
  const filtered = status !== 'ALL' || needed !== 'ALL' || overdueOnly

  // Kelompokkan ke 4 kolom; status tak dikenal masuk ke Ditutup.
  const grouped = useMemo(() => {
    const map: Record<string, Escalation[]> = { DIAJUKAN: [], DITINJAU: [], DIPUTUSKAN: [], DITUTUP: [] }
    for (const it of items) {
      if (map[it.status]) map[it.status].push(it)
      else map.DITUTUP.push(it)
    }
    return map
  }, [items])

  // Bila status disaring, hanya kolom itu yang tampil.
  const visibleColumns: string[] = status !== 'ALL' ? [status] : Array.from(STATUS_COLUMNS)

  const waiting = grouped.DIAJUKAN.length + grouped.DITINJAU.length
  const overdue = items.filter((e) => e.isOverdue && e.status !== 'DITUTUP').length
  const myTurn = items.filter((e) => {
    const p = escalationPerms(user, e)
    return p.mayReview || p.mayDecide || p.mayClose
  }).length

  const answer = !data
    ? ''
    : filtered
      ? data.total === 0
        ? 'Tidak ada eskalasi dengan saringan ini.'
        : `${formatNumber(data.total)} eskalasi cocok dengan saringan.`
      : waiting === 0
        ? 'Tidak ada eskalasi yang menunggu keputusan.'
        : `${formatNumber(waiting)} eskalasi menunggu keputusan.`
  const support = [
    overdue ? `${overdue} lewat SLA.` : null,
    myTurn ? `${myTurn} menunggu tindakan Anda.` : null,
    !filtered && grouped.DIPUTUSKAN.length ? `${grouped.DIPUTUSKAN.length} sudah diputuskan dan menunggu ditutup.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  function resetFilters() {
    setStatus('ALL')
    setNeeded('ALL')
    setOverdueOnly(false)
  }
  function openDetail(e: Escalation) {
    setDetail((d) => ({ id: e.id, snapshot: e, n: (d?.n ?? 0) + 1 }))
    setDetailOpen(true)
  }
  const detailItem = detail ? (items.find((e) => e.id === detail.id) ?? detail.snapshot) : null

  return (
    <>
      <PageHeader
        context="Pelacakan keputusan lintas entitas"
        title="Eskalasi"
        tools={
          <span className="mk-desktop-only">
            <NotificationButton />
          </span>
        }
      />

      {loading && !data ? (
        <div className="mk-hero" aria-busy="true" aria-label="Memuat ringkasan eskalasi">
          <div className="mk-hero__text">
            <Skeleton h={26} w={160} r={999} />
            <Skeleton h={36} w="70%" r={12} />
            <Skeleton h={20} w="55%" />
          </div>
        </div>
      ) : data ? (
        <Hero
          eyebrow={`${formatNumber(data.total)} eskalasi${filtered ? ' tersaring' : ''}`}
          answer={answer}
          support={support || (data.total ? 'Ketuk kartu untuk membaca ringkasan dan mengambil tindakan.' : undefined)}
        />
      ) : null}

      <div className="mk-filterbar">
        <div className="mk-chips" role="group" aria-label="Saring eskalasi">
          {STATUS_OPTIONS.map((o) => (
            <Chip key={o.value} selected={status === o.value} onClick={() => setStatus(o.value)}>
              {o.label}
            </Chip>
          ))}
          <Chip status="late" selected={overdueOnly} onClick={() => setOverdueOnly((v) => !v)}>
            Lewat SLA
          </Chip>
        </div>
        <label className="mk-sortsel">
          <span className="mk-sr">Kebutuhan</span>
          <select className={selectCls} value={needed} onChange={(e) => setNeeded(e.target.value)}>
            {NEEDED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && !data ? (
        <div className="mk-kanban" aria-busy="true" aria-label="Memuat papan eskalasi">
          {STATUS_COLUMNS.map((c) => (
            <div key={c} className="mk-kanban__col">
              <Skeleton h={26} w={120} r={999} />
              <Skeleton h={132} r={14} />
              <Skeleton h={132} r={14} />
            </div>
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorNote message={`Papan eskalasi belum termuat. ${error}`} onRetry={reload} />
        </Card>
      ) : !items.length ? (
        <Card>
          {filtered ? (
            <EmptyNote
              icon="peringatan"
              action={
                <Button size="sm" onClick={resetFilters}>
                  Hapus saringan
                </Button>
              }
            >
              Tidak ada eskalasi dengan saringan ini.
            </EmptyNote>
          ) : (
            <EmptyNote done>Belum ada eskalasi. Semua keputusan berjalan di tingkat masing-masing.</EmptyNote>
          )}
        </Card>
      ) : (
        <>
          {data && data.total > items.length && (
            <p className="t-footnote text-ink-2">
              Menampilkan {formatNumber(items.length)} dari {formatNumber(data.total)} eskalasi terbaru.
            </p>
          )}
          <div className={cx('mk-kanban', visibleColumns.length === 1 && 'is-single', loading && 'opacity-60')}>
            {visibleColumns.map((col) => (
              <KanbanColumn
                key={col}
                status={col}
                items={grouped[col] || []}
                selectedId={detailOpen ? (detail?.id ?? null) : null}
                onOpen={openDetail}
              />
            ))}
          </div>
        </>
      )}

      {detail && detailItem && (
        <EscalationSheet
          key={detail.n}
          open={detailOpen}
          escalation={detailItem}
          onClose={() => setDetailOpen(false)}
          onChanged={reload}
        />
      )}
    </>
  )
}

function KanbanColumn({
  status,
  items,
  selectedId,
  onOpen,
}: {
  status: string
  items: Escalation[]
  selectedId: string | null
  onOpen: (e: Escalation) => void
}) {
  return (
    <section className="mk-kanban__col" aria-label={`${statusLabel(status)}, ${items.length} eskalasi`}>
      <header className="mk-kanban__head">
        <EscalationStatusBadge status={status} />
        <span className="mk-kanban__count" aria-hidden>
          {items.length}
        </span>
      </header>
      <div className="mk-kanban__list">
        {items.length === 0 ? (
          <p className="mk-kanban__empty">Tidak ada eskalasi dengan status ini.</p>
        ) : (
          items.map((it) => <EscalationCard key={it.id} escalation={it} selected={selectedId === it.id} onOpen={() => onOpen(it)} />)
        )}
      </div>
    </section>
  )
}

function EscalationCard({ escalation: e, selected, onOpen }: { escalation: Escalation; selected: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={cx('mk-esc', e.isOverdue && 'is-overdue')}
      aria-pressed={selected}
      onClick={onOpen}
    >
      <span className="mk-esc__top">
        <span className="min-w-0">
          <span className="mk-esc__entity">{e.entity.name}</span>
          <span className="mk-esc__code">
            {e.entity.code} · {e.entity.region || '-'}
          </span>
        </span>
        {e.isOverdue ? (
          <StatusBadge status="late" size="sm">
            Lewat SLA
          </StatusBadge>
        ) : null}
      </span>
      <span className="mk-esc__summary">{e.summary}</span>
      <span className="mk-esc__meta">
        <span>
          Butuh <strong>{neededLabel(e.needed).toLowerCase()}</strong>
        </span>
        <span>
          {e.ageDays} hari{e.slaDays > 0 ? ` dari SLA ${e.slaDays}` : ''}
        </span>
      </span>
      {e.raisedBy || e.decidedBy ? (
        <span className="mk-esc__meta">
          {e.raisedBy ? (
            <span>
              {e.raisedBy.name} · {formatRelative(e.raisedAt)}
            </span>
          ) : null}
          {e.decidedBy ? <span>Diputuskan {e.decidedBy.name}</span> : null}
        </span>
      ) : null}
    </button>
  )
}

/** Alur status eskalasi: Diajukan → Ditinjau → Diputuskan → Ditutup. */
function statusSteps(e: Escalation): FlowStep[] {
  const idx = Math.max(0, (STATUS_COLUMNS as readonly string[]).indexOf(e.status))
  const closed = e.status === 'DITUTUP'
  return STATUS_COLUMNS.map((s, i) => {
    const done = closed || i < idx
    const current = !closed && i === idx
    return {
      title: statusLabel(s),
      sub:
        s === 'DIAJUKAN' && e.raisedBy
          ? `${e.raisedBy.name} · ${formatDateTime(e.raisedAt)}`
          : s === 'DIPUTUSKAN' && e.decidedBy
            ? `${e.decidedBy.name}${e.decidedAt ? ` · ${formatDateTime(e.decidedAt)}` : ''}`
            : undefined,
      status: done ? 'done' : current ? (e.isOverdue ? 'blocked' : 'current') : 'todo',
      meta: current && e.isOverdue ? 'Lewat SLA' : undefined,
    }
  })
}

/** Detail satu eskalasi di Sheet, beserta tindakan yang boleh diambil peran ini. */
function EscalationSheet({
  open,
  escalation: e,
  onClose,
  onChanged,
}: {
  open: boolean
  escalation: Escalation
  onClose: () => void
  onChanged: () => void
}) {
  const { user } = useApp()
  const [busy, setBusy] = useState<string | null>(null)
  const [deciding, setDeciding] = useState(false)
  const [decisionText, setDecisionText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const { mayReview, mayDecide, mayClose } = escalationPerms(user, e)

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(action)
    setErr(null)
    try {
      const res = await fetch('/api/escalations/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: e.id, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Eskalasi belum terproses. Coba lagi.')
      else {
        setDeciding(false)
        setDecisionText('')
        // [F2-URUNGKAN] tinjau/putuskan/tutup bisa diurungkan lewat toast.
        toastWithUndo(
          action === 'review' ? 'Eskalasi ditandai sudah ditinjau.' : action === 'decide' ? 'Keputusan tersimpan.' : 'Eskalasi ditutup.',
          json.undoToken,
          onChanged
        )
        onChanged()
        onClose()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  const working = busy !== null
  let footer: ReactNode = null
  if (deciding) {
    footer = (
      <>
        <Button onClick={() => setDeciding(false)} disabled={working}>
          Batal
        </Button>
        <Button variant="primary" onClick={() => act('decide', { decisionText })} disabled={working || decisionText.trim().length < 10}>
          {busy === 'decide' ? 'Menyimpan…' : 'Simpan keputusan'}
        </Button>
      </>
    )
  } else if (mayReview || mayDecide || mayClose) {
    footer = (
      <>
        {mayReview && (
          <Button variant={mayDecide ? 'secondary' : 'primary'} onClick={() => act('review')} disabled={working}>
            {busy === 'review' ? 'Menyimpan…' : 'Tandai ditinjau'}
          </Button>
        )}
        {mayDecide && (
          <Button variant="primary" onClick={() => setDeciding(true)} disabled={working}>
            Putuskan eskalasi
          </Button>
        )}
        {mayClose && (
          <Button variant="primary" icon="selesai" onClick={() => act('close')} disabled={working}>
            {busy === 'close' ? 'Menutup…' : 'Tutup eskalasi'}
          </Button>
        )}
      </>
    )
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={e.entity.name}
      subtitle={`Butuh ${neededLabel(e.needed).toLowerCase()} · ${e.ageDays} hari${e.slaDays > 0 ? ` dari SLA ${e.slaDays}` : ''}`}
      eyebrow={
        <span className="flex flex-wrap gap-2">
          <EscalationStatusBadge status={e.status} />
          {e.isOverdue ? (
            <StatusBadge status="late" size="sm">
              Lewat SLA
            </StatusBadge>
          ) : null}
        </span>
      }
      backLabel="Eskalasi"
      footer={footer}
    >
      <section className="flex flex-col gap-2">
        <h3 className="t-headline">Ringkasan</h3>
        <p className="t-body text-ink whitespace-pre-line">{e.summary}</p>
      </section>

      <section className="flex flex-col gap-2">
        <InfoLine icon="gedung">
          {e.entity.name} · {e.entity.code}
          {e.entity.region ? ` · ${e.entity.region}` : ''}
        </InfoLine>
        <InfoLine icon="pengguna">
          {e.raisedBy ? `Diajukan ${e.raisedBy.name} · ${formatRelative(e.raisedAt)}` : `Diajukan ${formatRelative(e.raisedAt)}`}
        </InfoLine>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle icon="alur">Alur</SectionTitle>
        <FlowDiagram orientation="vertical" steps={statusSteps(e)} label="Alur eskalasi" />
      </section>

      {e.decidedBy && (
        <section className="flex flex-col gap-2">
          <SectionTitle icon="persetujuan">Keputusan</SectionTitle>
          <p className="t-footnote text-ink-2">
            Diputuskan oleh {e.decidedBy.name}
            {e.decidedAt ? ` · ${formatRelative(e.decidedAt)}` : ''}
          </p>
          {e.decisionText && <p className="mk-inset t-body text-ink whitespace-pre-line">{e.decisionText}</p>}
        </section>
      )}

      {deciding && (
        <Field label="Keputusan dan arahan" htmlFor="esc-decision" required hint="Minimal 10 karakter.">
          <textarea
            id="esc-decision"
            rows={4}
            value={decisionText}
            onChange={(ev) => setDecisionText(ev.target.value)}
            placeholder="Tuliskan keputusan dan arahan pelaksanaannya."
            className="w-full min-h-20 rounded-md border-0 bg-fill-1 px-3.5 py-3 t-body text-ink placeholder:text-ink-3 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </Field>
      )}

      {err && (
        <p className="mk-note-box mk-soft--late" role="alert">
          {err}
        </p>
      )}
    </Sheet>
  )
}
