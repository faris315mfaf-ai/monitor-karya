'use client'

/**
 * Laporan per perusahaan untuk dashboard Manajemen (drill-down, keputusan
 * pemilik 8 Okt 2026; docs/design/peran/01-manajemen.md §Detail/Interaksi):
 *
 *  - Kartu perusahaan (ponsel 1, tablet 2, desktop 2–3 kolom): nama PT,
 *    "n proyek", "x dari y proyek lapor hari ini", lencana kepatuhan hari ini.
 *  - Ketuk kartu → Sheet perusahaan (daftar ProjectRow; kolom tenggat dipakai
 *    untuk "lapor hari ini/belum" karena fokus layar ini kepatuhan laporan).
 *  - Ketuk baris → Sheet proyek: identitas, StatTile "Lapor 14 hari", daftar
 *    laporan harian terbaru (muat malas /api/daily-reports?projectId=…), dan
 *    bagian "Perlu perhatian & eskalasi" (field opsional dari T3-A1 — tahan
 *    bila absen). Layar baca-saja untuk grup: tanpa tombol tulis.
 *
 * Kedua Sheet dipasang bersama dan memakai pola last/open (DivisionSheet)
 * supaya isi bertahan selama animasi menutup.
 *
 * Kontrak props `projects: CompanyProject[]` = OversightProject dengan `pic`
 * yang boleh null (lihat tipe di bawah); OversightProject[] biasa tetap
 * diterima.
 */

import { useMemo, useState } from 'react'
import {
  EmptyNote, ErrorNote, ProjectRow, Sheet, Skeleton, StatTile, StatusBadge, STATUS,
  type Status,
} from '@/components/mk'
import { useFetch } from '@/hooks/use-fetch'
import { ESCALATION_NEEDED_LABELS } from '@/lib/constants'
import { divisionTone } from '@/lib/division-tone'
import { ageDays, formatDate, formatNumber, formatTime, initials } from '@/lib/format'
import type { OversightProject } from './types'

// ------------------------------------------------------------------
// Tipe data
// ------------------------------------------------------------------

/** Eskalasi pada proyek — bentuk sama dengan RingkasanData.escalations (T3-A1). */
export type CompanyEscalation = {
  id: string
  summary: string
  needed: string
  status: string
  raisedAt: string
  raisedBy?: string | null
  ageDays?: number
  overdue?: boolean
}

/**
 * OversightProject dengan dua pelebaran tipe:
 *  - `pic` boleh null — kontrak T3-A2: management-dashboard meneruskan
 *    data.projects mentah; OversightProject[] (pic: string) tetap diterima.
 *  - `escalations` opsional dari T3-A1; kode tahan bila field absen.
 */
export type CompanyProject = Omit<OversightProject, 'pic'> & {
  pic: string | null
  escalations?: CompanyEscalation[]
}

/** Satu baris /api/daily-reports (item memuat project/entity/submittedBy + field laporan). */
type DailyReportItem = {
  id: string
  reportDate: string
  status: string
  progressPct: number
  achievementToday: string
  obstacle?: string | null
  isLate?: boolean
  submittedAt?: string | null
  submittedBy?: { id: string; name: string } | null
}
type DailyReportsPage = { items: DailyReportItem[]; total: number; page: number; pageSize: number }

// ------------------------------------------------------------------
// Fungsi murni (diuji tests/ui/company-reports.test.ts)
// ------------------------------------------------------------------

export type CompanyGroup = {
  entityId: string
  entityName: string
  entityCode: string
  projects: CompanyProject[]
  reportedToday: number
}

/** Kelompokkan proyek per PT (entityId); urutan mengikuti kemunculan pertama. */
export function groupCompanies(projects: CompanyProject[]): CompanyGroup[] {
  const byId = new Map<string, CompanyGroup>()
  for (const p of projects) {
    let g = byId.get(p.entityId)
    if (!g) {
      g = { entityId: p.entityId, entityName: p.entityName, entityCode: p.entityCode, projects: [], reportedToday: 0 }
      byId.set(p.entityId, g)
    }
    g.projects.push(p)
    if (p.reportedToday) g.reportedToday++
  }
  return [...byId.values()]
}

/** Lencana kepatuhan hari ini kartu perusahaan: semua lapor / sebagian / belum ada yang wajib. */
export function companyBadge(reported: number, total: number): { status: Status; label: string } {
  if (total <= 0) return { status: 'neutral', label: 'Belum ada yang wajib' }
  if (reported >= total) return { status: 'done', label: 'Semua lapor' }
  if (reported <= 0) return { status: 'risk', label: 'Belum ada yang lapor' }
  return { status: 'risk', label: `${total - reported} belum lapor` }
}

