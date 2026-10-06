'use client'

/**
 * Laporan mingguan untuk Direktur (03-kepala-divisi.md §8) [F2-KADIV]:
 * draf otomatis dari laporan harian & output (Output diterima, Proyek sesuai
 * jadwal x/y, Kendala terbuka, 3 poin yang bisa disunting), FlowDiagram
 * Kumpulkan → Review output → Susun ringkasan → Kirim ke Direktur, dan
 * peringatan bila review masih tertunda. Data: /api/kadiv/weekly-summary.
 *
 * Satu tombol primer: langkah berikutnya saja (Kirim ke Direktur, atau Simpan
 * draf saat menyunting). Kirim bisa diurungkan lewat toast.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ErrorNote, FlowDiagram, Skeleton, StatusBadge, useIsPhone, type FlowStep } from '@/components/mk'
import { Textarea } from '@/components/ui/textarea'
import { formatTime } from '@/lib/format'
import { postJson } from './use-kadiv'
import type { WeeklySummaryView } from './types'

const WIB = 'Asia/Jakarta'
const POINT_MAX = 280

function dayTime(iso: string) {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: WIB }).format(d).replace('.', '')
  return `${day} ${formatTime(d)}`
}

class ApiError extends Error {
  constructor(message: string, readonly code?: string, readonly pendingReview?: number) {
    super(message)
  }
}

async function send(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string; pendingReview?: number; directors?: { name: string }[] }
  if (!res.ok) throw new ApiError(j.error || 'Belum berhasil. Coba lagi.', j.code, j.pendingReview)
  return j
}

export function useWeeklySummary(divisionId: string | null | undefined) {
  const [view, setView] = useState<WeeklySummaryView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const load = useCallback(async () => {
    if (!divisionId) return
    const n = ++seq.current
    try {
      const res = await fetch(`/api/kadiv/weekly-summary?divisionId=${encodeURIComponent(divisionId)}`, { cache: 'no-store' })
      const j = (await res.json().catch(() => ({}))) as WeeklySummaryView & { error?: string }
      if (!res.ok) throw new Error(j.error || 'Ringkasan mingguan belum termuat')
      if (n !== seq.current) return
      setView(j)
      setError(null)
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : 'Ringkasan mingguan belum termuat')
    }
  }, [divisionId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  return { view, error, reload: load }
}

export function WeeklySummaryCard({
  divisionId,
  pendingReview,
  className,
  id,
  onReview,
}: {
  divisionId: string | null | undefined
  /** Jumlah output menunggu review dari antrean (supaya alur ikut bergerak saat Anda menerima output). */
  pendingReview?: number
  className?: string
  id?: string
  /** Gulir ke kartu review output. */
  onReview?: () => void
}) {
  const phone = useIsPhone()
  const { view, error, reload } = useWeeklySummary(divisionId)
  const [editing, setEditing] = useState<string[] | null>(null)
  const [busy, setBusy] = useState<'save' | 'send' | 'unsend' | null>(null)
  const [confirm, setConfirm] = useState<number | null>(null)

  // Muat ulang saat antrean review berubah (output diterima menggerakkan angka & alur).
  const lastPending = useRef(pendingReview)
  useEffect(() => {
    if (pendingReview === undefined || pendingReview === lastPending.current) return
    lastPending.current = pendingReview
    void reload()
  }, [pendingReview, reload])

  const title = view ? `Laporan mingguan M${view.week.isoWeek} untuk Direktur` : 'Laporan mingguan untuk Direktur'
  if (!view) {
    return (
      <Card id={id} className={className} title={title}>
        {error ? (
          <ErrorNote message={error} onRetry={() => void reload()} />
        ) : (
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton h={72} />
            <Skeleton h={44} />
            <Skeleton h={88} />
          </div>
        )}
      </Card>
    )
  }

  const saved = view.saved
  const sent = saved?.status === 'TERKIRIM'
  const stats = sent && saved ? saved : view.live
  const pending = sent ? (saved?.pendingReview ?? 0) : view.live.pendingReview
  const points = editing ?? (saved?.points.length ? saved.points : view.live.points)
  const now = Date.now()
  const handoverPassed = now >= Date.parse(view.week.handoverBy)
  const blocked = view.blocked
  const director = view.directors.map((d) => d.name).join(', ')
  const draftSaved = Boolean(saved && saved.status === 'DRAF')
  const dailyDone = view.daily.required > 0 && view.daily.sent >= view.daily.required

  const flow: FlowStep[] = [
    {
      title: 'Kumpulkan',
      sub: view.daily.required ? `${view.daily.sent} dari ${view.daily.required} laporan harian` : 'Belum ada laporan wajib',
      status: dailyDone || sent ? 'done' : 'current',
      icon: 'catatan',
    },
    {
      title: 'Review output',
      sub: pending ? `${pending} menunggu review` : 'Semua output direview',
      status: pending === 0 || sent ? 'done' : 'blocked',
      icon: 'persetujuan',
      meta: pending ? (sent ? 'Dikirim sebelum review selesai' : 'Angka output belum final') : undefined,
    },
    {
      title: 'Susun ringkasan',
      sub: sent ? '3 poin terkirim' : draftSaved ? 'Draf disunting' : 'Draf otomatis',
      status: sent || draftSaved ? 'done' : pending ? 'todo' : 'current',
      icon: 'dokumen',
    },
    {
      title: 'Kirim ke Direktur',
      sub: director || 'Direktur PT',
      status: sent ? 'done' : pending ? 'todo' : 'current',
      icon: 'kirim',
      meta: sent && saved?.sentAt ? `Terkirim ${formatTime(saved.sentAt)}` : undefined,
    },
  ]

  async function save() {
    if (!editing || !divisionId) return
    setBusy('save')
    try {
      await send('/api/kadiv/weekly-summary', { divisionId, points: editing }, 'PUT')
      toast.success('Draf ringkasan disimpan.')
      setEditing(null)
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Draf belum tersimpan')
    } finally {
      setBusy(null)
    }
  }

  async function unsend() {
    if (!divisionId) return
    setBusy('unsend')
    try {
      await postJson('/api/kadiv/weekly-summary', { divisionId, action: 'unsend' })
      toast.success('Ringkasan ditarik kembali ke draf.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belum berhasil ditarik')
    } finally {
      setBusy(null)
      await reload()
    }
  }

  async function sendNow(confirmPending: boolean) {
    if (!divisionId) return
    setBusy('send')
    try {
      const r = await send('/api/kadiv/weekly-summary', {
        divisionId,
        action: 'send',
        points: editing ?? points,
        confirmPending,
      })
      const names = (r.directors ?? []).map((d) => d.name).join(', ')
      setEditing(null)
      setConfirm(null)
      toast.success(names ? `Ringkasan terkirim ke ${names}.` : 'Ringkasan terkirim ke Direktur.', {
        action: { label: 'Urungkan', onClick: () => void unsend() },
      })
      await reload()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PENDING_REVIEW') setConfirm(e.pendingReview ?? pending)
      else toast.error(e instanceof Error ? e.message : 'Ringkasan belum terkirim')
    } finally {
      setBusy(null)
    }
  }

  const badge = sent ? (
    <StatusBadge status="done">Terkirim</StatusBadge>
  ) : blocked ? (
    <StatusBadge status="neutral">Terkunci</StatusBadge>
  ) : (
    <StatusBadge status={handoverPassed ? 'late' : 'neutral'}>Draf</StatusBadge>
  )

  const figures = [
    { label: 'Output diterima', value: `${stats.outputsAccepted}`, sub: stats.outputsTarget ? `dari ${stats.outputsTarget} target` : 'belum ada target' },
    { label: 'Proyek sesuai jadwal', value: `${stats.projectsOnTrack}/${stats.projectsTotal}`, sub: stats.projectsTotal ? 'proyek aktif' : 'tanpa proyek aktif' },
    { label: 'Kendala terbuka', value: `${stats.openObstacles}`, sub: stats.openObstacles ? 'perlu tindak lanjut' : 'tidak ada' },
  ]

  return (
    <Card
      id={id}
      className={className}
      title={title}
      subtitle={`Disusun otomatis dari laporan harian dan output · serahkan paling lambat ${dayTime(view.week.handoverBy)} · dikunci ${dayTime(view.week.lockAt)}`}
      action={badge}
    >
      <div className="flex flex-col gap-5">
        <div className="mk-inset">
          <FlowDiagram orientation={phone ? 'vertical' : 'horizontal'} steps={flow} label="Alur laporan mingguan untuk Direktur" />
        </div>

        <div className="mk-kv" role="list" aria-label="Angka minggu ini">
          {figures.map((f) => (
            <div key={f.label} role="listitem" className="mk-inset">
              <div className="t-footnote text-ink-2">{f.label}</div>
              <div className="t-title-2 tabular-nums">{f.value}</div>
              <div className="t-caption text-ink-2">{f.sub}</div>
            </div>
          ))}
        </div>

        {!sent && pending > 0 && !blocked && (
          <div className="mk-note-box mk-soft--risk" role="status">
            <div className="t-body-strong">
              {pending} output masih menunggu review
            </div>
            <p className="t-footnote">
              {handoverPassed
                ? 'Tenggat serah sudah lewat. Angka output dikirim apa adanya.'
                : 'Output baru dihitung selesai setelah Anda terima. Review dulu supaya angka untuk Direktur final, atau kirim tetap.'}
            </p>
            {onReview && (
              <Button size="sm" variant="plain" className="mt-1" onClick={onReview}>
                Review {pending} output
              </Button>
            )}
          </div>
        )}

        <section aria-label="Poin ringkasan" className="flex flex-col gap-2">
          <h4 className="t-headline">Poin untuk Direktur</h4>
          {editing ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="mk-field">
                  <label htmlFor={`kadiv-sum-${i}`} className="mk-field__label">
                    Poin {i + 1}
                  </label>
                  <Textarea
                    id={`kadiv-sum-${i}`}
                    rows={2}
                    maxLength={POINT_MAX}
                    value={editing[i] ?? ''}
                    onChange={(e) => setEditing((cur) => {
                      const next = [...(cur ?? [])]
                      while (next.length < 3) next.push('')
                      next[i] = e.target.value
                      return next
                    })}
                  />
                </div>
              ))}
              <div>
                <Button size="sm" variant="plain" onClick={() => setEditing([...view.live.points])}>
                  Pakai draf otomatis
                </Button>
              </div>
            </div>
          ) : (
            <ol className="t-body list-decimal pl-5 flex flex-col gap-1">
              {points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          )}
        </section>

        {confirm !== null && !sent && (
          <div className="mk-note-box mk-soft--late" role="alert">
            <div className="t-body-strong">Kirim sebelum review selesai?</div>
            <p className="t-footnote">
              {confirm} output masih menunggu review dan tenggat serah belum lewat. Direktur akan melihat angka output yang belum final.
            </p>
          </div>
        )}

        {blocked ? (
          <p className="t-footnote text-ink-2">{blocked.message}</p>
        ) : sent ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge status="done">{director ? `Terkirim ke ${director}` : 'Terkirim ke Direktur'}</StatusBadge>
            <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void unsend()}>
              {busy === 'unsend' ? 'Menarik…' : 'Tarik untuk disunting'}
            </Button>
          </div>
        ) : editing ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={busy !== null} onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button variant="primary" icon="selesai" full={phone} disabled={busy !== null || !editing.some((p) => p.trim())} onClick={() => void save()}>
              {busy === 'save' ? 'Menyimpan…' : 'Simpan draf'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon="ubah" disabled={busy !== null} onClick={() => setEditing([...points, '', '', ''].slice(0, 3))}>
              Edit draf
            </Button>
            <Button variant="primary" icon="kirim" full={phone} disabled={busy !== null} onClick={() => void sendNow(confirm !== null)}>
              {busy === 'send' ? 'Mengirim…' : confirm !== null ? 'Kirim tetap ke Direktur' : 'Kirim ke Direktur'}
            </Button>
          </div>
        )}

        <p className="t-footnote text-ink-2">
          {view.report?.forwardedAt
            ? 'Capaian mingguan sudah diteruskan Admin PT ke holding.'
            : view.report?.submittedAt
              ? 'Capaian mingguan sudah diserahkan ke Admin PT. Direktur membaca ringkasan ini bersama laporan divisi.'
              : `Capaian mingguan tetap diserahkan ke Admin PT paling lambat ${dayTime(view.week.handoverBy)}; ringkasan ini ikut terbaca Direktur.`}
        </p>
      </div>
    </Card>
  )
}
