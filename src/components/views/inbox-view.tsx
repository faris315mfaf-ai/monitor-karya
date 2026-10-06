'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import {
  Button, Card, Chip, EmptyNote, ErrorNote, Hero, Icon, PageHeader, ProgressRing, Skeleton, StatTile,
  StatusBadge,
} from '@/components/mk'
import { DailyStatusBadge, WeeklyHeaderBadge } from '@/components/status-badges'
import { formatDateLong, formatDateTime, formatTime } from '@/lib/format'
import { toastWithUndo } from '@/lib/undo-client' // [F2-URUNGKAN]

type DailyRow = {
  projectId: string
  code: string
  name: string
  picName: string | null
  reportId: string | null
  status: string | null
  progressPct: number | null
  evidenceCount: number
  submittedAt: string | null
  submittedBy: string | null
  forwardedAt: string | null
  readyToForward: boolean
}

type WeeklyRow = {
  divisionId: string
  name: string
  headName: string | null
  reportId: string | null
  statusHeader: string | null
  itemCount: number
  submittedAt: string | null
  approvedAt: string | null
  forwardedAt: string | null
  readyToForward: boolean
}

type Data = {
  reportDate: string
  dailyLockAt: string
  dailyCountdown: { hours: number; minutes: number; passed: boolean }
  dailyLocked: boolean
  week: { isoYear: number; isoWeek: number; handoverBy: string; lockAt: string }
  daily: DailyRow[]
  weekly: WeeklyRow[]
}

/** Kerangka memuat seukuran isi asli: header, ringkasan, dua daftar. */
function InboxSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Memuat penerimaan">
      <div>
        <Skeleton h={14} w={220} />
        <div className="h-2.5" />
        <Skeleton h={36} w={260} r={12} />
      </div>
      <div className="mk-hero">
        <div className="mk-hero__text">
          <Skeleton h={22} w={160} r={999} />
          <Skeleton h={36} w="80%" r={12} />
          <Skeleton h={18} w="60%" />
        </div>
        <Skeleton h={150} w={150} r={999} />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="mk-card space-y-3">
          <Skeleton h={20} w={240} />
          {[0, 1, 2].map((j) => (
            <Skeleton key={j} h={48} r={10} />
          ))}
        </div>
      ))}
    </div>
  )
}

type Filter = 'semua' | 'siap' | 'belum'

/**
 * Penerimaan (Admin PT): laporan harian dari PIC proyek dan capaian mingguan
 * dari kepala divisi masuk ke sini, lalu diteruskan ke holding sebelum kunci.
 */
