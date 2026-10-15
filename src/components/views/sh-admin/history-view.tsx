'use client'

/**
 * Riwayat laporan Admin subholding (tab `sh-history`): tabel dengan saringan
 * periode (hari ini / 7 / 30 hari), PT, status, dan cari. CSV dibuat di klien
 * dari baris yang sedang tampil. Di ponsel tabel menggulir di dalam kotaknya.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import {
  Button,
  Card,
  EmptyNote,
  ErrorNote,
  PageHeader,
  SearchField,
  SegmentedControl,
  Skeleton,
  StatusBadge,
} from '@/components/mk'
import { formatDateShort, formatTime } from '@/lib/format'
import {
  SH_STATUSES,
  SH_STATUS_META,
  csvFileName,
  filterReports,
  historyCsv,
  periodRange,
  titleLabel,
  type Period,
} from './logic'
import type { ShOptions, ShReportList, ShStatus } from './types'

const PAGE_SIZE = 200

export function ShHistoryView() {
  const [period, setPeriod] = useState<Period>('7')
  const [ptId, setPtId] = useState('')
  const [status, setStatus] = useState<ShStatus | ''>('')
  const [q, setQ] = useState('')

  const range = periodRange(period)
  const qs = new URLSearchParams({ from: range.from, to: range.to, pageSize: String(PAGE_SIZE) })
  if (ptId) qs.set('ptId', ptId)
  if (status) qs.set('status', status)
  const opts = useResource<ShOptions>('/api/sh/options')
  const list = useResource<ShReportList>(`/api/sh/reports?${qs.toString()}`)

  const items = list.data?.items ?? []
  // Server sudah menyaring periode/PT/status; kata kunci disaring di klien agar seketika.
  const rows = filterReports(items, { ptId, status, q })
  const truncated = (list.data?.total ?? 0) > items.length

  function downloadCsv() {
    if (!rows.length) return
    try {
      const blob = new Blob([historyCsv(rows)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = csvFileName(range.from, range.to)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast.error('CSV belum bisa dibuat di peramban ini.')
    }
  }

  const subName = opts.data?.subholding.name

  return (
    <div className="space-y-5">
      <PageHeader
        context={subName ? `Semua laporan ${subName} yang pernah dikirim` : 'Semua laporan yang pernah dikirim'}
        title="Riwayat laporan"
        tools={
          <Button size="sm" icon="unduh" disabled={!rows.length} onClick={downloadCsv}>
            Unduh CSV
          </Button>
        }
      />

      <Card ariaLabel="Saringan riwayat">
        <div className="flex flex-col gap-3">
          <div className="mk-toolbar">
            <SegmentedControl
              size="sm"
              label="Periode"
              value={period}
              onChange={(v) => setPeriod(v as Period)}
              options={[
                { value: 'today', label: 'Hari ini' },
                { value: '7', label: '7 hari' },
                { value: '30', label: '30 hari' },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="mk-field">
              <label htmlFor="sh-h-pt" className="mk-field__label">
                PT pelaksana
              </label>
              <select id="sh-h-pt" className="mk-select" value={ptId} onChange={(e) => setPtId(e.target.value)}>
                <option value="">Semua PT</option>
                {(opts.data?.pts ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mk-field">
              <label htmlFor="sh-h-status" className="mk-field__label">
                Status
              </label>
              <select id="sh-h-status" className="mk-select" value={status} onChange={(e) => setStatus(e.target.value as ShStatus | '')}>
                <option value="">Semua status</option>
                {SH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SH_STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mk-field sm:col-span-2 lg:col-span-1">
              <span className="mk-field__label" aria-hidden>
                Cari
              </span>
              <SearchField
                id="sh-h-cari"
                label="Cari kegiatan, deskripsi, atau pelapor"
                placeholder="Kegiatan, deskripsi, atau nama pelapor"
                value={q}
                onChange={setQ}
              />
            </div>
          </div>
        </div>
      </Card>

      <p className="t-footnote text-ink-2" aria-live="polite">
        {list.loading && !list.data ? 'Memuat…' : `${rows.length} laporan`}
        {truncated ? ` · menampilkan ${items.length} terbaru dari ${list.data?.total}; persempit saringan untuk melihat sisanya.` : ''}
      </p>

      <Card ariaLabel="Tabel riwayat laporan">
        {list.loading && !list.data ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} h={52} r={10} />
            ))}
          </div>
        ) : list.error ? (
          <ErrorNote message={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          <EmptyNote icon="cari">Tidak ada laporan yang cocok dengan saringan.</EmptyNote>
        ) : (
          <div className="mk-scroll-x" role="region" aria-label="Tabel riwayat, geser ke samping di layar sempit" tabIndex={0}>
            <table className="mk-adm-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Kegiatan / proyek</th>
                  <th scope="col">PT pelaksana</th>
                  <th scope="col">Pelapor</th>
                  <th scope="col">Bukti</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ditinjau</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = SH_STATUS_META[r.status] ?? SH_STATUS_META.MENUNGGU
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap text-ink-2">
                        {r.submittedAt ? `${formatDateShort(r.submittedAt)}, ${formatTime(r.submittedAt)}` : r.reportDate}
                      </td>
                      <td>
                        <div className="t-body text-ink font-semibold">{r.kegiatan}</div>
                        <div className="t-footnote text-ink-2 line-clamp-2">{r.deskripsi}</div>
                      </td>
                      <td className="whitespace-nowrap">{r.ptName}</td>
                      <td>
                        <div className="text-ink">{r.reporterName}</div>
                        <div className="t-footnote text-ink-2">{r.reporterTitle || titleLabel(r.reporterTitleKind, r.reporterTitleField)}</div>
                      </td>
                      <td className="whitespace-nowrap">{r.evidenceCount} berkas</td>
                      <td>
                        <StatusBadge size="sm" status={meta.status}>
                          {meta.label}
                        </StatusBadge>
                      </td>
                      <td className="t-footnote text-ink-2">
                        {r.decidedAt ? `${r.decidedByName ?? 'Supervisor'} · ${formatDateShort(r.decidedAt)}, ${formatTime(r.decidedAt)}` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
