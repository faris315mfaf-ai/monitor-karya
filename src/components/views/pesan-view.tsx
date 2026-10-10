'use client'

/**
 * Kotak masuk (keputusan pemilik 10 Okt 2026): satu tempat untuk semua peran
 * membaca seluruh pesan — pengingat, keputusan persetujuan, komentar — yang
 * selama ini hanya muncul di lonceng header. Sumber datanya sama dengan lonceng
 * (GET /api/notifications?inbox=1); membuka pesan menandainya dibaca (PATCH)
 * lalu detailnya dibuka di Sheet, tidak pindah halaman.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import { refreshNotes, tabLabel } from '@/components/shell'
import {
  Button, Card, EmptyNote, ErrorNote, Icon, PageHeader, SegmentedControl, Sheet, Skeleton, cx, type IconName,
} from '@/components/mk'
import { NOTIFICATION_TEMPLATE_LABELS, type NavTabId } from '@/lib/constants'
import { canSeeTab } from '@/lib/rbac'
import { formatDateTime, formatRelative } from '@/lib/format'

type Pesan = {
  id: string
  template: string
  title: string
  body: string
  tab: string | null
  createdAt: string
  readAt: string | null
}

type InboxData = { unread: number; items: Pesan[] }

/** Jenis pesan — selalu ikon + kata (07 · Ikon, 09 · Aksesibilitas). */
type PesanKind = 'komentar' | 'persetujuan' | 'pengingat' | 'pemberitahuan'

const KIND_META: Record<PesanKind, { icon: IconName; soft: string; label: string }> = {
  komentar: { icon: 'catatan', soft: 'mk-soft--neutral', label: 'Komentar' },
  persetujuan: { icon: 'persetujuan', soft: 'mk-soft--done', label: 'Persetujuan' },
  pengingat: { icon: 'notifikasi', soft: 'mk-soft--info', label: 'Pengingat' },
  pemberitahuan: { icon: 'info', soft: 'mk-soft--neutral', label: 'Pemberitahuan' },
}

/**
 * Jenis ditebak dari template notifikasi (penulisnya di src/lib/reminders*.ts,
 * reminder-rules.ts, dan API keputusan akses/buka kunci); template tak dikenal
 * ditebak lagi dari judul dan isi.
 */
function kindOf(n: Pesan): PesanKind {
  const t = n.template ?? ''
  if (t === 'REVIEW_OUTPUT' || t.includes('KOMENTAR')) return 'komentar'
  if (t.startsWith('KEPUTUSAN_')) return 'persetujuan'
  if (t.startsWith('PENGINGAT_') || t === 'ESKALASI_KADIV_HARIAN') return 'pengingat'
  const text = `${n.title} ${n.body}`.toLowerCase()
  if (text.includes('komentar')) return 'komentar'
  if (text.includes('persetujuan') || text.includes('disetujui') || text.includes('ditolak')) return 'persetujuan'
  if (text.includes('pengingat') || text.includes('diingatkan')) return 'pengingat'
  return 'pemberitahuan'
}

/** Kerangka memuat seukuran isi asli: header, jawaban, saringan, daftar. */
function PesanSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Memuat pesan">
      <div>
        <Skeleton h={14} w={220} />
        <div className="h-2.5" />
        <Skeleton h={36} w={280} r={12} />
      </div>
      <Skeleton h={26} w="55%" />
      <Skeleton h={40} w={280} r={12} />
      <div className="mk-card space-y-2 p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} h={64} r={12} />
        ))}
      </div>
    </div>
  )
}

type Filter = 'semua' | 'belum'

