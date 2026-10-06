'use client'

/**
 * Proyek divisi (03-kepala-divisi.md §6 dan "Sheet · Proyek") [F2-KADIV]:
 * Timeline proyek divisi + legenda status (desktop/tablet), ProjectRow
 * compact (ponsel); baris membuka Sheet proyek dengan cincin progres, status,
 * output, tenggat, dan tahapan. Status dari src/lib/project-status.ts (server).
 */

import { useMemo, useState } from 'react'
import { useApp } from '@/components/app-provider'
import {
  Button, Card, EmptyNote, ErrorNote, FlowDiagram, ProgressBar, ProgressRing, ProjectRow, Sheet, Skeleton, StatusBadge, Timeline,
  STATUS, useIsPhone, type FlowStep, type Status,
} from '@/components/mk'
import { phaseSteps, timelineFrame } from '@/components/views/dash-common'
import { DAILY_STATUS_META, PROJECT_PHASE_LABELS } from '@/lib/constants'
import { formatDateLong, formatDateShort, formatRelative, initials } from '@/lib/format'
import type { KadivDataCtl } from './use-kadiv'
import type { KadivProject } from './types'

const DAY = 86400000
const ORDER: Record<Status, number> = { late: 0, risk: 1, on: 2, neutral: 3, done: 4, info: 5 }
const STAGE_STATUS: Record<string, { status: FlowStep['status']; label: string }> = {
  SELESAI: { status: 'done', label: 'Selesai' },
  BERJALAN: { status: 'current', label: 'Berjalan' },
  TERTAHAN: { status: 'blocked', label: 'Tertahan' },
  BELUM_MULAI: { status: 'todo', label: 'Belum mulai' },
}

function dueText(iso: string | null) {
  if (!iso) return 'Tenggat belum ditetapkan'
  // Selisih hari kalender WIB (tenggat disimpan sebagai tengah malam WIB).
  const todayWib = Math.floor((Date.now() + 7 * 3600000) / DAY)
  const dueWib = Math.floor((Date.parse(iso) + 7 * 3600000) / DAY)
  const days = dueWib - todayWib
  if (days < 0) return `Lewat ${-days} hari · ${formatDateShort(iso)}`
  if (days === 0) return `Hari ini · ${formatDateShort(iso)}`
  return `${days} hari lagi · ${formatDateShort(iso)}`
}

