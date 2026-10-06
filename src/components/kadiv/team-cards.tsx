'use client'

/**
 * Kartu tim kepala divisi (03-kepala-divisi.md §5, §7, §9): Laporan harian tim,
 * Beban kerja tim, Output harian per orang (Heatmap + tren vs target), dan
 * Aktivitas tim. Semua membaca `useKadivData`; baris anggota membuka MemberSheet.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ActivityItem, AreaChart, Avatar, Button, Card, DivisionBar, EmptyNote, ErrorNote, Heatmap, Skeleton, useIsPhone,
} from '@/components/mk'
import { ROLE_LABELS } from '@/lib/constants'
import { firstName, formatRelative } from '@/lib/format'
import { MemberSheet } from './member-sheet'
import { MembersSheet } from './members-sheet'
import { ReportBadge, loadTone } from './parts'
import { postJson, type KadivDataCtl } from './use-kadiv'
import type { KadivTeam, TeamMember } from './types'

const WIB = 'Asia/Jakarta'
const ORDER: Record<TeamMember['report']['state'], number> = { BELUM: 0, TERKIRIM: 1, ABSEN: 2, TIDAK_WAJIB: 3 }

function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} h={44} />
      ))}
    </div>
  )
}

function Guard({ ctl, children, rows }: { ctl: KadivDataCtl; children: (team: KadivTeam) => React.ReactNode; rows?: number }) {
  if (ctl.loading && !ctl.team) return <Loading rows={rows} />
  if (ctl.teamError && !ctl.team) return <ErrorNote message={ctl.teamError} onRetry={() => void ctl.reload()} />
  if (!ctl.team?.division) return <EmptyNote icon="tim">Anda belum tercatat sebagai kepala divisi mana pun.</EmptyNote>
  return <>{children(ctl.team)}</>
}

/** Sheet anggota & sheet atur anggota; dipasang sekali per layar. */
export function useTeamSheets(ctl: KadivDataCtl) {
  const [memberId, setMemberId] = useState<string | null>(null)
  const [manage, setManage] = useState(false)
  const member = ctl.team?.members.find((m) => m.id === memberId) ?? null
  const element = ctl.team ? (
    <>
      <MemberSheet member={member} team={ctl.team} onClose={() => setMemberId(null)} onChanged={ctl.reload} />
      {ctl.team.division && <MembersSheet open={manage} divisionId={ctl.team.division.id} onClose={() => setManage(false)} onChanged={ctl.reload} />}
    </>
  ) : null
  return { open: setMemberId, manage: () => setManage(true), element }
}
export type TeamSheets = ReturnType<typeof useTeamSheets>

/* ------------------------------------------------------------------ */
/* Laporan harian tim                                                   */
/* ------------------------------------------------------------------ */