export function PesanView() {
  const { user, setActiveTab } = useApp()
  const { data, loading, error, reload } = useResource<InboxData>('/api/notifications?inbox=1')
  const [filter, setFilter] = useState<Filter>('semua')
  const [opened, setOpened] = useState<Pesan | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  async function markRead(ids: string[] | 'all') {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids === 'all' ? { all: true } : { ids }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(json.error || 'Pesan belum ditandai dibaca. Coba lagi.')
        return
      }
    } catch {
      toast.error('Tidak dapat menghubungi server.')
      return
    }
    refreshNotes() // lonceng & lencana nav ikut diperbarui
    reload()
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await markRead('all')
    } finally {
      setMarkingAll(false)
    }
  }

  /** Buka detail sekaligus tandai dibaca; tanda baca gagal tidak menutup detail. */
  function openPesan(n: Pesan) {
    setOpened(n)
    if (!n.readAt) void markRead([n.id])
  }

  if (loading && !data) return <PesanSkeleton />
  if (error || !data) return <ErrorNote message={error ?? 'Pesan belum termuat.'} onRetry={reload} />

  const unread = data.unread
  const shown = filter === 'belum' ? data.items.filter((n) => !n.readAt) : data.items
  const answer = unread > 0 ? `${unread} pesan belum dibaca.` : 'Semua pesan sudah dibaca.'
  // Setelah tandai dibaca + muat ulang, ambil versi terbaru pesan yang sedang
  // terbuka supaya status di Sheet ikut berubah seketika.
  const openedFresh = opened ? (data.items.find((i) => i.id === opened.id) ?? opened) : null

  return (
    <div
      className={loading ? 'space-y-5 opacity-60 pointer-events-none transition-opacity' : 'space-y-5'}
      aria-busy={loading || undefined}
    >
      <PageHeader
        context="Pengingat, keputusan, dan komentar untuk Anda"
        title="Kotak masuk"
        tools={
          unread > 0 ? (
            <Button size="sm" icon="selesai" disabled={markingAll} onClick={() => void markAllRead()}>
              {markingAll ? 'Menandai…' : 'Tandai semua dibaca'}
            </Button>
          ) : undefined
        }
      />

      <p className="t-title-3 text-ink">{answer}</p>

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
            {filter === 'belum' ? 'Semua pesan sudah dibaca.' : 'Belum ada pesan.'}
          </EmptyNote>
        ) : (
          <ul className="mk-list">
            {shown.map((n) => {
              const kind = KIND_META[kindOf(n)]
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className="mk-userrow"
                    aria-label={`${kind.label}: ${n.title}, ${formatRelative(n.createdAt)}${n.readAt ? '' : ', belum dibaca'}. Buka detail`}
                    onClick={() => openPesan(n)}
                  >
                    <span className={cx('mk-empty__icon', kind.soft)} aria-hidden>
                      <Icon name={kind.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span className={cx('t-body text-ink truncate', !n.readAt && 'font-semibold')}>{n.title}</span>
                        {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-fill" aria-hidden />}
                      </span>
                      {n.body ? <span className="t-footnote text-ink-2 line-clamp-2">{n.body}</span> : null}
                      <span className="t-caption text-ink-2">
                        {kind.label} · {formatRelative(n.createdAt)}
                      </span>
                    </span>
                    <Icon name="kanan" size={18} className="text-ink-3 shrink-0" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <PesanSheet pesan={openedFresh} onClose={() => setOpened(null)} onOpenTab={(tab) => { setOpened(null); setActiveTab(tab); window.scrollTo({ top: 0 }) }} role={user.role} />
    </div>
  )
}

function PesanSheet({
  pesan,
  onClose,
  onOpenTab,
  role,
}: {
  pesan: Pesan | null
  onClose: () => void
  onOpenTab: (tab: NavTabId) => void
  role: string
}) {
  // Isi tetap tampil selama animasi menutup (pola AuditSheet).
  const [last, setLast] = useState<Pesan | null>(pesan)
  if (pesan && pesan !== last) setLast(pesan)
  const n = pesan ?? last

  const kind = n ? KIND_META[kindOf(n)] : null
  const templateLabel = n ? (NOTIFICATION_TEMPLATE_LABELS[n.template] ?? null) : null
  const tab = n?.tab && canSeeTab(role, n.tab as NavTabId) ? (n.tab as NavTabId) : null

  return (
    <Sheet
      open={!!pesan}
      onOpenChange={(o) => !o && onClose()}
      backLabel="Kotak masuk"
      eyebrow={templateLabel ?? kind?.label ?? undefined}
      title={n?.title ?? ''}
      subtitle={n ? formatDateTime(n.createdAt) : undefined}
      footer={
        tab ? (
          <Button variant="primary" icon="kanan" full onClick={() => onOpenTab(tab)}>
            Buka {tabLabel(role, tab).toLowerCase()}
          </Button>
        ) : undefined
      }
    >
      {n ? (
        <div className="flex flex-col gap-5">
          <section className="mk-adm-sec">
            <h3 className="t-headline">Pesan</h3>
            {n.body ? (
              <p className="mk-inset t-body text-ink">{n.body}</p>
            ) : (
              <p className="t-footnote text-ink-2">Pesan ini tidak memuat isi tambahan.</p>
            )}
          </section>
          <section className="mk-adm-sec">
            <h3 className="t-headline">Waktu</h3>
            <div className="mk-inset flex flex-col gap-1">
              <span className="t-footnote text-ink">{formatDateTime(n.createdAt)} WIB</span>
              <span className="t-caption text-ink-2">Diterima {formatRelative(n.createdAt).toLowerCase()}</span>
            </div>
          </section>
          <section className="mk-adm-sec">
            <h3 className="t-headline">Status</h3>
            <div className="mk-inset flex items-center gap-2">
              <span
                className={cx('h-2 w-2 rounded-full', n.readAt ? 'bg-ink-3' : 'bg-accent-fill')}
                aria-hidden
              />
              <span className="t-footnote text-ink">{n.readAt ? 'Sudah dibaca' : 'Belum dibaca'}</span>
            </div>
          </section>
        </div>
      ) : null}
    </Sheet>
  )
}
