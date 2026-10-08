'use client'

/**
 * Kartu layar PIC proyek yang membaca GET /api/project-progress
 * (05-pic-proyek.md) [F2-PIC]: "Progres dibanding rencana" (AreaChart per
 * minggu, klik minggu → kalimat), "Tenggat terdekat", dan "Riwayat laporan"
 * 6 hari kerja. Juga `useIsCompact` untuk tata letak tablet/ponsel.
 */

import { useState, useSyncExternalStore } from 'react'
import { AreaChart, Card, DateBox, EmptyNote, ErrorNote, Skeleton, StatusBadge, type Status } from '@/components/mk'
import { DailyStatusBadge } from '@/components/status-badges'
import { formatTime } from '@/lib/format'
import type { HistoryDay, useProjectProgress } from './api'

type ProgressRes = ReturnType<typeof useProjectProgress>

const compactQuery = '(max-width: 1023px)'
function subscribeCompact(cb: () => void) {
  const mq = window.matchMedia(compactQuery)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
/** True di tablet dan ponsel (<1024px), tempat layar PIC dipecah per tab. Server: false. */
export function useIsCompact() {
  return useSyncExternalStore(subscribeCompact, () => window.matchMedia(compactQuery).matches, () => false)
}

function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={44} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Progres dibanding rencana                                           */
/* ------------------------------------------------------------------ */

export function ProgressPlanCard({ res, className }: { res: ProgressRes; className?: string }) {
  const { data, loading, error, reload } = res
  const weeks = data?.plan.weeks ?? []
  const [picked, setPicked] = useState<number | null>(null)
  const sel = weeks.length ? Math.min(picked ?? weeks.length - 1, weeks.length - 1) : -1
  const w = sel >= 0 ? weeks[sel] : null
  const hasPlan = data?.plan.source !== 'NONE' && weeks.every((x) => x.plan !== null)
  const anyReport = weeks.some((x) => x.reported)

  const subtitle =
    data?.plan.source === 'STAGES'
      ? 'Rencana dari tahapan proyek · pilih minggu untuk detail'
      : data?.plan.source === 'LINEAR'
        ? 'Rencana linear dari mulai ke tenggat · pilih minggu untuk detail'
        : 'Progres laporan per minggu'

  let caption: string | null = null
  if (w) {
    if (!w.reported) caption = `${w.label}: belum ada laporan terkirim${hasPlan ? `; rencana ${w.plan}%` : ''}.`
    else if (hasPlan && w.plan !== null) {
      const gap = w.plan - w.actual
      caption = `${w.label}: ${w.actual}% dari rencana ${w.plan}%${gap > 0 ? ` · kurang ${gap} poin` : gap < 0 ? ` · lebih ${-gap} poin` : ' · tepat rencana'}.`
    } else caption = `${w.label}: ${w.actual}%.`
  }

  return (
    <Card className={className} title="Progres dibanding rencana" subtitle={subtitle}>
      {loading && !data ? (
        <Skeleton h={200} />
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !anyReport && !hasPlan ? (
        <EmptyNote icon="laporan">Belum ada laporan atau rencana untuk digambar. Susun tahapan bertanggal agar rencana mingguan muncul.</EmptyNote>
      ) : (
        <>
          <AreaChart
            data={weeks.map((x) => ({ label: x.label, value: x.actual }))}
            compare={hasPlan ? weeks.map((x) => x.plan as number) : undefined}
            compareLabel={hasPlan ? 'Rencana' : undefined}
            seriesLabel="Aktual"
            unit="%"
            height={200}
            selectedIndex={sel}
            onSelect={setPicked}
          />
          {caption ? (
            <p className="t-callout text-ink mt-3" aria-live="polite">
              {caption}
            </p>
          ) : null}
        </>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Tenggat terdekat                                                    */
/* ------------------------------------------------------------------ */

export function DeadlinesCard({ res, className }: { res: ProgressRes; className?: string }) {
  const { data, loading, error, reload } = res
  const items = data?.deadlines ?? []
  return (
    <Card className={className} title="Tenggat terdekat" subtitle={items.length ? 'Dari tahapan, output, dan tenggat proyek' : undefined}>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyNote icon="kalender">Belum ada tenggat. Tetapkan tanggal di tahapan atau output.</EmptyNote>
      ) : (
        <ul className="mk-list mk-pic-list">
          {items.map((it) => (
            <li key={it.id} className="mk-listrow">
              <DateBox date={it.date} />
              <div className="min-w-0 flex-1">
                <div className="t-body-strong truncate">{it.title}</div>
                {it.note ? <div className="t-footnote text-ink-2 truncate">{it.note}</div> : null}
              </div>
              <StatusBadge status={it.state as Status} size="sm">
                {it.badge}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Riwayat laporan 6 hari kerja                                        */
/* ------------------------------------------------------------------ */

const HISTORY_META: Record<HistoryDay['state'], { status: Status; text: (h: HistoryDay) => string }> = {
  FORWARDED: { status: 'done', text: () => 'Diteruskan ke holding' },
  SENT: { status: 'done', text: (h) => (h.submittedAt ? `Terkirim ${formatTime(h.submittedAt)}` : 'Terkirim') },
  LATE: { status: 'risk', text: () => 'Terlambat masuk' },
  MISSING: { status: 'late', text: () => 'Tidak dikirim' },
  PENDING: { status: 'neutral', text: () => 'Belum dikirim' },
  DRAFT: { status: 'risk', text: () => 'Draf belum dikirim' },
}

export function ReportHistoryCard({ res, className }: { res: ProgressRes; className?: string }) {
  const { data, loading, error, reload } = res
  const days = [...(data?.history ?? [])].reverse()
  const past = days.filter((h) => h.state !== 'PENDING' && h.state !== 'DRAFT')
  const onTime = past.filter((h) => h.state === 'SENT' || h.state === 'FORWARDED').length
  return (
    <Card
      className={className}
      title="Riwayat laporan"
      subtitle={data ? `${days.length} hari kerja terakhir · ${onTime} dari ${past.length} tepat waktu` : undefined}
    >
      {loading && !data ? (
        <Loading rows={4} />
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : days.length === 0 ? (
        <EmptyNote>Belum ada riwayat.</EmptyNote>
      ) : (
        <ul className="mk-list mk-pic-list">
          {days.map((h) => {
            const m = HISTORY_META[h.state]
            return (
              <li key={h.date} className="mk-listrow">
                <DateBox date={`${h.date}T00:00:00+07:00`} />
                <div className="min-w-0 flex-1">
                  <div className="t-body-strong">{h.progressPct !== null ? `${h.progressPct}%` : 'Tanpa laporan'}</div>
                  {h.status ? (
                    <div className="t-footnote text-ink-2">
                      <DailyStatusBadge status={h.status} size="xs" />
                    </div>
                  ) : null}
                </div>
                <StatusBadge status={m.status} size="sm">
                  {m.text(h)}
                </StatusBadge>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
