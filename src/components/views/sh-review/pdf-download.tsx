'use client'

/**
 * Unduh laporan PDF Supervisor (9 Nov 2026, canvas "Unduh PDF Supervisor").
 *
 * Lembar "Unduh laporan PDF": periode Hari ini / Kemarin / Rentang tanggal
 * (pintasan 7 hari, minggu ini, bulan ini; maks. 31 hari), subholding (semua
 * atau dicentang, dengan jumlah laporan periode itu), laporan disetujui saja
 * atau termasuk yang menunggu (DRAF), satu PDF gabungan atau satu PDF per
 * subholding (.zip), dan isi (foto, sorotan, komentar). Bilah bawah memuat
 * jumlah, perkiraan ukuran, dan nama berkas.
 *
 * Tombol unduh cepat per subholding: PDF laporan disetujui subholding itu
 * hari ini, langsung tanpa lembar.
 *
 * Berkas diambil dengan fetch lalu disimpan lewat tautan blob, supaya galat
 * (tidak ada laporan, terlalu banyak, batas laju) tampil sebagai pesan, bukan
 * halaman JSON.
 */

import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button, Chip, ErrorNote, Icon, SegmentedControl, Skeleton, cx } from '@/components/mk'
import { ChoiceGroup, Input } from '@/components/mk/forms'
import { Sheet } from '@/components/mk/sheet'
import { SwitchRow } from '@/components/companies/parts'
import { useResource } from '@/hooks/use-resource'
import {
  MAX_RANGE_DAYS, bundleFileName, bundleSearch, periodRange, quickRange, rangeError,
  type BundleFormat, type BundlePeriod, type BundleQuery, type QuickRange,
} from '@/lib/subholding/pdf-bundle'
import { subholdingLabel, toneOf, wibDateKey } from '../sh-overview/logic'
import { Mono } from '../sh-overview/tablet/parts'
import {
  fileNameFromDisposition, isPicked, selectionFile, selectionHeadline, selectionOf, subReports, toggleSubPick,
  type BundleSummary, type SubPick,
} from './pdf-download-logic'
import { FOCUS_RING } from './queue'

const PERIODS: { value: BundlePeriod; label: string }[] = [
  { value: 'hari', label: 'Hari ini' },
  { value: 'kemarin', label: 'Kemarin' },
  { value: 'rentang', label: 'Rentang' },
]

const QUICK: { value: QuickRange; label: string }[] = [
  { value: '7hari', label: '7 hari terakhir' },
  { value: 'minggu', label: 'Minggu ini' },
  { value: 'bulan', label: 'Bulan ini' },
]

/** Ambil berkas dari GET /api/sh/pdf/berkas lalu simpan ke perangkat. Melempar Error berpesan. */
export async function saveBundle(q: BundleQuery): Promise<string> {
  const res = await fetch(`/api/sh/pdf/berkas?${bundleSearch(q)}`)
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (res.status === 401) throw new Error('Sesi Anda berakhir. Masuk kembali.')
    throw new Error(json.error || `Berkas belum bisa dibuat (HTTP ${res.status})`)
  }
  const blob = await res.blob()
  const name = fileNameFromDisposition(res.headers.get('content-disposition')) ?? bundleFileName(q)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  // Beri peramban waktu memulai unduhan sebelum alamat blob dilepas.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return name
}

/* ---------- Tombol pemicu ---------- */

/** Tombol "Unduh PDF" panel subholding / kepala antrean. `compact` = ikon saja. */
export function PdfDownloadButton({ compact, onClick, className }: { compact?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={compact ? 'Unduh laporan PDF' : undefined}
      title={compact ? 'Unduh laporan PDF' : undefined}
      className={cx(
        'inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[12px] t-callout font-semibold',
        compact ? 'w-11 bg-surface text-ink shadow-[var(--shadow-card)]' : 'bg-grafit-fill px-4 text-on-grafit',
        'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.97]',
        FOCUS_RING,
        className
      )}
    >
      <Icon name="unduh" size={18} strokeWidth={2.2} />
      {compact ? null : 'Unduh PDF'}
    </button>
  )
}

