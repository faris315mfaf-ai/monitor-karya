'use client'

import { useMemo, useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { NotificationButton } from '@/components/shell'
import {
  Button, Card, Chip, EmptyNote, ErrorNote, Hero, Icon, PageHeader, ProgressBar, SearchField, Sheet, Skeleton, StatTile,
  StatusBadge,
} from '@/components/mk'
import { InfoLine, SectionTitle } from '@/components/companies/parts'
import {
  WeeklyHeaderBadge,
  WeeklyItemStatusBadge,
  PriorityBadge,
  weeklyItemStatus,
} from '@/components/status-badges'
import { formatDate, formatDateShort, formatNumber } from '@/lib/format'
import { ASPECT_CATEGORY_LABELS } from '@/lib/constants'
import { can } from '@/lib/rbac'
import { useApp } from '@/components/app-provider'
import { DivisionWeeklyDesk } from '@/components/division-weekly-desk'

type WeeklyItem = {
  id: string
  workItem: string
  targetOutput: string
  picName: string
  picTitle: string
  targetDate: string | null
  status: string
  progressPct: number
  achievementThisWeek: string
  obstacleFollowUp: string | null
  needsEscalation: boolean
  evidenceCount: number
  aspectCategory: { id: string; name: string; code: string }
  priority: { id: string; code: string; name: string }
}

type WeeklyReport = {
  id: string
  isoYear: number
  isoWeek: number
  periodStart: string
  periodEnd: string
  statusHeader: string
  isLocked: boolean
  lockedAt: string | null
  isLate: boolean
  approvedAt: string | null
  approvedBy: { id: string; name: string; email: string } | null
  division: { id: string; name: string }
  entity: { id: string; name: string; code: string; region: string | null }
  items: WeeklyItem[]
}

type WeeklyListData = {
  items: WeeklyReport[]
  total: number
  page: number
  pageSize: number
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Semua status' },
  { value: 'DRAFT', label: 'Draf' },
  { value: 'MENUNGGU_PERSETUJUAN', label: 'Menunggu persetujuan' },
  { value: 'DISETUJUI', label: 'Disetujui' },
  { value: 'TERKUNCI', label: 'Terkunci' },
]

const BREAKDOWN: Array<{ status: string; label: string }> = [
  { status: 'SELESAI', label: 'selesai' },
  { status: 'ON_PROGRESS', label: 'berjalan' },
  { status: 'BELUM_MULAI', label: 'belum mulai' },
  { status: 'TERKENDALA', label: 'terkendala' },
  { status: 'NA', label: 'N/A' },
]

function countBy(items: WeeklyItem[]) {
  const counts: Record<string, number> = {}
  for (const it of items) counts[it.status] = (counts[it.status] || 0) + 1
  return counts
}

export function DivisionsView() {
  const { user } = useApp()
  const canInput = can(user.role, 'weekly:input')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusHeader, setStatusHeader] = useState<string>('ALL')
  const [detail, setDetail] = useState<{ report: WeeklyReport; n: number } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '10' })
    if (statusHeader !== 'ALL') p.set('statusHeader', statusHeader)
    if (search.trim()) p.set('search', search.trim())
    return p.toString()
  }, [page, statusHeader, search])

  const { data, loading, error, reload } = useResource<WeeklyListData>(`/api/weekly-reports?${params}`)
  const reports = useMemo(() => data?.items ?? [], [data])
  const filtered = statusHeader !== 'ALL' || search.trim() !== ''
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const waiting = reports.filter((r) => r.statusHeader === 'MENUNGGU_PERSETUJUAN').length
  const late = reports.filter((r) => r.isLate).length
  const answer = !data
    ? ''
    : data.total === 0
      ? filtered
        ? 'Tidak ada laporan mingguan dengan saringan ini.'
        : 'Belum ada laporan mingguan divisi.'
      : `${formatNumber(data.total)} laporan mingguan divisi${filtered ? ' cocok dengan saringan' : ' tercatat'}.`
  const supportParts = [waiting ? `${waiting} menunggu persetujuan` : null, late ? `${late} terlambat` : null].filter(Boolean)
  const support = supportParts.length
    ? `Di halaman ini: ${supportParts.join(', ')}.`
    : reports.length
      ? 'Ketuk laporan untuk membaca butir, capaian, dan kendalanya.'
      : undefined

  function resetFilters() {
    setSearch('')
    setStatusHeader('ALL')
    setPage(1)
  }
  function openDetail(r: WeeklyReport) {
    setDetail((d) => ({ report: r, n: (d?.n ?? 0) + 1 }))
    setDetailOpen(true)
  }

  return (
    <>
      <PageHeader
        context={canInput ? 'Pilih entitas dan divisi, lalu isi capaian per hari' : 'Siklus pelaporan mingguan divisi'}
        title="Divisi"
        tools={
          <span className="mk-desktop-only">
            <NotificationButton />
          </span>
        }
      />

      {/* Meja isian (8 Sep 2026): Admin PT / Kepala Divisi / TI menyusun laporan
          mingguan divisinya di sini; arsip seluruh laporan ada di bawahnya. */}
      {canInput ? (
        <>
          <DivisionWeeklyDesk />
          <h2 className="t-title-3 flex items-center gap-2 pt-2">
            <Icon name="dokumen" size={22} className="text-ink-2" /> Arsip laporan mingguan
          </h2>
        </>
      ) : loading && !data ? (
        <div className="mk-hero" aria-busy="true" aria-label="Memuat ringkasan laporan">
          <div className="mk-hero__text">
            <Skeleton h={26} w={160} r={999} />
            <Skeleton h={36} w="70%" r={12} />
            <Skeleton h={20} w="55%" />
          </div>
        </div>
      ) : data ? (
        <Hero eyebrow="Laporan mingguan divisi" answer={answer} support={support} />
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="mk-chips" role="group" aria-label="Status laporan">
          {STATUS_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              selected={statusHeader === o.value}
              onClick={() => {
                setStatusHeader(o.value)
                setPage(1)
              }}
            >
              {o.label}
            </Chip>
          ))}
        </div>
        <SearchField
          id="dv-q"
          label="Cari laporan"
          placeholder="Cari divisi, entitas, atau wilayah"
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
        />
      </div>

      {loading && !data ? (
        <Card ariaLabel="Memuat laporan mingguan">
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} h={56} r={12} />
            ))}
          </div>
        </Card>
      ) : error ? (
        <Card>
          <ErrorNote message={`Laporan mingguan belum termuat. ${error}`} onRetry={reload} />
        </Card>
      ) : !reports.length ? (
        <Card>
          <EmptyNote
            icon="dokumen"
            action={
              filtered ? (
                <Button size="sm" onClick={resetFilters}>
                  Hapus saringan
                </Button>
              ) : undefined
            }
          >
            {filtered ? 'Tidak ada laporan mingguan dengan saringan ini.' : 'Belum ada laporan mingguan divisi.'}
          </EmptyNote>
        </Card>
      ) : (
        <>
          <Card
            title="Laporan mingguan"
            subtitle={`Menampilkan ${reports.length} dari ${formatNumber(data?.total ?? reports.length)} laporan. Ketuk baris untuk membuka detail.`}
          >
            <div className={loading ? 'mk-list opacity-60 transition-opacity' : 'mk-list'}>
              {reports.map((r) => (
                <ReportRow key={r.id} report={r} onOpen={() => openDetail(r)} />
              ))}
            </div>
          </Card>

          {data && data.total > data.pageSize && (
            <nav className="flex items-center justify-between gap-2" aria-label="Halaman laporan mingguan">
              <Button icon="kiri" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Sebelumnya
              </Button>
              <span className="t-footnote text-ink-2 tabular-nums">
                Halaman {page} dari {pages}
              </span>
              <Button iconAfter="kanan" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>
                Berikutnya
              </Button>
            </nav>
          )}
        </>
      )}

      {detail && (
        <WeeklyReportSheet key={detail.n} open={detailOpen} report={detail.report} onClose={() => setDetailOpen(false)} />
      )}
    </>
  )
}

