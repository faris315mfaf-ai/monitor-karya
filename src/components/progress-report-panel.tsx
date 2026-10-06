'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import {
  Button, Card, Chip, EmptyNote, ErrorNote, Icon, ProgressBar, Sheet, Skeleton, StatusBadge, statusFromDaily, type Status,
} from '@/components/mk'
import { DailyStatusBadge } from '@/components/status-badges'
import { EvidencePanel, type EvidenceItem } from '@/components/evidence-panel'
import { WeeklyTaskBoard, weekKeyOf } from '@/components/weekly-task-board'
import type { ProjectOption } from '@/components/task-dialog'
import { Field, useConfirm } from '@/components/companies/parts'
import { DAILY_STATUS_META } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/format'

type Report = {
  id: string
  status: string
  progressPct: number
  summary: string
  obstacle: string | null
  followUp: string | null
  evidenceCount: number
  submittedAt: string | null
  isLocked: boolean
  updatedAt: string
  evidence: EvidenceItem[]
}

type PeriodRow = {
  key: string
  start: string
  end: string
  lockAt: string
  locked: boolean
  current: boolean
  report: Report | null
}

type Data = {
  project: { id: string; name: string; code: string }
  cadence: 'MINGGUAN' | 'BULANAN'
  periods: PeriodRow[]
}

const STATUS_OPTIONS = ['SELESAI', 'ON_PROGRESS', 'TERKENDALA', 'MENUNGGU_KEPUTUSAN', 'TIDAK_ADA_PERUBAHAN']

function periodLabel(cadence: Data['cadence'], p: PeriodRow) {
  if (cadence === 'MINGGUAN') {
    const w = p.key.split('-W')[1]
    return `Minggu ${Number(w)} · ${formatDate(p.start)}–${formatDate(p.end)}`
  }
  const month = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(p.start))
  return month.charAt(0).toUpperCase() + month.slice(1)
}

/** Keadaan laporan satu periode dalam kosakata status desain. */
function periodState(p: PeriodRow): { status: Status; label: string } {
  const r = p.report
  if (r?.submittedAt) return { status: 'done', label: p.locked ? 'Terkirim · terkunci' : 'Terkirim' }
  if (p.locked) return { status: 'late', label: r ? 'Draf terkunci' : 'Tidak dikirim' }
  if (r) return { status: 'risk', label: 'Draf belum dikirim' }
  return { status: 'neutral', label: 'Belum diisi' }
}

