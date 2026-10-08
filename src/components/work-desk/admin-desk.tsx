'use client'

/**
 * Meja kerja Admin PT — keputusan pemilik 9 Okt 2026: pemroses seluruh laporan
 * masuk. Dua seksi akordeon yang terbuka otomatis: "Laporan proyek" (harian PIC)
 * dan "Laporan divisi" (capaian mingguan kepala divisi). Baris pelapor dibuka di
 * Sheet rincian: laporan proyek memuat identitas, status/progres, capaian hari
 * itu, kendala & tindak lanjut, dan galeri bukti (grid foto + baris berkas);
 * laporan divisi memuat identitas, status, dan ringkasan butir. Murni memeriksa —
 * tanpa aksi tulis; penerusan tetap lewat tombol di Ringkasan. UI sama di ponsel
 * maupun PC: satu kolom daftar, detail selalu di Sheet.
 *
 * Daftar pelapor dari /api/work-desk (kind ADMIN). Kendala/tindak lanjut baru
 * diambil saat sheet dibuka dari /api/daily-reports?projectId=…&dateFrom=&dateTo=,
 * dan bukti dari /api/evidence?targetType=DAILY_REPORT&targetId=… — foto unggahan
 * meminta URL bertanda tangan per berkas dari /api/evidence/<id> (berlaku singkat).
 */

import { useEffect, useState } from 'react'
import {
  EmptyNote, ErrorNote, Hero, Icon, IconButton, ProgressBar, Sheet, Skeleton, StatusBadge, cx,
} from '@/components/mk'
import { DailyStatusBadge, WeeklyHeaderBadge, dailyStatus } from '@/components/status-badges'
import { DashHeader } from '@/components/views/dash-common'
import type { EvidenceItem } from '@/components/evidence-panel'
import { useResource } from '@/hooks/use-resource'
import { formatDateLong, formatDateShort, formatDateTime, formatTime } from '@/lib/format'

type AdminProject = {
  id: string
  code: string
  name: string
  phase: string
  pic: { id: string; name: string } | null
  picName: string | null
  tasks: { total: number; done: number }
  report: {
    id: string
    status: string
    progressPct: number
    evidenceCount: number
    submittedAt: string | null
    submittedBy: string | null
    forwardedAt: string | null
    isLate: boolean
    needsEscalation: boolean
    achievement: string
  } | null
  remindedAt: string | null
}