/** Status laporan harian → StatusBadge (warna + ikon + kata). */
export const REPORT_STATUS: Record<string, { status: Status; label: string }> = {
  SELESAI: { status: 'done', label: 'Selesai' },
  ON_PROGRESS: { status: 'on', label: 'Dikerjakan' },
  TERKENDALA: { status: 'risk', label: 'Terkendala' },
  MENUNGGU_KEPUTUSAN: { status: 'risk', label: 'Menunggu keputusan' },
  TIDAK_ADA_PERUBAHAN: { status: 'neutral', label: 'Tanpa perubahan' },
}
export function reportBadge(status: string | null | undefined): { status: Status; label: string } {
  return (status && REPORT_STATUS[status]) || { status: 'neutral', label: status || 'Tanpa status' }
}

/** Status eskalasi → StatusBadge. */
export const ESCALATION_BADGE: Record<string, { status: Status; label: string }> = {
  DIAJUKAN: { status: 'risk', label: 'Diajukan' },
  DITINJAU: { status: 'info', label: 'Ditinjau' },
  DIPUTUSKAN: { status: 'done', label: 'Diputuskan' },
  DITUTUP: { status: 'done', label: 'Ditutup' },
}
export function escalationBadge(status: string | null | undefined): { status: Status; label: string } {
  return (status && ESCALATION_BADGE[status]) || { status: 'neutral', label: status || 'Tanpa status' }
}

/** Ratakan spasi lalu pangkas jadi satu baris pendek untuk caption daftar. */
export function oneLine(text: string | null | undefined, max = 110): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

const picName = (p: CompanyProject) => p.pic?.trim() || 'PIC belum ditentukan'
const neededLabel = (n: string) => ESCALATION_NEEDED_LABELS[n] || n

// ------------------------------------------------------------------
// Kartu perusahaan
// ------------------------------------------------------------------

export function CompanyReports({ projects }: { projects: CompanyProject[] }) {
  const companies = useMemo(() => groupCompanies(projects), [projects])
  const [openEntityId, setOpenEntityId] = useState<string | null>(null)
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)

  // Pola last/open: isi sheet bertahan selama animasi menutup.
  const openCompany = companies.find((c) => c.entityId === openEntityId) ?? null
  const [lastCompany, setLastCompany] = useState<CompanyGroup | null>(null)
  if (openCompany && openCompany !== lastCompany) setLastCompany(openCompany)
  const company = openCompany ?? lastCompany

  const openProject = openProjectId ? projects.find((p) => p.id === openProjectId) ?? null : null
  const [lastProject, setLastProject] = useState<CompanyProject | null>(null)
  if (openProject && openProject !== lastProject) setLastProject(openProject)
  const project = openProject ?? lastProject

  function closeCompany() {
    // Menutup sheet perusahaan menutup juga sheet proyek di atasnya.
    setOpenProjectId(null)
    setOpenEntityId(null)
  }

  if (companies.length === 0) {
    return <EmptyNote icon="gedung">Belum ada proyek untuk ditampilkan.</EmptyNote>
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="t-body text-ink-2">
        {formatNumber(companies.length)} perusahaan · ketuk untuk membaca laporan hariannya
      </p>
      <div className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2 lg:grid-cols-3">
        {companies.map((c) => {
          const badge = companyBadge(c.reportedToday, c.projects.length)
          return (
            <button
              key={c.entityId}
              type="button"
              className="mk-card mk-card--inset flex flex-col items-start gap-2 p-4 text-left"
              aria-label={`Lihat laporan perusahaan ${c.entityName}`}
              onClick={() => setOpenEntityId(c.entityId)}
            >
              <span className="t-body-strong self-stretch truncate">{c.entityName}</span>
              <span className="t-footnote text-ink-2 self-stretch">{formatNumber(c.projects.length)} proyek</span>
              <span className="t-footnote text-ink-2 self-stretch">
                {formatNumber(c.reportedToday)} dari {formatNumber(c.projects.length)} proyek lapor hari ini
              </span>
              <StatusBadge status={badge.status} size="sm">
                {badge.label}
              </StatusBadge>
            </button>
          )
        })}
      </div>

      <CompanySheet
        company={company}
        open={!!openCompany}
        selectedProjectId={openProjectId}
        onClose={closeCompany}
        onOpenProject={(id) => setOpenProjectId(id)}
      />
      <ProjectReportsSheet project={project} open={!!openProject} onClose={() => setOpenProjectId(null)} />
    </div>
  )
}

// ------------------------------------------------------------------
// Sheet perusahaan
// ------------------------------------------------------------------

function CompanySheet({
  company,
  open,
  selectedProjectId,
  onClose,
  onOpenProject,
}: {
  company: CompanyGroup | null
  open: boolean
  selectedProjectId: string | null
  onClose: () => void
  onOpenProject: (id: string) => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={company ? company.entityName : ''}
      eyebrow={company ? company.entityCode : undefined}
      subtitle={
        company
          ? `${formatNumber(company.reportedToday)} dari ${formatNumber(company.projects.length)} proyek lapor hari ini`
          : undefined
      }
      backLabel="Laporan per perusahaan"
    >
      {company ? (
        <div className="mk-prows">
          {company.projects.map((p) => (
            <ProjectRow
              key={p.id}
              name={p.name}
              division={p.divisionName || company.entityCode}
              divisionTone={p.divisionName ? divisionTone(p.divisionName) : 'data-1'}
              pic={picName(p)}
              initials={p.pic?.trim() ? initials(p.pic) : '—'}
              progress={p.progress}
              due={p.reportedToday ? 'Lapor hari ini' : 'Belum lapor'}
              status={p.status}
              selected={selectedProjectId === p.id}
              onClick={() => onOpenProject(p.id)}
            />
          ))}
        </div>
      ) : null}
    </Sheet>
  )
}