export function TeamDailyCard({ ctl, sheets, className, id }: { ctl: KadivDataCtl; sheets: TeamSheets; className?: string; id?: string }) {
  const [busy, setBusy] = useState(false)
  const t = ctl.team
  const s = t?.summary
  const rows = useMemo(() => [...(t?.members ?? [])].sort((a, b) => ORDER[a.report.state] - ORDER[b.report.state] || a.name.localeCompare(b.name)), [t])
  const waiting = rows.filter((m) => m.report.state === 'BELUM' && !m.report.remindedAt)

  async function remindAll() {
    setBusy(true)
    try {
      const r = await postJson<{ sent: { name: string }[] }>('/api/kadiv/team', { action: 'remind', divisionId: t?.division?.id })
      const names = [...new Set(r.sent.map((x) => firstName(x.name)))]
      toast.success(names.length ? `${names.join(', ')} sudah diingatkan.` : 'Semua sudah diingatkan hari ini.')
      await ctl.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pengingat belum terkirim')
    } finally {
      setBusy(false)
    }
  }

  const deadline = t?.cutoffLabel ?? '17.00'
  return (
    <Card
      id={id}
      className={className}
      title="Laporan harian tim"
      subtitle={s ? `${s.reported} dari ${s.reporters} masuk · tenggat ${deadline}${s.absent ? ` · ${s.absent} orang tidak hadir` : ''}` : `Tenggat ${deadline}`}
      action={
        t?.division ? (
          <Button size="sm" variant="plain" icon="pengguna" onClick={sheets.manage}>
            Atur anggota
          </Button>
        ) : null
      }
    >
      <Guard ctl={ctl} rows={4}>
        {(team) =>
          team.members.length === 0 ? (
            <EmptyNote icon="tim" action={<Button size="sm" onClick={sheets.manage}>Tambah anggota</Button>}>
              Belum ada anggota di divisi {team.division?.name}. Tambahkan anggota atau tautkan proyek ke divisi ini.
            </EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="mk-desk-queue">
                {rows.map((m, i) => (
                  <li key={m.id} className="mk-desk-queue__row" style={{ '--i': i } as React.CSSProperties}>
                    <button type="button" className="mk-desk-queue__hit" onClick={() => sheets.open(m.id)}>
                      <Avatar initials={m.initials} name={m.name} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="t-body-strong block truncate">{m.name}</span>
                        <span className="t-footnote text-ink-2 block truncate">
                          {m.title || ROLE_LABELS[m.role] || m.role}
                          {m.projects.length ? ` · ${m.projects.map((p) => p.name).join(', ')}` : ''}
                        </span>
                        <span className="mt-1 block">
                          <ReportBadge member={m} locked={team.locked} size="sm" />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {rows.some((m) => m.report.state === 'BELUM') && (
                <Button variant="primary" icon="notifikasi" full disabled={busy || team.locked || waiting.length === 0} onClick={() => void remindAll()}>
                  {team.locked ? `Terkunci sejak ${deadline}` : waiting.length === 0 ? 'Semua sudah diingatkan' : busy ? 'Mengingatkan…' : 'Ingatkan yang belum mengirim'}
                </Button>
              )}
            </div>
          )
        }
      </Guard>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Beban kerja tim                                                      */
/* ------------------------------------------------------------------ */

export function WorkloadCard({ ctl, className }: { ctl: KadivDataCtl; className?: string }) {
  const s = ctl.team?.summary
  return (
    <Card
      className={className}
      title="Beban kerja tim"
      subtitle={
        s && s.avgLoad !== null
          ? `Rata-rata ${s.avgLoad}%${s.overloaded ? ` · ${s.overloaded} orang di atas 100%` : ''} · garis = batas sehat 80%`
          : 'Garis = batas sehat 80%'
      }
    >
      <Guard ctl={ctl}>
        {(team) =>
          team.members.length === 0 ? (
            <EmptyNote icon="tim">Belum ada anggota untuk dihitung.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-4">
              {[...team.members]
                .sort((a, b) => (b.load.pct ?? -1) - (a.load.pct ?? -1))
                .map((m) => (
                    <DivisionBar
                      key={m.id}
                      name={m.name}
                      value={m.load.pct ?? 0}
                      target={80}
                      tone={m.load.pct === null ? 'neutral' : loadTone(m.load.pct)}
                      meta={
                        m.load.pct === null
                          ? 'Tidak ada sisa hari kerja minggu ini'
                          : [
                              m.load.pct > 100 ? `Melebihi kapasitas · ${m.load.pct}%` : null,
                              `${m.load.openTasks} task terbuka`,
                              m.projects.length ? m.projects.map((p) => p.name).join(', ') : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                      }
                    />
                ))}
              <p className="t-footnote text-ink-2 mt-2">
                Sisa jam task terbuka dibanding sisa jam kerja minggu ini (8 jam per hari, tanpa hari cuti). Task tanpa durasi dihitung 1 jam.
              </p>
            </div>
          )
        }
      </Guard>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Output harian per orang                                              */
/* ------------------------------------------------------------------ */

export function OutputHeatmapCard({ ctl, className }: { ctl: KadivDataCtl; className?: string }) {
  const phone = useIsPhone()
  return (
    <Card className={className} title="Output harian per orang" subtitle="Task selesai dan output diterima · 10 hari kerja · sel kosong = cuti">
      <Guard ctl={ctl}>
        {(team) => {
          if (team.members.length === 0) return <EmptyNote icon="tim">Belum ada anggota.</EmptyNote>
          const max = Math.max(4, ...team.heat.flat().map((v) => v ?? 0))
          const cols = team.days.map((d) =>
            new Intl.DateTimeFormat('id-ID', { day: 'numeric', timeZone: WIB }).format(new Date(d)),
          )
          const trend = team.trend
          const hasTrend = trend.some((w) => w.accepted || w.target)
          return (
            <div className="flex flex-col gap-5">
              <div className="overflow-x-auto">
                <Heatmap
                  data={team.heat}
                  rowLabels={team.members.map((m) => (phone ? m.initials : firstName(m.name)))}
                  colLabels={cols}
                  max={max}
                  cell={phone ? 26 : 24}
                  label={`Output harian ${team.members.length} orang selama 10 hari kerja`}
                  lowLabel="Sedikit"
                  highLabel="Banyak"
                  formatCell={(v) => `${v} selesai`}
                />
              </div>
              <div>
                <div className="t-body-strong">Output diterima per minggu</div>
                <div className="t-footnote text-ink-2 mb-2">Dibanding target: output bertenggat minggu itu</div>
                {hasTrend ? (
                  <AreaChart
                    data={trend.map((w) => ({ label: w.label, value: w.accepted }))}
                    compare={trend.map((w) => w.target)}
                    seriesLabel="Diterima"
                    compareLabel="Target"
                    unit="output"
                    zero
                    height={160}
                  />
                ) : (
                  <EmptyNote icon="target">Belum ada output bertenggat dalam 8 minggu terakhir.</EmptyNote>
                )}
              </div>
            </div>
          )
        }}
      </Guard>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Aktivitas tim                                                        */
/* ------------------------------------------------------------------ */

export function TeamActivityCard({ ctl, className, limit = 8 }: { ctl: KadivDataCtl; className?: string; limit?: number }) {
  return (
    <Card className={className} title="Aktivitas tim" subtitle="14 hari terakhir · dari log aktivitas">
      <Guard ctl={ctl}>
        {(team) =>
          team.activity.length === 0 ? (
            <EmptyNote icon="aktivitas">Belum ada aktivitas tim.</EmptyNote>
          ) : (
            <div>
              {team.activity.slice(0, limit).map((a, i, arr) => (
                <ActivityItem key={a.id} who={a.actorName} initials={a.initials} action={a.text} time={formatRelative(a.at)} last={i === arr.length - 1} />
              ))}
            </div>
          )
        }
      </Guard>
    </Card>
  )
}
