'use client'

/**
 * Meja kerja Admin PT (04-admin-pt.md): siapa yang belum lapor hari ini, siapa
 * yang sudah diingatkan, apa yang siap diteruskan ke holding, dan apa yang
 * menunggu tanda tangan Anda. Admin menilai kepatuhan, bukan isi laporan.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import {
  AttentionItem, Button, Card, DivisionBar, EmptyNote, FlowDiagram, Heatmap, Hero, ProgressBar, SegmentedControl, Sheet,
  StatTile, StatusBadge, cx, type FlowStep, type Status,
} from '@/components/mk'
import { DailyStatusBadge, weeklyHeaderStatus } from '@/components/status-badges'
import { DashHeader } from '@/components/views/dash-common'
import { ESCALATION_NEEDED_LABELS, PROJECT_PHASE_LABELS } from '@/lib/constants'
import { formatDateShort, formatTime } from '@/lib/format'
import { CountUp, DeadlineRing, TallyPill, remainLong } from './parts'
import { AccessRequestsCard } from '@/components/admin/access-requests-card'
import { UnlockCard } from '@/components/admin/unlock-card'
import { divisionTone } from '@/lib/division-tone'

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

type Filter = 'all' | 'missing' | 'in' | 'forwarded'
const WIB = 'Asia/Jakarta'
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

function rowStatus(p: AdminProject, locked: boolean, reminded: string | null): { status: Status; text: string } {
  const r = p.report
  if (r?.forwardedAt) return { status: 'done', text: 'Diteruskan' }
  if (r?.submittedAt) return { status: r.isLate ? 'risk' : 'info', text: `${r.isLate ? 'Terlambat masuk' : 'Masuk'} ${formatTime(r.submittedAt)}` }
  if (reminded) return { status: locked ? 'late' : 'risk', text: `Diingatkan ${formatTime(reminded)}` }
  if (r) return { status: locked ? 'late' : 'risk', text: 'Draf belum dikirim' }
  return { status: locked ? 'late' : 'neutral', text: 'Belum masuk' }
}

function weeklyText(r: AdminDesk['divisions'][number]['report']) {
  if (!r) return 'Belum masuk'
  if (r.forwardedAt) return 'Diteruskan'
  if (r.statusHeader === 'DISETUJUI') return 'Disetujui'
  if (r.statusHeader === 'MENUNGGU_PERSETUJUAN') return 'Menunggu persetujuan'
  if (r.statusHeader === 'TERKUNCI') return 'Terkunci'
  return 'Draf'
}

export function AdminDeskView({ data, reload }: { data: AdminDesk; reload: () => void }) {
  const { setActiveTab } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [reminded, setReminded] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [lastOpen, setLastOpen] = useState<AdminProject | null>(null)

  const remindedAt = (p: AdminProject) => reminded[p.id] ?? p.remindedAt
  const projects = data.projects
  const n = projects.length
  const received = projects.filter((p) => p.report?.submittedAt)
  const missing = projects.filter((p) => !p.report?.submittedAt)
  const forwarded = projects.filter((p) => p.report?.forwardedAt)
  const toForward = received.filter((p) => !p.report?.forwardedAt)
  const remindable = missing.filter((p) => p.pic && !remindedAt(p))
  const remindedCount = missing.filter((p) => remindedAt(p)).length
  const noPic = missing.filter((p) => !p.pic).length
  const waiting = data.approvals.length + data.escalations.length
  const weeklyIn = data.divisions.filter((d) => d.report?.submittedAt).length

  const shown = projects.filter((p) =>
    filter === 'missing' ? !p.report?.submittedAt : filter === 'in' ? p.report?.submittedAt && !p.report.forwardedAt : filter === 'forwarded' ? p.report?.forwardedAt : true
  )
  const open = projects.find((p) => p.id === openId) ?? null
  if (open && open !== lastOpen) setLastOpen(open)
  const sheetP = open ?? lastOpen

  async function remind(p: AdminProject | 'all') {
    setSending(p === 'all' ? 'all' : p.id)
    try {
      const res = await fetch('/api/work-desk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p === 'all' ? { action: 'remind-all-pics' } : { action: 'remind-pic', projectId: p.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (p === 'all') {
        if (!res.ok) return void toast.error(json.error || 'Pengingat belum terkirim')
        const sent = (json.sent ?? []) as { projectId: string; picName: string; remindedAt: string }[]
        setReminded((m) => ({ ...m, ...Object.fromEntries(sent.map((s) => [s.projectId, s.remindedAt])) }))
        toast.success(sent.length ? `${sent.length} PIC diingatkan. Tercatat di log aktivitas.` : 'Tidak ada PIC yang perlu diingatkan.')
      } else if (res.ok) {
        setReminded((m) => ({ ...m, [p.id]: json.remindedAt }))
        toast.success(`${json.picName} diingatkan. Tercatat di log aktivitas.`)
      } else {
        if (json.remindedAt) setReminded((m) => ({ ...m, [p.id]: json.remindedAt }))
        toast.error(json.error || 'Pengingat belum terkirim')
      }
      reload()
    } catch {
      toast.error('Tidak dapat menghubungi server')
    } finally {
      setSending(null)
    }
  }

  const workStart = new Date(Date.parse(data.today) + 8 * 3600000).toISOString()
  const allIn = n > 0 && missing.length === 0

  const primary =
    missing.length > 0 && !data.locked && data.canRemind ? (
      <Button variant="primary" icon="notifikasi" disabled={remindable.length === 0 || sending !== null} onClick={() => remind('all')}>
        {sending === 'all' ? 'Mengirim…' : remindable.length ? `Ingatkan ${remindable.length} PIC` : 'Semua sudah diingatkan'}
      </Button>
    ) : toForward.length > 0 ? (
      <Button variant="primary" icon="kirim" onClick={() => setActiveTab('inbox')}>
        Teruskan {toForward.length} laporan
      </Button>
    ) : (
      <Button variant="primary" icon="ringkasan" onClick={() => setActiveTab('dashboard')}>
        Lihat ringkasan
      </Button>
    )

  const flow: FlowStep[] = [
    { title: 'PIC mengisi', sub: `${received.length} dari ${n} masuk`, status: allIn ? 'done' : data.locked ? 'blocked' : 'current', icon: 'catatan', meta: !allIn && remindedCount ? `${remindedCount} diingatkan` : undefined },
    { title: 'Masuk ke Anda', sub: `${toForward.length} menunggu diteruskan`, status: received.length === 0 ? 'todo' : toForward.length ? 'current' : 'done', icon: 'dokumen' },
    { title: 'Diteruskan ke holding', sub: `${forwarded.length} dari ${n}`, status: n && forwarded.length === n ? 'done' : forwarded.length ? 'current' : 'todo', icon: 'kirim' },
    { title: `Terkunci ${data.cutoffLabel}`, sub: data.locked ? 'Sudah terkunci' : 'Perubahan ditutup', status: data.locked ? 'done' : 'todo', icon: 'kunci' },
  ]

  const hist = data.history
  const dayLabel = (iso: string) => new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', timeZone: WIB }).format(new Date(iso)).replace('.', '')

  return (
    <>
      <DashHeader
        context={data.entity.name}
        tools={
          allIn ? (
            <StatusBadge status="done">Laporan hari ini · Lengkap</StatusBadge>
          ) : (
            <StatusBadge status={data.locked ? 'late' : 'risk'}>
              {missing.length} belum lapor
            </StatusBadge>
          )
        }
      />

      <Hero
        eyebrow={`Meja kerja · ${new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: WIB }).format(new Date(data.today))}`}
        answer={n === 0 ? 'Belum ada proyek aktif di perusahaan Anda.' : `${received.length} dari ${n} proyek sudah lapor hari ini.`}
        support={[
          missing.length ? `${missing.length} belum lapor, ${remindedCount} sudah diingatkan.` : n ? 'Semua PIC sudah mengirim laporan.' : null,
          noPic ? `${noPic} proyek belum punya PIC.` : null,
          toForward.length ? `${toForward.length} laporan siap diteruskan ke holding.` : null,
          waiting ? `${waiting} hal menunggu Anda.` : null,
          data.locked ? `Tenggat ${data.cutoffLabel} sudah lewat.` : missing.length ? `Tenggat ${data.cutoffLabel} WIB, ${remainLong(data.countdown.totalMs)} lagi.` : null,
        ]
          .filter(Boolean)
          .join(' ')}
        actions={
          <>
            {primary}
            <Button variant="plain" onClick={() => setActiveTab('inbox')}>
              Buka penerimaan
            </Button>
          </>
        }
        art={<DeadlineRing from={workStart} to={data.lockAt} done={allIn} doneLabel="Lengkap" doneCaption="semua PIC sudah lapor" caption={`menuju ${data.cutoffLabel} WIB`} />}
        kpis={
          <>
            <StatTile variant="gradient" label="Laporan masuk" value={`${received.length} dari ${n}`} delta={`${pct(received.length, n)}% hari ini`} spark={hist.map((h) => h.submitted)} />
            <StatTile label="Belum lapor" value={missing.length} delta={missing.length ? `${remindedCount} sudah diingatkan` : 'Lengkap'} tone={missing.length ? (data.locked ? 'late' : 'risk') : 'on'} onClick={() => setFilter('missing')} />
            <StatTile label="Siap diteruskan" value={toForward.length} delta={`${forwarded.length} sudah diteruskan`} tone={toForward.length ? 'info' : 'neutral'} onClick={() => setActiveTab('inbox')} />
            <StatTile label="Menunggu Anda" value={waiting} delta={`${data.approvals.length} pengajuan · ${data.escalations.length} eskalasi`} tone={waiting ? 'risk' : 'on'} />
          </>
        }
      />

      <div className="mk-row">
        <Card
          className="is-wide"
          title="Laporan harian per proyek"
          subtitle={data.locked ? `Terkunci sejak ${data.cutoffLabel}` : 'Ketuk baris untuk detail · pengingat sekali per proyek per hari'}
          action={
            <SegmentedControl
              size="sm"
              label="Saring laporan"
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              options={[
                { value: 'all', label: `Semua ${n}` },
                { value: 'missing', label: `Belum ${missing.length}` },
                { value: 'in', label: `Masuk ${toForward.length}` },
                { value: 'forwarded', label: `Diteruskan ${forwarded.length}` },
              ]}
            />
          }
        >
          {shown.length === 0 ? (
            <EmptyNote done={filter === 'missing'}>
              {filter === 'missing' ? 'Semua proyek sudah lapor hari ini.' : n === 0 ? 'Belum ada proyek aktif.' : 'Tidak ada proyek pada saringan ini.'}
            </EmptyNote>
          ) : (
            <ul className="mk-desk-queue">
              {shown.map((p, i) => {
                const st = rowStatus(p, data.locked, remindedAt(p))
                const canRemindThis = data.canRemind && !data.locked && !p.report?.submittedAt && p.pic && !remindedAt(p)
                return (
                  <li key={p.id} className="mk-desk-queue__row" style={{ '--i': i } as React.CSSProperties}>
                    <div className="mk-desk-queue__line">
                      <button type="button" className="mk-desk-queue__hit" onClick={() => setOpenId(p.id)}>
                        <span className="min-w-0 flex-1">
                          <span className="t-body-strong block truncate">{p.name}</span>
                          <span className="t-footnote text-ink-2 block truncate">
                            {p.picName ?? 'Belum ada PIC'} · {p.code}
                            {p.report ? ` · progres ${p.report.progressPct}%` : ''}
                          </span>
                        </span>
                        <span className="mk-desk-queue__bar">
                          <ProgressBar value={pct(p.tasks.done, p.tasks.total)} status="accent" showValue={false} label={`Task ${p.name}`} />
                          <span className="t-caption text-ink-2 tabular-nums">{p.tasks.total ? `${p.tasks.done} dari ${p.tasks.total} task` : 'Tanpa task'}</span>
                        </span>
                        <span key={st.text} className="mk-desk-pop">
                          <StatusBadge status={st.status} size="sm">
                            {st.text}
                          </StatusBadge>
                        </span>
                      </button>
                      {canRemindThis ? (
                        <Button size="sm" variant="secondary" icon="notifikasi" disabled={sending !== null} onClick={() => remind(p)} aria-label={`Ingatkan ${p.picName} untuk ${p.name}`}>
                          {sending === p.id ? 'Mengirim…' : 'Ingatkan'}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <Card className="is-narrow" title="Alur hari ini" subtitle={`Laporan harian ${data.entity.code}`}>
          <div className="flex flex-col gap-5">
            <div className="mk-desk-tallies">
              <TallyPill label="masuk" value={received.length} total={n} status={allIn ? 'done' : undefined} />
              <TallyPill label="diteruskan" value={forwarded.length} total={n} />
            </div>
            <FlowDiagram orientation="vertical" steps={flow} label="Alur laporan harian" />
          </div>
        </Card>
      </div>

      <div className="mk-row">
        <Card
          className="is-half"
          title={`Capaian mingguan M${data.week.isoWeek}`}
          subtitle={`${weeklyIn} dari ${data.divisions.length} divisi menyerahkan · tenggat ${new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: WIB }).format(new Date(data.week.handoverBy))} ${formatTime(data.week.handoverBy)}`}
          action={
            <Button size="sm" variant="secondary" onClick={() => setActiveTab('divisions')}>
              Buka divisi
            </Button>
          }
        >
          {data.divisions.length === 0 ? (
            <EmptyNote icon="tim">Belum ada divisi aktif.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-4">
              {data.divisions.map((d, i) => {
                const r = d.report
                const warn = r ? [r.blocked ? `${r.blocked} terkendala` : null, r.missingEvidence ? `${r.missingEvidence} tanpa bukti` : null].filter(Boolean).join(' · ') : ''
                return (
                  <div key={d.id} className="mk-desk-div" style={{ '--i': i } as React.CSSProperties}>
                    <DivisionBar
                      name={`Divisi ${d.name}`}
                      value={r ? pct(r.done, r.items) : 0}
                      tone={divisionTone(d.name)}
                      meta={r ? `${r.done} dari ${r.items} item${warn ? ` · ${warn}` : ''}` : (d.head?.name ?? 'Kepala divisi belum ditetapkan')}
                    />
                    <StatusBadge status={r ? (r.forwardedAt ? 'done' : weeklyHeaderStatus(r.statusHeader)) : data.week.locked ? 'late' : 'neutral'} size="sm">
                      {weeklyText(r)}
                    </StatusBadge>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
        <Card className="is-half" title="Menunggu Anda" subtitle={waiting ? 'Pengajuan proyek dan eskalasi' : 'Tidak ada yang tertunda'}>
          {waiting === 0 ? (
            <EmptyNote done>Tidak ada yang menunggu tindakan Anda.</EmptyNote>
          ) : (
            <div>
              {data.approvals.map((a) => (
                <AttentionItem
                  key={a.id}
                  title={a.name}
                  reason={`Pengajuan proyek dari ${a.proposer} · perlu tanda tangan Anda`}
                  status="info"
                  meta={formatDateShort(a.proposedAt)}
                  onClick={() => setActiveTab('projects')}
                />
              ))}
              {data.escalations.map((e) => (
                <AttentionItem
                  key={e.id}
                  title={e.summary}
                  reason={`${ESCALATION_NEEDED_LABELS[e.needed] ?? e.needed} · ${e.raisedBy ?? 'Pengaju'} · ${e.ageDays} hari${e.overdue ? ', lewat SLA' : ''}`}
                  status={e.overdue ? 'late' : 'risk'}
                  meta={e.status === 'DIAJUKAN' ? 'Diajukan' : 'Ditinjau'}
                  onClick={() => setActiveTab('escalations')}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Permintaan akses & buka kunci (P2-C): diproses di sini, tercatat di log aktivitas. */}
      <div className="mk-row">
        <AccessRequestsCard className="is-half" />
        <UnlockCard className="is-half" />
      </div>

      <Card
        title="Pola 10 hari kerja"
        subtitle={`Persentase dari ${n} proyek · ${data.lateThisMonth} keterlambatan tercatat bulan ini`}
      >
        {hist.length === 0 || n === 0 ? (
          <EmptyNote>Belum ada riwayat.</EmptyNote>
        ) : (
          <div className="mk-scroll-x">
            <Heatmap
              data={[hist.map((h) => pct(h.submitted, n)), hist.map((h) => pct(h.onTime, n)), hist.map((h) => pct(h.forwarded, n))]}
              rowLabels={['Masuk', 'Tepat waktu', 'Diteruskan']}
              colLabels={hist.map((h) => dayLabel(h.date))}
              max={100}
              cell={30}
              tone="data-2"
              formatCell={(v) => `${v}%`}
              label="Kepatuhan laporan harian 10 hari kerja"
              lowLabel="0%"
              highLabel="100%"
              showLegend
            />
          </div>
        )}
      </Card>

      <Sheet
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={sheetP?.name ?? ''}
        subtitle={sheetP ? `${sheetP.code} · ${sheetP.picName ?? 'Belum ada PIC'}` : undefined}
        eyebrow={sheetP ? <StatusBadge status={rowStatus(sheetP, data.locked, remindedAt(sheetP)).status} size="sm">{rowStatus(sheetP, data.locked, remindedAt(sheetP)).text}</StatusBadge> : undefined}
        backLabel="Meja kerja"
        footer={
          sheetP ? (
            !sheetP.report?.submittedAt ? (
              <Button
                variant="primary"
                icon="notifikasi"
                disabled={!data.canRemind || data.locked || !sheetP.pic || Boolean(remindedAt(sheetP)) || sending !== null}
                onClick={() => remind(sheetP)}
              >
                {remindedAt(sheetP) ? `Diingatkan ${formatTime(remindedAt(sheetP))}` : sheetP.pic ? `Ingatkan ${sheetP.pic.name}` : 'Belum ada PIC'}
              </Button>
            ) : !sheetP.report.forwardedAt && data.canForward ? (
              <Button
                variant="primary"
                icon="kirim"
                onClick={() => {
                  setOpenId(null)
                  setActiveTab('inbox')
                }}
              >
                Teruskan di penerimaan
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setOpenId(null)}>
                Tutup
              </Button>
            )
          ) : null
        }
      >
        {sheetP && (
          <>
            <div className="mk-kv">
              <div>
                <div className="t-footnote text-ink-2">Tahap</div>
                <div className="t-body-strong">{PROJECT_PHASE_LABELS[sheetP.phase] ?? sheetP.phase}</div>
              </div>
              <div>
                <div className="t-footnote text-ink-2">Progres</div>
                <div className="t-body-strong">{sheetP.report ? `${sheetP.report.progressPct}%` : '—'}</div>
              </div>
              <div>
                <div className="t-footnote text-ink-2">Task hari ini</div>
                <div className="t-body-strong">
                  <CountUp value={sheetP.tasks.done} /> dari {sheetP.tasks.total}
                </div>
              </div>
              <div>
                <div className="t-footnote text-ink-2">Bukti</div>
                <div className="t-body-strong">{sheetP.report?.evidenceCount ?? 0} berkas</div>
              </div>
            </div>
            <div>
              <h3 className="t-headline mb-3">Alur laporan</h3>
              <FlowDiagram
                orientation="vertical"
                label="Alur laporan proyek"
                steps={[
                  {
                    title: 'Diisi PIC',
                    sub: sheetP.report?.submittedAt ? `${sheetP.report.submittedBy ?? sheetP.picName ?? 'PIC'} · ${formatTime(sheetP.report.submittedAt)}` : remindedAt(sheetP) ? `Diingatkan ${formatTime(remindedAt(sheetP))}` : 'Belum dikirim',
                    status: sheetP.report?.submittedAt ? 'done' : data.locked ? 'blocked' : 'current',
                    icon: 'catatan',
                    meta: sheetP.report?.isLate ? 'Terlambat masuk' : undefined,
                  },
                  { title: 'Masuk ke Anda', status: sheetP.report?.forwardedAt ? 'done' : sheetP.report?.submittedAt ? 'current' : 'todo', icon: 'dokumen' },
                  { title: 'Diteruskan ke holding', sub: sheetP.report?.forwardedAt ? formatTime(sheetP.report.forwardedAt) : undefined, status: sheetP.report?.forwardedAt ? 'done' : 'todo', icon: 'kirim' },
                ]}
              />
            </div>
            {sheetP.report ? (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="t-headline">Capaian hari ini</h3>
                  <DailyStatusBadge status={sheetP.report.status} size="xs" />
                </div>
                <p className={cx('mk-note-box', 'bg-fill-1')}>{sheetP.report.achievement || 'Belum ditulis.'}</p>
                {sheetP.report.needsEscalation && <div className="mk-note-box mk-soft--risk mt-3">PIC menandai laporan ini perlu eskalasi.</div>}
              </div>
            ) : (
              <EmptyNote icon="catatan">PIC belum membuat laporan hari ini.</EmptyNote>
            )}
          </>
        )}
      </Sheet>
    </>
  )
}
