'use client'

/**
 * Laporan mingguan divisi untuk pengawas (02-direktur.md butir 4 & Sheet):
 * baris per divisi dengan lencana per kepala divisi, alur laporan minggu ini,
 * dan sheet laporan terkirim / belum masuk.
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import { Avatar, Button, Card, EmptyNote, FlowDiagram, Icon, Sheet, StatusBadge, type FlowStep } from '@/components/mk'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import { WeeklyCommentThread, type WeeklyCommentThreadHandle } from './weekly-comments'
import { divisionTone } from '@/lib/division-tone'
import { formatNumber, formatRelative, initials } from '@/lib/format'
import { WEEKLY_HANDOVER_LABEL, WEEKLY_LOCK_LABEL } from '@/lib/lock'
import { WEEKLY_BADGE, pct, type DivisionSummary, type RingkasanData, type WeeklyState } from './types'

type Viewer = NonNullable<RingkasanData['viewer']>

/** Status baca & pengingat yang diubah di layar ini, di atas data server.
 *  `weekKey` ("2026-W40") = minggu laporan yang tampil; pengingat menagih minggu itu. */
export function useWeeklyActions(entityOf: (d: DivisionSummary) => string, weekKey?: string) {
  const [override, setOverride] = useState<Record<string, WeeklyState>>({})
  const [reminded, setReminded] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const stateOf = (d: DivisionSummary): WeeklyState => override[d.id] ?? d.weekly.state

  async function send(method: 'POST' | 'DELETE', d: DivisionSummary) {
    const res = await fetch('/api/ringkasan/laporan-dibaca', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyReportId: d.weekly.id }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(typeof j.error === 'string' ? j.error : 'Belum tersimpan. Coba lagi.')
    }
  }

  async function markRead(d: DivisionSummary) {
    if (!d.weekly.id) return
    const before = stateOf(d)
    setBusy(d.id)
    try {
      await send('POST', d)
      setOverride((o) => ({ ...o, [d.id]: 'read' }))
      refreshNavBadges()
      toast.success(`Laporan Divisi ${d.name} ditandai sudah dibaca.`, {
        action: {
          label: 'Urungkan',
          onClick: () => {
            send('DELETE', d)
              .then(() => {
                setOverride((o) => ({ ...o, [d.id]: before === 'read' ? 'sent' : before }))
                refreshNavBadges()
              })
              .catch((e: Error) => toast.error(e.message))
          },
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belum tersimpan. Coba lagi.')
    } finally {
      setBusy(null)
    }
  }

  async function remind(d: DivisionSummary) {
    setBusy(d.id)
    try {
      const res = await fetch('/api/notifications/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // [F1-B] Hanya divisi ini, untuk minggu yang tampil (bukan semua divisi minggu berjalan).
        body: JSON.stringify({ entityId: entityOf(d), divisionId: d.id, ...(weekKey ? { week: weekKey } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof j.error === 'string' ? j.error : 'Pengingat belum terkirim. Coba lagi.')
        return
      }
      // [F2-DIREKTUR] Toast mengikuti hasil sebenarnya, bukan selalu "terkirim".
      const outcome = (j.results as { outcome?: string }[] | undefined)?.[0]?.outcome
      if (outcome === 'TANPA_KEPALA') {
        toast.error(`Divisi ${d.name} belum punya kepala divisi. Minta Admin PT menetapkannya.`)
        return
      }
      setReminded((r) => ({ ...r, [d.id]: true }))
      if (outcome === 'SUDAH_HARI_INI') toast(`${d.head?.name ?? 'Kepala divisi'} sudah diingatkan hari ini.`)
      else toast.success(d.head ? `Pengingat terkirim ke ${d.head.name}.` : 'Pengingat terkirim ke kepala divisi yang belum melapor.')
    } catch {
      toast.error('Server tidak terjangkau. Coba lagi.')
    } finally {
      setBusy(null)
    }
  }

  return { stateOf, markRead, remind, reminded, busy }
}

export type WeeklyActions = ReturnType<typeof useWeeklyActions>

/** Alur laporan minggu ini dengan simpul baku 00-alur-antarperan.md: PIC `catatan` → Kepala divisi `persetujuan` → Direktur `dokumen`. */
export function weeklyFlow(divisions: DivisionSummary[], stateOf: (d: DivisionSummary) => WeeklyState): FlowStep[] {
  const n = divisions.length
  const missing = divisions.filter((d) => stateOf(d) === 'missing').length
  const sent = n - missing
  const read = divisions.filter((d) => stateOf(d) === 'read').length
  return [
    { title: 'PIC proyek', sub: 'Laporan harian', status: 'done', icon: 'catatan' },
    {
      title: 'Kepala divisi',
      sub: `${sent} dari ${n} terkirim`,
      status: missing ? 'blocked' : 'done',
      icon: 'persetujuan',
      meta: missing ? `${missing} belum masuk` : undefined,
    },
    { title: 'Direktur', sub: `${read} dari ${sent} dibaca`, status: sent === 0 ? 'todo' : read === sent ? 'done' : 'current', icon: 'dokumen' },
  ]
}

export function WeeklyReportsCard({
  divisions,
  weekLabel,
  viewer,
  actions,
  onOpen,
  className = 'is-wide',
}: {
  divisions: DivisionSummary[]
  weekLabel: string
  viewer: Viewer
  actions: WeeklyActions
  onOpen: (d: DivisionSummary) => void
  className?: string
}) {
  const missing = divisions.filter((d) => actions.stateOf(d) === 'missing').length
  return (
    <Card
      className={className}
      title={`Laporan mingguan divisi · ${weekLabel}`}
      subtitle={
        divisions.length === 0
          ? 'Belum ada divisi aktif'
          : missing
            ? `${divisions.length - missing} dari ${divisions.length} masuk · ${missing} belum masuk`
            : `Semua ${divisions.length} laporan sudah masuk`
      }
    >
      {divisions.length === 0 ? (
        <EmptyNote>Belum ada divisi aktif di cakupan Anda.</EmptyNote>
      ) : (
        <>
          <div className="mk-list">
            {divisions.map((d, i) => {
              const st = actions.stateOf(d)
              const badge = WEEKLY_BADGE[st]
              const who = d.head?.name ?? 'Kepala divisi belum ditetapkan'
              const line =
                st === 'missing'
                  ? `${who} — belum mengirim laporan ${weekLabel}.`
                  : `${d.weekly.submittedBy ?? who} · ${formatRelative(d.weekly.submittedAt).toLowerCase()} — ${d.weekly.summary ?? ''}${
                      d.weekly.comments ? ` ${d.weekly.comments} tanggapan.` : ''
                    }`
              return (
                <div key={d.id} className="mk-listrow flex-wrap">
                  <Avatar initials={initials(d.head?.name ?? d.name)} tone={divisionTone(d.name)} size={36} name={who} />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left min-h-11 cursor-pointer"
                    onClick={() => onOpen(d)}
                    aria-label={`Buka laporan Divisi ${d.name}`}
                  >
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="t-body-strong">Divisi {d.name}</span>
                      <StatusBadge status={badge.status} size="sm">
                        {badge.label}
                      </StatusBadge>
                    </span>
                    <span className="block t-footnote text-ink-2 line-clamp-2">{line}</span>
                  </button>
                  {st === 'missing' ? (
                    viewer.canRemind ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={actions.busy === d.id || actions.reminded[d.id]}
                        onClick={() => actions.remind(d)}
                      >
                        {actions.reminded[d.id] ? 'Pengingat terkirim' : 'Ingatkan'}
                      </Button>
                    ) : null
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => onOpen(d)}>
                      Baca laporan
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mk-inset mt-4">
            <h4 className="t-callout text-ink-2 mb-3">Alur laporan minggu ini</h4>
            <FlowDiagram steps={weeklyFlow(divisions, actions.stateOf)} label="Alur laporan minggu ini" />
          </div>
        </>
      )}
    </Card>
  )
}

/** Sheet laporan: terkirim (angka, poin utama, kendala, tanggapan) atau belum masuk (pengingat, kontak). */
export function WeeklyReportSheet({
  division,
  weekLabel,
  viewer,
  actions,
  onClose,
}: {
  division: DivisionSummary | null
  weekLabel: string
  viewer: Viewer
  actions: WeeklyActions
  onClose: () => void
}) {
  const { setActiveTab } = useApp()
  const [last, setLast] = useState<DivisionSummary | null>(division)
  const [contactOpen, setContactOpen] = useState(false)
  const thread = useRef<WeeklyCommentThreadHandle>(null)
  if (division && division !== last) {
    setLast(division)
    setContactOpen(false)
  }
  const d = division ?? last
  const st = d ? actions.stateOf(d) : 'missing'
  const badge = WEEKLY_BADGE[st]
  const missing = st === 'missing'
  const headFirst = d?.head?.name.split(/\s+/)[0] ?? null
  const hasContact = Boolean(d?.head && (d.head.email || d.head.phone))
  const summary = d?.weekly.headSummary ?? null
  const points = summary?.points.length ? summary.points : (d?.weekly.points ?? [])

  // [F2-DIREKTUR] Satu tombol primer: Ingatkan (belum masuk) atau Tandai sudah dibaca (terkirim).
  const footer = !d ? null : missing ? (
    <>
      {hasContact ? (
        <Button variant="secondary" icon="pengguna" aria-expanded={contactOpen} onClick={() => setContactOpen((v) => !v)}>
          Hubungi {headFirst}
        </Button>
      ) : null}
      {viewer.canRemind ? (
        <Button variant="primary" disabled={actions.busy === d.id || actions.reminded[d.id]} onClick={() => actions.remind(d)}>
          {actions.reminded[d.id] ? 'Pengingat terkirim' : 'Ingatkan kepala divisi'}
        </Button>
      ) : null}
    </>
  ) : (
    <>
      {viewer.canComment && d.weekly.id ? (
        <Button variant="secondary" icon="catatan" onClick={() => thread.current?.focus()}>
          Beri tanggapan
        </Button>
      ) : null}
      {viewer.canMarkRead && st !== 'read' ? (
        <Button variant="primary" disabled={actions.busy === d.id} onClick={() => actions.markRead(d)}>
          Tandai sudah dibaca
        </Button>
      ) : null}
    </>
  )

  return (
    <Sheet
      open={!!division}
      onOpenChange={(o) => !o && onClose()}
      title={d ? `Divisi ${d.name}` : ''}
      subtitle={d ? `${d.head?.name ?? 'Kepala divisi belum ditetapkan'} · ${d.entityName}` : undefined}
      eyebrow={d ? <StatusBadge status={badge.status} size="sm">{badge.label}</StatusBadge> : undefined}
      backLabel="Ringkasan"
      footer={footer}
    >
      {d && missing && (
        <>
          <p className="t-body text-ink">
            Laporan mingguan {weekLabel} Divisi {d.name} belum dikirim. Tenggat serahnya {WEEKLY_HANDOVER_LABEL} dan minggu itu dikunci {WEEKLY_LOCK_LABEL}.
          </p>
          <div className={`mk-note-box ${actions.reminded[d.id] ? 'mk-soft--done' : 'mk-soft--neutral'}`}>
            {actions.reminded[d.id]
              ? `Pengingat terkirim ke ${d.head?.name ?? 'kepala divisi'}.`
              : viewer.canRemind
                ? 'Belum ada pengingat dari Anda hari ini.'
                : 'Admin PT atau direktur PT yang mengirim pengingat ke kepala divisi.'}
          </div>
          {contactOpen && d.head ? (
            <div className="flex flex-col gap-2" aria-label={`Kontak ${d.head.name}`}>
              {d.head.phone ? (
                <a className="mk-contact" href={`tel:${d.head.phone.replace(/[^\d+]/g, '')}`}>
                  <Icon name="pengguna" size={18} />
                  <span className="min-w-0">
                    <span className="mk-contact__label block">Telepon {d.head.name}</span>
                    <span className="mk-contact__value block">{d.head.phone}</span>
                  </span>
                </a>
              ) : null}
              {d.head.email ? (
                <a className="mk-contact" href={`mailto:${d.head.email}?subject=${encodeURIComponent(`Laporan mingguan ${weekLabel} Divisi ${d.name}`)}`}>
                  <Icon name="kirim" size={18} />
                  <span className="min-w-0">
                    <span className="mk-contact__label block">Email {d.head.name}</span>
                    <span className="mk-contact__value block">{d.head.email}</span>
                  </span>
                </a>
              ) : null}
            </div>
          ) : null}
          {!hasContact && d.head ? <p className="t-footnote text-ink-2">Kontak {d.head.name} belum diisi di data akun.</p> : null}
        </>
      )}
      {d && !missing && (
        <>
          <div className="mk-kv">
            <Figure label="Output" value={`${formatNumber(d.outputs.done)} dari ${formatNumber(d.outputs.total)}`} />
            <Figure label="Tepat waktu" value={d.onTime ? `${d.onTime.pct}%` : '—'} />
            <Figure label="Kendala" value={formatNumber(summary ? summary.openObstacles : d.weekly.obstacles.length)} />
          </div>
          <p className="t-footnote text-ink-2">
            Dikirim {d.weekly.submittedBy ? `oleh ${d.weekly.submittedBy} ` : ''}
            {formatRelative(d.weekly.submittedAt).toLowerCase()} · {d.weekly.itemsDone} dari {d.weekly.itemsTotal} pekerjaan selesai (
            {pct(d.weekly.itemsDone, d.weekly.itemsTotal)}%)
          </p>
          <div>
            <h3 className="t-headline mb-2">Poin utama</h3>
            {summary ? <p className="t-footnote text-ink-2 mb-2">Ringkasan dari kepala divisi{summary.sentAt ? ` · ${formatRelative(summary.sentAt).toLowerCase()}` : ''}</p> : null}
            {points.length ? (
              <ul className="flex flex-col gap-2 t-body text-ink list-disc pl-5">
                {points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="t-body text-ink-2">Laporan ini belum memuat capaian tertulis.</p>
            )}
          </div>
          {d.weekly.obstacles.length > 0 && (
            <div className="mk-note-box mk-soft--risk">
              <div className="t-body-strong mb-1">Kendala</div>
              <ul className="flex flex-col gap-1 list-disc pl-5">
                {d.weekly.obstacles.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {d.weekly.id ? <WeeklyCommentThread key={d.weekly.id} ref={thread} weeklyReportId={d.weekly.id} headName={d.head?.name} /> : null}
          <div>
            <Button
              variant="plain"
              size="sm"
              iconAfter="kanan"
              onClick={() => {
                onClose()
                setActiveTab('divisions')
              }}
            >
              Buka laporan lengkap
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="mk-inset">
      <div className="t-footnote text-ink-2">{label}</div>
      <div className="t-title-2 tabular-nums">{value}</div>
    </div>
  )
}
