'use client'

/**
 * Meja kerja Kepala divisi (03-kepala-divisi.md): apakah capaian minggu ini
 * siap diserahkan, dan apa yang masih menahannya? Daftar periksa penyerahan,
 * item yang perlu tindakan (dibuka di dialog item yang sama dengan papan
 * mingguan), capaian hari ini, dan riwayat 6 minggu.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import {
  BarChart, Button, Card, Chip, EmptyNote, FlowDiagram, Hero, ProgressBar, StatTile, StatusBadge, cx, useIsPhone, type FlowStep,
} from '@/components/mk'
import { ItemDialog, type Data as WeeklyData, type DivisionRow, type Item } from '@/components/division-weekly-desk'
import { WEEKLY_LANE, wibKey } from '@/components/weekly-board'
import { weeklyItemStatus } from '@/components/status-badges'
import { DashHeader } from '@/components/views/dash-common'
import { WEEKLY_STATUS_META } from '@/lib/constants'
import { formatTime } from '@/lib/format'
import { CountUp, DeadlineRing, DrawnCheck, remainLong, useTicker } from './parts'
import { ReviewOutputCard, TeamActivityCard, TeamDailyCard, WorkloadCard, useKadivData, useTeamSheets } from '@/components/kadiv'
import { RequestAccessCard } from '@/components/admin/request-access-form' // [F2-ADMIN]
import { WeeklyFeedbackCard } from '@/components/oversight/weekly-comments' // [F2-DIREKTUR]
import { ApprovalRequestsCard } from '@/components/oversight/approval-requests' // [F2-DIREKTUR]

export type KadivDesk = {
  kind: 'KADIV'
  today: string
  divisions: {
    id: string
    name: string
    entityName: string
    history: { label: string; done: number; total: number; status: string | null; onTime: boolean }[]
  }[]
}

const WIB = 'Asia/Jakarta'
const needsEvidence = (i: Item) => i.evidenceCount === 0 && !['BELUM_MULAI', 'NA'].includes(i.status)

function handoverText(iso: string) {
  const d = new Date(iso)
  return `${new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: WIB }).format(d)} ${formatTime(d)}`
}

/** Alasan sebuah item muncul di "Perlu tindakan", atau null bila tidak perlu. */
function attention(i: Item): string | null {
  if (i.status === 'TERKENDALA' && !i.obstacleFollowUp) return 'Terkendala · tindak lanjut belum ditulis'
  if (i.status === 'TERKENDALA') return `Terkendala · ${i.obstacleFollowUp}`
  if (needsEvidence(i)) return 'Belum ada bukti'
  if (i.status === 'BELUM_MULAI') return 'Belum mulai'
  return null
}

