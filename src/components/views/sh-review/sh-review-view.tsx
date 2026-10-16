'use client'

/**
 * Persetujuan Supervisor (papan 5 & 8–9 mockup subholding, kontrak 16 Okt 2026).
 * Saring subholding (chip + jumlah menunggu), tab Menunggu / Diminta perbaikan /
 * Disetujui, daftar kiri + rincian kanan. Di ponsel & tablet daftar dan rincian
 * bertumpuk: pilih laporan → rincian dengan tombol kembali.
 *
 * Rincian: PT, pelapor, jabatan, deskripsi, galeri bukti (lightbox), percakapan,
 * komentar + "Kirim komentar saja" / "Minta perbaikan" (wajib ≥5 huruf) /
 * "Setujui" (wajib ≥1 bukti). Setelah keputusan pindah ke laporan berikutnya.
 *
 * Sorotan (kontrak manajemen 16 Okt, papan Lapis-Supervisor-Ponsel): sakelar
 * "Tandai untuk manajemen" + catatan wajib 5–280 → tombol "Setujui & sorot";
 * laporan disetujui yang disorot memakai lencana bintang "Sorotan" + catatan.
 * Di ponsel tombol keputusan menempel di bawah layar (di atas tab bar & area aman).
 *
 * Data: GET /api/sh/review, POST /api/sh/reports/:id/comments,
 * POST /api/sh/reports/:id/decision.
 */

import { useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import {
  Button, Card, Chip, EmptyNote, ErrorNote, PageHeader, SegmentedControl, Skeleton, StatusBadge, cx, useIsPhone, useIsTablet,
} from '@/components/mk'
import { Switch, Textarea } from '@/components/mk/forms'
import { formatDateTime, formatRelative } from '@/lib/format'
import { EvidenceLightbox, EvidenceThumb, type LightboxState } from '../sh-overview/evidence'
import {
  COMMENT_KIND_LABEL, HIGHLIGHT_NOTE_MAX, HIGHLIGHT_NOTE_MIN_LETTERS, STATUS_META, STATUS_TABS, approveConsequence, approveLabel,
  decisionBody, decisionGate, friendlyError, highlightNoteCheck, isHighlighted, nextAfterDecision, resolveSelected, shouldReload,
  totalWaiting, type DecisionAction, type ReviewData, type ShReport, type ShStatus,
} from './logic'

const ALL = 'ALL'

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; error?: string; field?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => ({}))) as { error?: string; field?: string }
    return { ok: res.ok, status: res.status, error: json.error, field: json.field }
  } catch {
    return { ok: false, status: 0 }
  }
}