export function InboxView() {
  const { data, loading, error, reload } = useResource<Data>('/api/inbox')
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('semua')

  async function forward(kind: 'daily' | 'weekly', id: string, name: string) {
    setBusy(id)
    try {
      const res = await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        // [F2-URUNGKAN] penerusan bisa diurungkan sebelum holding memakainya.
        toastWithUndo(`${name} diteruskan ke holding.`, json.undoToken, reload)
        reload()
      } else toast.error(json.error || 'Laporan belum diteruskan. Coba lagi.')
    } catch {
      toast.error('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) return <InboxSkeleton />
  if (error || !data) return <ErrorNote message={error ?? 'Data penerimaan belum termuat.'} onRetry={reload} />

  const dailyPending = data.daily.filter((d) => d.readyToForward).length
  const dailyMissing = data.daily.filter((d) => !d.submittedAt).length
  const dailyIn = data.daily.length - dailyMissing
  const dailyPct = data.daily.length ? Math.round((dailyIn / data.daily.length) * 100) : 0
  const weeklyPending = data.weekly.filter((w) => w.readyToForward).length
  const toForward = dailyPending + weeklyPending

  const lockText = data.dailyLocked
    ? `Laporan harian sudah dikunci pukul ${formatTime(data.dailyLockAt)} WIB.`
    : `Kunci harian ${data.dailyCountdown.hours} jam ${data.dailyCountdown.minutes} menit lagi (${formatTime(data.dailyLockAt)} WIB).`

  const answer =
    toForward > 0
      ? `${toForward} laporan siap diteruskan ke holding.`
      : data.daily.length + data.weekly.length === 0
        ? 'Belum ada proyek atau divisi yang melapor ke Anda.'
        : 'Tidak ada laporan yang menunggu diteruskan.'

  const support = [
    dailyMissing ? `${dailyMissing} laporan harian belum masuk.` : data.daily.length ? 'Semua laporan harian sudah masuk.' : null,
    lockText,
  ]
    .filter(Boolean)
    .join(' ')

  const dailyShown = data.daily.filter((d) =>
    filter === 'siap' ? d.readyToForward : filter === 'belum' ? !d.submittedAt : true
  )
  const weeklyShown = data.weekly.filter((w) =>
    filter === 'siap' ? w.readyToForward : filter === 'belum' ? !w.submittedAt : true
  )

  return (
    <div className={loading ? 'space-y-5 opacity-60 pointer-events-none transition-opacity' : 'space-y-5'} aria-busy={loading || undefined}>
      <PageHeader
        context={`${formatDateLong(new Date(data.reportDate))} · M${data.week.isoWeek} ${data.week.isoYear}`}
        title="Penerimaan"
      />

      <Hero
        eyebrow={data.dailyLocked ? 'Laporan harian terkunci' : 'Laporan masuk · hari ini'}
        answer={answer}
        support={support}
        art={
          <ProgressRing
            value={dailyPct}
            size={150}
            status={dailyMissing === 0 ? 'done' : data.dailyLocked ? 'late' : 'accent'}
            sublabel={`${dailyIn} dari ${data.daily.length} masuk`}
            ariaLabel={`${dailyIn} dari ${data.daily.length} laporan harian masuk`}
          />
        }
        kpis={
          <>
            <StatTile label="Siap diteruskan" value={toForward} tone={toForward > 0 ? 'info' : 'done'} />
            <StatTile label="Harian belum masuk" value={dailyMissing} tone={dailyMissing > 0 ? 'risk' : 'done'} />
            <StatTile label="Mingguan disetujui" value={weeklyPending} tone="neutral" />
          </>
        }
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Saring laporan">
        {(
          [
            ['semua', 'Semua', data.daily.length + data.weekly.length],
            ['siap', 'Siap diteruskan', toForward],
            ['belum', 'Belum masuk', dailyMissing + data.weekly.filter((w) => !w.submittedAt).length],
          ] as const
        ).map(([v, label, count]) => (
          <Chip key={v} selected={filter === v} count={count} className="mk-wk-tap" onClick={() => setFilter(v)}>
            {label}
          </Chip>
        ))}
      </div>

      {/* Laporan harian dari PIC proyek */}
      <Card title="Laporan harian dari PIC proyek" subtitle={`Teruskan sebelum pukul ${formatTime(data.dailyLockAt)} WIB`}>
        {data.daily.length === 0 ? (
          <EmptyNote icon="proyek">Tidak ada proyek aktif.</EmptyNote>
        ) : dailyShown.length === 0 ? (
          <EmptyNote done={filter === 'belum'} icon="cari">
            {filter === 'belum' ? 'Semua laporan harian sudah masuk.' : 'Tidak ada laporan harian yang siap diteruskan.'}
          </EmptyNote>
        ) : (
          <ul className="mk-inbox-list">
            {dailyShown.map((d) => (
              <li key={d.projectId} className="mk-inbox-row">
                <div className="mk-inbox-row__main">
                  <div className="mk-inbox-row__title">{d.name}</div>
                  <div className="mk-inbox-row__meta">
                    <span className="mk-inbox-code">{d.code}</span>
                    {d.picName && <span>PIC {d.picName}</span>}
                    {d.submittedAt && <span>dikirim {formatTime(new Date(d.submittedAt))}</span>}
                    <span className={d.evidenceCount > 0 ? 'mk-text--done' : 'mk-text--risk'}>
                      {d.evidenceCount} bukti
                    </span>
                  </div>
                </div>
                <div className="mk-inbox-row__side">
                  {d.status ? <DailyStatusBadge status={d.status} /> : null}
                  {d.forwardedAt ? (
                    <StatusBadge status="done" size="sm">
                      Diteruskan
                    </StatusBadge>
                  ) : d.readyToForward ? (
                    <Button
                      size="sm"
                      icon="kirim"
                      className="mk-wk-tap"
                      disabled={busy === d.reportId}
                      aria-busy={busy === d.reportId || undefined}
                      onClick={() => d.reportId && forward('daily', d.reportId, d.name)}
                    >
                      {busy === d.reportId ? 'Meneruskan…' : 'Teruskan laporan'}
                    </Button>
                  ) : (
                    <StatusBadge status={d.reportId ? 'info' : 'risk'} size="sm">
                      {d.reportId ? 'Draf PIC' : 'Belum masuk'}
                    </StatusBadge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Capaian mingguan dari kepala divisi */}
      <Card
        title="Capaian mingguan dari kepala divisi"
        subtitle={`Diserahkan paling lambat ${formatDateLong(data.week.handoverBy)}, dikunci ${formatDateTime(data.week.lockAt)} WIB`}
      >
        {data.weekly.length === 0 ? (
          <EmptyNote icon="tim">Tidak ada divisi.</EmptyNote>
        ) : weeklyShown.length === 0 ? (
          <EmptyNote done={filter === 'belum'} icon="cari">
            {filter === 'belum' ? 'Semua divisi sudah menyerahkan capaian.' : 'Tidak ada capaian mingguan yang siap diteruskan.'}
          </EmptyNote>
        ) : (
          <ul className="mk-inbox-list">
            {weeklyShown.map((w) => (
              <li key={w.divisionId} className="mk-inbox-row">
                <div className="mk-inbox-row__main">
                  <div className="mk-inbox-row__title">{w.name}</div>
                  <div className="mk-inbox-row__meta">
                    {w.headName && <span>Kadiv {w.headName}</span>}
                    <span>{w.itemCount} item</span>
                    {w.approvedAt && (
                      <span className="mk-text--done inline-flex items-center gap-1">
                        <Icon name="selesai" size={14} /> disetujui
                      </span>
                    )}
                  </div>
                </div>
                <div className="mk-inbox-row__side">
                  {w.statusHeader ? <WeeklyHeaderBadge status={w.statusHeader} /> : null}
                  {w.forwardedAt ? (
                    <StatusBadge status="done" size="sm">
                      Diteruskan
                    </StatusBadge>
                  ) : w.readyToForward ? (
                    <Button
                      size="sm"
                      icon="kirim"
                      className="mk-wk-tap"
                      disabled={busy === w.reportId}
                      aria-busy={busy === w.reportId || undefined}
                      onClick={() => w.reportId && forward('weekly', w.reportId, w.name)}
                    >
                      {busy === w.reportId ? 'Meneruskan…' : 'Teruskan capaian'}
                    </Button>
                  ) : (
                    <StatusBadge status="risk" size="sm">
                      Menunggu kadiv
                    </StatusBadge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
