'use client'

/**
 * Dashboard Admin subholding (tab `sh-dashboard`, kontrak 16 Okt 2026):
 * form Tambah laporan di atas, angka ringkas, lalu daftar laporan hari ini.
 * Akun dipakai bersama banyak pelapor — nama & jabatan diisi per laporan.
 *
 * Alur simpan: validasi → POST/PATCH /api/sh/reports → unggah bukti yang sudah
 * dipilih satu per satu. Bila sebagian bukti gagal, laporan tetap tersimpan dan
 * panel "Bukti belum terunggah" menawarkan unggah ulang ke laporan yang sama.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import {
  Button,
  Card,
  Chip,
  EmptyNote,
  ErrorNote,
  Icon,
  Input,
  PageHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  StatTile,
  StatusBadge,
  Switch,
  Textarea,
  cx,
} from '@/components/mk'
import { useConfirm } from '@/components/companies/parts'
import { formatDateLong, formatDateShort, formatTime } from '@/lib/format'
import { BuktiPicker } from './bukti-picker'
import {
  EMPTY_FORM,
  SH_STATUS_META,
  SH_STATUSES,
  callJson,
  clearShEdit,
  formFromReport,
  lastSupervisorComment,
  loadRemembered,
  loadReportDetail,
  newKey,
  peekShEdit,
  reportedPtCount,
  reporterSuggestions,
  saveRemembered,
  shiftDateKey,
  submitReport,
  titleLabel,
  uploadAll,
  validateForm,
  wibDateKey,
  type FormErrors,
  type PendingBukti,
  type ShForm,
} from './logic'
import type { ShOptions, ShReport, ShReportList, ShStatus, ShTitleKind } from './types'

type Filter = 'SEMUA' | ShStatus
type Retry = { report: ShReport; failed: { item: PendingBukti; error: string }[]; total: number }

const FIELD_ORDER: (keyof FormErrors)[] = ['kegiatan', 'ptId', 'deskripsi', 'reporterName', 'titleField', 'bukti']

export function ShDashboardView() {
  const today = wibDateKey(new Date())
  const opts = useResource<ShOptions>('/api/sh/options')
  const list = useResource<ShReportList>(`/api/sh/reports?from=${today}&to=${today}&pageSize=100`)
  // Laporan hari sebelumnya yang masih diminta perbaiki (daftar utama hanya hari ini).
  const older = useResource<ShReportList>(
    `/api/sh/reports?status=PERLU_PERBAIKAN&from=${shiftDateKey(today, -30)}&to=${shiftDateKey(today, -1)}&pageSize=50`
  )

  const [form, setForm] = useState<ShForm>(EMPTY_FORM)
  const [bukti, setBukti] = useState<PendingBukti[]>([])
  const [errors, setErrors] = useState<FormErrors>({})
  const [tried, setTried] = useState(false)
  const [editing, setEditing] = useState<ShReport | null>(null)
  const [ingat, setIngat] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [retry, setRetry] = useState<Retry | null>(null)
  const [retryBusy, setRetryBusy] = useState(false)
  const [idemKey, setIdemKey] = useState(() => newKey('shr'))
  const [filter, setFilter] = useState<Filter>('SEMUA')
  const [confirmEl, confirm] = useConfirm()
  const [attach, setAttach] = useState<ShReport | null>(null)
  const [initDone, setInitDone] = useState(false)
  const [pending] = useState(() => peekShEdit())
  const [pendingDone, setPendingDone] = useState(false)
  const formRef = useRef<HTMLElement>(null)

  // Nama & jabatan yang diingat peramban ini (setelah data pertama tiba = sudah di klien).
  if (!initDone && opts.data) {
    setInitDone(true)
    const r = loadRemembered()
    if (r && !editing) setForm((f) => ({ ...f, reporterName: r.name, titleKind: r.titleKind, titleField: r.titleField }))
    else if (!r) setIngat(false)
  }

  // Dari Kotak masuk: "Perbaiki laporan" → buka form mode ubah.
  const [pendingDetail, setPendingDetail] = useState<ShReport | null>(null)
  const pendingFetched = useRef(false)
  useEffect(() => {
    clearShEdit()
  }, [])
  const pendingFound = pending
    ? (pending.report ??
      list.data?.items.find((r) => r.id === pending.id) ??
      older.data?.items.find((r) => r.id === pending.id) ??
      pendingDetail)
    : null
  useEffect(() => {
    if (!pending || pendingFound || pendingFetched.current || list.loading || older.loading) return
    pendingFetched.current = true
    void loadReportDetail(fetch, pending.id).then((r) => {
      if (r) setPendingDetail(r)
      else toast.error('Laporan yang diminta perbaikan tidak ditemukan. Mungkin sudah ditarik atau disetujui.')
    })
  }, [list.loading, older.loading, pendingFound])
  if (pendingFound && !pendingDone) {
    setPendingDone(true)
    setEditing(pendingFound)
    setForm(formFromReport(pendingFound))
  }

  const remembered = initDone ? loadRemembered() : null
  const suggestions = reporterSuggestions(opts.data?.reporters ?? [], remembered)

  const existingCount = editing?.evidenceCount ?? 0
  const liveErrors = tried ? validateForm(form, existingCount + bukti.length) : errors

  function set<K extends keyof ShForm>(k: K, v: ShForm[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setDone(null)
  }

  function reloadAll() {
    list.reload()
    older.reload()
  }

  function resetForm(keepReporter: boolean) {
    setForm(keepReporter ? { ...EMPTY_FORM, reporterName: form.reporterName, titleKind: form.titleKind, titleField: form.titleField } : EMPTY_FORM)
    setBukti([])
    setErrors({})
    setTried(false)
    setEditing(null)
    setIdemKey(newKey('shr'))
  }

  function startEdit(r: ShReport) {
    setEditing(r)
    setForm(formFromReport(r))
    setBukti([])
    setErrors({})
    setTried(false)
    setDone(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function onSubmit() {
    const errs = validateForm(form, existingCount + bukti.length)
    setTried(true)
    setErrors(errs)
    if (Object.keys(errs).length) {
      const first = FIELD_ORDER.find((k) => errs[k])
      if (first) document.getElementById(`sh-f-${first}`)?.focus()
      return
    }
    setBusy('Menyimpan laporan…')
    setDone(null)
    const wasEditing = editing
    const res = await submitReport({
      fetchImpl: fetch,
      form,
      bukti,
      editId: editing?.id ?? null,
      idempotencyKey: idemKey,
      onProgress: (d, t) => setBusy(`Mengunggah bukti ${Math.min(d + 1, t)} dari ${t}…`),
    })
    setBusy(null)
    if (!res.ok) {
      toast.error(res.error)
      setDone(null)
      return
    }
    if (!wasEditing) {
      if (ingat) saveRemembered({ name: form.reporterName.trim(), titleKind: form.titleKind, titleField: form.titleField.trim() })
      else saveRemembered(null)
      resetForm(ingat)
    } else {
      // Selesai memperbaiki: kembali ke form kosong dengan pelapor yang diingat (bukan pelapor laporan lama).
      resetForm(false)
      const r = ingat ? loadRemembered() : null
      if (r) setForm({ ...EMPTY_FORM, reporterName: r.name, titleKind: r.titleKind, titleField: r.titleField })
    }
    reloadAll()
    if (res.failed.length) {
      setRetry({ report: res.report, failed: res.failed, total: res.failed.length + res.uploaded.length })
      toast.warning('Laporan tersimpan, tetapi sebagian bukti belum terunggah.')
    } else {
      setRetry(null)
      const msg = wasEditing
        ? `Perbaikan “${res.report.kegiatan}” terkirim ulang ke supervisor.`
        : `Laporan “${res.report.kegiatan}” terkirim ke supervisor. Form siap untuk laporan berikutnya.`
      setDone(msg)
      toast.success(wasEditing ? 'Laporan dikirim ulang.' : 'Laporan terkirim.')
    }
  }

  async function retryUpload() {
    if (!retry) return
    setRetryBusy(true)
    const out = await uploadAll(fetch, retry.report.id, retry.failed.map((f) => f.item))
    setRetryBusy(false)
    reloadAll()
    if (out.failed.length) {
      setRetry({ ...retry, failed: out.failed })
      toast.error(`${out.failed.length} bukti masih gagal terunggah.`)
    } else {
      setRetry(null)
      setDone(`Semua bukti untuk “${retry.report.kegiatan}” sudah terlampir.`)
      toast.success('Bukti terunggah.')
    }
  }

  async function doWithdraw(r: ShReport) {
    const ok = await confirm({
      title: 'Tarik laporan ini?',
      description: `Laporan “${r.kegiatan}” beserta buktinya akan dihapus dan tidak lagi tampil di antrean supervisor.`,
      confirmLabel: 'Tarik laporan',
      destructive: true,
    })
    if (!ok) return
    const res = await callJson(fetch, `/api/sh/reports/${encodeURIComponent(r.id)}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    if (editing?.id === r.id) resetForm(true)
    if (retry?.report.id === r.id) setRetry(null)
    toast.success('Laporan ditarik.')
    reloadAll()
  }

  if ((opts.loading && !opts.data) || (list.loading && !list.data)) return <DashSkeleton />
  if (opts.error || !opts.data) return <ErrorNote message={opts.error ?? 'Data subholding belum termuat.'} onRetry={opts.reload} />

  const o = opts.data
  const items = list.data?.items ?? []
  const counts = list.data?.counts ?? { MENUNGGU: 0, PERLU_PERBAIKAN: 0, DISETUJUI: 0 }
  const total = SH_STATUSES.reduce((s, k) => s + (counts[k] ?? 0), 0)
  const shown = filter === 'SEMUA' ? items : items.filter((r) => r.status === filter)
  const olderFix = older.data?.items ?? []
  const supNote = editing ? lastSupervisorComment(editing) : null
  const errList = FIELD_ORDER.filter((k) => liveErrors[k])

  return (
    <div className="space-y-5">
      <PageHeader
        context={`${formatDateLong(new Date())} · ${o.subholding.name} · ${o.pts.length} PT`}
        title="Laporan kegiatan & proyek hari ini"
      />
      <p className="t-footnote text-ink-2">
        Akun ini dipakai bersama. Isi nama dan jabatan Anda di setiap laporan; Anda boleh melapor berkali-kali.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Dikirim hari ini" value={total} delta={`${reportedPtCount(items, o.pts)} dari ${o.pts.length} PT melapor`} tone="neutral" />
        <StatTile label="Menunggu tinjauan" value={counts.MENUNGGU} delta="di antrean supervisor" tone="info" onClick={() => setFilter('MENUNGGU')} />
        <StatTile label="Perlu perbaikan" value={counts.PERLU_PERBAIKAN} delta="lihat komentar supervisor" tone="risk" onClick={() => setFilter('PERLU_PERBAIKAN')} />
        <StatTile label="Disetujui" value={counts.DISETUJUI} delta="sudah tampil di manajemen" tone="done" onClick={() => setFilter('DISETUJUI')} />
      </div>

      {retry ? (
        <RetryPanel
          retry={retry}
          busy={retryBusy}
          onRetry={() => void retryUpload()}
          onAttach={() => setAttach(retry.report)}
          onClose={() => setRetry(null)}
        />
      ) : null}

      <section ref={formRef} aria-labelledby="sh-form-title" className="mk-card space-y-4" style={{ scrollMarginTop: 'var(--space-6)' }}>
        <div className="mk-sectitle">
          <h2 id="sh-form-title" className="t-title-3 text-ink">
            {editing ? 'Perbaiki laporan' : 'Tambah laporan'}
          </h2>
          <span className="t-caption text-ink-2">* wajib diisi</span>
        </div>

        {editing ? (
          <div className="mk-note-box bg-waspada-soft text-ink flex flex-wrap items-start gap-3">
            <Icon name="catatan" size={18} className="shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1">
              <strong>Komentar supervisor:</strong> {supNote?.body ?? 'Tidak ada komentar tertulis.'}
            </span>
            <Button size="sm" variant="plain" onClick={() => resetForm(true)} disabled={!!busy}>
              Batal memperbaiki
            </Button>
          </div>
        ) : null}

        <div className="mk-formgrid">
          <Field id="sh-f-kegiatan" label="Kegiatan / proyek" error={liveErrors.kegiatan}>
            <Input
              id="sh-f-kegiatan"
              value={form.kegiatan}
              maxLength={200}
              placeholder="Mis. Pemasangan panel surya atap gudang"
              aria-invalid={!!liveErrors.kegiatan || undefined}
              aria-describedby={liveErrors.kegiatan ? 'sh-f-kegiatan-err' : undefined}
              onChange={(e) => set('kegiatan', e.target.value)}
            />
          </Field>
          <Field id="sh-f-ptId" label="PT pelaksana" error={liveErrors.ptId}>
            <select
              id="sh-f-ptId"
              className="mk-select"
              value={form.ptId}
              aria-invalid={!!liveErrors.ptId || undefined}
              aria-describedby={liveErrors.ptId ? 'sh-f-ptId-err' : undefined}
              onChange={(e) => set('ptId', e.target.value)}
            >
              <option value="">Pilih PT di {o.subholding.name}</option>
              {o.pts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="sh-f-deskripsi" label="Deskripsi" error={liveErrors.deskripsi} full>
            <Textarea
              id="sh-f-deskripsi"
              rows={4}
              maxLength={4000}
              value={form.deskripsi}
              placeholder="Apa yang dikerjakan hari ini, hasilnya, kendala bila ada"
              aria-invalid={!!liveErrors.deskripsi || undefined}
              aria-describedby={liveErrors.deskripsi ? 'sh-f-deskripsi-err' : undefined}
              onChange={(e) => set('deskripsi', e.target.value)}
            />
          </Field>
          <Field id="sh-f-reporterName" label="Nama pelapor" error={liveErrors.reporterName}>
            <Input
              id="sh-f-reporterName"
              value={form.reporterName}
              maxLength={120}
              autoComplete="name"
              placeholder="Nama lengkap yang melapor"
              aria-invalid={!!liveErrors.reporterName || undefined}
              aria-describedby={liveErrors.reporterName ? 'sh-f-reporterName-err' : undefined}
              onChange={(e) => set('reporterName', e.target.value)}
            />
          </Field>
          <div className="mk-field">
            <span className="mk-field__label" id="sh-f-jabatan-label">
              Jabatan pelapor <span className="mk-field__req">*</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                label="Jenis jabatan"
                value={form.titleKind}
                onChange={(v) => set('titleKind', v as ShTitleKind)}
                options={[
                  { value: 'MANAJER', label: 'Manajer' },
                  { value: 'KEPALA', label: 'Kepala' },
                ]}
              />
              <Input
                id="sh-f-titleField"
                className="min-w-0 flex-1"
                aria-label="Bidang jabatan"
                value={form.titleField}
                maxLength={80}
                placeholder="Bidang, mis. Proyek, Keuangan"
                aria-invalid={!!liveErrors.titleField || undefined}
                aria-describedby={liveErrors.titleField ? 'sh-f-titleField-err' : 'sh-f-jabatan-hint'}
                onChange={(e) => set('titleField', e.target.value)}
              />
            </div>
            <p className="mk-field__hint" id="sh-f-jabatan-hint">
              Tertulis: <strong className="text-ink">{titleLabel(form.titleKind, form.titleField || '…')}</strong>
            </p>
            {liveErrors.titleField ? (
              <p className="mk-field__error" id="sh-f-titleField-err">
                {liveErrors.titleField}
              </p>
            ) : null}
          </div>
        </div>

        {suggestions.length ? (
          <div className="flex flex-col gap-2">
            <span className="t-footnote text-ink-2">Pelapor sebelumnya</span>
            <div className="mk-chips" role="group" aria-label="Pelapor sebelumnya">
              {suggestions.map((s) => {
                const on =
                  form.reporterName.trim() === s.name && form.titleKind === s.titleKind && form.titleField.trim() === s.titleField
                return (
                  <Chip
                    key={`${s.name}|${s.titleKind}|${s.titleField}`}
                    selected={on}
                    onClick={() => {
                      setForm((f) => ({ ...f, reporterName: s.name, titleKind: s.titleKind, titleField: s.titleField }))
                      setDone(null)
                    }}
                  >
                    {s.name} · {titleLabel(s.titleKind, s.titleField)}
                  </Chip>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="mk-field" id="sh-f-bukti" tabIndex={-1}>
          <span className="mk-field__label">
            Bukti laporan <span className="mk-field__req">* minimal 1 · foto, dokumen, atau tautan</span>
          </span>
          {editing && editing.evidence?.length ? (
            <p className="mk-field__hint">
              Sudah terlampir {editing.evidenceCount} bukti: {editing.evidence.map((e) => e.fileName).join(', ')}. Tambahkan bila supervisor meminta bukti baru.
            </p>
          ) : null}
          <BuktiPicker
            items={bukti}
            disabled={!!busy}
            error={liveErrors.bukti}
            onAdd={(add) => {
              setBukti((b) => [...b, ...add])
              setDone(null)
            }}
            onRemove={(k) => setBukti((b) => b.filter((x) => x.key !== k))}
          />
        </div>

        {tried && errList.length ? (
          <div className="mk-note-box bg-bahaya-soft text-ink" role="alert">
            Lengkapi dulu: {errList.map((k) => FIELD_LABEL[k]).join(', ')}.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3 t-footnote text-ink">
            <Switch checked={ingat} onCheckedChange={setIngat} />
            Ingat nama & jabatan untuk laporan berikutnya
          </label>
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <Button variant="plain" disabled={!!busy} onClick={() => resetForm(false)}>
                Kosongkan
              </Button>
            ) : null}
            <Button variant="primary" icon="kirim" disabled={!!busy} onClick={() => void onSubmit()}>
              {busy ?? (editing ? 'Kirim ulang laporan' : 'Kirim laporan')}
            </Button>
          </div>
        </div>

        <div aria-live="polite">
          {done ? (
            <div className="mk-note-box bg-sukses-soft text-ink flex items-start gap-2" role="status">
              <Icon name="selesai" size={18} className="shrink-0 mt-0.5 text-sukses" />
              <span>{done}</span>
            </div>
          ) : null}
        </div>
      </section>

      {olderFix.length ? (
        <Card title="Perlu perbaikan dari hari sebelumnya" subtitle="Perbaiki lalu kirim ulang agar bisa ditinjau kembali.">
          <ReportList
            items={olderFix}
            withDate
            onFix={startEdit}
            onAttach={setAttach}
            onWithdraw={(r) => void doWithdraw(r)}
            editingId={editing?.id}
          />
        </Card>
      ) : null}

      <Card
        title="Laporan yang sudah masuk hari ini"
        action={
          <span className="t-footnote text-ink-2">
            {shown.length} laporan
          </span>
        }
      >
        <div className="mk-chips mb-3" role="group" aria-label="Saring status">
          <Chip selected={filter === 'SEMUA'} count={total} onClick={() => setFilter('SEMUA')}>
            Semua
          </Chip>
          {SH_STATUSES.map((s) => (
            <Chip key={s} selected={filter === s} status={SH_STATUS_META[s].status} count={counts[s] ?? 0} onClick={() => setFilter(s)}>
              {SH_STATUS_META[s].label}
            </Chip>
          ))}
        </div>
        {list.error ? (
          <ErrorNote message={list.error} onRetry={list.reload} />
        ) : shown.length === 0 ? (
          <EmptyNote icon="laporan">
            {filter === 'SEMUA' ? 'Belum ada laporan hari ini. Laporan pertama bisa ditambahkan dari form di atas.' : 'Belum ada laporan dengan status ini.'}
          </EmptyNote>
        ) : (
          <ReportList items={shown} onFix={startEdit} onAttach={setAttach} onWithdraw={(r) => void doWithdraw(r)} editingId={editing?.id} />
        )}
      </Card>

      {confirmEl}

      <AttachSheet
        report={attach}
        onClose={() => setAttach(null)}
        onDone={(reportId) => {
          if (retry?.report.id === reportId) setRetry(null)
          reloadAll()
        }}
      />
    </div>
  )
}

const FIELD_LABEL: Record<string, string> = {
  kegiatan: 'kegiatan / proyek',
  ptId: 'PT pelaksana',
  deskripsi: 'deskripsi',
  reporterName: 'nama pelapor',
  titleField: 'bidang jabatan',
  bukti: 'bukti laporan',
}

function Field({
  id,
  label,
  error,
  full,
  children,
}: {
  id: string
  label: string
  error?: string
  full?: boolean
  children: ReactNode
}) {
  return (
    <div className={cx('mk-field', full && 'is-full')}>
      <label htmlFor={id} className="mk-field__label">
        {label} <span className="mk-field__req">*</span>
      </label>
      {children}
      {error ? (
        <p className="mk-field__error" id={`${id}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

function ReportList({
  items,
  withDate,
  onFix,
  onAttach,
  onWithdraw,
  editingId,
}: {
  items: ShReport[]
  withDate?: boolean
  onFix: (r: ShReport) => void
  onAttach: (r: ShReport) => void
  onWithdraw: (r: ShReport) => void
  editingId?: string
}) {
  return (
    <ul className="mk-list">
      {items.map((r) => {
        const meta = SH_STATUS_META[r.status] ?? SH_STATUS_META.MENUNGGU
        const note = lastSupervisorComment(r)
        const when = r.submittedAt ? (withDate ? `${formatDateShort(r.submittedAt)}, ${formatTime(r.submittedAt)}` : formatTime(r.submittedAt)) : r.reportDate
        const canFix = r.status === 'PERLU_PERBAIKAN' && r.canEdit
        const canAttach = r.canEdit && r.status !== 'DISETUJUI'
        const canWithdraw = r.status === 'MENUNGGU' && r.canWithdraw
        return (
          <li key={r.id}>
            <article className={cx('flex flex-col gap-2 py-4', editingId === r.id && 'opacity-60')} aria-label={r.kegiatan}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge size="sm" status={meta.status}>
                  {meta.label}
                </StatusBadge>
                <span className="t-caption text-ink-2">
                  {when} · {r.ptName}
                </span>
                {editingId === r.id ? <span className="mk-tag">Sedang diperbaiki</span> : null}
              </div>
              <h3 className="t-headline text-ink">{r.kegiatan}</h3>
              <p className="t-body text-ink-2 line-clamp-3 whitespace-pre-line">{r.deskripsi}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 t-footnote text-ink-2">
                <span>
                  Pelapor: <strong className="text-ink">{r.reporterName}</strong> · {r.reporterTitle || titleLabel(r.reporterTitleKind, r.reporterTitleField)}
                </span>
                <span className={cx(r.evidenceCount === 0 && 'mk-text--late')}>
                  Bukti: <strong className={cx(r.evidenceCount > 0 && 'text-ink')}>{r.evidenceCount} berkas</strong>
                  {r.evidenceCount === 0 ? ' · lampirkan agar bisa disetujui' : ''}
                </span>
              </div>
              {note ? (
                <div className="mk-inset flex items-start gap-2 t-footnote text-ink">
                  <Icon name="catatan" size={16} className="shrink-0 mt-0.5 text-ink-2" />
                  <span>
                    <strong>Supervisor:</strong> {note.body}
                  </span>
                </div>
              ) : null}
              {canFix || canAttach || canWithdraw ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {canFix ? (
                    <Button size="sm" variant="primary" icon="ubah" disabled={editingId === r.id} onClick={() => onFix(r)}>
                      Perbaiki & kirim ulang
                    </Button>
                  ) : null}
                  {canAttach ? (
                    <Button size="sm" icon="unggah" onClick={() => onAttach(r)}>
                      Lampirkan bukti
                    </Button>
                  ) : null}
                  {canWithdraw ? (
                    <Button size="sm" variant="plain" icon="hapus" className="mk-text--late" onClick={() => onWithdraw(r)}>
                      Tarik laporan
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          </li>
        )
      })}
    </ul>
  )
}

function RetryPanel({
  retry,
  busy,
  onRetry,
  onAttach,
  onClose,
}: {
  retry: Retry
  busy: boolean
  onRetry: () => void
  onAttach: () => void
  onClose: () => void
}) {
  const ok = retry.total - retry.failed.length
  return (
    <section className="mk-card space-y-3" role="alert" aria-labelledby="sh-retry-title">
      <div className="flex items-start gap-3">
        <span className="mk-empty__icon mk-soft--risk shrink-0" aria-hidden>
          <Icon name="peringatan" size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="sh-retry-title" className="t-headline text-ink">
            Bukti belum terunggah
          </h2>
          <p className="t-footnote text-ink-2">
            Laporan “{retry.report.kegiatan}” sudah tersimpan. {retry.failed.length} dari {retry.total} bukti gagal diunggah
            {ok === 0 ? '; laporan belum punya bukti sehingga supervisor belum bisa menyetujuinya.' : '.'}
          </p>
        </div>
      </div>
      <ul className="mk-list">
        {retry.failed.map((f) => (
          <li key={f.item.key} className="mk-lap-file">
            <Icon name={f.item.kind === 'link' ? 'alur' : 'dokumen'} size={18} className="text-ink-2 shrink-0" />
            <span className="mk-lap-file__name">{f.item.name}</span>
            <span className="t-caption mk-text--late">{f.error}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon="unggah" disabled={busy} onClick={onRetry}>
          {busy ? 'Mengunggah ulang…' : 'Unggah ulang'}
        </Button>
        <Button size="sm" icon="tambah" disabled={busy} onClick={onAttach}>
          Pilih bukti lain
        </Button>
        <Button size="sm" variant="plain" disabled={busy} onClick={onClose}>
          Tutup
        </Button>
      </div>
    </section>
  )
}

/** Sheet "Lampirkan bukti" ke laporan yang sudah tersimpan (unggah ulang/tambahan). */
function AttachSheet({ report, onClose, onDone }: { report: ShReport | null; onClose: () => void; onDone: (reportId: string) => void }) {
  const [last, setLast] = useState<ShReport | null>(report)
  if (report && report !== last) setLast(report)
  const r = report ?? last
  const [items, setItems] = useState<PendingBukti[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Record<string, { tone: 'late' | 'done' | 'info'; text: string }>>({})
  const [forId, setForId] = useState<string | null>(report?.id ?? null)
  if (report && report.id !== forId) {
    setForId(report.id)
    setItems([])
    setStatus({})
  }

  async function upload() {
    if (!r || !items.length) return
    setBusy(true)
    setStatus(Object.fromEntries(items.map((i) => [i.key, { tone: 'info' as const, text: 'Menunggu…' }])))
    const out = await uploadAll(fetch, r.id, items)
    setBusy(false)
    onDone(r.id)
    if (!out.failed.length) {
      toast.success(`${out.uploaded.length} bukti terlampir.`)
      setItems([])
      setStatus({})
      onClose()
      return
    }
    const failedKeys = new Set(out.failed.map((f) => f.item.key))
    setItems((list) => list.filter((i) => failedKeys.has(i.key)))
    setStatus(Object.fromEntries(out.failed.map((f) => [f.item.key, { tone: 'late' as const, text: f.error }])))
    toast.error(`${out.failed.length} bukti gagal. Periksa lalu coba lagi.`)
  }

  return (
    <Sheet
      open={!!report}
      onOpenChange={(o) => !o && !busy && onClose()}
      backLabel="Dashboard"
      eyebrow="Lampirkan bukti"
      title={r?.kegiatan ?? ''}
      subtitle={r ? `${r.ptName} · ${r.evidenceCount} bukti terlampir` : undefined}
      footer={
        <Button variant="primary" icon="unggah" full disabled={busy || !items.length} onClick={() => void upload()}>
          {busy ? 'Mengunggah…' : items.length ? `Unggah ${items.length} bukti` : 'Pilih bukti dulu'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="t-footnote text-ink-2">Foto, dokumen, atau tautan. Maksimal 20 MB per berkas.</p>
        <BuktiPicker
          idPrefix="sh-attach"
          items={items}
          disabled={busy}
          status={status}
          onAdd={(add) => setItems((l) => [...l, ...add])}
          onRemove={(k) => setItems((l) => l.filter((x) => x.key !== k))}
        />
      </div>
    </Sheet>
  )
}

function DashSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Memuat dashboard">
      <div>
        <Skeleton h={14} w={260} />
        <div className="h-2.5" />
        <Skeleton h={36} w={340} r={12} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={96} r={14} />
        ))}
      </div>
      <div className="mk-card space-y-3">
        <Skeleton h={24} w={200} />
        <Skeleton h={44} r={12} />
        <Skeleton h={96} r={12} />
        <Skeleton h={44} r={12} />
      </div>
      <div className="mk-card space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} h={110} r={12} />
        ))}
      </div>
    </div>
  )
}