// ------------------------------------------------------------------
// Sheet proyek: laporan harian 14 hari + eskalasi
// ------------------------------------------------------------------

function ProjectReportsSheet({
  project,
  open,
  onClose,
}: {
  project: CompanyProject | null
  open: boolean
  onClose: () => void
}) {
  // Muat malas hanya saat sheet terbuka; data useFetch bertahan saat ditutup
  // (URL null tidak menghapus state) sehingga isi tetap tampil selama animasi.
  const reports = useFetch<DailyReportsPage>(
    open && project ? `/api/daily-reports?projectId=${encodeURIComponent(project.id)}&pageSize=14` : null
  )
  const items = reports.data?.items ?? null
  const lateCount = items ? items.filter((r) => r.isLate).length : 0
  const escalations = project?.escalations ?? []

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={project ? project.name : ''}
      eyebrow={project ? project.code : undefined}
      subtitle={
        project ? `PIC ${picName(project)}${project.divisionName ? ` · ${project.divisionName}` : ''}` : undefined
      }
      backLabel="Perusahaan"
    >
      {project ? (
        <>
          <StatusBadge status={STATUS[project.status] ? project.status : 'neutral'}>
            {STATUS[project.status]?.label ?? 'Belum mulai'}
          </StatusBadge>

          {reports.loading && !items ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat laporan harian">
              <Skeleton h={92} r={14} />
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} h={48} />
              ))}
            </div>
          ) : reports.error ? (
            <ErrorNote message={reports.error} onRetry={reports.reload} />
          ) : (
            <>
              <StatTile
                variant="surface"
                label="Lapor 14 hari"
                value={items ? items.length : 0}
                delta={lateCount ? `${formatNumber(lateCount)} laporan terlambat` : items && items.length ? 'semua tepat waktu' : 'belum ada laporan'}
                tone={lateCount ? 'late' : items && items.length ? 'on' : 'neutral'}
              />
              <div>
                <h3 className="t-headline mb-2">Laporan harian terbaru</h3>
                {!items || items.length === 0 ? (
                  <EmptyNote icon="laporan">Belum ada laporan harian pada proyek ini.</EmptyNote>
                ) : (
                  <div className="mk-list">
                    {items.map((r) => {
                      const badge = reportBadge(r.status)
                      return (
                        <div key={r.id} className="mk-listrow">
                          <div className="min-w-0 flex-1">
                            <div className="t-body-strong truncate">
                              {formatDate(r.reportDate)}
                              {r.submittedAt ? (
                                <span className="t-footnote text-ink-2"> · {formatTime(r.submittedAt)}</span>
                              ) : null}
                            </div>
                            <div className="t-footnote text-ink-2 truncate">
                              {oneLine(r.achievementToday) || 'Tanpa catatan capaian'}
                            </div>
                          </div>
                          <span className="flex flex-col items-end gap-1">
                            <StatusBadge status={badge.status} size="sm">
                              {badge.label}
                            </StatusBadge>
                            {r.isLate ? (
                              <StatusBadge status="late" size="sm">
                                Terlambat
                              </StatusBadge>
                            ) : null}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          <div>
            <h3 className="t-headline mb-2">Perlu perhatian & eskalasi</h3>
            {escalations.length === 0 ? (
              <EmptyNote done>Belum ada eskalasi pada proyek ini.</EmptyNote>
            ) : (
              <div className="mk-list">
                {escalations.map((e) => {
                  const badge = escalationBadge(e.status)
                  const umur = typeof e.ageDays === 'number' ? e.ageDays : ageDays(e.raisedAt)
                  return (
                    <div key={e.id} className="mk-listrow">
                      <div className="min-w-0 flex-1">
                        <div className="t-body-strong truncate">{e.summary}</div>
                        <div className="t-footnote text-ink-2 truncate">
                          Dibutuhkan: {neededLabel(e.needed)} · {formatNumber(umur)} hari
                          {e.raisedBy ? ` · diajukan ${e.raisedBy}` : ''}
                        </div>
                      </div>
                      <span className="flex flex-col items-end gap-1">
                        <StatusBadge status={badge.status} size="sm">
                          {badge.label}
                        </StatusBadge>
                        {e.overdue ? (
                          <StatusBadge status="late" size="sm">
                            Lewat SLA
                          </StatusBadge>
                        ) : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </Sheet>
  )
}
