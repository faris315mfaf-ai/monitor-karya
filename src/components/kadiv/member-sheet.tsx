'use client'

/**
 * Sheet anggota (03-kepala-divisi.md "Sheet · Anggota"): lencana laporan,
 * kehadiran, beban kerja minggu ini, dikerjakan hari ini, kendala, rencana
 * besok, dan catatan ke PIC (P2-A /api/project-notes). Aksi utama
 * "Ingatkan <nama>" bila laporannya belum masuk, atau "Tandai sudah dibaca"
 * bila laporannya sudah masuk [F2-KADIV] (laporan tetap dikirim ke Admin PT;
 * tanda ini hanya untuk kepala divisi, bisa diurungkan lewat toast).
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Avatar, Button, DivisionBar, EmptyNote, ErrorNote, SegmentedControl, Sheet, Skeleton, StatusBadge } from '@/components/mk'
import { Textarea } from '@/components/ui/textarea'
import { ROLE_LABELS } from '@/lib/constants'
import { firstName, formatRelative, formatTime } from '@/lib/format'
import { TASK_STATUS_LABEL, loadTone, ReportBadge } from './parts'
import { postJson } from './use-kadiv'
import { ATTENDANCE_LABELS, type AttendanceStatus, type KadivTeam, type TeamMember } from './types'

type Note = { id: string; body: string; createdAt: string; authorName: string; mine: boolean; readAt: string | null }

function useNotes(projectId: string | null) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/project-notes?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      const j = (await res.json().catch(() => ({}))) as { items?: Note[]; unread?: number; error?: string }
      if (!res.ok) throw new Error(j.error || 'Catatan belum termuat')
      setNotes(j.items ?? [])
      setUnread(j.unread ?? 0)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Catatan belum termuat')
    }
  }, [projectId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  return { notes, unread, error, reload: load }
}

export function MemberSheet({
  member,
  team,
  onClose,
  onChanged,
}: {
  member: TeamMember | null
  team: KadivTeam
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const activeProject = member?.projects.find((p) => p.id === projectId)?.id ?? member?.projects[0]?.id ?? null
  const notes = useNotes(member ? activeProject : null)

  if (!member) return <Sheet open={false} onOpenChange={() => onClose()} title="" />

  const first = firstName(member.name)
  const canRemind = member.report.state === 'BELUM' && !team.locked && !member.report.remindedAt

  async function remind() {
    if (!member) return
    setBusy('remind')
    try {
      const r = await postJson<{ sent: unknown[] }>('/api/kadiv/team', { action: 'remind', userId: member.id, divisionId: team.division?.id })
      toast.success(r.sent?.length ? `${first} sudah diingatkan.` : `${first} sudah diingatkan sebelumnya hari ini.`)
      await onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pengingat belum terkirim')
    } finally {
      setBusy(null)
    }
  }

  async function setAttendance(status: AttendanceStatus) {
    if (!member || status === member.attendance) return
    setBusy('att')
    const userId = member.id
    try {
      const r = await postJson<{ previous: { status: string; note: string | null } | null }>('/api/attendance', { userId, status })
      const prev = r.previous
      toast.success(status === 'HADIR' ? `${first} dicatat hadir hari ini.` : `${first} dicatat ${ATTENDANCE_LABELS[status].toLowerCase()} hari ini.`, {
        action: {
          label: 'Urungkan',
          onClick: async () => {
            try {
              if (prev) await postJson('/api/attendance', { userId, status: prev.status, note: prev.note })
              else await fetch(`/api/attendance?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
              await onChanged()
            } catch {
              toast.error('Belum berhasil diurungkan')
            }
          },
        },
      })
      await onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kehadiran belum tersimpan')
    } finally {
      setBusy(null)
    }
  }

  async function sendNote() {
    if (!activeProject || !text.trim()) return
    setBusy('note')
    try {
      await postJson('/api/project-notes', { projectId: activeProject, body: text.trim() })
      setText('')
      toast.success(`Catatan terkirim ke ${first}.`)
      await notes.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Catatan belum terkirim')
    } finally {
      setBusy(null)
    }
  }

  /** [F2-KADIV] Tandai laporan harian hari ini (dan catatan yang belum dibaca) sudah dibaca. */
  async function markReportRead() {
    if (!member) return
    const userId = member.id
    setBusy('report-read')
    try {
      await postJson('/api/kadiv/team', { action: 'read', userId, divisionId: team.division?.id })
      if (activeProject && notes.unread > 0) await postJson('/api/project-notes', { projectId: activeProject }, 'PATCH').catch(() => null)
      toast.success(`Laporan ${first} ditandai sudah dibaca.`, {
        action: {
          label: 'Urungkan',
          onClick: async () => {
            try {
              await postJson('/api/kadiv/team', { action: 'unread', userId, divisionId: team.division?.id })
              await onChanged()
            } catch {
              toast.error('Belum berhasil diurungkan')
            }
          },
        },
      })
      await Promise.all([onChanged(), notes.reload()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belum berhasil')
    } finally {
      setBusy(null)
    }
  }

  async function markRead() {
    if (!activeProject) return
    setBusy('read')
    try {
      await postJson('/api/project-notes', { projectId: activeProject }, 'PATCH')
      toast.success('Catatan ditandai sudah dibaca.')
      await notes.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belum berhasil')
    } finally {
      setBusy(null)
    }
  }

  const load = member.load.pct
  const projectName = (id: string | null) => member.projects.find((p) => p.id === id)?.name ?? ''

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow={team.division ? `Divisi ${team.division.name}` : 'Tim'}
      title={member.name}
      subtitle={[member.title || ROLE_LABELS[member.role] || member.role, member.projects.length ? `${member.projects.length} proyek` : 'Tanpa proyek'].join(' · ')}
      backLabel="Tim"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {notes.unread > 0 && !(member.report.state === 'TERKIRIM' && !member.report.readAt) && (
            <Button variant="secondary" icon="selesai" disabled={busy !== null} onClick={() => void markRead()}>
              Tandai catatan dibaca
            </Button>
          )}
          {member.report.state === 'TERKIRIM' && !member.report.readAt ? (
            <Button variant="primary" icon="selesai" disabled={busy !== null} onClick={() => void markReportRead()}>
              {busy === 'report-read' ? 'Menandai…' : 'Tandai sudah dibaca'}
            </Button>
          ) : member.report.state === 'BELUM' ? (
            <Button variant="primary" icon="notifikasi" disabled={!canRemind || busy !== null} onClick={() => void remind()}>
              {member.report.remindedAt ? `Diingatkan ${formatTime(member.report.remindedAt)}` : busy === 'remind' ? 'Mengingatkan…' : `Ingatkan ${first}`}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Avatar initials={member.initials} name={member.name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="t-footnote text-ink-2">Laporan harian hari ini</div>
            <ReportBadge member={member} locked={team.locked} />
            {member.report.state === 'TERKIRIM' && (
              <div className="t-caption text-ink-2 mt-1">
                {member.report.readAt ? `Sudah Anda baca ${formatTime(member.report.readAt)}` : 'Belum Anda baca'} · dikirim ke Admin PT
              </div>
            )}
          </div>
        </div>

        <section className="flex flex-col gap-2" aria-label="Kehadiran">
          <h4 className="t-headline">Kehadiran hari ini</h4>
          <SegmentedControl
            label="Kehadiran hari ini"
            size="sm"
            full
            value={member.attendance}
            onChange={(v) => void setAttendance(v as AttendanceStatus)}
            options={(Object.keys(ATTENDANCE_LABELS) as AttendanceStatus[]).map((k) => ({ value: k, label: ATTENDANCE_LABELS[k] }))}
          />
          <p className="t-footnote text-ink-2">Orang yang cuti, sakit, atau izin tidak dihitung di laporan harian tim.</p>
        </section>

        <section className="flex flex-col gap-2" aria-label="Beban kerja">
          <h4 className="t-headline">Beban kerja minggu ini</h4>
          {load === null ? (
            <p className="t-footnote text-ink-2">Tidak ada sisa hari kerja minggu ini.</p>
          ) : (
            <DivisionBar
              name={first}
              value={load}
              target={80}
              tone={loadTone(load)}
              meta={`${load}% · ${member.load.openTasks} task terbuka · sisa ${Math.round(member.load.openMinutes / 60)} jam`}
            />
          )}
        </section>

        <section className="flex flex-col gap-2" aria-label="Dikerjakan hari ini">
          <h4 className="t-headline">Dikerjakan hari ini</h4>
          {member.today.achievements.length > 0 && (
            <ul className="t-body list-disc pl-5">
              {member.today.achievements.map((a, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  {a}
                </li>
              ))}
            </ul>
          )}
          {member.today.tasks.length === 0 ? (
            member.today.achievements.length ? null : 
            <EmptyNote icon="kalender">Belum ada task untuk hari ini.</EmptyNote>
          ) : (
            <ul className="mk-desk-queue">
              {member.today.tasks.map((t) => (
                <li key={t.id} className="mk-desk-queue__row">
                  <div className="mk-desk-queue__hit" style={{ cursor: 'default' }}>
                    <span className="min-w-0 flex-1">
                      <span className="t-body-strong block truncate">{t.title}</span>
                      <span className="t-footnote text-ink-2 block truncate">
                        {t.projectName} · {t.progressPct}%
                      </span>
                    </span>
                    <StatusBadge status={t.status === 'SELESAI' ? 'done' : t.status === 'TERKENDALA' ? 'late' : t.status === 'BELUM_MULAI' ? 'neutral' : 'on'} size="sm">
                      {TASK_STATUS_LABEL[t.status] ?? t.status}
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2" aria-label="Kendala">
          <h4 className="t-headline">Kendala</h4>
          {member.today.obstacles.length === 0 ? (
            <p className="t-footnote text-ink-2">Tidak ada kendala yang dicatat hari ini.</p>
          ) : (
            <ul className="t-body list-disc pl-5">
              {member.today.obstacles.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2" aria-label="Rencana besok">
          <h4 className="t-headline">Rencana besok</h4>
          {member.today.plans.length === 0 ? (
            <p className="t-footnote text-ink-2">Belum ada rencana yang dicatat.</p>
          ) : (
            <ul className="t-body list-disc pl-5">
              {member.today.plans.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
        </section>

        {member.projects.length > 0 && (
          <section className="flex flex-col gap-3" aria-label="Catatan">
            <h4 className="t-headline">Catatan ke {first}</h4>
            {member.projects.length > 1 && (
              <SegmentedControl
                label="Proyek catatan"
                size="sm"
                value={activeProject ?? undefined}
                onChange={setProjectId}
                options={member.projects.map((p) => ({ value: p.id, label: p.code }))}
              />
            )}
            {notes.error ? (
              <ErrorNote message={notes.error} onRetry={() => void notes.reload()} />
            ) : notes.notes === null ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                <Skeleton h={56} />
                <Skeleton h={56} />
              </div>
            ) : notes.notes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {notes.notes.slice(-4).map((n) => (
                  <li key={n.id} className="mk-inset t-body">
                    <div className="t-footnote text-ink-2">
                      {n.mine ? 'Anda' : n.authorName} · {formatRelative(n.createdAt)}
                      {!n.mine && !n.readAt ? ' · belum dibaca' : ''}
                    </div>
                    <div className="whitespace-pre-wrap">{n.body}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-footnote text-ink-2">Belum ada catatan untuk {projectName(activeProject)}.</p>
            )}
            <label htmlFor="kadiv-note" className="sr-only">
              Tulis catatan
            </label>
            <Textarea id="kadiv-note" rows={3} maxLength={2000} value={text} placeholder={`Tulis catatan untuk ${first}`} onChange={(e) => setText(e.target.value)} />
            <div className="flex justify-end">
              <Button variant="secondary" icon="kirim" disabled={!text.trim() || busy !== null} onClick={() => void sendNote()}>
                {busy === 'note' ? 'Mengirim…' : 'Kirim catatan'}
              </Button>
            </div>
          </section>
        )}
      </div>
    </Sheet>
  )
}
