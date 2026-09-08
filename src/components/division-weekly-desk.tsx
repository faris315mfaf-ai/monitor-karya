'use client'

import { useMemo, useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { LoadingSpinner, EmptyState, ErrorState } from '@/components/loading-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { WeeklyHeaderBadge, WeeklyItemStatusBadge, PriorityBadge } from '@/components/status-badges'
import { EvidencePanel, type EvidenceItem } from '@/components/evidence-panel'
import { WeeklyBoard, WEEKLY_LANE, boardSignature, wibKey, type BoardMove } from '@/components/weekly-board'
import { WEEKLY_STATUS_META } from '@/lib/constants'
import { formatDate, formatDateLong, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, BellRing, Building2, CalendarCheck, CalendarRange, Check, CheckCircle2, ListChecks, Loader2, Lock,
  Paperclip, Plus, Send, ShieldCheck, Siren, SquarePen, Tag as TagIcon, Trash2, Users, X,
} from 'lucide-react'

type Ref = { id: string; code: string; name: string }

type Item = {
  id: string
  workItem: string
  targetOutput: string
  picName: string
  picTitle: string
  status: string
  progressPct: number
  achievementThisWeek: string
  obstacleFollowUp: string | null
  followUp: string | null
  workDate: string | null
  position: number
  evidenceCount: number
  tags: string[]
  subtasks: { id?: string; title: string; isDone: boolean }[]
  escalationRaised?: boolean
  evidence?: EvidenceItem[]
  aspectCategory: Ref
  priority: Ref
}

type DivisionRow = {
  id: string
  name: string
  type: string
  headName: string | null
  report: {
    id: string
    statusHeader: string
    submittedAt: string | null
    approvedAt: string | null
    forwardedAt: string | null
    isLocked: boolean
    items: Item[]
  } | null
}

type Data = {
  week: { key: string; isoYear: number; isoWeek: number; start: string; end: string; handoverBy: string; lockAt: string; current: boolean }
  locked: boolean
  days: string[]
  weeks: { key: string; start: string; end: string; current: boolean }[]
  entities: Ref[]
  entityId: string | null
  entityPinned: boolean
  aspects: Ref[]
  priorities: Ref[]
  canApprove: boolean
  canRemind: boolean
  divisions: DivisionRow[]
}

type Card = Item & { lane: string }

const STATUSES = ['SELESAI', 'ON_PROGRESS', 'BELUM_MULAI', 'TERKENDALA', 'NA']

const selectClass =
  'h-11 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-3 text-base text-slate-800 dark:text-slate-100 disabled:opacity-70'

/**
 * Meja mingguan divisi (8 Sep 2026): pilih entitas & divisi yang dilaporkan
 * dan minggunya, lalu susun capaian per hari di papan seret-lepas. Setiap item
 * memuat status, capaian minggu ini, kendala, tindak lanjut, dan prioritas.
 * Kepala Divisi memakai meja ini untuk divisinya; Admin PT untuk semua divisi
 * entitasnya (dari Modul Divisi); TI untuk PT mana pun.
 */
export function DivisionWeeklyDesk() {
  const [entityId, setEntityId] = useState('')
  const [weekKey, setWeekKey] = useState('')
  const [divisionId, setDivisionId] = useState('ALL')

  const url = useMemo(() => {
    const p = new URLSearchParams()
    if (entityId) p.set('entityId', entityId)
    if (weekKey) p.set('week', weekKey)
    const q = p.toString()
    return `/api/weekly-input${q ? `?${q}` : ''}`
  }, [entityId, weekKey])
  const { data, loading, error, reload } = useResource<Data>(url)

  if (loading && !data) return <LoadingSpinner className="py-10" />
  if (error || !data) return <ErrorState message={error ?? 'Data tidak tersedia'} />

  const shown = divisionId === 'ALL' ? data.divisions : data.divisions.filter((d) => d.id === divisionId)
  const weekNo = (key: string) => Number(key.split('-W')[1])

  return (
    <div className={cn('space-y-4', loading && 'opacity-60 pointer-events-none transition-opacity')}>
      {/* Pilihan entitas · divisi · minggu */}
      <Card className="glass">
        <CardContent className="p-3 sm:p-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="desk-entity" className="text-sm flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Entitas yang dilaporkan
            </Label>
            <select id="desk-entity" value={data.entityId ?? ''} onChange={(e) => setEntityId(e.target.value)} disabled={data.entityPinned} className={selectClass}>
              {data.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desk-division" className="text-sm flex items-center gap-1.5">
              <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" /> Divisi
            </Label>
            <select id="desk-division" value={divisionId} onChange={(e) => setDivisionId(e.target.value)} className={selectClass}>
              {data.divisions.length !== 1 && <option value="ALL">Semua divisi ({data.divisions.length})</option>}
              {data.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desk-week" className="text-sm flex items-center gap-1.5">
              <CalendarRange className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Minggu
            </Label>
            <select id="desk-week" value={data.week.key} onChange={(e) => setWeekKey(e.target.value)} className={selectClass}>
              {data.weeks.map((w) => (
                <option key={w.key} value={w.key}>
                  Minggu {weekNo(w.key)} · {formatDate(w.start)} – {formatDate(w.end)}
                  {w.current ? ' (berjalan)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div
            className={cn(
              'md:col-span-3 rounded-xl px-3 py-2 flex items-center gap-2 text-sm',
              !data.week.current
                ? 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
                : data.locked
                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  : 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
            )}
          >
            {!data.week.current ? <Lock className="h-4 w-4" /> : data.locked ? <Lock className="h-4 w-4" /> : <CalendarCheck className="h-4 w-4" />}
            {!data.week.current
              ? `Minggu ${data.week.isoWeek}/${data.week.isoYear} sudah lewat — hanya dibaca.`
              : data.locked
                ? 'Minggu ini sudah dikunci. Perubahan memerlukan permohonan buka kunci.'
                : `Serahkan paling lambat ${formatDateLong(data.week.handoverBy)} pukul ${formatTime(data.week.handoverBy)} WIB.`}
          </div>
        </CardContent>
      </Card>

      {data.canRemind && data.week.current && <ReminderPanel entityId={data.entityId} divisions={data.divisions} />}

      {shown.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" />}
          title="Belum ada divisi"
          description="Hubungi Admin PT atau Tim TI untuk penugasan divisi."
        />
      ) : (
        shown.map((d) => <DivisionBoard key={`${d.id}:${data.week.key}`} division={d} data={data} onChanged={reload} />)
      )}
    </div>
  )
}

/** Siapa yang belum menyerahkan minggu ini, dan tombol untuk mengingatkan mereka. */
function ReminderPanel({ entityId, divisions }: { entityId: string | null; divisions: DivisionRow[] }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ sent: number; results: { divisionName: string; outcome: string; head: { name: string } | null }[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const unreported = divisions.filter((d) => !d.report || d.report.statusHeader === 'DRAFT')

  async function send() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/notifications/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Gagal mengirim pengingat')
      else setResult(json)
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  const OUTCOME: Record<string, string> = {
    TERKIRIM: 'terkirim',
    SUDAH_HARI_INI: 'sudah diingatkan hari ini',
    TANPA_KEPALA: 'belum punya kepala divisi',
  }

  return (
    <div className={cn('rounded-2xl border p-3 sm:p-4 space-y-2', unreported.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5')}>
      <div className="flex flex-wrap items-center gap-3">
        <BellRing className={cn('h-5 w-5', unreported.length > 0 ? 'text-amber-600' : 'text-emerald-600')} />
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {unreported.length > 0 ? `${unreported.length} dari ${divisions.length} divisi belum menyerahkan laporan minggu ini` : 'Semua divisi sudah menyerahkan laporan minggu ini'}
          </div>
          {unreported.length > 0 && (
            <div className="text-[13px] text-slate-600 dark:text-slate-300">
              {unreported.map((d) => d.name).join(' · ')} — sistem juga mengingatkan otomatis tiap pagi hari kerja.
            </div>
          )}
        </div>
        {unreported.length > 0 && (
          <Button size="sm" onClick={send} disabled={busy} className="h-10 bg-gradient-to-r from-amber-600 to-amber-500 text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Kirim pengingat
          </Button>
        )}
      </div>
      {err && <p className="text-[13px] text-rose-700 dark:text-rose-300">{err}</p>}
      {result && (
        <ul className="text-[13px] text-slate-700 dark:text-slate-200 space-y-0.5">
          <li className="font-semibold">{result.sent} pengingat terkirim ke lonceng aplikasi kepala divisi.</li>
          {result.results.map((r, i) => (
            <li key={i}>
              {r.divisionName}
              {r.head ? ` (${r.head.name})` : ''}: {OUTCOME[r.outcome] ?? r.outcome}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DivisionBoard({ division, data, onChanged }: { division: DivisionRow; data: Data; onChanged: () => void }) {
  const items = division.report?.items ?? []
  const locked = data.locked || !data.week.current || Boolean(division.report?.isLocked)
  const status = division.report?.statusHeader ?? 'DRAFT'
  const dayKeys = useMemo(() => data.days.map(wibKey), [data.days])
  const cards = useMemo<Card[]>(
    () =>
      items.map((i) => {
        const key = i.workDate ? wibKey(i.workDate) : null
        return { ...i, lane: key && dayKeys.includes(key) ? key : WEEKLY_LANE }
      }),
    [items, dayKeys]
  )
  const [dialog, setDialog] = useState<{ item: Item | null; lane: string } | null>(null)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [escalating, setEscalating] = useState<Item | null>(null)

  const done = items.filter((i) => i.status === 'SELESAI').length
  const blocked = items.filter((i) => i.status === 'TERKENDALA').length
  const avg = items.length ? Math.round(items.reduce((s, i) => s + i.progressPct, 0) / items.length) : 0
  const missingEvidence = items.filter((i) => i.evidenceCount === 0 && !['BELUM_MULAI', 'NA'].includes(i.status)).length

  async function move(moves: BoardMove[]) {
    setMsg(null)
    try {
      const res = await fetch('/api/weekly-input', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          divisionId: division.id,
          week: data.week.key,
          moves: moves.map((m) => ({ itemId: m.id, workDate: m.lane === WEEKLY_LANE ? null : m.lane, position: m.index })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setMsg({ kind: 'err', text: json.error || 'Gagal memindahkan kartu' })
      else setMsg({ kind: 'ok', text: 'Susunan tersimpan.' })
    } catch {
      setMsg({ kind: 'err', text: 'Tidak dapat menghubungi server.' })
    } finally {
      setVersion((v) => v + 1)
      onChanged()
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Hapus item ini beserta lampirannya?')) return
    setBusy(id)
    setMsg(null)
    try {
      const res = await fetch(`/api/weekly-input?itemId=${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setMsg({ kind: 'err', text: json.error || 'Gagal menghapus' })
      else onChanged()
    } catch {
      setMsg({ kind: 'err', text: 'Tidak dapat menghubungi server.' })
    } finally {
      setBusy(null)
    }
  }

  async function act(action: 'submit' | 'approve') {
    setBusy(action)
    setMsg(null)
    setErrors([])
    try {
      const res = await fetch('/api/weekly-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ divisionId: division.id, week: data.week.key, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: 'err', text: json.error || 'Gagal' })
        setErrors(Array.isArray(json.errors) ? json.errors : [])
      } else {
        setMsg({ kind: 'ok', text: action === 'submit' ? 'Diserahkan ke Admin PT.' : 'Disetujui dan siap dikunci.' })
        onChanged()
      }
    } catch {
      setMsg({ kind: 'err', text: 'Tidak dapat menghubungi server.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">{division.name}</CardTitle>
            <CardDescription className="text-[13px]">
              {division.type}
              {division.headName ? ` · Kepala: ${division.headName}` : ''} · {items.length} item
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <WeeklyHeaderBadge status={status} />
            {division.report?.forwardedAt && <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[11px] h-5">Diteruskan</Badge>}
          </div>
        </div>
        {/* Tinjauan ringkas minggu ini */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
          <span>
            <strong className="text-emerald-600">{done}</strong> selesai
          </span>
          {blocked > 0 && (
            <span>
              <strong className="text-rose-600">{blocked}</strong> terkendala
            </span>
          )}
          {missingEvidence > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              <strong>{missingEvidence}</strong> tanpa bukti
            </span>
          )}
          <span className="flex items-center gap-2 min-w-[120px]">
            <Progress value={avg} className="h-1.5 flex-1" /> <span className="tabular-nums">{avg}%</span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {locked && data.week.current && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[13px] text-rose-700 dark:text-rose-300">
            <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Minggu ini sudah dikunci. Perubahan memerlukan permohonan buka kunci.
          </div>
        )}

        {!locked && (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setDialog({ item: null, lane: wibKey(new Date().toISOString()) })} className="h-11 bg-gradient-to-r from-violet-600 to-violet-500 text-white">
              <Plus className="h-5 w-5" /> Tambah capaian
            </Button>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Seret pegangan ⋮ untuk memindahkan antar hari. Di ponsel, tahan kartu sebentar lalu geser.
            </p>
          </div>
        )}

        <WeeklyBoard<Card>
          key={`${data.week.key}:${version}:${boardSignature(cards)}`}
          days={data.days}
          today={data.week.current ? new Date().toISOString() : null}
          cards={cards}
          disabled={locked}
          onMove={move}
          onAdd={(lane) => setDialog({ item: null, lane })}
          emptyText="Belum ada capaian."
          renderCard={(it, dragging) => (
            <ItemCard
              item={it}
              dragging={dragging}
              locked={locked}
              busy={busy === it.id}
              onEdit={() => setDialog({ item: it, lane: it.lane })}
              onDelete={() => remove(it.id)}
              onEscalate={() => setEscalating(it)}
              onChanged={onChanged}
            />
          )}
        />

        {msg && (
          <div
            className={cn(
              'rounded-lg p-2.5 text-[13px]',
              msg.kind === 'ok'
                ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300'
            )}
          >
            <div className="flex items-start gap-2">
              {msg.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              <div>
                {msg.text}
                {errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {!locked && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              className="text-sm h-10 bg-gradient-to-r from-violet-600 to-violet-500 text-white"
              disabled={busy !== null || items.length === 0}
              onClick={() => act('submit')}
            >
              {busy === 'submit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Serahkan ke Admin PT
            </Button>
            {data.canApprove && (
              <Button size="sm" variant="outline" className="text-sm h-10" disabled={busy !== null || status === 'DRAFT'} onClick={() => act('approve')}>
                {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Setujui
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {dialog && (
        <ItemDialog
          key={dialog.item?.id ?? `baru-${dialog.lane}`}
          divisionId={division.id}
          divisionName={division.name}
          data={data}
          item={dialog.item}
          lane={dialog.lane}
          locked={locked}
          onClose={() => setDialog(null)}
          onSaved={onChanged}
        />
      )}

      {escalating && (
        <WeeklyEscalationDialog
          item={escalating}
          onClose={() => setEscalating(null)}
          onDone={() => {
            setEscalating(null)
            onChanged()
          }}
        />
      )}
    </Card>
  )
}

function ItemCard({
  item,
  dragging,
  locked,
  busy,
  onEdit,
  onDelete,
  onEscalate,
  onChanged,
}: {
  item: Card
  dragging: boolean
  locked: boolean
  busy: boolean
  onEdit: () => void
  onDelete: () => void
  onEscalate: () => void
  onChanged: () => void
}) {
  const [showFiles, setShowFiles] = useState(false)
  const needsEvidence = !['BELUM_MULAI', 'NA'].includes(item.status)
  return (
    <div
      className={cn(
        'glass rounded-xl p-3 space-y-2 border-l-4',
        item.priority.code === 'TINGGI' ? 'border-l-rose-500' : item.priority.code === 'RENDAH' ? 'border-l-sky-400' : 'border-l-amber-500',
        dragging && 'ring-2 ring-violet-500/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{item.workItem}</div>
        <WeeklyItemStatusBadge status={item.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <PriorityBadge priority={item.priority.code} />
        <span>{item.aspectCategory.name}</span>
        <span>PIC {item.picName}</span>
        <span className={item.evidenceCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : needsEvidence ? 'text-amber-600' : ''}>
          <Paperclip className="inline h-3.5 w-3.5 -mt-0.5" /> {item.evidenceCount}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={item.progressPct} className="h-1.5 flex-1" />
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{item.progressPct}%</span>
      </div>
      {item.achievementThisWeek && <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{item.achievementThisWeek}</p>}
      {item.obstacleFollowUp && (
        <p className="text-xs rounded-md bg-rose-500/10 border border-rose-500/25 px-2 py-1 text-rose-700 dark:text-rose-300 line-clamp-2">
          <strong>Kendala:</strong> {item.obstacleFollowUp}
        </p>
      )}
      {item.followUp && (
        <p className="text-xs rounded-md bg-blue-500/10 border border-blue-500/25 px-2 py-1 text-blue-700 dark:text-blue-300 line-clamp-2">
          <strong>Tindak lanjut:</strong> {item.followUp}
        </p>
      )}
      {!dragging && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {!locked && (
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={onEdit}>
              <SquarePen className="h-3.5 w-3.5" /> Ubah
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setShowFiles((v) => !v)} aria-expanded={showFiles}>
            <Paperclip className="h-3.5 w-3.5" /> Bukti
          </Button>
          {item.status === 'TERKENDALA' && !item.escalationRaised && !locked && (
            <Button size="sm" variant="outline" className="h-9 text-xs border-rose-500/40 text-rose-700 dark:text-rose-300" onClick={onEscalate}>
              <Siren className="h-3.5 w-3.5" /> Eskalasi
            </Button>
          )}
          {!locked && !item.escalationRaised && (
            <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-slate-500 hover:text-rose-600" aria-label="Hapus item" onClick={onDelete} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      )}
      {showFiles && !dragging && (
        <EvidencePanel targetType="WEEKLY_ITEM" targetId={item.id} items={item.evidence ?? []} required={needsEvidence} disabled={locked} onChanged={onChanged} compact />
      )}
    </div>
  )
}

/** Formulir satu item — layar penuh di ponsel, lembar lebar di desktop. */
function ItemDialog({
  divisionId,
  divisionName,
  data,
  item,
  lane,
  locked,
  onClose,
  onSaved,
}: {
  divisionId: string
  divisionName: string
  data: Data
  item: Item | null
  lane: string
  locked: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const editing = Boolean(item)
  const [day, setDay] = useState(lane)
  const [f, setF] = useState({
    workItem: item?.workItem ?? '',
    targetOutput: item?.targetOutput ?? '',
    picName: item?.picName ?? '',
    status: item?.status ?? '',
    progressPct: item?.progressPct ?? 0,
    achievementThisWeek: item?.achievementThisWeek ?? '',
    obstacleFollowUp: item?.obstacleFollowUp ?? '',
    followUp: item?.followUp ?? '',
    aspectCategoryId: item?.aspectCategory.id ?? data.aspects[0]?.id ?? '',
    priorityId: item?.priority.id ?? data.priorities[0]?.id ?? '',
  })
  const [tags, setTags] = useState<string[]>(item?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [subtasks, setSubtasks] = useState<{ title: string; isDone: boolean }[]>(item?.subtasks ?? [])
  const [subDraft, setSubDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }))
  const canSave = f.workItem.trim() && f.targetOutput.trim() && f.picName.trim() && f.status && f.achievementThisWeek.trim() && (f.status !== 'TERKENDALA' || f.obstacleFollowUp.trim())

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/weekly-input', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          divisionId,
          itemId: item?.id,
          week: data.week.key,
          workDate: day === WEEKLY_LANE ? null : day,
          ...f,
          tags,
          subtasks,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Gagal menyimpan')
      else {
        onSaved()
        onClose()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  const field = 'bg-white/80 dark:bg-slate-900/60 h-11 text-base'

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'glass-modal p-0 gap-0 flex flex-col overflow-hidden',
          'w-screen h-dvh max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0',
          'sm:w-[min(96vw,56rem)] sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2'
        )}
      >
        <DialogHeader className="px-5 sm:px-7 pt-5 pb-4 border-b border-white/40 dark:border-white/10 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold tracking-tight">{editing ? 'Ubah Capaian' : 'Tambah Capaian'}</DialogTitle>
              <DialogDescription className="text-sm mt-1">
                {day === WEEKLY_LANE ? 'Capaian mingguan' : formatDateLong(day)} · {divisionName} · Minggu {data.week.isoWeek}
              </DialogDescription>
            </div>
            <button type="button" onClick={onClose} aria-label="Tutup" className="shrink-0 h-11 w-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-500/10 dark:hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 sm:px-7 py-5 space-y-4">
          <section className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="item-work" className="text-sm">
                  Uraian pekerjaan / item <span className="text-rose-500">*</span>
                </Label>
                <Input id="item-work" value={f.workItem} onChange={(e) => set('workItem', e.target.value)} disabled={locked} className={field} placeholder="mis. Closing laporan keuangan bulanan" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-target" className="text-sm">
                  Target output <span className="text-rose-500">*</span>
                </Label>
                <Input id="item-target" value={f.targetOutput} onChange={(e) => set('targetOutput', e.target.value)} disabled={locked} className={field} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-pic" className="text-sm">
                  PIC <span className="text-rose-500">*</span>
                </Label>
                <Input id="item-pic" value={f.picName} onChange={(e) => set('picName', e.target.value)} disabled={locked} className={field} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-aspect" className="text-sm">Aspek</Label>
                <select id="item-aspect" value={f.aspectCategoryId} onChange={(e) => set('aspectCategoryId', e.target.value)} disabled={locked} className={selectClass}>
                  {data.aspects.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-priority" className="text-sm">Tingkat prioritas</Label>
                <select id="item-priority" value={f.priorityId} onChange={(e) => set('priorityId', e.target.value)} disabled={locked} className={selectClass}>
                  {data.priorities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="item-day" className="text-sm">Hari pengerjaan</Label>
                <select id="item-day" value={day} onChange={(e) => setDay(e.target.value)} disabled={locked} className={selectClass}>
                  {data.days.map((d) => (
                    <option key={d} value={wibKey(d)}>
                      {formatDateLong(d)}
                    </option>
                  ))}
                  <option value={WEEKLY_LANE}>Capaian mingguan (tanpa hari)</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">
                Status <span className="text-rose-500">*</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('status', s)}
                    disabled={locked}
                    aria-pressed={f.status === s}
                    className={cn(
                      'min-h-11 px-4 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50',
                      f.status === s
                        ? 'border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                    )}
                  >
                    {WEEKLY_STATUS_META[s]?.label ?? s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-progress" className="text-sm">Progres: {f.progressPct}%</Label>
              <Input id="item-progress" type="range" min={0} max={100} step={5} value={f.progressPct} onChange={(e) => set('progressPct', Number(e.target.value))} disabled={locked} className="cursor-pointer" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-ach" className="text-sm">
                Capaian minggu ini <span className="text-rose-500">*</span>
              </Label>
              <Textarea id="item-ach" rows={3} value={f.achievementThisWeek} onChange={(e) => set('achievementThisWeek', e.target.value)} disabled={locked} className="bg-white/80 dark:bg-slate-900/60 text-base" placeholder="Apa yang tercapai pada periode ini." />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-obs" className="text-sm">
                  Kendala {f.status === 'TERKENDALA' && <span className="text-rose-500">*</span>}
                </Label>
                <Textarea id="item-obs" rows={3} value={f.obstacleFollowUp} onChange={(e) => set('obstacleFollowUp', e.target.value)} disabled={locked} className="bg-white/80 dark:bg-slate-900/60 text-base" placeholder="Apa yang menghambat." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-fu" className="text-sm">Tindak lanjut</Label>
                <Textarea id="item-fu" rows={3} value={f.followUp} onChange={(e) => set('followUp', e.target.value)} disabled={locked} className="bg-white/80 dark:bg-slate-900/60 text-base" placeholder="Langkah berikutnya, oleh siapa, kapan." />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-tag" className="text-sm flex items-center gap-1.5">
                <TagIcon className="h-4 w-4" /> Tag
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} className="bg-violet-500/15 text-violet-700 dark:text-violet-300 gap-1 py-1 px-2.5 text-sm">
                    {t}
                    {!locked && (
                      <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Hapus tag ${t}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
              <Input
                id="item-tag"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    const v = tagDraft.trim()
                    if (v && !tags.includes(v) && tags.length < 8) setTags([...tags, v])
                    setTagDraft('')
                  }
                }}
                placeholder="Ketik lalu Enter"
                disabled={locked || tags.length >= 8}
                className={field}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5">
                <ListChecks className="h-4 w-4" /> Langkah kerja
              </Label>
              {subtasks.map((st, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSubtasks(subtasks.map((x, j) => (i === j ? { ...x, isDone: !x.isDone } : x)))}
                    disabled={locked}
                    aria-label={st.isDone ? `Batalkan ${st.title}` : `Tandai selesai ${st.title}`}
                    className={cn('h-7 w-7 shrink-0 rounded-md border flex items-center justify-center', st.isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600')}
                  >
                    {st.isDone && <Check className="h-4 w-4" />}
                  </button>
                  <span className={cn('flex-1 text-base', st.isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200')}>{st.title}</span>
                  {!locked && (
                    <button type="button" onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))} aria-label={`Hapus langkah ${st.title}`} className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {!locked && (
                <div className="flex gap-2">
                  <Input
                    value={subDraft}
                    onChange={(e) => setSubDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const v = subDraft.trim()
                        if (v) setSubtasks([...subtasks, { title: v, isDone: false }])
                        setSubDraft('')
                      }
                    }}
                    placeholder="Tambah langkah kerja"
                    className={field}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-11 p-0"
                    onClick={() => {
                      const v = subDraft.trim()
                      if (v) setSubtasks([...subtasks, { title: v, isDone: false }])
                      setSubDraft('')
                    }}
                    disabled={!subDraft.trim()}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              )}
            </div>
          </section>

          {editing ? (
            <section className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 p-4">
              <EvidencePanel targetType="WEEKLY_ITEM" targetId={item!.id} items={item!.evidence ?? []} required={!['BELUM_MULAI', 'NA'].includes(f.status)} disabled={locked} onChanged={onSaved} />
            </section>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 px-1">Dokumen dan foto dapat dilampirkan setelah item disimpan.</p>
          )}

          {err && (
            <p className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {err}
            </p>
          )}
        </div>

        <div className="px-5 sm:px-7 py-4 border-t border-white/40 dark:border-white/10 flex gap-2 justify-end bg-white/40 dark:bg-slate-900/40">
          <Button variant="ghost" onClick={onClose} disabled={busy} className="h-12 px-5 text-base">
            Batal
          </Button>
          <Button onClick={save} disabled={busy || locked || !canSave} className="h-12 px-6 text-base bg-gradient-to-r from-violet-600 to-violet-500 text-white">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {editing ? 'Simpan perubahan' : 'Simpan capaian'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Raising one weekly item to the next level up. */
function WeeklyEscalationDialog({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const [summary, setSummary] = useState(item.obstacleFollowUp ?? '')
  const [needed, setNeeded] = useState('DUKUNGAN_LINTAS_FUNGSI')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/escalations/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'raise', sourceType: 'WEEKLY_ITEM', sourceId: item.id, summary, needed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Gagal mengajukan eskalasi')
      else onDone()
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-modal max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Siren className="h-5 w-5 text-rose-600 dark:text-rose-400" /> Ajukan Eskalasi
          </DialogTitle>
          <DialogDescription className="text-sm">{item.workItem}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Yang dibutuhkan</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'KEPUTUSAN', label: 'Keputusan' },
                { value: 'ANGGARAN', label: 'Anggaran' },
                { value: 'DUKUNGAN_LINTAS_FUNGSI', label: 'Dukungan lintas fungsi' },
              ].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setNeeded(o.value)}
                  className={cn(
                    'min-h-11 px-4 rounded-xl border text-sm font-medium transition-colors',
                    needed === o.value ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wesc-summary" className="text-sm font-medium">
              Ringkasan untuk pengambil keputusan <span className="text-rose-500">*</span>
            </Label>
            <Textarea id="wesc-summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Jelaskan hambatannya, dampaknya, dan opsi yang Anda usulkan." className="bg-white/80 dark:bg-slate-900/60" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Minimal 10 karakter.</p>
          </div>
          {err && (
            <p className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {err}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy || summary.trim().length < 10} className="bg-gradient-to-r from-rose-600 to-rose-500 text-white">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Ajukan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
