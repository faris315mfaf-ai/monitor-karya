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
 * Data: GET /api/sh/review, POST /api/sh/reports/:id/comments,
 * POST /api/sh/reports/:id/decision.
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import {
  Button, Card, Chip, EmptyNote, ErrorNote, PageHeader, SegmentedControl, Skeleton, StatusBadge, cx, useIsPhone, useIsTablet,
} from '@/components/mk'
import { Textarea } from '@/components/mk/forms'
import { formatDateTime, formatRelative } from '@/lib/format'
import { EvidenceLightbox, EvidenceThumb, type LightboxState } from '../sh-overview/evidence'
import {
  COMMENT_KIND_LABEL, STATUS_META, STATUS_TABS, decisionGate, friendlyError, nextAfterDecision, resolveSelected, shouldReload,
  totalWaiting, type DecisionAction, type ReviewData, type ShReport, type ShStatus,
} from './logic'

const ALL = 'ALL'

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: res.ok, status: res.status, error: json.error }
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
      <span className="t-body-strong text-ink">{r.kegiatan}</span>
      <span className="t-footnote text-ink-2">
        {r.reporterName} · {r.reporterTitle} · {r.evidenceCount} bukti
      </span>
    </button>
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
  const [busy, setBusy] = useState<DecisionAction | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const meta = STATUS_META[r.status] ?? STATUS_META.MENUNGGU
  const evidenceCount = Math.max(r.evidenceCount ?? 0, r.evidence?.length ?? 0)
  const gate = decisionGate({ status: r.status, note, evidenceCount, busy: busy !== null })

  async function act(action: DecisionAction) {
    if (action === 'revise' && !gate.canRevise) {
      setErr(gate.reviseHint)
      noteRef.current?.focus()
      return
    }
    if (action === 'approve' && !gate.canApprove) {
      setErr(gate.approveHint)
      return
    }
    if (action === 'comment' && !gate.canComment) {
      setErr('Komentar masih kosong.')
      noteRef.current?.focus()
      return
    }
    setBusy(action)
    setErr(null)
    const text = note.trim()
    const res =
      action === 'comment'
        ? await post(`/api/sh/reports/${encodeURIComponent(r.id)}/comments`, { body: text })
        : await post(`/api/sh/reports/${encodeURIComponent(r.id)}/decision`, {
            action,
            ...(text ? { note: text } : {}),
          })
    setBusy(null)
    if (!res.ok) {
      const msg = friendlyError(res.status, res.error, action)
      setErr(msg)
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
    toast.success(action === 'approve' ? `Disetujui: ${r.kegiatan}` : `Perbaikan diminta: ${r.kegiatan}`, {
      description: action === 'approve' ? 'Laporan tampil di dashboard Ketua Umum & Manajemen.' : 'Admin subholding menerima komentar Anda.',
    })
    refreshNavBadges()
    onDecided(r.id)
  }

  return (
    <Card>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mk-tag is-strong">{r.subholdingName}</span>
          <StatusBadge status={meta.status} size="sm">
            {meta.label}
          </StatusBadge>
          <span className="t-footnote text-ink-2">
            Dikirim {formatDateTime(r.submittedAt)} oleh akun admin {r.subholdingName}
          </span>
        </div>
        <h2 className="t-title-2 text-ink">{r.kegiatan}</h2>

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
          <label htmlFor={`sh-note-${r.id}`} className="t-body-strong text-ink">
            Komentar untuk admin{' '}
            <span className="t-footnote font-normal text-ink-2">{gate.decidable ? '(wajib bila meminta perbaikan)' : '(opsional)'}</span>
          </label>
          <Textarea
            id={`sh-note-${r.id}`}
            ref={noteRef}
            rows={3}
            value={note}
            maxLength={2000}
            onChange={(e) => {
              setNote(e.target.value)
              if (err) setErr(null)
            }}
            placeholder={gate.decidable ? 'Mis. Tambahkan foto titik rembesan dan nomor segmennya.' : 'Tulis komentar untuk admin subholding'}
            aria-invalid={Boolean(err) || undefined}
            aria-describedby={err ? `sh-note-err-${r.id}` : undefined}
          />
          {err ? (
            <p id={`sh-note-err-${r.id}`} role="alert" className="t-footnote font-semibold text-bahaya">
              {err}
            </p>
          ) : gate.decidable && gate.approveHint ? (
            <p className="t-footnote text-ink-2">{gate.approveHint}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => void act('comment')} disabled={busy !== null || !note.trim()}>
              {busy === 'comment' ? 'Mengirim…' : 'Kirim komentar saja'}
            </Button>
            {gate.decidable ? (
              <>
                <Button variant="destructive" icon="ubah" onClick={() => void act('revise')} disabled={busy !== null}>
                  {busy === 'revise' ? 'Mengirim…' : 'Minta perbaikan'}
                </Button>
                <Button variant="primary" icon="selesai" onClick={() => void act('approve')} disabled={busy !== null || !gate.canApprove}>
                  {busy === 'approve' ? 'Menyetujui…' : 'Setujui'}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {r.status !== 'MENUNGGU' ? (
          <p className={cx('mk-note-box', r.status === 'DISETUJUI' ? 'mk-soft--done' : 'mk-soft--risk')}>
            {r.status === 'DISETUJUI'
              ? `Disetujui${r.decidedByName ? ` oleh ${r.decidedByName}` : ''}${r.decidedAt ? ` · ${formatDateTime(r.decidedAt)}` : ''}. Laporan ini tampil di dashboard Ketua Umum & Manajemen.`
              : 'Menunggu admin subholding memperbaiki dan mengirim ulang.'}
          </p>
        ) : null}
      </div>
      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </Card>
  )
}

