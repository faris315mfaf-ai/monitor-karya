'use client'

import { useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { LoadingSpinner, EmptyState } from '@/components/loading-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { WeeklyHeaderBadge, WeeklyItemStatusBadge } from '@/components/status-badges'
import { EvidencePanel } from '@/components/evidence-panel'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate, formatDateLong } from '@/lib/format'
import {
  AlertTriangle, CalendarCheck, Check, CheckCircle2, ListChecks, Loader2, Lock, Plus,
  Send, ShieldCheck, Siren, Tag as TagIcon, Trash2, X,
} from 'lucide-react'

type Ref = { id: string; code: string; name: string }
type Item = {
  id: string
  workItem: string
  targetOutput: string
  picName: string
  status: string
  progressPct: number
  achievementThisWeek: string
  obstacleFollowUp: string | null
  evidenceCount: number
  tags: string[]
  subtasks: { id?: string; title: string; isDone: boolean }[]
  escalationRaised?: boolean
  evidence?: Array<{ id: string; fileName: string; url: string | null; mime?: string | null; size?: number | null; createdAt: string }>
  aspectCategory: Ref
  priority: Ref
}
type DivisionRow = {
  id: string
  name: string
  type: string
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
  isoYear: number
  isoWeek: number
  periodStart: string
  periodEnd: string
  handoverBy: string
  lockAt: string
  locked: boolean
  canApprove: boolean
  aspects: Ref[]
  priorities: Ref[]
  divisions: DivisionRow[]
}

const STATUSES = ['SELESAI', 'ON_PROGRESS', 'BELUM_MULAI', 'TERKENDALA', 'NA']
const STATUS_LABEL: Record<string, string> = {
  SELESAI: 'Selesai',
  ON_PROGRESS: 'Berjalan',
  BELUM_MULAI: 'Belum mulai',
  TERKENDALA: 'Terkendala',
  NA: 'Tidak berlaku',
}

export function WeeklyInputView() {
  const { data, loading, error, reload } = useResource<Data>('/api/weekly-input')

  if (loading) return <LoadingSpinner className="py-10" />
  if (error || !data)
    return <EmptyState title="Gagal memuat capaian mingguan" description={error ?? undefined} />

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Capaian Mingguan
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
            Minggu {data.isoWeek}/{data.isoYear} · {formatDate(new Date(data.periodStart))} –{' '}
            {formatDate(new Date(data.periodEnd))}
          </p>
        </div>
        <div
          className={`glass rounded-xl px-3 py-2 flex items-center gap-2 ${
            data.locked ? 'text-rose-600' : 'text-violet-600'
          }`}
        >
          {data.locked ? <Lock className="h-4 w-4" /> : <CalendarCheck className="h-4 w-4" />}
          <div className="leading-tight">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {data.locked ? 'Terkunci' : 'Serahkan paling lambat'}
            </div>
            <div className="text-base font-semibold">
              {data.locked
                ? 'Minggu ini ditutup'
                : `${formatDateLong(new Date(data.handoverBy))} pukul 17.00`}
            </div>
          </div>
        </div>
      </div>

      {data.divisions.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" />}
          title="Belum ada divisi yang ditugaskan"
          description="Hubungi Admin PT untuk penugasan divisi."
        />
      ) : (
        data.divisions.map((d) => (
          <DivisionBlock key={d.id} division={d} data={data} onChanged={reload} />
        ))
      )}
    </div>
  )
}