function ReportRow({ report, onOpen }: { report: WeeklyReport; onOpen: () => void }) {
  return (
    <button type="button" className="mk-rrow" onClick={onOpen} aria-label={`Buka laporan ${report.division.name} minggu ${report.isoWeek}`}>
      <span className="mk-rrow__body">
        <span className="mk-rrow__title">{report.division.name}</span>
        <span className="mk-rrow__meta">
          {report.entity.name} · M{report.isoWeek} {report.isoYear} · {formatDateShort(report.periodStart)}–{formatDateShort(report.periodEnd)}
        </span>
        <span className="mk-rrow__meta">
          {report.items.length} butir
          {report.approvedBy ? ` · disetujui ${report.approvedBy.name}` : ''}
        </span>
      </span>
      <span className="mk-rrow__badges">
        <WeeklyHeaderBadge status={report.statusHeader} />
        {report.isLate && (
          <StatusBadge status="late" size="sm">
            Terlambat
          </StatusBadge>
        )}
        {report.isLocked && report.statusHeader !== 'TERKUNCI' && <span className="mk-tag">Terkunci</span>}
      </span>
      <Icon name="kanan" size={18} className="mk-rrow__chev" />
    </button>
  )
}

/** Detail laporan mingguan di Sheet: status, 3 angka, butir pekerjaan, kendala. */
function WeeklyReportSheet({ open, report, onClose }: { open: boolean; report: WeeklyReport; onClose: () => void }) {
  const counts = useMemo(() => countBy(report.items), [report.items])
  const breakdown = BREAKDOWN.filter((b) => counts[b.status])
    .map((b) => `${counts[b.status]} ${b.label}`)
    .join(' · ')
  const blocked = counts.TERKENDALA || 0

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="wide"
      title={report.division.name}
      subtitle={`${report.entity.name} · M${report.isoWeek} ${report.isoYear}`}
      eyebrow={
        <span className="flex flex-wrap gap-2">
          <WeeklyHeaderBadge status={report.statusHeader} />
          {report.isLate && (
            <StatusBadge status="late" size="sm">
              Terlambat
            </StatusBadge>
          )}
          {report.isLocked && report.statusHeader !== 'TERKUNCI' && <span className="mk-tag">Terkunci</span>}
        </span>
      }
      backLabel="Divisi"
    >
      <section className="flex flex-col gap-2">
        <InfoLine icon="kalender">
          {formatDate(report.periodStart)} sampai {formatDate(report.periodEnd)}
        </InfoLine>
        <InfoLine icon="gedung">
          {report.entity.name} · {report.entity.region || report.entity.code}
        </InfoLine>
        {report.isLocked && report.lockedAt && <InfoLine icon="kunci">Dikunci {formatDate(report.lockedAt)}</InfoLine>}
      </section>

      {report.approvedBy && report.approvedAt && (
        <p className="mk-note-box mk-soft--done">
          Disetujui oleh <strong>{report.approvedBy.name}</strong> · {formatDate(report.approvedAt)}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Butir" value={report.items.length} delta={breakdown || undefined} />
        <StatTile label="Selesai" value={counts.SELESAI || 0} tone="done" />
        <StatTile label="Terkendala" value={blocked} tone={blocked ? 'risk' : 'neutral'} />
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle icon="dokumen">Butir pekerjaan</SectionTitle>
        {report.items.length === 0 ? (
          <EmptyNote icon="dokumen">Belum ada butir di laporan ini.</EmptyNote>
        ) : (
          report.items.map((it) => <WeeklyItemBlock key={it.id} item={it} />)
        )}
      </section>
    </Sheet>
  )
}

function WeeklyItemBlock({ item }: { item: WeeklyItem }) {
  const aspectLabel = ASPECT_CATEGORY_LABELS[item.aspectCategory.code] || item.aspectCategory.name
  const st = weeklyItemStatus(item.status)
  return (
    <article className="mk-witem">
      <div className="mk-witem__top">
        <div className="min-w-0">
          <h4 className="mk-witem__title">{item.workItem}</h4>
          <div className="mk-witem__tags">
            <span className="mk-tag">{aspectLabel}</span>
            <PriorityBadge priority={item.priority.code} />
            {item.needsEscalation && (
              <StatusBadge status="risk" size="sm">
                Perlu eskalasi
              </StatusBadge>
            )}
          </div>
        </div>
        <WeeklyItemStatusBadge status={item.status} />
      </div>

      <ProgressBar value={item.progressPct} status={st === 'neutral' || st === 'info' ? 'accent' : st} label={`Progres ${item.workItem}`} />

      <InfoLine icon="pengguna">
        {item.picName}
        {item.picTitle ? `, ${item.picTitle}` : ''}
      </InfoLine>
      {(item.targetOutput || item.targetDate) && (
        <InfoLine icon="target">
          {item.targetOutput || 'Target'}
          {item.targetDate ? ` · ${formatDate(item.targetDate)}` : ''}
        </InfoLine>
      )}
      {item.evidenceCount > 0 && <InfoLine icon="dokumen">{item.evidenceCount} bukti terlampir</InfoLine>}

      {item.achievementThisWeek && (
        <p className="t-footnote text-ink">
          <span className="font-semibold">Capaian: </span>
          {item.achievementThisWeek}
        </p>
      )}

      {item.obstacleFollowUp && (
        <p className="mk-note-box mk-soft--risk">
          <span className="font-semibold">Kendala dan tindak lanjut: </span>
          {item.obstacleFollowUp}
        </p>
      )}
    </article>
  )
}