/** Unduh cepat: laporan disetujui satu subholding hari ini (tanpa lembar). */
export function SubPdfButton({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false)
  const label = `Unduh PDF ${name} hari ini`
  const run = async () => {
    if (busy) return
    setBusy(true)
    const today = wibDateKey(new Date())
    try {
      const file = await saveBundle({
        from: today, to: today, subs: [id], drafts: false, format: 'pdf', photos: true, highlights: true, comments: true,
      })
      toast(`Berkas ${file} diunduh.`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Berkas belum bisa dibuat. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={run}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy}
      title={label}
      className={cx(
        'relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-accent hover:bg-fill-1',
        'motion-safe:transition-[transform,background-color,opacity] motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.92]',
        busy && 'cursor-progress opacity-50',
        FOCUS_RING
      )}
    >
      <Icon name="unduh" size={17} strokeWidth={2.3} />
    </button>
  )
}

/* ---------- Lembar ---------- */

export function PdfDownloadSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [todayKey] = useState(() => wibDateKey(new Date()))
  const [period, setPeriod] = useState<BundlePeriod>('hari')
  const [custom, setCustom] = useState(() => quickRange('7hari', todayKey))
  const [pick, setPick] = useState<SubPick>(null)
  const [drafts, setDrafts] = useState(false)
  const [format, setFormat] = useState<BundleFormat>('pdf')
  const [photos, setPhotos] = useState(true)
  const [highlights, setHighlights] = useState(true)
  const [comments, setComments] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uid = useId()

  const range = periodRange(period, todayKey, custom)
  const bad = rangeError(range.from, range.to)
  const url = open && !bad ? `/api/sh/pdf/ringkasan?from=${range.from}&to=${range.to}` : null
  const res = useResource<BundleSummary>(url)
  // Selama rentang baru dimuat, data lama masih ada: jangan dipakai untuk hitungan.
  const summary = res.data && !bad && res.data.from === range.from && res.data.to === range.to ? res.data : null
  const withDrafts = drafts && Boolean(summary?.canDrafts)
  const sel = summary ? selectionOf(summary, pick, withDrafts) : null
  const allIds = summary?.subholdings.map((s) => s.id) ?? []
  const onlySub = summary && sel?.subs === 1 ? summary.subholdings.find((s) => isPicked(pick, s.id))?.name ?? null : null
  const canDownload = Boolean(sel && sel.subs && sel.reports) && !busy

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setError(null)
  }

  const download = async () => {
    if (!canDownload) return
    setBusy(true)
    setError(null)
    try {
      const file = await saveBundle({
        from: range.from, to: range.to, subs: pick, drafts: withDrafts, format, photos, highlights, comments,
      })
      toast(`Berkas ${file} diunduh.`)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Berkas belum bisa dibuat. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  const headline = bad ?? (sel ? selectionHeadline(sel, photos) : 'Menghitung laporan…')
  const fileLine = sel && !bad ? selectionFile(sel, { ...range, format }, onlySub) : ''

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v)
      }}
      title="Unduh laporan PDF"
      size="wide"
      backLabel="Persetujuan"
      footer={
        <div className="flex w-full flex-col gap-3">
          {error ? (
            <p role="alert" className="m-0 flex items-start gap-2 t-footnote font-semibold text-bahaya">
              <Icon name="peringatan" size={16} strokeWidth={2.4} className="mt-px shrink-0" />
              {error}
            </p>
          ) : null}
          {/* Ponsel: ringkasan di atas, tombol unduh selebar layar (kembali lewat tombol kepala). */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 sm:flex-1" aria-live="polite">
              <p className={cx('m-0 t-callout font-bold', bad ? 'text-bahaya' : 'text-ink')}>{headline}</p>
              {fileLine ? <p className="m-0 truncate t-caption text-ink-2">{fileLine}</p> : null}
            </div>
            <div className="flex shrink-0 gap-2 max-sm:[&>.mk-btn]:flex-1">
              <Button variant="plain" onClick={() => onOpenChange(false)} disabled={busy} className="max-sm:!hidden">
                Batal
              </Button>
              <Button variant="primary" icon="unduh" onClick={download} disabled={!canDownload} aria-busy={busy || undefined}>
                {busy ? 'Menyiapkan berkas…' : format === 'zip' ? 'Unduh .zip' : 'Unduh PDF'}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby={`${uid}-periode`} className="flex flex-col gap-2.5">
          <h3 id={`${uid}-periode`} className="m-0 t-footnote font-bold text-ink-2">
            Periode
          </h3>
          <SegmentedControl label="Periode" options={PERIODS} value={period} onChange={change((v: string) => setPeriod(v as BundlePeriod))} full />
          {period === 'rentang' ? (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <label className="mk-field">
                  <span className="mk-field__label">Dari tanggal</span>
                  <Input
                    type="date"
                    value={custom.from}
                    max={todayKey}
                    onChange={(e) => change(setCustom)({ ...custom, from: e.target.value })}
                  />
                </label>
                <label className="mk-field">
                  <span className="mk-field__label">Sampai tanggal</span>
                  <Input
                    type="date"
                    value={custom.to}
                    min={custom.from || undefined}
                    max={todayKey}
                    onChange={(e) => change(setCustom)({ ...custom, to: e.target.value })}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {QUICK.map((q) => {
                  const r = quickRange(q.value, todayKey)
                  return (
                    <Chip key={q.value} selected={r.from === custom.from && r.to === custom.to} onClick={() => change(setCustom)(r)}>
                      {q.label}
                    </Chip>
                  )
                })}
                <span className="t-caption text-ink-2">Maks. {MAX_RANGE_DAYS} hari</span>
              </div>
            </div>
          ) : null}
        </section>

        <section aria-labelledby={`${uid}-sub`} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 id={`${uid}-sub`} className="m-0 t-footnote font-bold text-ink-2">
              Subholding
            </h3>
            {summary && summary.subholdings.length ? (
              <button
                type="button"
                onClick={() => change(setPick)(pick === null ? [] : null)}
                className={cx('min-h-9 cursor-pointer rounded-[8px] px-2 t-footnote font-semibold text-accent hover:bg-fill-1', FOCUS_RING)}
              >
                {pick === null ? 'Kosongkan pilihan' : 'Pilih semua'}
              </button>
            ) : null}
          </div>
          {bad ? (
            <p className="m-0 t-footnote text-ink-2">Perbaiki periode untuk melihat jumlah laporan.</p>
          ) : !summary ? (
            res.error && !res.loading ? (
              <ErrorNote message={res.error} onRetry={res.reload} />
            ) : (
              <div className="flex flex-col gap-1.5" aria-busy="true" aria-label="Memuat jumlah laporan">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} h={52} r={12} />
                ))}
              </div>
            )
          ) : summary.subholdings.length === 0 ? (
            <p className="m-0 t-callout font-normal text-ink-2">Belum ada subholding aktif.</p>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
              {summary.subholdings.map((s, i) => {
                const on = isPicked(pick, s.id)
                const n = subReports(s, withDrafts)
                const name = subholdingLabel(s.name)
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => change(setPick)(toggleSubPick(pick, s.id, allIds))}
                    className={cx(
                      'flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-3.5 text-left hover:bg-fill-1',
                      i > 0 && 'shadow-[inset_0_1px_0_var(--line)]',
                      FOCUS_RING
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px]',
                        on ? 'bg-accent-fill text-on-accent' : 'border-2 border-[var(--line-strong)] bg-surface'
                      )}
                    >
                      {on ? <Icon name="selesai" size={14} strokeWidth={3} /> : null}
                    </span>
                    <Mono name={name} tone={toneOf(s.id)} size={30} />
                    <span className="min-w-0 flex-1 truncate t-callout font-semibold text-ink">{name}</span>
                    <span className={cx('shrink-0 t-footnote tabular-nums', n ? 'text-ink-2' : 'text-ink-3')}>
                      {n ? `${n} laporan` : 'Tidak ada'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <div className="grid gap-6 sm:grid-cols-2">
          {summary?.canDrafts ? (
            <section aria-labelledby={`${uid}-status`} className="flex flex-col gap-2.5">
              <h3 id={`${uid}-status`} className="m-0 t-footnote font-bold text-ink-2">
                Laporan yang disertakan
              </h3>
              <ChoiceGroup aria-labelledby={`${uid}-status`} className="!grid-cols-1">
                <Choice on={!drafts} title="Disetujui saja" onClick={() => change(setDrafts)(false)} />
                <Choice on={drafts} title="Termasuk menunggu" hint="Berkas diberi tanda air DRAF" onClick={() => change(setDrafts)(true)} />
              </ChoiceGroup>
            </section>
          ) : null}
          <section aria-labelledby={`${uid}-susun`} className="flex flex-col gap-2.5">
            <h3 id={`${uid}-susun`} className="m-0 t-footnote font-bold text-ink-2">
              Susunan berkas
            </h3>
            <ChoiceGroup aria-labelledby={`${uid}-susun`} className="!grid-cols-1">
              <Choice on={format === 'pdf'} title="Satu PDF gabungan" onClick={() => change(setFormat)('pdf')} />
              <Choice on={format === 'zip'} title="Satu PDF per subholding" hint="Dikemas dalam .zip" onClick={() => change(setFormat)('zip')} />
            </ChoiceGroup>
          </section>
        </div>

        <section aria-labelledby={`${uid}-isi`} className="flex flex-col gap-2.5">
          <h3 id={`${uid}-isi`} className="m-0 t-footnote font-bold text-ink-2">
            Isi
          </h3>
          <div className="flex flex-col gap-2">
            <SwitchRow id={`${uid}-foto`} title="Foto bukti" description="Foto lain dicantumkan namanya bila lebih dari 120" checked={photos} onChange={change(setPhotos)} />
            <SwitchRow id={`${uid}-sorot`} title="Catatan sorotan" checked={highlights} onChange={change(setHighlights)} />
            <SwitchRow id={`${uid}-komen`} title="Komentar supervisor" checked={comments} onChange={change(setComments)} />
          </div>
        </section>
      </div>
    </Sheet>
  )
}

function Choice({ on, title, hint, onClick }: { on: boolean; title: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={cx('mk-choice', on && 'is-on')} onClick={onClick}>
      <span className="mk-choice__radio" aria-hidden />
      <span>
        <span className="mk-choice__title">{title}</span>
        {hint ? <span className="mk-choice__hint">{hint}</span> : null}
      </span>
    </button>
  )
}