function DivisionBlock({
  division,
  data,
  onChanged,
}: {
  division: DivisionRow
  data: Data
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const items = division.report?.items ?? []
  const locked = data.locked || Boolean(division.report?.isLocked)
  const status = division.report?.statusHeader ?? 'DRAFT'

  async function act(action: 'submit' | 'approve') {
    setBusy(action)
    setMsg(null)
    setErrors([])
    try {
      const res = await fetch('/api/weekly-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ divisionId: division.id, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: 'err', text: json.error || 'Gagal' })
        setErrors(Array.isArray(json.errors) ? json.errors : [])
      } else {
        setMsg({
          kind: 'ok',
          text: action === 'submit' ? 'Diserahkan ke Admin PT.' : 'Disetujui dan siap dikunci.',
        })
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
              {division.type} · {items.length} item pekerjaan
            </CardDescription>
          </div>
          <WeeklyHeaderBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {locked && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[13px] text-rose-700 dark:text-rose-300">
            <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Minggu ini sudah dikunci. Perubahan memerlukan permohonan buka kunci.
          </div>
        )}

        {items.length === 0 && !adding && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada item pekerjaan minggu ini.</p>
        )}

        {items.map((it) => (
          <ItemRow key={it.id} item={it} divisionId={division.id} data={data} locked={locked} onChanged={onChanged} />
        ))}

        {adding && (
          <ItemForm
            divisionId={division.id}
            data={data}
            onDone={() => {
              setAdding(false)
              onChanged()
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {msg && (
          <div
            className={`rounded-lg p-2.5 text-[13px] ${
              msg.kind === 'ok'
                ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300'
            }`}
          >
            <div className="flex items-start gap-2">
              {msg.kind === 'ok' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              )}
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
            {!adding && (
              <Button size="sm" variant="outline" className="text-sm" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" /> Tambah item
              </Button>
            )}
            <Button
              size="sm"
              className="text-sm bg-gradient-to-r from-violet-600 to-violet-500 text-white"
              disabled={busy !== null || items.length === 0}
              onClick={() => act('submit')}
            >
              {busy === 'submit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Serahkan ke Admin PT
            </Button>
            {data.canApprove && (
              <Button
                size="sm"
                variant="outline"
                className="text-sm"
                disabled={busy !== null || status === 'DRAFT'}
                onClick={() => act('approve')}
              >
                {busy === 'approve' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Setujui
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ItemRow({
  item,
  divisionId,
  data,
  locked,
  onChanged,
}: {
  item: Item
  divisionId: string
  data: Data
  locked: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [escalating, setEscalating] = useState(false)

  if (editing) {
    return (
      <ItemForm
        divisionId={divisionId}
        data={data}
        item={item}
        onDone={() => {
          setEditing(false)
          onChanged()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="glass rounded-xl p-3 space-y-1.5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-medium text-slate-800 dark:text-slate-100">{item.workItem}</div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400">
            {item.aspectCategory.name} · PIC {item.picName} · target {item.targetOutput}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap sm:shrink-0">
          <WeeklyItemStatusBadge status={item.status} />
          {!locked && (
            <Button size="sm" variant="ghost" className="h-9 text-[13px]" onClick={() => setEditing(true)}>
              Ubah
            </Button>
          )}
          {item.status === 'TERKENDALA' && !item.escalationRaised && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-[13px] border-rose-500/40 text-rose-700 dark:text-rose-300"
              onClick={() => setEscalating(true)}
            >
              <Siren className="h-4 w-4" /> Eskalasi
            </Button>
          )}
        </div>
      </div>
      <div className="text-[13px] text-slate-600 dark:text-slate-300">{item.achievementThisWeek}</div>
      {item.subtasks?.length > 0 && (
        <div className="space-y-1">
          {item.subtasks.map((st, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${
                  st.isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {st.isDone && <Check className="h-3 w-3" />}
              </span>
              <span className={st.isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}>
                {st.title}
              </span>
            </div>
          ))}
        </div>
      )}

      {item.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map((t) => (
            <Badge key={t} variant="outline" className="text-[11px] px-2 py-0.5">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Badge variant="outline" className="text-[11px] h-4 px-1">
          {item.priority.name}
        </Badge>
        <span className="tabular-nums">{item.progressPct}%</span>
        <span className={item.evidenceCount > 0 ? 'text-emerald-600' : 'text-amber-600'}>
          {item.evidenceCount} bukti
        </span>
      </div>
      {escalating && (
        <WeeklyEscalationDialog
          item={item}
          onClose={() => setEscalating(false)}
          onDone={() => {
            setEscalating(false)
            onChanged()
          }}
        />
      )}

      <EvidencePanel
        targetType="WEEKLY_ITEM"
        targetId={item.id}
        items={item.evidence ?? []}
        required={!["BELUM_MULAI", "NA"].includes(item.status)}
        disabled={locked}
        onChanged={onChanged}
        compact
      />
    </div>
  )
}

function ItemForm({
  divisionId,
  data,
  item,
  onDone,
  onCancel,
}: {
  divisionId: string
  data: Data
  item?: Item
  onDone: () => void
  onCancel: () => void
}) {
  const [f, setF] = useState({
    workItem: item?.workItem ?? '',
    targetOutput: item?.targetOutput ?? '',
    picName: item?.picName ?? '',
    status: item?.status ?? '',
    progressPct: item?.progressPct ?? 0,
    achievementThisWeek: item?.achievementThisWeek ?? '',
    obstacleFollowUp: item?.obstacleFollowUp ?? '',
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

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/weekly-input', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ divisionId, itemId: item?.id, ...f, tags, subtasks }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Gagal menyimpan')
      else onDone()
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-blue-500/30 bg-white/60 dark:bg-slate-900/40 p-3 space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-sm">Uraian pekerjaan <span className="text-rose-500">*</span></Label>
          <Input value={f.workItem} onChange={(e) => set('workItem', e.target.value)} className="bg-white/80 dark:bg-slate-900/60 h-9 text-base" />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Target output <span className="text-rose-500">*</span></Label>
          <Input value={f.targetOutput} onChange={(e) => set('targetOutput', e.target.value)} className="bg-white/80 dark:bg-slate-900/60 h-9 text-base" />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">PIC <span className="text-rose-500">*</span></Label>
          <Input value={f.picName} onChange={(e) => set('picName', e.target.value)} className="bg-white/80 dark:bg-slate-900/60 h-9 text-base" />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Aspek</Label>
          <select
            value={f.aspectCategoryId}
            onChange={(e) => set('aspectCategoryId', e.target.value)}
            className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-2 text-base"
          >
            {data.aspects.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Prioritas</Label>
          <select
            value={f.priorityId}
            onChange={(e) => set('priorityId', e.target.value)}
            className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-2 text-base"
          >
            {data.priorities.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-sm">Status <span className="text-rose-500">*</span></Label>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set('status', s)}
              className={`text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors ${
                f.status === s
                  ? 'border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10 dark:hover:bg-slate-400/15'
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-sm">Progres ({f.progressPct}%)</Label>
        <Input
          type="range"
          min={0}
          max={100}
          value={f.progressPct}
          onChange={(e) => set('progressPct', Number(e.target.value))}
          className="h-9 cursor-pointer"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-sm flex items-center gap-1.5">
          <TagIcon className="h-4 w-4" /> Tag
        </Label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {tags.map((t) => (
            <Badge key={t} className="bg-violet-500/15 text-violet-700 dark:text-violet-300 gap-1 py-1 px-2.5">
              {t}
              <button onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Hapus tag ${t}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ))}
        </div>
        <Input
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
          className="bg-white/80 dark:bg-slate-900/60"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-sm flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" /> Langkah kerja
        </Label>
        {subtasks.map((st, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => setSubtasks(subtasks.map((x, j) => (i === j ? { ...x, isDone: !x.isDone } : x)))}
              aria-label={st.isDone ? `Batalkan ${st.title}` : `Tandai selesai ${st.title}`}
              className={`h-6 w-6 shrink-0 rounded-md border flex items-center justify-center ${
                st.isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'
              }`}
            >
              {st.isDone && <Check className="h-4 w-4" />}
            </button>
            <span className={`flex-1 text-sm ${st.isDone ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
              {st.title}
            </span>
            <button
              onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
              aria-label={`Hapus langkah ${st.title}`}
              className="text-slate-400 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
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
            className="bg-white/80 dark:bg-slate-900/60"
          />
          <Button
            variant="outline"
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
      </div>

      <div className="space-y-1">
        <Label className="text-sm">Capaian minggu ini <span className="text-rose-500">*</span></Label>
        <Textarea rows={2} value={f.achievementThisWeek} onChange={(e) => set('achievementThisWeek', e.target.value)} className="bg-white/80 dark:bg-slate-900/60 text-base" />
      </div>

      {f.status === 'TERKENDALA' && (
        <div className="space-y-1">
          <Label className="text-sm">Kendala &amp; tindak lanjut <span className="text-rose-500">*</span></Label>
          <Textarea rows={2} value={f.obstacleFollowUp} onChange={(e) => set('obstacleFollowUp', e.target.value)} className="bg-white/80 dark:bg-slate-900/60 text-base" />
        </div>
      )}

      {err && <p className="text-[13px] text-rose-700 dark:text-rose-300">{err}</p>}

      <div className="flex gap-2">
        <Button size="sm" className="text-sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Simpan item
        </Button>
        <Button size="sm" variant="ghost" className="text-sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" /> Batal
        </Button>
      </div>
    </div>
  )
}

/** Raising one weekly item to the next level up. */
function WeeklyEscalationDialog({
  item,
  onClose,
  onDone,
}: {
  item: Item
  onClose: () => void
  onDone: () => void
}) {
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
        body: JSON.stringify({
          action: 'raise',
          sourceType: 'WEEKLY_ITEM',
          sourceId: item.id,
          summary,
          needed,
        }),
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
            <Siren className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            Ajukan Eskalasi
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
                  onClick={() => setNeeded(o.value)}
                  className={`min-h-11 px-4 rounded-xl border text-sm font-medium transition-colors ${
                    needed === o.value
                      ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                  }`}
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
            <Textarea
              id="wesc-summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Jelaskan hambatannya, dampaknya, dan opsi yang Anda usulkan."
              className="bg-white/80 dark:bg-slate-900/60"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">Minimal 10 karakter.</p>
          </div>

          {err && (
            <p className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {err}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button
            onClick={submit}
            disabled={busy || summary.trim().length < 10}
            className="bg-gradient-to-r from-rose-600 to-rose-500 text-white"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Ajukan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
