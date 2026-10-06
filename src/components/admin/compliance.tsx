'use client'

/**
 * Kepatuhan laporan per divisi untuk Admin PT [F2-ADMIN] (04-admin-pt.md §4,
 * §5, Sheet divisi). Satu sumber data: /api/admin/compliance.
 *
 *  - ComplianceCard: Harian / Mingguan per divisi, klik baris → Sheet divisi,
 *    tombol "Ingatkan" per divisi.
 *  - ComplianceHeatmapCard: peta panas divisi × 10 hari kerja.
 *  - DivisionSheet: ubin harian & mingguan, peta panas divisi itu, belum lapor
 *    dengan "Ingatkan" per orang, "Hubungi kepala divisi", "Ingatkan semua".
 *
 * Pengingat sekali per proyek per hari dan tercatat di log aktivitas
 * (REMIND_PIC), teksnya sama dengan pengingat otomatis.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Avatar, Button, Card, DivisionBar, EmptyNote, ErrorNote, Heatmap, SegmentedControl, Sheet, Skeleton, StatTile, StatusBadge,
  type Status,
} from '@/components/mk'
import { initialsOf } from '@/lib/accounts'
import { formatRelative, formatTime } from '@/lib/format'
import { divisionTone } from '@/lib/division-tone'
import { WEEKLY_STATE_LABELS, pctOf, type ComplianceData, type DivisionCompliance, type WeeklyState } from '@/lib/admin-compliance'
import { send, useFetch } from './use-fetch'

const WIB = 'Asia/Jakarta'

export function useCompliance() {
  return useFetch<ComplianceData>('/api/admin/compliance')
}
export type ComplianceState = ReturnType<typeof useCompliance>

const WEEKLY_STATUS: Record<WeeklyState, Status> = { MASUK: 'done', TERLAMBAT: 'risk', BELUM: 'neutral' }

export function weeklyBadge(d: DivisionCompliance, handoverPassed: boolean): { status: Status; text: string } {
  const w = d.weekly
  const status = w.state === 'BELUM' && handoverPassed ? 'late' : WEEKLY_STATUS[w.state]
  const extra = w.forwardedAt ? ' · diteruskan' : w.approvedAt ? ' · disetujui' : ''
  return { status, text: WEEKLY_STATE_LABELS[w.state] + extra }
}

function dailyBadge(d: DivisionCompliance, locked: boolean): { status: Status; text: string } {
  const missing = d.missing.length
  if (d.expected === 0) return { status: 'neutral', text: d.onLeave ? 'Semua cuti/izin' : 'Tanpa PIC' }
  if (missing === 0) return { status: 'done', text: 'Lengkap' }
  const reminded = d.missing.filter((m) => m.remindedAt).length
  if (reminded === missing) return { status: locked ? 'late' : 'info', text: 'Diingatkan' }
  return { status: locked ? 'late' : 'risk', text: `${missing} belum` }
}

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: WIB }).format(new Date(iso)).replace('.', '') +
  ' ' +
  new Intl.DateTimeFormat('id-ID', { day: 'numeric', timeZone: WIB }).format(new Date(iso))

type RemindBody = { userId: string } | { divisionId: string } | { all: true }
type RemindResult = { ok: boolean; people: { userId: string; name: string; remindedAt: string }[]; error: string | null; remindedAt?: string | null }

/** Kirim pengingat lalu tandai orang yang diingatkan di data lokal (tanpa menunggu muat ulang). */
export async function sendReminder(state: ComplianceState, body: RemindBody): Promise<RemindResult> {
  const r = await send('/api/admin/compliance/remind', 'POST', body)
  const people = ((r.json.people ?? []) as RemindResult['people']) ?? []
  const stamp = new Map(people.map((p) => [p.userId, p.remindedAt]))
  const late = typeof r.json.remindedAt === 'string' && 'userId' in body ? new Map([[body.userId, r.json.remindedAt as string]]) : null
  if (stamp.size || late) {
    state.setData((d) =>
      d
        ? {
            ...d,
            totals: { ...d.totals, reminded: d.totals.reminded + stamp.size },
            divisions: d.divisions.map((dv) => ({
              ...dv,
              missing: dv.missing.map((m) => ({ ...m, remindedAt: m.remindedAt ?? stamp.get(m.id) ?? late?.get(m.id) ?? null })),
            })),
          }
        : d
    )
  }
  return { ok: r.ok, people, error: r.error, remindedAt: (r.json.remindedAt as string | null | undefined) ?? null }
}

