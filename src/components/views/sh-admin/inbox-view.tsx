'use client'

/**
 * Kotak masuk Admin subholding (tab `sh-inbox`): tanggapan supervisor (perlu
 * perbaikan / disetujui / komentar) dan pengingat PT yang belum melapor.
 * Membuka pesan → tandai dibaca + percakapan di Sheet; balas lewat
 * POST /api/sh/reports/:id/comments. "Perbaiki laporan" membuka Dashboard
 * dalam mode ubah.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import { refreshNotes } from '@/components/shell'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import {
  Button,
  Card,
  EmptyNote,
  ErrorNote,
  Icon,
  PageHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  StatusBadge,
  Textarea,
  cx,
} from '@/components/mk'
import type { NavTabId } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/lib/format'
import {
  INBOX_KIND_META,
  SH_STATUS_META,
  callJson,
  inboxEntries,
  loadReportDetail,
  requestShEdit,
  type InboxEntry,
} from './logic'
import type { ShComment, ShInbox, ShReport } from './types'

type Filter = 'semua' | 'belum'

export function ShInboxView() {
  const { setActiveTab } = useApp()
  const { data, loading, error, reload } = useResource<ShInbox>('/api/sh/inbox')
  const [filter, setFilter] = useState<Filter>('semua')
  const [opened, setOpened] = useState<InboxEntry | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  // Tanda baca lokal agar titik "belum dibaca" hilang seketika.
  const [readLocal, setReadLocal] = useState<Set<string>>(new Set())

  async function markRead(body: { ids: string[] } | { all: true }) {
    const res = await callJson(fetch, '/api/sh/inbox/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      toast.error(res.error || 'Pesan belum ditandai dibaca.')
      return false
    }
    refreshNotes()
    refreshNavBadges()
    return true
  }

  async function markAll() {
    setMarkingAll(true)
    const ok = await markRead({ all: true })
    setMarkingAll(false)
    if (ok) reload()
  }

  function open(e: InboxEntry) {
    setOpened(e)
    if (e.type === 'pesan' && e.unread && !readLocal.has(e.item.id)) {
      setReadLocal((s) => new Set(s).add(e.item.id))
      void markRead({ ids: [e.item.id] })
    }
  }

  function goFix(reportId: string, report: ShReport | null) {
    requestShEdit(reportId, report)
    setOpened(null)
    setActiveTab('sh-dashboard' as NavTabId)
    window.scrollTo({ top: 0 })
  }

  if (loading && !data) return <InboxSkeleton />
  if (error || !data) return <ErrorNote message={error ?? 'Kotak masuk belum termuat.'} onRetry={reload} />

  const entries = inboxEntries(data).map((e) =>
    e.type === 'pesan' && readLocal.has(e.item.id) ? { ...e, unread: false } : e
  )
  const unread = entries.filter((e) => e.unread).length
  const shown = filter === 'belum' ? entries.filter((e) => e.unread) : entries

  return (
    <div className="space-y-5">
      <PageHeader
        context="Tanggapan supervisor dan pengingat untuk subholding Anda"
        title="Kotak masuk"
        tools={
          unread > 0 ? (
            <Button size="sm" icon="selesai" disabled={markingAll} onClick={() => void markAll()}>
              {markingAll ? 'Menandai…' : 'Tandai semua dibaca'}
            </Button>
          ) : undefined
        }
      />
      <p className="t-title-3 text-ink">{unread > 0 ? `${unread} pesan belum dibaca.` : 'Semua pesan sudah dibaca.'}</p>

      <div className="mk-toolbar">
        <SegmentedControl
          size="sm"
          label="Saring pesan"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: 'semua', label: 'Semua' },
            { value: 'belum', label: 'Belum dibaca' },
          ]}
        />
      </div>

      <Card ariaLabel="Daftar pesan">
        {shown.length === 0 ? (
          <EmptyNote done={filter === 'belum'} icon="notifikasi">
            {filter === 'belum' ? 'Semua pesan sudah dibaca.' : 'Belum ada pesan dari supervisor.'}
          </EmptyNote>
        ) : (
          <ul className="mk-list">
            {shown.map((e) => {
              const meta = INBOX_KIND_META[e.kind] ?? INBOX_KIND_META.KOMENTAR
              const title = e.type === 'pesan' ? e.item.report.kegiatan : 'Pengingat laporan'
              const body = e.type === 'pesan' ? e.item.body : e.reminder.text
              const sub = e.type === 'pesan' ? `${e.item.report.ptName} · ${e.item.authorName}` : null
              return (
                <li key={e.key}>
                  <button
                    type="button"
                    className="mk-userrow"
                    aria-label={`${meta.label}: ${title}, ${formatRelative(e.createdAt)}${e.unread ? ', belum dibaca' : ''}. Buka`}
                    onClick={() => open(e)}
                  >
                    <span className="min-w-0 flex-1 flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge size="sm" status={meta.status}>
                          {meta.label}
                        </StatusBadge>
                        <span className="t-caption text-ink-2">{formatRelative(e.createdAt)}</span>
                        {e.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-accent-fill" aria-hidden /> : null}
                      </span>
                      <span className={cx('t-body text-ink truncate', e.unread && 'font-semibold')}>{title}</span>
                      {body ? <span className="t-footnote text-ink-2 line-clamp-2">{body}</span> : null}
                      {sub ? <span className="t-caption text-ink-2">{sub}</span> : null}
                    </span>
                    <Icon name="kanan" size={18} className="text-ink-3 shrink-0" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <MessageSheet
        entry={opened}
        onClose={() => setOpened(null)}
        onFix={goFix}
        onAddReport={() => {
          setOpened(null)
          setActiveTab('sh-dashboard' as NavTabId)
          window.scrollTo({ top: 0 })
        }}
        onReplied={reload}
      />
    </div>
  )
}

function MessageSheet({
  entry,
  onClose,
  onFix,
  onAddReport,
  onReplied,
}: {
  entry: InboxEntry | null
  onClose: () => void
  onFix: (reportId: string, report: ShReport | null) => void
  onAddReport: () => void
  onReplied: () => void
}) {
  const [last, setLast] = useState<InboxEntry | null>(entry)
  if (entry && entry !== last) setLast(entry)
  const e = entry ?? last

  const reportId = e?.type === 'pesan' ? e.item.report.id : null
  const hint = e?.type === 'pesan' ? { kegiatan: e.item.report.kegiatan, submittedAt: e.item.report.submittedAt } : undefined
  const [detail, setDetail] = useState<{ id: string; report: ShReport | null } | null>(null)
  const [nonce, setNonce] = useState(0)
  const [reply, setReply] = useState('')
  const [replyFor, setReplyFor] = useState<string | null>(reportId)
  const [sending, setSending] = useState(false)
  if (reportId !== replyFor) {
    setReplyFor(reportId)
    setReply('')
  }

  // Muat rincian (percakapan) saat laporan yang dibuka berganti atau setelah membalas.
  const isOpen = !!entry
  useEffect(() => {
    if (!isOpen || !reportId) return
    let cancelled = false
    void loadReportDetail(fetch, reportId, hint).then((r) => {
      if (!cancelled) setDetail({ id: reportId, report: r })
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, reportId, nonce])
  const loadingDetail = !!reportId && detail?.id !== reportId

  async function send() {
    const body = reply.trim()
    if (!reportId || !body) return
    setSending(true)
    const res = await callJson(fetch, `/api/sh/reports/${encodeURIComponent(reportId)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    setSending(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setReply('')
    toast.success('Balasan terkirim.')
    setNonce((n) => n + 1)
    onReplied()
  }

  const meta = e ? INBOX_KIND_META[e.kind] ?? INBOX_KIND_META.KOMENTAR : null
  const rep = e?.type === 'pesan' ? e.item.report : null
  const full = detail?.id === reportId ? detail?.report ?? null : null
  const status = full?.status ?? rep?.status ?? null
  const thread: ShComment[] =
    full?.comments ??
    (e?.type === 'pesan'
      ? [{ id: e.item.id, kind: e.item.kind, body: e.item.body, authorName: e.item.authorName, authorRole: 'SUPERVISOR', createdAt: e.item.createdAt, mine: false }]
      : [])
  const isFix = status === 'PERLU_PERBAIKAN'

  return (
    <Sheet
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      backLabel="Kotak masuk"
      size="wide"
      eyebrow={meta?.label}
      title={rep ? rep.kegiatan : 'Pengingat laporan'}
      subtitle={e ? formatDateTime(e.createdAt) + ' WIB' : undefined}
      footer={
        rep ? (
          isFix ? (
            <Button variant="primary" icon="ubah" full onClick={() => rep && onFix(rep.id, full)}>
              Perbaiki laporan
            </Button>
          ) : undefined
        ) : (
          <Button variant="primary" icon="tambah" full onClick={onAddReport}>
            Tambah laporan
          </Button>
        )
      }
    >
      {e && e.type === 'pengingat' ? (
        <p className="mk-inset t-body text-ink">{e.reminder.text}</p>
      ) : null}

      {e && rep ? (
        <div className="flex flex-col gap-5">
          <section className="mk-inset grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info label="Status">
              {status ? (
                <StatusBadge size="sm" status={SH_STATUS_META[status].status}>
                  {SH_STATUS_META[status].label}
                </StatusBadge>
              ) : (
                '-'
              )}
            </Info>
            <Info label="PT pelaksana">{rep.ptName}</Info>
            <Info label="Pelapor">
              {rep.reporterName} · {rep.reporterTitle}
            </Info>
            <Info label="Dikirim">{rep.submittedAt ? formatDateTime(rep.submittedAt) : '-'}</Info>
            <Info label="Bukti">{(full?.evidenceCount ?? rep.evidenceCount) + ' berkas'}</Info>
          </section>

          {full?.deskripsi ? (
            <section className="flex flex-col gap-2">
              <h3 className="t-headline text-ink">Deskripsi</h3>
              <p className="t-body text-ink-2 whitespace-pre-line">{full.deskripsi}</p>
            </section>
          ) : null}

          <section className="flex flex-col gap-3" aria-live="polite">
            <h3 className="t-headline text-ink">Percakapan</h3>
            {loadingDetail ? <Skeleton h={64} r={12} /> : null}
            <div className="mk-thread">
              {thread.map((c) => (
                <div key={c.id} className={cx('mk-thread__item', c.mine && 'is-mine')}>
                  <span className="mk-thread__meta">
                    {c.mine ? 'Anda' : c.authorName} · {formatDateTime(c.createdAt)}
                    {c.kind === 'PERBAIKAN' ? ' · minta perbaikan' : c.kind === 'SETUJU' ? ' · menyetujui' : ''}
                  </span>
                  <span className="t-body text-ink whitespace-pre-line">{c.body}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <label htmlFor="sh-balas" className="mk-field__label">
              Balas supervisor
            </label>
            <Textarea
              id="sh-balas"
              rows={3}
              maxLength={2000}
              value={reply}
              placeholder="Tulis tanggapan atau penjelasan"
              onChange={(ev) => setReply(ev.target.value)}
            />
            <div className="flex justify-end">
              <Button icon="kirim" disabled={sending || !reply.trim()} onClick={() => void send()}>
                {sending ? 'Mengirim…' : 'Kirim balasan'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </Sheet>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="t-caption text-ink-2">{label}</span>
      <span className="t-footnote text-ink">{children}</span>
    </div>
  )
}

function InboxSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Memuat kotak masuk">
      <div>
        <Skeleton h={14} w={260} />
        <div className="h-2.5" />
        <Skeleton h={36} w={240} r={12} />
      </div>
      <Skeleton h={26} w="45%" />
      <div className="mk-card space-y-2 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} h={72} r={12} />
        ))}
      </div>
    </div>
  )
}