export function ShReviewView() {
  const [sh, setSh] = useState<string>(ALL)
  const [tab, setTab] = useState<ShStatus>('MENUNGGU')
  const [selected, setSelected] = useState<string | null>(null)
  /** Ponsel & tablet: rincian dibuka di atas daftar. */
  const [showDetail, setShowDetail] = useState(false)
  const isPhone = useIsPhone()
  const isTablet = useIsTablet()
  const stacked = isPhone || isTablet

  const url = `/api/sh/review?status=${tab}${sh !== ALL ? `&subholdingId=${encodeURIComponent(sh)}` : ''}`
  const { data, loading, error, reload } = useResource<ReviewData>(url)

  const items = data?.items ?? []
  const subholdings = data?.subholdings ?? []
  const waiting = subholdings.length ? totalWaiting(subholdings) : (data?.counts?.MENUNGGU ?? 0)
  const currentId = resolveSelected(items, selected)
  const current = items.find((r) => r.id === currentId) ?? null
  const detailVisible = !stacked || showDetail

  function pickSh(id: string) {
    setSh(id)
    setSelected(null)
    setShowDetail(false)
  }
  function pickTab(v: ShStatus) {
    setTab(v)
    setSelected(null)
    setShowDetail(false)
  }
  function open(id: string) {
    setSelected(id)
    setShowDetail(true)
    if (stacked) window.scrollTo({ top: 0 })
  }

  function afterDecision(decidedId: string) {
    const next = nextAfterDecision(items, decidedId)
    setSelected(next)
    if (!next) setShowDetail(false)
    reload()
  }

  const answer =
    waiting > 0 ? `${waiting} laporan menunggu persetujuan Anda` : 'Tidak ada laporan yang menunggu persetujuan'

  return (
    <div className="flex flex-col gap-5">
      {!(stacked && showDetail && current) ? (
        <>
          <PageHeader context="Persetujuan · semua subholding PT BIKE Tbk" title={answer} />
          {subholdings.length > 0 ? (
            <div className="mk-chips" role="group" aria-label="Saring subholding">
              <Chip selected={sh === ALL} count={waiting} onClick={() => pickSh(ALL)}>
                Semua subholding
              </Chip>
              {subholdings.map((s) => (
                <Chip key={s.id} selected={sh === s.id} count={s.waiting} onClick={() => pickSh(s.id)}>
                  {s.name}
                </Chip>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {loading && !data ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat laporan">
          <Skeleton h={40} r={12} w="min(100%, 440px)" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={88} r={18} w="min(100%, 440px)" />
          ))}
        </div>
      ) : error || !data ? (
        <Card>
          <ErrorNote message={error ?? 'Laporan belum termuat.'} onRetry={reload} />
        </Card>
      ) : (
        <div className={cx('flex flex-wrap items-start gap-5', loading && 'opacity-60 transition-opacity')} aria-busy={loading || undefined}>
          {!(stacked && showDetail && current) ? (
            <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3 lg:max-w-[460px]">
              <SegmentedControl
                full
                size="sm"
                label="Saring status"
                value={tab}
                onChange={(v) => pickTab(v as ShStatus)}
                options={STATUS_TABS.map((t) => ({ value: t.value, label: `${t.label} (${data.counts?.[t.value] ?? 0})` }))}
              />
              {items.length === 0 ? (
                <Card>
                  <EmptyNote done={tab === 'MENUNGGU'} icon="persetujuan">
                    {tab === 'MENUNGGU' ? 'Tidak ada laporan di sini. Semua sudah ditinjau.' : 'Belum ada laporan dengan status ini.'}
                  </EmptyNote>
                </Card>
              ) : (
                <ul className="flex flex-col gap-2" aria-label="Antrean laporan">
                  {items.map((r) => (
                    <li key={r.id}>
                      <QueueRow r={r} active={!stacked && r.id === currentId} onOpen={() => open(r.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {detailVisible ? (
            <section aria-label="Rincian laporan" className="min-w-0 flex-[999_1_520px]">
              {stacked && current ? (
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Button variant="plain" icon="kiri" onClick={() => setShowDetail(false)}>
                    Antrean · {items.length}
                  </Button>
                  <span className="t-footnote text-ink-2">
                    {items.findIndex((r) => r.id === current.id) + 1} dari {items.length}
                  </span>
                </div>
              ) : null}
              {current ? (
                <ReportDetail key={current.id} r={current} onDecided={afterDecision} onCommented={reload} onStale={reload} />
              ) : (
                <Card>
                  <EmptyNote icon="persetujuan">Pilih laporan di daftar untuk meninjaunya.</EmptyNote>
                </Card>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}

function QueueRow({ r, active, onOpen }: { r: ShReport; active: boolean; onOpen: () => void }) {
  const meta = STATUS_META[r.status] ?? STATUS_META.MENUNGGU
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className={cx(
        'flex w-full flex-col items-start gap-1.5 rounded-[var(--radius-lg)] bg-surface px-4 py-3.5 text-left cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
        active ? 'ring-2 ring-[var(--accent)]' : 'ring-1 ring-[var(--line)] hover:bg-fill-1'
      )}
    >
      <span className="flex w-full flex-wrap items-center gap-2">
        <span className="mk-tag">{r.subholdingName}</span>
        <span className="t-caption text-ink-2">
          {r.ptName} · {formatRelative(r.submittedAt)}
        </span>
        <span className="ml-auto">
          <StatusBadge status={meta.status} size="sm">
            {meta.label}
          </StatusBadge>
        </span>
      </span>
      <span className="flex w-full items-start gap-2">
        <span className="min-w-0 flex-1 t-body-strong text-ink">{r.kegiatan}</span>
        {isHighlighted(r) ? <HighlightBadge /> : null}
      </span>
      <span className="t-footnote text-ink-2">
        {r.reporterName} · {r.reporterTitle} · {r.evidenceCount} bukti
      </span>
    </button>
  )
}


/** Bintang sorotan (ikon set mk belum punya bintang). Dekoratif: selalu bersama kata. */
function StarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="flex-none">
      <path d="M12 2.8l2.84 5.76 6.36.92-4.6 4.49 1.08 6.33L12 17.31l-5.68 2.99 1.08-6.33-4.6-4.49 6.36-.92L12 2.8z" />
    </svg>
  )
}

/** Lencana "Sorotan": warna waspada + bintang + kata. */
function HighlightBadge() {
  return (
    <span className="inline-flex min-h-6 items-center gap-1 rounded-full bg-waspada-soft px-2 t-caption font-semibold text-waspada">
      <StarIcon size={12} />
      Sorotan
    </span>
  )
}

function ReportDetail({
  r,
  onDecided,
  onCommented,
  onStale,
}: {
  r: ShReport
  onDecided: (id: string) => void
  onCommented: () => void
  onStale: () => void
}) {
  const [note, setNote] = useState('')
  const [highlight, setHighlight] = useState(false)
  const [highlightNote, setHighlightNote] = useState('')
  const [busy, setBusy] = useState<DecisionAction | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hlErr, setHlErr] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const hlRef = useRef<HTMLTextAreaElement>(null)
  const isPhone = useIsPhone()
  const reduce = useReducedMotion()
  const meta = STATUS_META[r.status] ?? STATUS_META.MENUNGGU
  const evidenceCount = Math.max(r.evidenceCount ?? 0, r.evidence?.length ?? 0)
  const gate = decisionGate({ status: r.status, note, evidenceCount, busy: busy !== null, highlight, highlightNote })
  const hl = highlightNoteCheck(highlightNote)
  const highlighted = isHighlighted(r)
  const ids = {
    note: `sh-note-${r.id}`,
    noteErr: `sh-note-err-${r.id}`,
    hlSwitch: `sh-hl-${r.id}`,
    hlDesc: `sh-hl-desc-${r.id}`,
    hlNote: `sh-hl-note-${r.id}`,
    hlCount: `sh-hl-count-${r.id}`,
    hlErr: `sh-hl-err-${r.id}`,
    consequence: `sh-approve-hint-${r.id}`,
  }

  function toggleHighlight(on: boolean) {
    setHighlight(on)
    setHlErr(null)
    if (on) requestAnimationFrame(() => hlRef.current?.focus({ preventScroll: true }))
  }

  async function act(action: DecisionAction) {
    if (action === 'revise' && !gate.canRevise) {
      setErr(gate.reviseHint)
      noteRef.current?.focus()
      return
    }
    if (action === 'approve' && !gate.canApprove) {
      if (gate.approveHint) setErr(gate.approveHint)
      else if (gate.highlightHint) {
        setHlErr(gate.highlightHint)
        hlRef.current?.focus()
      }
      return
    }
    if (action === 'comment' && !gate.canComment) {
      setErr('Komentar masih kosong.')
      noteRef.current?.focus()
      return
    }
    setBusy(action)
    setErr(null)
    setHlErr(null)
    const sorot = action === 'approve' && highlight
    const res =
      action === 'comment'
        ? await post(`/api/sh/reports/${encodeURIComponent(r.id)}/comments`, { body: note.trim() })
        : await post(
            `/api/sh/reports/${encodeURIComponent(r.id)}/decision`,
            decisionBody(action, { note, highlight, highlightNote })
          )
    setBusy(null)
    if (!res.ok) {
      const msg = friendlyError(res.status, res.error, action)
      if (res.status === 422 && res.field === 'highlightNote') {
        setHlErr(msg)
        hlRef.current?.focus()
      } else setErr(msg)
      if (shouldReload(res.status)) {
        toast.error(msg)
        onStale()
      }
      return
    }
    setNote('')
    if (action === 'comment') {
      toast.success('Komentar terkirim ke admin subholding.')
      onCommented()
      return
    }
    toast.success(action === 'approve' ? `${sorot ? 'Disetujui & disorot' : 'Disetujui'}: ${r.kegiatan}` : `Perbaikan diminta: ${r.kegiatan}`, {
      description:
        action === 'approve'
          ? sorot
            ? 'Laporan tampil di Sorotan dashboard Superuser & Manajemen.'
            : 'Laporan tampil di dashboard Superuser & Manajemen.'
          : 'Admin subholding menerima komentar Anda.',
    })
    refreshNavBadges()
    onDecided(r.id)
  }

  const reviseBtn = (cls?: string) => (
    <Button variant="destructive" icon={isPhone ? undefined : 'ubah'} size={isPhone ? 'lg' : 'md'} className={cls} onClick={() => void act('revise')} disabled={busy !== null}>
      {busy === 'revise' ? 'Mengirim…' : 'Minta perbaikan'}
    </Button>
  )
  const approveBtn = (cls?: string) => (
    <Button
      variant="primary"
      icon={isPhone ? undefined : 'selesai'}
      size={isPhone ? 'lg' : 'md'}
      className={cls}
      onClick={() => void act('approve')}
      disabled={busy !== null || gate.approveHint !== null}
      aria-describedby={ids.consequence}
    >
      {busy === 'approve' ? 'Menyetujui…' : approveLabel(highlight)}
    </Button>
  )
  const consequence = (cls?: string) => (
    <p id={ids.consequence} className={cx('t-caption text-ink-2', cls)}>
      {approveConsequence(highlight)}
    </p>
  )

  return (
    <Card>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mk-tag is-strong">{r.subholdingName}</span>
          <StatusBadge status={meta.status} size="sm">
            {meta.label}
          </StatusBadge>
          {highlighted ? <HighlightBadge /> : null}
          <span className="t-footnote text-ink-2">
            Dikirim {formatDateTime(r.submittedAt)} oleh akun admin {r.subholdingName}
          </span>
        </div>
        <h2 className="t-title-2 text-ink">{r.kegiatan}</h2>

        {highlighted && r.highlightNote ? (
          <div className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-waspada-soft px-3.5 py-3">
            <span className="inline-flex items-center gap-1.5 t-caption font-semibold text-waspada">
              <StarIcon size={12} />
              Catatan untuk manajemen
            </span>
            <p className="t-body text-ink whitespace-pre-line break-words">{r.highlightNote}</p>
          </div>
        ) : null}

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ['PT pelaksana', r.ptName],
            ['Pelapor', r.reporterName],
            ['Jabatan', r.reporterTitle],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[var(--radius-md)] bg-fill-1 px-3.5 py-3">
              <dt className="t-caption text-ink-2">{k}</dt>
              <dd className="t-body-strong text-ink break-words">{v || '—'}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-1.5">
          <h3 className="t-headline text-ink">Deskripsi</h3>
          <p className="t-body text-ink whitespace-pre-line">{r.deskripsi}</p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="t-headline text-ink">Bukti ({evidenceCount})</h3>
          {r.evidence?.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2.5">
              {r.evidence.map((e, i) => (
                <EvidenceThumb
                  key={e.id}
                  item={{ id: e.id, fileName: e.fileName, mime: e.mime ?? null }}
                  onOpen={() => setLightbox({ items: r.evidence.map((x) => ({ id: x.id, fileName: x.fileName, mime: x.mime ?? null })), index: i, title: r.kegiatan })}
                  label={`Perbesar bukti ${i + 1} dari ${r.evidence.length}: ${e.fileName}`}
                />
              ))}
            </div>
          ) : (
            <p className="mk-note-box mk-soft--risk">Belum ada bukti terlampir.</p>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <h3 className="t-headline text-ink">Percakapan</h3>
          {r.comments?.length ? (
            <ul className="flex flex-col gap-2">
              {r.comments.map((c) => (
                <li key={c.id} className={cx('flex flex-col gap-1 rounded-[var(--radius-md)] px-3.5 py-3', c.mine ? 'bg-info-soft' : 'bg-fill-1')}>
                  <span className="t-caption text-ink-2">
                    {c.mine ? 'Anda' : c.authorName} · {COMMENT_KIND_LABEL[c.kind] ?? 'Komentar'} · {formatDateTime(c.createdAt)}
                  </span>
                  <span className="t-body text-ink whitespace-pre-line">{c.body}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-footnote text-ink-2">Belum ada komentar.</p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-[var(--line)] pt-4">
          {gate.decidable ? (
            <section
              aria-label="Tandai untuk manajemen"
              className="flex flex-col rounded-[var(--radius-lg)] bg-surface-2 px-3.5 py-3 ring-1 ring-[var(--line)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-auto flex-col gap-0.5">
                  <label htmlFor={ids.hlSwitch} className="t-body-strong text-ink cursor-pointer">
                    Tandai untuk manajemen
                  </label>
                  <p id={ids.hlDesc} className="t-caption text-ink-2">
                    Muncul di bagian Sorotan dashboard Manajemen &amp; Superuser
                  </p>
                </div>
                <Switch
                  id={ids.hlSwitch}
                  checked={highlight}
                  onCheckedChange={toggleHighlight}
                  disabled={busy !== null}
                  aria-describedby={ids.hlDesc}
                />
              </div>
              <AnimatePresence initial={false}>
                {highlight ? (
                  <motion.div
                    key="hl-note"
                    initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={reduce ? { duration: 0.15 } : { type: 'spring', bounce: 0, duration: 0.32 }}
                    className="-mx-1 overflow-hidden px-1"
                  >
                    <div className="flex flex-col gap-1.5 pt-3 pb-1">
                      <label htmlFor={ids.hlNote} className="t-footnote font-semibold text-ink">
                        Catatan untuk manajemen <span className="font-normal text-ink-2">(wajib, maks {HIGHLIGHT_NOTE_MAX} karakter)</span>
                      </label>
                      <Textarea
                        id={ids.hlNote}
                        ref={hlRef}
                        rows={3}
                        value={highlightNote}
                        maxLength={1000}
                        required
                        disabled={busy !== null}
                        onChange={(e) => {
                          setHighlightNote(e.target.value)
                          if (hlErr) setHlErr(null)
                        }}
                        placeholder="Mis. Perlu keputusan perbaikan struktur sebelum pengecoran lantai 4."
                        aria-invalid={Boolean(hlErr) || hl.tone === 'over' || undefined}
                        aria-describedby={cx(ids.hlCount, hlErr && ids.hlErr)}
                      />
                      <div className="flex items-start justify-between gap-3">
                        {hlErr ? (
                          <p id={ids.hlErr} role="alert" className="t-footnote font-semibold text-bahaya">
                            {hlErr}
                          </p>
                        ) : (
                          <span className="t-caption text-ink-2">Minimal {HIGHLIGHT_NOTE_MIN_LETTERS} huruf.</span>
                        )}
                        <span
                          id={ids.hlCount}
                          aria-label={`${hl.length} dari ${HIGHLIGHT_NOTE_MAX} karakter`}
                          className={cx(
                            'ml-auto flex-none t-caption tabular-nums',
                            hl.tone === 'over' ? 'font-semibold text-bahaya' : hl.tone === 'near' ? 'text-waspada' : 'text-ink-2'
                          )}
                        >
                          {hl.counter}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>
          ) : null}

          <label htmlFor={ids.note} className="t-body-strong text-ink">
            Komentar untuk admin{' '}
            <span className="t-footnote font-normal text-ink-2">{gate.decidable ? '(wajib bila meminta perbaikan)' : '(opsional)'}</span>
          </label>
          <Textarea
            id={ids.note}
            ref={noteRef}
            rows={isPhone ? 2 : 3}
            value={note}
            maxLength={2000}
            onChange={(e) => {
              setNote(e.target.value)
              if (err) setErr(null)
            }}
            placeholder={gate.decidable ? 'Mis. Tambahkan foto titik rembesan dan nomor segmennya.' : 'Tulis komentar untuk admin subholding'}
            aria-invalid={Boolean(err) || undefined}
            aria-describedby={err ? ids.noteErr : undefined}
          />
          {err ? (
            <p id={ids.noteErr} role="alert" className="t-footnote font-semibold text-bahaya">
              {err}
            </p>
          ) : gate.decidable && gate.approveHint ? (
            <p className="t-footnote text-ink-2">{gate.approveHint}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => void act('comment')} disabled={busy !== null || !note.trim()}>
              {busy === 'comment' ? 'Mengirim…' : 'Kirim komentar saja'}
            </Button>
            {gate.decidable && !isPhone ? (
              <>
                {reviseBtn()}
                {approveBtn()}
              </>
            ) : null}
          </div>
          {gate.decidable && !isPhone ? consequence('text-right') : null}
        </div>

        {r.status !== 'MENUNGGU' ? (
          <p className={cx('mk-note-box', r.status === 'DISETUJUI' ? 'mk-soft--done' : 'mk-soft--risk')}>
            {r.status === 'DISETUJUI'
              ? `Disetujui${r.decidedByName ? ` oleh ${r.decidedByName}` : ''}${r.decidedAt ? ` · ${formatDateTime(r.decidedAt)}` : ''}. ${
                  highlighted ? 'Laporan ini tampil di Sorotan dashboard Superuser & Manajemen.' : 'Laporan ini tampil di dashboard Superuser & Manajemen.'
                }`
              : 'Menunggu admin subholding memperbaiki dan mengirim ulang.'}
          </p>
        ) : null}

        {gate.decidable && isPhone ? (
          /* Ponsel: tombol keputusan menempel di bawah layar, tepat di atas tab bar & area aman. */
          <div
            role="group"
            aria-label="Keputusan"
            className={cx(
              'sticky z-[1] bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))]',
              '-mx-[var(--space-6)] -mb-[var(--space-6)] flex flex-col gap-2 rounded-b-[var(--radius-lg)]',
              // Material tebal: teks di belakang bilah tidak boleh terbaca menembus teks bantu.
              'border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-4 pt-3 pb-4 backdrop-blur-[24px] backdrop-saturate-[1.8]'
            )}
          >
            <div className="flex gap-2">
              {reviseBtn('min-w-0 flex-1 px-3')}
              {approveBtn('min-w-0 flex-1 px-3')}
            </div>
            {consequence('text-center')}
          </div>
        ) : null}
      </div>
      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </Card>
  )
}