export function DivisionProjectsCard({ ctl, className, id }: { ctl: KadivDataCtl; className?: string; id?: string }) {
  const phone = useIsPhone()
  const [openId, setOpenId] = useState<string | null>(null)
  const team = ctl.team
  const projects = useMemo(
    () => [...(team?.projects ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.code.localeCompare(b.code)),
    [team],
  )
  const counts = useMemo(() => {
    const m = new Map<Status, number>()
    for (const p of projects) m.set(p.status, (m.get(p.status) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => ORDER[a[0]] - ORDER[b[0]])
  }, [projects])
  const open = projects.find((p) => p.id === openId) ?? null
  const divName = team?.division?.name

  let body: React.ReactNode
  if (ctl.loading && !team) {
    body = (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton h={44} />
        <Skeleton h={44} />
        <Skeleton h={44} />
      </div>
    )
  } else if (ctl.teamError && !team) {
    body = <ErrorNote message={ctl.teamError} onRetry={() => void ctl.reload()} />
  } else if (!team?.division) {
    body = <EmptyNote icon="tim">Anda belum tercatat sebagai kepala divisi mana pun.</EmptyNote>
  } else if (projects.length === 0) {
    body = <EmptyNote icon="proyek">Belum ada proyek aktif yang tertaut ke divisi {divName}. Tautkan proyek lewat Atur anggota.</EmptyNote>
  } else if (phone) {
    body = (
      <div className="flex flex-col">
        {projects.map((p) => (
          <ProjectRow
            key={p.id}
            compact
            name={p.name}
            division={p.code}
            pic={p.picName ?? 'PIC belum ditentukan'}
            initials={initials(p.picName ?? '?')}
            progress={p.progress}
            due={p.targetEndDate ? formatDateShort(p.targetEndDate) : 'Tanpa tenggat'}
            status={p.status}
            selected={p.id === openId}
            onClick={() => setOpenId(p.id)}
          />
        ))}
      </div>
    )
  } else {
    const tl = timelineFrame(projects)
    const rows = projects.map((p) => ({
      id: p.id,
      label: p.name,
      sub: `${p.picName ?? 'PIC belum ditentukan'} · ${p.code}`,
      start: Math.max(0, tl.at(p.startDate, 0)),
      end: Math.max(1, tl.at(p.targetEndDate, tl.span)),
      progress: p.progress,
      status: p.status,
      range: `${p.startDate ? formatDateShort(p.startDate) : '…'}–${p.targetEndDate ? formatDateShort(p.targetEndDate) : 'tanpa tenggat'}`,
    }))
    body = (
      <div className="mk-scroll-x pt-6">
        <Timeline rows={rows} span={tl.span} ticks={tl.ticks} today={tl.today} title="Proyek" selectedId={openId} onSelect={setOpenId} />
      </div>
    )
  }

  return (
    <Card
      id={id}
      className={className}
      title={divName ? `Proyek Divisi ${divName}` : 'Proyek divisi'}
      subtitle={projects.length ? `${projects.length} proyek aktif · ketuk baris untuk detail` : undefined}
      action={
        counts.length ? (
          <div className="flex flex-wrap justify-end gap-2" aria-label="Legenda status">
            {counts.map(([st, n]) => (
              <StatusBadge key={st} status={st} size="sm">
                {`${STATUS[st].label} ${n}`}
              </StatusBadge>
            ))}
          </div>
        ) : null
      }
    >
      {body}
      <KadivProjectSheet project={open} onClose={() => setOpenId(null)} />
    </Card>
  )
}

/** Sheet proyek kepala divisi: cincin, status, output, tenggat, tahapan. */
export function KadivProjectSheet({ project, onClose }: { project: KadivProject | null; onClose: () => void }) {
  const { setActiveTab } = useApp()
  // Isi tetap tampil selama animasi menutup.
  const [last, setLast] = useState<KadivProject | null>(project)
  if (project && project !== last) setLast(project)
  const p = project ?? last
  const o = p?.outputs
  const stageSteps: FlowStep[] =
    p?.stages.map((s) => ({
      title: s.name,
      sub: s.dueDate ? `Tenggat ${formatDateShort(s.dueDate)}` : undefined,
      status: STAGE_STATUS[s.status]?.status ?? 'todo',
      meta: STAGE_STATUS[s.status]?.label,
    })) ?? []

  return (
    <Sheet
      open={!!project}
      onOpenChange={(v) => !v && onClose()}
      eyebrow={p ? <StatusBadge status={p.status} size="sm" /> : undefined}
      title={p?.name ?? ''}
      subtitle={p ? `${p.code} · ${p.picName ?? 'PIC belum ditentukan'}` : undefined}
      backLabel="Proyek"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose()
              setActiveTab('projects')
            }}
          >
            Buka modul proyek
          </Button>
        </div>
      }
    >
      {p && o && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-5">
            <ProgressRing value={p.progress} size={112} status={p.status === 'neutral' ? 'accent' : p.status} sublabel="progres" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="t-headline">{STATUS[p.status].label}</span>
              <span className="t-footnote text-ink-2">Fase {PROJECT_PHASE_LABELS[p.phase] ?? p.phase}</span>
              <span className="t-footnote text-ink-2">
                {p.lastReport
                  ? `Laporan terakhir ${formatRelative(p.lastReport.submittedAt ?? p.lastReport.date).toLowerCase()} · ${DAILY_STATUS_META[p.lastReport.status]?.label ?? p.lastReport.status}`
                  : 'Belum ada laporan harian 30 hari terakhir'}
              </span>
            </div>
          </div>
          {p.reason && <div className={`mk-note-box ${p.status === 'late' ? 'mk-soft--late' : 'mk-soft--risk'}`}>{p.reason}</div>}

          <section className="flex flex-col gap-2" aria-label="Tenggat">
            <h4 className="t-headline">Tenggat</h4>
            <div className="mk-kv">
              <div className="mk-inset">
                <div className="t-footnote text-ink-2">Proyek</div>
                <div className="t-body-strong">{p.targetEndDate ? formatDateLong(p.targetEndDate) : '-'}</div>
                <div className="t-caption text-ink-2">{dueText(p.targetEndDate)}</div>
              </div>
              <div className="mk-inset">
                <div className="t-footnote text-ink-2">Output terdekat</div>
                <div className="t-body-strong">{p.nextOutputDue ? formatDateLong(p.nextOutputDue) : '-'}</div>
                <div className="t-caption text-ink-2">{p.nextOutputDue ? dueText(p.nextOutputDue) : 'Tidak ada output bertenggat'}</div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2" aria-label="Output">
            <h4 className="t-headline">Output</h4>
            {o.total === 0 ? (
              <p className="t-footnote text-ink-2">PIC belum mencatat output untuk proyek ini.</p>
            ) : (
              <>
                <ProgressBar value={Math.round((o.accepted / o.total) * 100)} status="done" label={`${o.accepted} dari ${o.total} output diterima`} showValue={false} />
                <p className="t-footnote text-ink-2">
                  {o.accepted} dari {o.total} diterima
                </p>
                <ul className="mk-kv" aria-label="Rincian output">
                  {[
                    { label: 'Menunggu review', n: o.pending, st: 'risk' as Status },
                    { label: 'Perlu revisi', n: o.revise, st: 'late' as Status },
                    { label: 'Dikerjakan', n: o.open, st: 'on' as Status },
                  ].map((x) => (
                    <li key={x.label} className="mk-inset">
                      <div className="t-title-2 tabular-nums">{x.n}</div>
                      <StatusBadge status={x.n ? x.st : 'neutral'} size="sm">
                        {x.label}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2" aria-label="Tahapan">
            <h4 className="t-headline">Tahapan</h4>
            {stageSteps.length ? (
              <FlowDiagram orientation="vertical" steps={stageSteps} label="Tahapan proyek" />
            ) : (
              <>
                <p className="t-footnote text-ink-2">PIC belum menyusun tahapan. Fase proyek:</p>
                <FlowDiagram orientation="vertical" steps={phaseSteps(p.phase, p.status, p.reason)} label="Fase proyek" />
              </>
            )}
          </section>
        </div>
      )}
    </Sheet>
  )
}