export type AdminDesk = {
  kind: 'ADMIN'
  entity: { id: string; name: string; code: string; region: string | null }
  today: string
  lockAt: string
  locked: boolean
  countdown: { hours: number; minutes: number; totalMs: number; passed: boolean }
  cutoffLabel: string
  week: { isoYear: number; isoWeek: number; handoverBy: string; lockAt: string; locked: boolean }
  /** Ringkasan dari src/lib/daily-intake.ts — sama dengan angka di Ringkasan Admin. */
  intake?: { projects: number; received: number; awaitingForward: number; missing: number }
  canForward: boolean
  canRemind: boolean
  projects: AdminProject[]
  divisions: {
    id: string
    name: string
    head: { id: string; name: string } | null
    report: {
      id: string
      statusHeader: string
      submittedAt: string | null
      approvedAt: string | null
      forwardedAt: string | null
      items: number
      done: number
      blocked: number
      missingEvidence: number
    } | null
  }[]
  approvals: { id: string; name: string; description: string | null; proposer: string; proposedAt: string; slot: string | null }[]
  escalations: { id: string; summary: string; status: string; needed: string; raisedAt: string; raisedBy: string | null; ageDays: number; overdue: boolean }[]
  unlocks: { id: string; targetType: string; reason: string; status: string; createdAt: string }[]
  lateThisMonth: number
  history: { date: string; submitted: number; onTime: number; forwarded: number }[]
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
/** Pelapor terbaru di atas: meja penerimaan membaca dari yang baru masuk. */
const newestFirst = (a: string | null | undefined, b: string | null | undefined) =>
  (Date.parse(b ?? '') || 0) - (Date.parse(a ?? '') || 0)

type OpenRow =
  | { kind: 'daily'; project: AdminProject }
  | { kind: 'weekly'; division: AdminDesk['divisions'][number] }

/** Lencana ringkas baris pelapor: baru masuk, atau sudah diteruskan ke Direksi. */
function ForwardBadge({ forwardedAt }: { forwardedAt: string | null }) {
  return (
    <StatusBadge status={forwardedAt ? 'done' : 'info'} size="sm">
      {forwardedAt ? 'Sudah diteruskan' : 'Baru'}
    </StatusBadge>
  )
}

/** Seksi akordeon pada Card: kepala kartu adalah tombolnya, terbuka otomatis. */
function Disclosure({
  id,
  title,
  sub,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  sub: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="mk-card" aria-label={title}>
      <button
        type="button"
        className="mk-card__head mk-wk-tap w-full cursor-pointer border-0 bg-transparent p-0 text-left text-ink"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span className="mk-card__titles">
          <span className="mk-card__title">{title}</span>
          <span className="mk-card__sub">{sub}</span>
        </span>
        <Icon
          name="bawah"
          size={20}
          className={cx('mt-1 shrink-0 text-ink-2 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
        />
      </button>
      <div id={id} className={open ? undefined : 'hidden'}>
        {children}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Galeri bukti (baca saja)                                            */
/* ------------------------------------------------------------------ */

/** Foto unggahan: URL bertanda tangan diminta saat tampil, klik membuka tab baru. */
function EvidencePhoto({ item }: { item: EvidenceItem }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/evidence/${item.id}`)
      .then((r) => r.json())
      .then((j: { url?: string }) => {
        if (cancelled) return
        if (j?.url) setSrc(j.url)
        else setFailed(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [item.id])

  return (
    <a href={src ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`Buka foto ${item.fileName}`} className="mk-lap-thumb">
      {src && !failed ? (
        <img src={src} alt={item.fileName} loading="lazy" onError={() => setFailed(true)} />
      ) : failed ? (
        <span className="mk-lap-thumb__ph">
          <Icon name="dokumen" size={24} />
        </span>
      ) : (
        <Skeleton h="100%" r={0} />
      )}
      <span className="mk-lap-thumb__name">{item.fileName}</span>
    </a>
  )
}

/** Berkas/tautan non-gambar: satu baris, tombol membuka URL penuh di tab baru. */
function EvidenceFile({ item }: { item: EvidenceItem }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function open() {
    // Tautan luar disimpan lengkap di barisnya; berkas unggahan minta URL bertanda.
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
      return
    }
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/evidence/${item.id}`)
      const json = (await res.json().catch(() => ({}))) as { url?: string }
      if (!res.ok || !json.url) {
        setFailed(true)
        return
      }
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="mk-lap-file">
      <Icon name={item.url ? 'alur' : 'dokumen'} size={18} className="text-ink-3 shrink-0" />
      <span className="mk-lap-file__name" title={item.fileName}>
        {item.fileName}
      </span>
      {failed ? <span className="t-caption mk-text--late">Belum bisa dibuka</span> : null}
      <IconButton icon={item.url ? 'kanan' : 'unduh'} label={`Buka ${item.fileName}`} disabled={busy} onClick={() => void open()} />
    </li>
  )
}

/** Galeri bukti satu laporan harian — dimuat hanya saat sheet terbuka. */
function EvidenceGallery({ targetId }: { targetId: string }) {
  const { data, loading, error, reload } = useResource<{ items: EvidenceItem[] }>(
    `/api/evidence?targetType=DAILY_REPORT&targetId=${encodeURIComponent(targetId)}`
  )

  if (loading) {
    return (
      <div className="mk-lap-thumbs" aria-busy="true" aria-label="Memuat bukti">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mk-lap-thumb">
            <Skeleton h="100%" r={0} />
          </div>
        ))}
      </div>
    )
  }
  if (error) return <ErrorNote message={error} onRetry={reload} />

  const items = data?.items ?? []
  if (items.length === 0) return <EmptyNote icon="dokumen">Tidak ada bukti terlampir pada laporan ini.</EmptyNote>

  const photos = items.filter((e) => !e.url && (e.mime ?? '').startsWith('image/'))
  const files = items.filter((e) => e.url || !(e.mime ?? '').startsWith('image/'))
  return (
    <>
      {photos.length > 0 ? (
        <div className="mk-lap-thumbs">
          {photos.map((e) => (
            <EvidencePhoto key={e.id} item={e} />
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <ul className="mk-list" aria-label="Berkas dan tautan bukti">
          {files.map((e) => (
            <EvidenceFile key={e.id} item={e} />
          ))}
        </ul>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Sheet rincian laporan proyek                                        */
/* ------------------------------------------------------------------ */

type DailyDetailItem = {
  id: string
  obstacle: string | null
  followUp: string | null
  followUpTargetDate: string | null
}

function DailyReportBody({ project, today }: { project: AdminProject; today: string }) {
  const r = project.report
  // Kendala & tindak lanjut tidak dibawa /api/work-desk — diambil untuk hari ini saja.
  const detail = useResource<{ items: DailyDetailItem[] }>(
    `/api/daily-reports?projectId=${encodeURIComponent(project.id)}&dateFrom=${encodeURIComponent(today)}&dateTo=${encodeURIComponent(today)}`
  )
  if (!r) return null

  const item = detail.data?.items.find((x) => x.id === r.id) ?? null
  return (
    <>
      <div className="mk-kv" aria-label="Identitas laporan">
        <div className="min-w-0">
          <div className="t-footnote text-ink-2">Proyek</div>
          <div className="t-body-strong truncate">{project.name}</div>
        </div>
        <div>
          <div className="t-footnote text-ink-2">PIC</div>
          <div className="t-body-strong truncate">{project.picName ?? 'Belum ada PIC'}</div>
        </div>
        <div>
          <div className="t-footnote text-ink-2">Pengirim</div>
          <div className="t-body-strong truncate">{r.submittedBy ?? project.picName ?? 'PIC'}</div>
        </div>
        <div>
          <div className="t-footnote text-ink-2">Dikirim</div>
          <div className="t-body-strong tabular-nums">pukul {formatTime(r.submittedAt)} WIB</div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="t-headline">Status &amp; progres</h3>
          <span className="flex flex-wrap items-center gap-2">
            <DailyStatusBadge status={r.status} />
            {r.isLate ? (
              <StatusBadge status="late" size="sm">
                Terlambat masuk
              </StatusBadge>
            ) : null}
            {r.needsEscalation ? (
              <StatusBadge status="risk" size="sm">
                Perlu eskalasi
              </StatusBadge>
            ) : null}
          </span>
        </div>
        <ProgressBar value={r.progressPct} status={dailyStatus(r.status)} label={`Progres ${project.name}`} />
      </div>

      <div>
        <h3 className="t-headline mb-2">Capaian hari ini</h3>
        <p className={cx('mk-note-box', 'bg-fill-1')}>{r.achievement || 'PIC belum menuliskan capaian.'}</p>
      </div>

      <div>
        <h3 className="t-headline mb-2">Kendala &amp; tindak lanjut</h3>
        {detail.loading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat kendala dan tindak lanjut">
            <Skeleton h={44} r={10} />
            <Skeleton h={44} r={10} />
          </div>
        ) : detail.error ? (
          <ErrorNote message={detail.error} onRetry={detail.reload} />
        ) : (
          <>
            <p className={item?.obstacle ? 'mk-note-box mk-soft--risk' : 't-body text-ink-2'}>
              {item?.obstacle || 'Tidak ada kendala yang dilaporkan.'}
            </p>
            {item?.followUp ? (
              <p className="mk-inset t-body mt-3">
                {item.followUp}
                {item.followUpTargetDate ? (
                  <span className="text-ink-2"> · target {formatDateShort(item.followUpTargetDate)}</span>
                ) : null}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="t-headline">Bukti pendukung</h3>
          <span className="t-footnote text-ink-2 tabular-nums">{r.evidenceCount} berkas</span>
        </div>
        <EvidenceGallery targetId={r.id} />
      </div>
    </>
  )
}

function DailyReportSheet({
  row,
  today,
  open,
  onClose,
}: {
  row: AdminProject | null
  today: string
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={row?.name ?? ''}
      subtitle={row ? `${row.code} · PIC ${row.picName ?? 'belum ditetapkan'}` : undefined}
      eyebrow={
        row?.report ? (
          <span className="flex flex-wrap items-center gap-2">
            <DailyStatusBadge status={row.report.status} />
            <ForwardBadge forwardedAt={row.report.forwardedAt} />
          </span>
        ) : undefined
      }
      backLabel="Meja kerja"
    >
      {row && row.report ? <DailyReportBody key={`${row.id}:${row.report.id}`} project={row} today={today} /> : null}
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Sheet rincian laporan divisi                                        */
/* ------------------------------------------------------------------ */

function WeeklyReportBody({ division, week }: { division: AdminDesk['divisions'][number]; week: AdminDesk['week'] }) {
  const r = division.report
  if (!r) return null
  return (
    <>
      <div className="mk-kv" aria-label="Identitas laporan">
        <div className="min-w-0">
          <div className="t-footnote text-ink-2">Divisi</div>
          <div className="t-body-strong truncate">{division.name}</div>
        </div>
        <div>
          <div className="t-footnote text-ink-2">Kepala divisi</div>
          <div className="t-body-strong truncate">{division.head?.name ?? 'Belum ditetapkan'}</div>
        </div>
        <div>
          <div className="t-footnote text-ink-2">Minggu</div>
          <div className="t-body-strong tabular-nums">M{week.isoWeek} {week.isoYear}</div>
        </div>
        <div>
          <div className="t-footnote text-ink-2">Diserahkan</div>
          <div className="t-body-strong tabular-nums">pukul {formatTime(r.submittedAt)} WIB</div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="t-headline">Status</h3>
          <span className="flex flex-wrap items-center gap-2">
            <WeeklyHeaderBadge status={r.statusHeader} />
            <ForwardBadge forwardedAt={r.forwardedAt} />
          </span>
        </div>
        <p className="t-footnote text-ink-2">
          {r.forwardedAt
            ? `Diteruskan ke Direksi ${formatDateTime(r.forwardedAt)} WIB.`
            : 'Menunggu diteruskan lewat tombol penerusan di Ringkasan.'}
          {r.approvedAt ? ` Disetujui kepala divisi pukul ${formatTime(r.approvedAt)} WIB.` : ' Belum disetujui kepala divisi.'}
        </p>
      </div>

      <div>
        <h3 className="t-headline mb-2">Ringkasan butir</h3>
        <p className="t-body-strong mb-2">
          {r.done} dari {r.items} item selesai
        </p>
        <ProgressBar value={pct(r.done, r.items)} status="accent" label={`Capaian divisi ${division.name}`} />
        <p className="t-footnote text-ink-2 mt-2">
          {r.blocked > 0 ? `${r.blocked} item terkendala` : 'Tidak ada item terkendala'}
          {r.missingEvidence > 0 ? ` · ${r.missingEvidence} item tanpa bukti` : ''}
        </p>
      </div>
    </>
  )
}

function WeeklyReportSheet({
  row,
  week,
  open,
  onClose,
}: {
  row: AdminDesk['divisions'][number] | null
  week: AdminDesk['week']
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={row?.name ?? ''}
      subtitle={row ? `Kepala divisi ${row.head?.name ?? 'belum ditetapkan'} · M${week.isoWeek}` : undefined}
      eyebrow={
        row?.report ? (
          <span className="flex flex-wrap items-center gap-2">
            <WeeklyHeaderBadge status={row.report.statusHeader} />
            <ForwardBadge forwardedAt={row.report.forwardedAt} />
          </span>
        ) : undefined
      }
      backLabel="Meja kerja"
    >
      {row && row.report ? <WeeklyReportBody key={`${row.id}:${row.report.id}`} division={row} week={week} /> : null}
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Meja kerja                                                          */
/* ------------------------------------------------------------------ */

export function AdminDeskView({ data }: { data: AdminDesk }) {
  // Akordeon terbuka otomatis: meja kerja langsung menunjukkan pelapor.
  const [openDailySec, setOpenDailySec] = useState(true)
  const [openWeeklySec, setOpenWeeklySec] = useState(true)
  const [open, setOpen] = useState<OpenRow | null>(null)
  // Baris terakhir dipertahankan supaya isi Sheet tidak berkedip saat menutup.
  const [last, setLast] = useState<OpenRow | null>(null)
  if (open && open !== last) setLast(open)

  const daily = data.projects
    .filter((p) => p.report?.submittedAt)
    .sort((a, b) => newestFirst(a.report?.submittedAt, b.report?.submittedAt))
  const weekly = data.divisions
    .filter((d) => d.report?.submittedAt)
    .sort((a, b) => newestFirst(a.report?.submittedAt, b.report?.submittedAt))

  const missingDaily = data.projects.length - daily.length
  const pendingForward =
    daily.filter((p) => !p.report?.forwardedAt).length + weekly.filter((d) => !d.report?.forwardedAt).length

  const answer =
    daily.length + weekly.length === 0
      ? 'Belum ada laporan yang masuk untuk diperiksa.'
      : `${daily.length} laporan proyek masuk hari ini, ${weekly.length} laporan divisi minggu ini.`

  const support = [
    data.projects.length > 0
      ? missingDaily > 0
        ? `${missingDaily} proyek belum melapor hari ini.`
        : 'Semua proyek sudah melapor hari ini.'
      : null,
    daily.length + weekly.length > 0
      ? pendingForward > 0
        ? `${pendingForward} laporan menunggu diteruskan dari Ringkasan.`
        : 'Semua laporan yang masuk sudah diteruskan.'
      : null,
  ]
    .filter(Boolean)
    .join(' ')

  const dailyRow = open?.kind === 'daily' ? open.project : last?.kind === 'daily' ? last.project : null
  const weeklyRow = open?.kind === 'weekly' ? open.division : last?.kind === 'weekly' ? last.division : null

  return (
    <>
      <DashHeader context={data.entity.name} />

      <Hero eyebrow={`Laporan masuk · ${formatDateLong(data.today)}`} answer={answer} support={support || undefined} />

      <Disclosure
        id="mk-desk-admin-proyek"
        title="Laporan proyek"
        sub={`Hari ini · ${daily.length} pelapor`}
        open={openDailySec}
        onToggle={() => setOpenDailySec((v) => !v)}
      >
        {daily.length === 0 ? (
          <EmptyNote icon="proyek">
            {data.projects.length === 0
              ? 'Belum ada proyek aktif di perusahaan Anda.'
              : 'Belum ada proyek yang mengirim laporan hari ini.'}
          </EmptyNote>
        ) : (
          <ul className="mk-desk-queue" aria-label="Laporan proyek hari ini">
            {daily.map((p, i) => {
              const r = p.report
              if (!r?.submittedAt) return null
              return (
                <li key={p.id} className="mk-desk-queue__row" style={{ '--i': i } as React.CSSProperties}>
                  <button
                    type="button"
                    className="mk-desk-queue__hit mk-wk-tap"
                    aria-label={`Buka laporan proyek ${p.name}`}
                    onClick={() => setOpen({ kind: 'daily', project: p })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="t-body-strong block truncate">{p.name}</span>
                      <span className="t-footnote text-ink-2 block truncate">
                        {p.picName ?? 'Belum ada PIC'} · {p.code}
                      </span>
                    </span>
                    <span className="mk-desk-pop flex shrink-0 flex-col items-end gap-1">
                      <ForwardBadge forwardedAt={r.forwardedAt} />
                      <span className="t-footnote text-ink-2 tabular-nums">{formatTime(r.submittedAt)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Disclosure>

      <Disclosure
        id="mk-desk-admin-divisi"
        title="Laporan divisi"
        sub={`Minggu ini (M${data.week.isoWeek}) · ${weekly.length} pelapor`}
        open={openWeeklySec}
        onToggle={() => setOpenWeeklySec((v) => !v)}
      >
        {weekly.length === 0 ? (
          <EmptyNote icon="tim">
            {data.divisions.length === 0 ? 'Belum ada divisi aktif.' : 'Belum ada divisi yang menyerahkan laporan minggu ini.'}
          </EmptyNote>
        ) : (
          <ul className="mk-desk-queue" aria-label="Laporan divisi minggu ini">
            {weekly.map((d, i) => {
              const r = d.report
              if (!r?.submittedAt) return null
              return (
                <li key={d.id} className="mk-desk-queue__row" style={{ '--i': i } as React.CSSProperties}>
                  <button
                    type="button"
                    className="mk-desk-queue__hit mk-wk-tap"
                    aria-label={`Buka laporan divisi ${d.name}`}
                    onClick={() => setOpen({ kind: 'weekly', division: d })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="t-body-strong block truncate">{d.name}</span>
                      <span className="t-footnote text-ink-2 block truncate">
                        {d.head?.name ? `Kadiv ${d.head.name}` : 'Kepala divisi belum ditetapkan'}
                      </span>
                    </span>
                    <span className="mk-desk-pop flex shrink-0 flex-col items-end gap-1">
                      <ForwardBadge forwardedAt={r.forwardedAt} />
                      <span className="t-footnote text-ink-2 tabular-nums">{formatTime(r.submittedAt)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Disclosure>

      <DailyReportSheet row={dailyRow} today={data.today} open={open?.kind === 'daily'} onClose={() => setOpen(null)} />
      <WeeklyReportSheet row={weeklyRow} week={data.week} open={open?.kind === 'weekly'} onClose={() => setOpen(null)} />
    </>
  )
}