function toastResult(r: RemindResult, scope: string) {
  if (!r.ok) return void toast.error(r.error ?? 'Pengingat belum terkirim')
  toast.success(r.people.length ? `${r.people.length} orang ${scope} diingatkan. Tercatat di log aktivitas.` : 'Tidak ada yang perlu diingatkan.')
}

// ------------------------------------------------------------------
// Kartu kepatuhan per divisi
// ------------------------------------------------------------------

export function ComplianceCard({ state, className, onChanged }: { state: ComplianceState; className?: string; onChanged?: () => void }) {
  const [mode, setMode] = useState<'harian' | 'mingguan'>('harian')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const data = state.data
  const divisions = (data?.divisions ?? []).filter((d) => d.expected > 0 || d.onLeave > 0 || mode === 'mingguan')
  const weeklyIn = (data?.divisions ?? []).filter((d) => d.weekly.state !== 'BELUM').length

  async function remindDivision(d: DivisionCompliance) {
    setBusy(d.id)
    const r = await sendReminder(state, { divisionId: d.id })
    setBusy(null)
    toastResult(r, `Divisi ${d.name}`)
    onChanged?.()
  }

  return (
    <Card
      className={className}
      title="Kepatuhan laporan per divisi"
      subtitle={
        !data
          ? 'Memuat…'
          : mode === 'harian'
            ? `${data.totals.reported} dari ${data.totals.expected} orang lapor hari ini${data.totals.onLeave ? ` · ${data.totals.onLeave} cuti/izin` : ''} · ketuk divisi untuk detail`
            : `M${data.week.isoWeek}: ${weeklyIn} dari ${data.divisions.length} divisi menyerahkan · tenggat Kamis 17.00 WIB`
      }
      action={
        <SegmentedControl
          size="sm"
          label="Jenis laporan"
          value={mode}
          onChange={(v) => setMode(v as 'harian' | 'mingguan')}
          options={[
            { value: 'harian', label: 'Harian' },
            { value: 'mingguan', label: 'Mingguan' },
          ]}
        />
      }
    >
      {state.loading && !data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={56} />
          ))}
        </div>
      ) : state.error || !data ? (
        <ErrorNote message={state.error ?? undefined} onRetry={state.reload} />
      ) : divisions.length === 0 ? (
        <EmptyNote icon="tim">
          {data.divisions.length === 0 ? 'Belum ada divisi aktif.' : 'Belum ada PIC proyek aktif di divisi mana pun. Atur divisi proyek atau anggota divisi di sheet akun.'}
        </EmptyNote>
      ) : (
        <>
          <ul className="mk-desk-queue">
            {divisions.map((d, i) => {
              const daily = dailyBadge(d, data.locked)
              const weekly = weeklyBadge(d, data.week.handoverPassed)
              const remindable = d.missing.filter((m) => !m.remindedAt).length
              return (
                <li key={d.id} className="mk-desk-queue__row" style={{ '--i': i } as React.CSSProperties}>
                  <div className="mk-desk-queue__line">
                    <button type="button" className="mk-desk-queue__hit" onClick={() => setOpenId(d.id)} aria-label={`Detail Divisi ${d.name}`}>
                      <span className="min-w-0 flex-1">
                        {mode === 'harian' ? (
                          <DivisionBar
                            name={`Divisi ${d.name}`}
                            value={pctOf(d.reported, d.expected)}
                            tone={divisionTone(d.name)}
                            meta={`${d.reported} dari ${d.expected} orang · ${d.head?.name ?? 'kepala divisi belum ditetapkan'}`}
                          />
                        ) : (
                          <>
                            <span className="t-body-strong block truncate">Divisi {d.name}</span>
                            <span className="t-footnote text-ink-2 block truncate">
                              {d.head?.name ?? 'Kepala divisi belum ditetapkan'}
                              {d.weekly.submittedAt ? ` · diserahkan ${formatRelative(d.weekly.submittedAt).toLowerCase()}` : ''}
                            </span>
                          </>
                        )}
                      </span>
                      <StatusBadge status={mode === 'harian' ? daily.status : weekly.status} size="sm">
                        {mode === 'harian' ? daily.text : weekly.text}
                      </StatusBadge>
                    </button>
                    {mode === 'harian' && data.canRemind && !data.locked && remindable > 0 ? (
                      <Button size="sm" variant="secondary" icon="notifikasi" disabled={busy !== null} onClick={() => remindDivision(d)} aria-label={`Ingatkan ${remindable} orang Divisi ${d.name}`}>
                        {busy === d.id ? 'Mengirim…' : 'Ingatkan'}
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          {mode === 'harian' && data.totals.unassigned > 0 ? (
            <p className="t-footnote text-ink-2 mt-3">
              {data.totals.unassigned} PIC belum masuk divisi mana pun. Atur divisinya di sheet akun atau di formulir proyek.
            </p>
          ) : null}
        </>
      )}
      {data ? <DivisionSheet state={state} openId={openId} onClose={() => setOpenId(null)} onChanged={onChanged} /> : null}
    </Card>
  )
}

// ------------------------------------------------------------------
// Peta panas 10 hari kerja
// ------------------------------------------------------------------

export function ComplianceHeatmapCard({ state, className }: { state: ComplianceState; className?: string }) {
  const data = state.data
  const rows = (data?.divisions ?? []).filter((d) => d.history.some((v) => v !== null))
  const avg = (() => {
    const all = rows.flatMap((d) => d.history.filter((v): v is number => v !== null))
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null
  })()
  return (
    <Card
      className={className}
      title="Riwayat kepatuhan harian"
      subtitle={data ? `Persen orang yang lapor per divisi, ${data.days.length} hari kerja${avg !== null ? ` · rata-rata ${avg}%` : ''}` : 'Memuat…'}
    >
      {state.loading && !data ? (
        <Skeleton h={200} />
      ) : state.error || !data ? (
        <ErrorNote message={state.error ?? undefined} onRetry={state.reload} />
      ) : rows.length === 0 ? (
        <EmptyNote>Belum ada riwayat per divisi.</EmptyNote>
      ) : (
        <div className="mk-scroll-x">
          <Heatmap
            data={rows.map((d) => d.history)}
            rowLabels={rows.map((d) => d.name)}
            colLabels={data.days.map(dayLabel)}
            max={100}
            cell={30}
            tone="hijau"
            formatCell={(v) => `${v}%`}
            label={`Kepatuhan laporan harian per divisi, ${data.days.length} hari kerja terakhir`}
            lowLabel="0%"
            highLabel="100%"
            showLegend
          />
        </div>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------
// Sheet divisi
// ------------------------------------------------------------------

function DivisionSheet({ state, openId, onClose, onChanged }: { state: ComplianceState; openId: string | null; onClose: () => void; onChanged?: () => void }) {
  const data = state.data!
  const [last, setLast] = useState<DivisionCompliance | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const open = data.divisions.find((d) => d.id === openId) ?? null
  if (open && open !== last) setLast(open)
  const d = open ?? last

  const remindable = d ? d.missing.filter((m) => !m.remindedAt) : []
  const canSend = data.canRemind && !data.locked

  async function remindOne(userId: string, name: string) {
    setBusy(userId)
    const r = await sendReminder(state, { userId })
    setBusy(null)
    if (r.ok) toast.success(`${name} diingatkan. Tercatat di log aktivitas.`)
    else toast.error(r.error ?? 'Pengingat belum terkirim')
    onChanged?.()
  }
  async function remindAll() {
    if (!d) return
    setBusy('all')
    const r = await sendReminder(state, { divisionId: d.id })
    setBusy(null)
    toastResult(r, `Divisi ${d.name}`)
    onChanged?.()
  }
  function contact() {
    const h = d?.head
    if (!h) return
    if (h.email) window.location.href = `mailto:${encodeURIComponent(h.email)}?subject=${encodeURIComponent(`Laporan harian Divisi ${d!.name}`)}`
    else if (h.phone) window.location.href = `tel:${h.phone.replace(/[^\d+]/g, '')}`
  }

  const weekly = d ? weeklyBadge(d, data.week.handoverPassed) : null
  const contactable = !!(d?.head && (d.head.email || d.head.phone))

  return (
    <Sheet
      open={!!open}
      onOpenChange={(o) => !o && onClose()}
      title={d ? `Divisi ${d.name}` : ''}
      subtitle={d ? `Kepala divisi ${d.head?.name ?? 'belum ditetapkan'}` : undefined}
      backLabel="Kepatuhan"
      footer={
        d ? (
          <>
            <Button variant="secondary" icon="kirim" disabled={!contactable} onClick={contact}>
              Hubungi kepala divisi
            </Button>
            {d.missing.length > 0 ? (
              <Button variant="primary" icon="notifikasi" disabled={!canSend || remindable.length === 0 || busy !== null} onClick={remindAll}>
                {busy === 'all' ? 'Mengirim…' : remindable.length ? `Ingatkan semua (${remindable.length})` : 'Semua sudah diingatkan'}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {d ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              variant="surface"
              label="Laporan harian"
              value={`${d.reported} dari ${d.expected}`}
              delta={d.expected ? `${pctOf(d.reported, d.expected)}% orang${d.onLeave ? ` · ${d.onLeave} cuti/izin` : ''}` : 'Tidak ada yang wajib lapor'}
              tone={d.missing.length ? (data.locked ? 'late' : 'risk') : 'on'}
            />
            <div className="mk-card mk-card--inset flex flex-col gap-2 p-4">
              <span className="t-footnote text-ink-2">Laporan mingguan M{data.week.isoWeek}</span>
              {weekly ? (
                <StatusBadge status={weekly.status} size="sm">
                  {weekly.text}
                </StatusBadge>
              ) : null}
              <span className="t-caption text-ink-2">
                {d.weekly.submittedAt ? `Diserahkan ${formatRelative(d.weekly.submittedAt).toLowerCase()}` : 'Tenggat Kamis 17.00 WIB'}
              </span>
            </div>
          </div>

          {d.history.some((v) => v !== null) ? (
            <div>
              <h3 className="t-headline mb-2">10 hari kerja terakhir</h3>
              <div className="mk-scroll-x">
                <Heatmap
                  data={[d.history]}
                  rowLabels={[d.name]}
                  colLabels={data.days.map(dayLabel)}
                  max={100}
                  cell={26}
                  tone="hijau"
                  formatCell={(v) => `${v}%`}
                  label={`Kepatuhan harian Divisi ${d.name}`}
                />
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="t-headline mb-2">Belum lapor hari ini</h3>
            {d.missing.length === 0 ? (
              <EmptyNote done>{d.expected ? 'Semua anggota sudah lapor hari ini.' : 'Tidak ada anggota yang wajib lapor hari ini.'}</EmptyNote>
            ) : (
              <div className="mk-list">
                {d.missing.map((p) => (
                  <div key={p.id} className="mk-listrow">
                    <Avatar initials={initialsOf(p.name)} size={36} name={p.name} />
                    <div className="min-w-0 flex-1">
                      <div className="t-body-strong truncate">{p.name}</div>
                      <div className="t-footnote text-ink-2 truncate">
                        {p.role} · {p.lastReportAt ? `terakhir lapor ${formatRelative(p.lastReportAt).toLowerCase()}` : 'belum pernah lapor'}
                      </div>
                      {p.projects.length ? <div className="t-caption text-ink-2 truncate">{p.projects.join(', ')}</div> : null}
                    </div>
                    {p.remindedAt ? (
                      <StatusBadge status="info" size="sm">
                        Diingatkan {formatTime(p.remindedAt)}
                      </StatusBadge>
                    ) : canSend ? (
                      <Button size="sm" variant="secondary" icon="notifikasi" disabled={busy !== null} onClick={() => remindOne(p.id, p.name)} aria-label={`Ingatkan ${p.name}`}>
                        {busy === p.id ? 'Mengirim…' : 'Ingatkan'}
                      </Button>
                    ) : (
                      <StatusBadge status={data.locked ? 'late' : 'risk'} size="sm">
                        Belum lapor
                      </StatusBadge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {d.head ? (
            <div>
              <h3 className="t-headline mb-2">Kontak kepala divisi</h3>
              <div className="t-footnote text-ink-2 flex flex-col gap-1">
                <span className="t-body-strong text-ink">{d.head.name}</span>
                {d.head.email ? (
                  <a className="inline-flex min-h-[var(--touch-min)] items-center text-accent underline-offset-2 hover:underline" href={`mailto:${d.head.email}`}>
                    {d.head.email}
                  </a>
                ) : null}
                {d.head.phone ? (
                  <a className="inline-flex min-h-[var(--touch-min)] items-center text-accent underline-offset-2 hover:underline" href={`tel:${d.head.phone.replace(/[^\d+]/g, '')}`}>
                    {d.head.phone}
                  </a>
                ) : null}
                {!d.head.email && !d.head.phone ? <span>Belum ada email atau telepon.</span> : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </Sheet>
  )
}