function lockLine(p: PeriodRow) {
  const r = p.report
  return [p.locked ? `Dikunci ${formatDateTime(p.lockAt)}` : `Tenggat ${formatDateTime(p.lockAt)}`, r ? `${r.evidenceCount} bukti` : null]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Laporan kemajuan per MINGGU atau per BULAN untuk satu proyek.
 *
 * Mingguan (8 Sep 2026): laporannya adalah papan capaian task per hari —
 * kartu bisa diseret antar hari, diubah, dihapus, ditambah — lalu satu kartu
 * ringkasan & bukti untuk minggu yang sama. Bulanan: daftar periode; detail
 * periode dibuka di Sheet. Laporan yang belum terkunci bisa diubah atau
 * dihapus; yang terkunci hanya dibaca.
 */
export function ProgressReportPanel({
  projectId,
  projectName,
  projects,
  cadence,
}: {
  projectId: string
  projectName?: string
  projects?: ProjectOption[]
  cadence: 'MINGGUAN' | 'BULANAN'
}) {
  const { data, loading, error, reload } = useResource<Data>(
    `/api/progress-reports?projectId=${projectId}&cadence=${cadence}`
  )
  const [weekKey, setWeekKey] = useState(() => weekKeyOf())
  const [openKey, setOpenKey] = useState<string | null>(null)

  // Data lama dari proyek/kadens lain tidak boleh tampil saat berpindah.
  const fresh = data && data.project.id === projectId && data.cadence === cadence ? data : null

  if (!fresh && loading) {
    return (
      <div className="mk-lap-stack" aria-busy="true" aria-label="Memuat laporan">
        <Skeleton h={cadence === 'MINGGUAN' ? 260 : 72} r={22} />
        <Skeleton h={180} r={22} />
      </div>
    )
  }
  if (!fresh) {
    return (
      <Card>
        <ErrorNote message={error ?? 'Laporan belum termuat.'} onRetry={reload} />
      </Card>
    )
  }

  if (cadence === 'MINGGUAN') {
    const period = fresh.periods.find((p) => p.key === weekKey) ?? null
    const st = period ? periodState(period) : null
    return (
      <div className="mk-lap-stack">
        <WeeklyTaskBoard
          projectId={projectId}
          projectName={projectName ?? fresh.project.name}
          projects={projects}
          weekKey={weekKey}
          onWeekChange={setWeekKey}
        />

        <Card
          title="Ringkasan minggu & bukti"
          subtitle={period ? `${periodLabel('MINGGUAN', period)} · ${lockLine(period)}` : undefined}
          action={st ? <StatusBadge status={st.status}>{st.label}</StatusBadge> : undefined}
        >
          {period ? (
            <PeriodDetail key={period.key} period={period} cadence="MINGGUAN" projectId={projectId} onChanged={reload} />
          ) : (
            <EmptyNote icon="kalender">Ringkasan hanya tersedia untuk {fresh.periods.length} minggu terakhir. Pilih minggu yang lebih baru di papan.</EmptyNote>
          )}
        </Card>
      </div>
    )
  }

  const done = fresh.periods.filter((p) => p.report?.submittedAt).length
  const opened = fresh.periods.find((p) => p.key === openKey) ?? null
  const pending = fresh.periods.find((p) => p.current && !p.report?.submittedAt)

  return (
    <>
      <Card
        title={`${done} dari ${fresh.periods.length} laporan bulanan terakhir sudah dikirim.`}
        subtitle={pending ? `Laporan ${periodLabel('BULANAN', pending)} belum dikirim · tenggat ${formatDateTime(pending.lockAt)}` : 'Pilih periode untuk membaca, mengubah, atau mengirim laporan.'}
        action={
          pending ? (
            <Button variant="primary" size="sm" onClick={() => setOpenKey(pending.key)}>
              Isi laporan bulan ini
            </Button>
          ) : undefined
        }
      >
        {fresh.periods.length === 0 ? (
          <EmptyNote icon="kalender">Belum ada periode laporan bulanan untuk proyek ini.</EmptyNote>
        ) : (
          <ul className="mk-lap-rows">
            {fresh.periods.map((p) => {
              const st = periodState(p)
              return (
                <li key={p.key}>
                  <button type="button" className="mk-lap-row" onClick={() => setOpenKey(p.key)} aria-label={`Buka laporan ${periodLabel('BULANAN', p)}`}>
                    <span className="mk-lap-row__main">
                      <span className="mk-lap-row__title">
                        {periodLabel('BULANAN', p)}
                        {p.current ? <span className="t-footnote text-accent font-semibold"> · Berjalan</span> : null}
                      </span>
                      <span className="mk-lap-row__meta">{lockLine(p)}</span>
                    </span>
                    {p.report ? (
                      <span className="mk-lap-row__prog">
                        <ProgressBar value={p.report.progressPct} status={statusFromDaily(p.report.status)} label={`Progres ${periodLabel('BULANAN', p)}`} />
                      </span>
                    ) : null}
                    <StatusBadge status={st.status} size="sm">
                      {st.label}
                    </StatusBadge>
                    <Icon name="kanan" size={18} className="mk-lap-row__chev" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Sheet
        open={!!opened}
        onOpenChange={(o) => !o && setOpenKey(null)}
        size="wide"
        eyebrow={fresh.project.name}
        title={opened ? `Laporan ${periodLabel('BULANAN', opened)}` : 'Laporan bulanan'}
        subtitle={opened ? lockLine(opened) : undefined}
        backLabel="Bulanan"
      >
        {opened ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={periodState(opened).status}>{periodState(opened).label}</StatusBadge>
              {opened.report ? <DailyStatusBadge status={opened.report.status} /> : null}
            </div>
            <PeriodDetail key={opened.key} period={opened} cadence="BULANAN" projectId={projectId} onChanged={reload} />
          </>
        ) : null}
      </Sheet>
    </>
  )
}

function PeriodDetail({
  period: p,
  cadence,
  projectId,
  onChanged,
}: {
  period: PeriodRow
  cadence: Data['cadence']
  projectId: string
  onChanged: () => void
}) {
  const r = p.report
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<'save' | 'submit' | 'delete' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirmEl, confirm] = useConfirm()

  const [status, setStatus] = useState(r?.status ?? '')
  const [progressPct, setProgressPct] = useState(r?.progressPct ?? 0)
  const [summary, setSummary] = useState(r?.summary ?? '')
  const [obstacle, setObstacle] = useState(r?.obstacle ?? '')
  const [followUp, setFollowUp] = useState(r?.followUp ?? '')

  const editable = !p.locked
  const showForm = editable && (editing || !r)
  const needsObstacle = status === 'TERKENDALA' || status === 'MENUNGGU_KEPUTUSAN'
  const needsEvidence = status !== '' && status !== 'TIDAK_ADA_PERUBAHAN'
  const unit = cadence === 'MINGGUAN' ? 'minggu' : 'bulan'

  async function send(action: 'save' | 'submit') {
    setBusy(action)
    setErr(null)
    try {
      const res = await fetch('/api/progress-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          cadence,
          periodKey: p.key,
          action,
          status,
          progressPct,
          summary,
          obstacle: obstacle || null,
          followUp: followUp || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Laporan belum tersimpan')
      } else {
        toast.success(action === 'submit' ? 'Laporan terkirim' : 'Draf tersimpan')
        setEditing(false)
        onChanged()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!r) return
    const ok = await confirm({
      title: `Hapus laporan ${unit} ini?`,
      description: 'Laporan periode ini beserta lampirannya dihapus dan tidak bisa dikembalikan.',
      confirmLabel: 'Hapus laporan',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    setErr(null)
    try {
      const res = await fetch(`/api/progress-reports?id=${r.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Laporan belum terhapus')
      else onChanged()
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mk-lap-stack">
      {r && !showForm && (
        <>
          <ProgressBar value={r.progressPct} size="lg" status={statusFromDaily(r.status)} label={`Progres kumulatif ${unit} ini`} />
          <p className="t-body text-ink whitespace-pre-wrap">{r.summary}</p>
          {r.obstacle && (
            <p className="mk-note-box mk-soft--risk">
              <strong>Kendala:</strong> {r.obstacle}
            </p>
          )}
          {r.followUp && (
            <p className="mk-note-box mk-soft--info">
              <strong>Tindak lanjut:</strong> {r.followUp}
            </p>
          )}
          <EvidencePanel targetType="PROGRESS_REPORT" targetId={r.id} items={r.evidence} disabled={!editable} onChanged={onChanged} required={needsEvidence} />
          {editable && (
            <div className="mk-lap-actions">
              {!r.submittedAt && (
                <Button
                  variant="primary"
                  icon="kirim"
                  onClick={() => send('submit')}
                  disabled={busy !== null || (needsEvidence && r.evidenceCount < 1)}
                >
                  {busy === 'submit' ? 'Mengirim…' : 'Kirim laporan'}
                </Button>
              )}
              <Button onClick={() => setEditing(true)} disabled={busy !== null}>
                Ubah laporan
              </Button>
              <Button variant="destructive" size="sm" onClick={remove} disabled={busy !== null}>
                {busy === 'delete' ? 'Menghapus…' : 'Hapus laporan'}
              </Button>
            </div>
          )}
          {editable && !r.submittedAt && needsEvidence && r.evidenceCount < 1 && (
            <p className="t-footnote mk-text--risk">Lampirkan minimal 1 bukti sebelum mengirim.</p>
          )}
        </>
      )}

      {showForm && (
        <>
          <Field label="Status" required>
            <div className="mk-lap-chips" role="group" aria-label="Status laporan">
              {STATUS_OPTIONS.map((s) => (
                <Chip key={s} selected={status === s} status={statusFromDaily(s)} onClick={() => setStatus(s)}>
                  {DAILY_STATUS_META[s]?.label ?? s}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={`Progres kumulatif ${progressPct}%`} htmlFor={`pp-${p.key}`}>
            <input
              id={`pp-${p.key}`}
              className="mk-lap-range"
              type="range"
              min={0}
              max={100}
              value={progressPct}
              onChange={(e) => setProgressPct(Number(e.target.value))}
            />
          </Field>
          <Field label={`Ringkasan capaian ${unit} ini`} htmlFor={`sum-${p.key}`} required>
            <textarea
              id={`sum-${p.key}`}
              className="mk-lap-input"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Apa yang tercapai, angka yang penting, dan hal yang perlu diketahui atasan."
            />
          </Field>
          {needsObstacle && (
            <div className="mk-formgrid">
              <Field label="Kendala" htmlFor={`obs-${p.key}`} required>
                <textarea
                  id={`obs-${p.key}`}
                  className="mk-lap-input"
                  rows={3}
                  value={obstacle}
                  onChange={(e) => setObstacle(e.target.value)}
                  placeholder="Apa yang menghambat? Mis. perangkat belum tiba"
                />
              </Field>
              <Field label="Rencana tindak lanjut" htmlFor={`fu-${p.key}`} required={status === 'TERKENDALA'}>
                <textarea
                  id={`fu-${p.key}`}
                  className="mk-lap-input"
                  rows={3}
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  placeholder="Langkah berikutnya dan kapan"
                />
              </Field>
            </div>
          )}
          {r ? (
            <EvidencePanel targetType="PROGRESS_REPORT" targetId={r.id} items={r.evidence} onChanged={onChanged} required={needsEvidence} />
          ) : (
            <p className="t-footnote text-ink-2">Simpan draf dulu, lalu lampirkan foto atau dokumen.</p>
          )}
          <div className="mk-lap-actions">
            <Button
              variant="primary"
              icon="kirim"
              onClick={() => send('submit')}
              disabled={busy !== null || !status || !summary.trim() || (needsEvidence && (r?.evidenceCount ?? 0) < 1)}
            >
              {busy === 'submit' ? 'Mengirim…' : 'Kirim laporan'}
            </Button>
            <Button onClick={() => send('save')} disabled={busy !== null || !status || !summary.trim()}>
              {busy === 'save' ? 'Menyimpan…' : 'Simpan draf'}
            </Button>
            {r && (
              <Button variant="plain" onClick={() => setEditing(false)} disabled={busy !== null}>
                Batalkan ubahan
              </Button>
            )}
          </div>
          {needsEvidence && (r?.evidenceCount ?? 0) < 1 && (
            <p className="t-footnote text-ink-2">Laporan bisa dikirim setelah minimal 1 bukti terlampir.</p>
          )}
        </>
      )}

      {!r && !editable && <EmptyNote icon="kunci">Periode ini sudah lewat tanpa laporan.</EmptyNote>}

      {err && (
        <p className="mk-note-box mk-soft--late flex items-start gap-2" role="alert">
          <Icon name="peringatan" size={18} className="shrink-0" />
          <span>{err}</span>
        </p>
      )}
      {confirmEl}
    </div>
  )
}