export function KadivDeskView({ desk, weekly, reload }: { desk: KadivDesk; weekly: WeeklyData; reload: () => void }) {
  const { setActiveTab } = useApp()
  const phone = useIsPhone()
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<'submit' | 'approve' | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [edit, setEdit] = useState<{ item: Item | null; lane: string } | null>(null)
  const [bar, setBar] = useState<number | undefined>(undefined)
  const now = useTicker(30000)

  const divisions = weekly.divisions
  const div: DivisionRow | null = divisions.find((d) => d.id === pickedId) ?? divisions[0] ?? null
  // Fitur tim (P2-B): review output, laporan harian tim, beban kerja, aktivitas.
  const kadiv = useKadivData(div?.id ?? null)
  const sheets = useTeamSheets(kadiv)

  if (!div) {
    return (
      <>
        <DashHeader context="Meja kerja" />
        <Card>
          <EmptyNote icon="tim">Anda belum tercatat sebagai kepala divisi mana pun. Hubungi Admin PT.</EmptyNote>
        </Card>
      </>
    )
  }

  const report = div.report
  const items = report?.items ?? []
  const counted = items.filter((i) => i.status !== 'NA')
  const done = counted.filter((i) => i.status === 'SELESAI').length
  const blocked = counted.filter((i) => i.status === 'TERKENDALA')
  const noEvidence = counted.filter(needsEvidence)
  const followUpMissing = blocked.filter((i) => !i.obstacleFollowUp)
  const submitted = Boolean(report?.submittedAt)
  const approved = Boolean(report?.approvedAt)
  const forwarded = Boolean(report?.forwardedAt)
  const locked = weekly.locked || Boolean(report?.isLocked)
  const todayKey = wibKey(desk.today)
  const todayItems = items.filter((i) => i.workDate && wibKey(i.workDate) === todayKey)
  const actionItems = items.map((i) => ({ i, why: attention(i) })).filter((x) => x.why) as { i: Item; why: string }[]
  const hist = desk.divisions.find((d) => d.id === div.id)?.history ?? []
  const barIdx = bar ?? hist.length - 1
  const onTimeWeeks = hist.slice(0, -1).filter((h) => h.onTime).length
  const handoverLeft = now ? Date.parse(weekly.week.handoverBy) - now.getTime() : Infinity
  const handoverPassed = handoverLeft <= 0
  const pct = counted.length ? Math.round((done / counted.length) * 100) : 0

  const checks = [
    { ok: items.length > 0, text: 'Capaian minggu ini sudah diisi', hint: items.length ? `${items.length} item di papan` : 'Tambahkan item pertama' },
    { ok: noEvidence.length === 0 && items.length > 0, text: 'Item berjalan dan selesai berbukti', hint: noEvidence.length ? `${noEvidence.length} item belum berbukti` : 'Semua item berbukti' },
    { ok: followUpMissing.length === 0 && items.length > 0, text: 'Kendala punya tindak lanjut', hint: blocked.length ? `${blocked.length - followUpMissing.length} dari ${blocked.length} item terkendala` : 'Tidak ada item terkendala' },
    { ok: submitted, text: 'Diserahkan ke Admin PT', hint: submitted ? `Pukul ${formatTime(report?.submittedAt)}` : handoverPassed ? 'Tenggat serah sudah lewat' : `Paling lambat ${handoverText(weekly.week.handoverBy)}` },
    { ok: approved, text: 'Disetujui', hint: approved ? `Pukul ${formatTime(report?.approvedAt)}` : weekly.canApprove ? 'Oleh Anda setelah diserahkan' : 'Oleh kepala divisi' },
    { ok: forwarded, text: 'Diteruskan ke holding', hint: forwarded ? `Pukul ${formatTime(report?.forwardedAt)}` : 'Oleh Admin PT' },
  ]
  const ready = checks.filter((c) => c.ok).length

  const flow: FlowStep[] = [
    { title: 'Isi capaian', sub: `${items.length} item`, status: items.length ? 'done' : 'current', icon: 'catatan' },
    { title: 'Serahkan', sub: handoverText(weekly.week.handoverBy), status: submitted ? 'done' : noEvidence.length || followUpMissing.length ? 'blocked' : items.length ? 'current' : 'todo', icon: 'kirim', meta: !submitted && noEvidence.length ? `${noEvidence.length} tanpa bukti` : undefined },
    { title: 'Setujui', sub: weekly.canApprove ? 'oleh Anda' : 'kepala divisi', status: approved ? 'done' : submitted ? 'current' : 'todo', icon: 'persetujuan' },
    { title: 'Diteruskan', sub: 'Admin PT ke holding', status: forwarded ? 'done' : approved ? 'current' : 'todo', icon: 'dokumen' },
  ]

  async function act(action: 'submit' | 'approve') {
    if (!div) return
    setBusy(action)
    setProblems([])
    try {
      const res = await fetch('/api/weekly-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ divisionId: div.id, week: weekly.week.key, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Belum berhasil')
        setProblems(Array.isArray(json.errors) ? json.errors : [])
      } else {
        toast.success(action === 'submit' ? `Capaian ${div.name} diserahkan ke Admin PT.` : `Capaian ${div.name} disetujui.`)
        reload()
      }
    } catch {
      toast.error('Tidak dapat menghubungi server')
    } finally {
      setBusy(null)
    }
  }

  const primary =
    !submitted && items.length > 0 ? (
      <Button variant="primary" icon="kirim" disabled={locked || busy !== null} onClick={() => act('submit')}>
        {busy === 'submit' ? 'Menyerahkan…' : 'Serahkan ke Admin PT'}
      </Button>
    ) : submitted && !approved && weekly.canApprove ? (
      <Button variant="primary" icon="persetujuan" disabled={locked || busy !== null} onClick={() => act('approve')}>
        {busy === 'approve' ? 'Menyetujui…' : 'Setujui capaian'}
      </Button>
    ) : (
      <Button variant="primary" icon="kalender" onClick={() => setActiveTab('weekly-input')}>
        Buka papan mingguan
      </Button>
    )

  const openNew = () => {
    const inWeek = weekly.days.some((d) => wibKey(d) === todayKey)
    setEdit({ item: null, lane: inWeek ? todayKey : WEEKLY_LANE })
  }

  return (
    <>
      <DashHeader
        context={divisions.length === 1 ? `Divisi ${div.name}` : `${divisions.length} divisi`}
        tools={
          submitted ? (
            <StatusBadge status="done">Capaian M{weekly.week.isoWeek} · Diserahkan</StatusBadge>
          ) : (
            <StatusBadge status={handoverPassed ? 'late' : 'risk'}>Capaian M{weekly.week.isoWeek} · Belum diserahkan</StatusBadge>
          )
        }
      />

      {divisions.length > 1 && (
        <div className="mk-chips" role="group" aria-label="Pilih divisi">
          {divisions.map((d) => (
            <Chip key={d.id} selected={d.id === div.id} count={d.report?.items.length ?? 0} onClick={() => setPickedId(d.id)}>
              {d.name}
            </Chip>
          ))}
        </div>
      )}

      <Hero
        eyebrow={`Meja kerja · minggu ke-${weekly.week.isoWeek}`}
        answer={
          items.length === 0
            ? `Divisi ${div.name} belum mengisi capaian minggu ini.`
            : submitted
              ? `Capaian divisi ${div.name} sudah diserahkan, ${done} dari ${counted.length} item selesai.`
              : `${ready} dari ${checks.length} syarat penyerahan sudah terpenuhi.`
        }
        support={[
          noEvidence.length ? `${noEvidence.length} item belum berbukti.` : null,
          followUpMissing.length ? `${followUpMissing.length} kendala belum punya tindak lanjut.` : null,
          submitted || !now ? null : handoverPassed ? 'Tenggat serah sudah lewat.' : `Serahkan dalam ${remainLong(handoverLeft)}, paling lambat ${handoverText(weekly.week.handoverBy)}.`,
          locked ? 'Minggu ini terkunci; perubahan perlu permohonan buka kunci.' : null,
          kadiv.review?.queue.length ? `${kadiv.review.queue.length} output menunggu review Anda.` : null,
        ]
          .filter(Boolean)
          .join(' ')}
        actions={
          <>
            {primary}
            <Button variant="plain" onClick={() => setActiveTab('weekly-input')}>
              Lihat papan mingguan
            </Button>
          </>
        }
        art={<DeadlineRing from={weekly.week.start} to={weekly.week.handoverBy} done={submitted} doneLabel="Diserahkan" doneCaption={`capaian M${weekly.week.isoWeek}`} caption="menuju tenggat serah" />}
        kpis={
          <>
            <StatTile variant="gradient" label="Item selesai" value={`${done} dari ${counted.length}`} delta={`${pct}% minggu ini`} spark={hist.map((h) => h.done)} />
            <StatTile label="Terkendala" value={blocked.length} delta={followUpMissing.length ? `${followUpMissing.length} tanpa tindak lanjut` : 'Semua punya tindak lanjut'} tone={blocked.length ? 'risk' : 'on'} />
            <StatTile label="Bukti kurang" value={noEvidence.length} delta={noEvidence.length ? 'Menahan penyerahan' : 'Semua item berbukti'} tone={noEvidence.length ? 'late' : 'on'} />
            <StatTile label="Serah tepat waktu" value={`${onTimeWeeks} dari ${Math.max(0, hist.length - 1)}`} delta="minggu sebelumnya" tone={hist.length > 1 && onTimeWeeks === hist.length - 1 ? 'on' : 'neutral'} />
          </>
        }
      />

      <div className="mk-row">
        <Card className="is-wide" title="Daftar periksa penyerahan" subtitle={`${ready} dari ${checks.length} terpenuhi · disusun dari papan mingguan`}>
          <div className="flex flex-col gap-5">
            <div className="mk-inset">
              <FlowDiagram orientation={phone ? 'vertical' : 'horizontal'} steps={flow} label="Alur capaian mingguan" />
            </div>
            <ul className="mk-desk-checks">
              {checks.map((c, i) => (
                <li key={c.text} className={cx('mk-desk-checks__item', c.ok && 'is-on')} style={{ '--i': i } as React.CSSProperties}>
                  <DrawnCheck checked={c.ok} />
                  <span className="min-w-0 flex-1">
                    <span className="t-body-strong block">{c.text}</span>
                    <span className="t-footnote text-ink-2 block">{c.hint}</span>
                  </span>
                  <span className="sr-only">{c.ok ? 'terpenuhi' : 'belum terpenuhi'}</span>
                </li>
              ))}
            </ul>
            {problems.length > 0 && (
              <div className="mk-note-box mk-soft--late" role="alert">
                <div className="t-body-strong mb-1">Perbaiki dulu sebelum menyerahkan</div>
                <ul className="t-footnote list-disc pl-5">
                  {problems.slice(0, 6).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
        <Card className="is-narrow" title="Perlu tindakan" subtitle={actionItems.length ? `${actionItems.length} item · ketuk untuk memperbaiki` : 'Tidak ada yang tertahan'}>
          {actionItems.length === 0 ? (
            <EmptyNote done>{items.length ? 'Semua item siap diserahkan.' : 'Belum ada item minggu ini.'}</EmptyNote>
          ) : (
            <ul className="mk-desk-queue">
              {actionItems.slice(0, 7).map(({ i, why }, n) => (
                <li key={i.id} className="mk-desk-queue__row" style={{ '--i': n } as React.CSSProperties}>
                  <button
                    type="button"
                    className="mk-desk-queue__hit"
                    disabled={locked}
                    onClick={() => setEdit({ item: i, lane: i.workDate ? wibKey(i.workDate) : WEEKLY_LANE })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="t-body-strong block truncate">{i.workItem}</span>
                      <span className="t-footnote text-ink-2 block truncate">
                        {i.picName} · {why}
                      </span>
                    </span>
                    <StatusBadge status={weeklyItemStatus(i.status)} size="sm">
                      {WEEKLY_STATUS_META[i.status]?.label ?? i.status}
                    </StatusBadge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mk-row">
        <ReviewOutputCard ctl={kadiv} className="is-wide" />
        <TeamDailyCard ctl={kadiv} sheets={sheets} className="is-narrow" />
      </div>

      <div className="mk-row">
        <Card
          className="is-half"
          title="Capaian hari ini"
          subtitle={todayItems.length ? `${todayItems.filter((i) => i.status === 'SELESAI').length} dari ${todayItems.length} selesai` : new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: WIB }).format(new Date(desk.today))}
          action={
            <Button size="sm" variant="secondary" icon="tambah" disabled={locked} onClick={openNew}>
              Tambah capaian
            </Button>
          }
        >
          {todayItems.length === 0 ? (
            <EmptyNote icon="kalender">Belum ada capaian yang dicatat untuk hari ini.</EmptyNote>
          ) : (
            <ul className="mk-desk-queue">
              {todayItems.map((i, n) => (
                <li key={i.id} className="mk-desk-queue__row" style={{ '--i': n } as React.CSSProperties}>
                  <button type="button" className="mk-desk-queue__hit" disabled={locked} onClick={() => setEdit({ item: i, lane: todayKey })}>
                    <DrawnCheck checked={i.status === 'SELESAI'} />
                    <span className="min-w-0 flex-1">
                      <span className="t-body-strong block truncate">{i.workItem}</span>
                      <span className="t-footnote text-ink-2 block truncate">
                        {i.picName} · {i.targetOutput}
                      </span>
                    </span>
                    <span className="mk-desk-queue__bar">
                      <ProgressBar value={i.progressPct} status={weeklyItemStatus(i.status) === 'neutral' ? 'accent' : weeklyItemStatus(i.status)} showValue={false} label={`Progres ${i.workItem}`} />
                      <span className="t-caption text-ink-2 tabular-nums">{i.progressPct}%</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          className="is-half"
          title="Riwayat 6 minggu"
          subtitle="Item selesai per minggu"
          action={
            hist[barIdx] ? (
              <div className="text-right">
                <div className="t-title-2">
                  <CountUp value={hist[barIdx].done} />
                  <span className="t-footnote text-ink-2"> dari {hist[barIdx].total}</span>
                </div>
                <div className="t-footnote">
                  {hist[barIdx].status ? (
                    <StatusBadge status={hist[barIdx].onTime ? 'done' : 'risk'} size="sm">
                      {hist[barIdx].onTime ? 'Diserahkan tepat waktu' : barIdx === hist.length - 1 && !submitted ? 'Belum diserahkan' : 'Terlambat diserahkan'}
                    </StatusBadge>
                  ) : (
                    <span className="text-ink-2">{hist[barIdx].label} · tidak ada laporan</span>
                  )}
                </div>
              </div>
            ) : null
          }
        >
          {hist.length === 0 ? (
            <EmptyNote>Belum ada riwayat.</EmptyNote>
          ) : (
            <BarChart data={hist.map((h) => ({ label: h.label, value: h.done }))} selectedIndex={barIdx} onSelect={setBar} height={180} unit="item" />
          )}
        </Card>
      </div>

      <div className="mk-row">
        <WorkloadCard ctl={kadiv} className="is-half" />
        <TeamActivityCard ctl={kadiv} className="is-half" />
      </div>

      {/* [F2-DIREKTUR] tanggapan direktur atas laporan mingguan & permintaan persetujuan */}
      <div className="mk-row">
        <WeeklyFeedbackCard key={`tanggapan-${div.id}`} divisionId={div.id} className="is-half" />
        <ApprovalRequestsCard divisionId={div.id} className="is-half" />
      </div>

      {/* [F2-ADMIN] permintaan akses ke Admin PT */}
      <RequestAccessCard />

      {sheets.element}

      {edit && (
        <ItemDialog
          divisionId={div.id}
          divisionName={div.name}
          data={weekly}
          item={edit.item}
          lane={edit.lane}
          locked={locked}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            reload()
          }}
        />
      )}
    </>
  )
}
