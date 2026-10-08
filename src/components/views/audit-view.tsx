'use client'

import { useMemo, useState } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import {
  ActivityItem, Card, Chip, EmptyNote, ErrorNote, Icon, IconButton, PageHeader, Sheet, Skeleton, Button, cx, useIsPhone, type Status,
} from '@/components/mk'
import { Input } from '@/components/mk/forms'
import { ROLE_LABELS } from '@/lib/constants'
import { ALL_ROLES } from '@/lib/rbac'
import { initialsOf } from '@/lib/accounts'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'

type AuditLog = {
  id: string
  action: string
  targetType: string
  targetId: string
  beforeData: unknown
  afterData: unknown
  ip: string | null
  userAgent: string | null
  at: string
  actorId: string | null
  actor: { id: string; name: string; email: string; role: string } | null
}

type AuditLogListData = {
  items: AuditLog[]
  total: number
  page: number
  pageSize: number
  /** [F2-GRUP] pemegang audit:read boleh mengunduh CSV. */
  canExport?: boolean
}

/**
 * Label & nada setiap aksi yang ditulis ke AuditLog [F1-D]. Daftar ini dicocokkan
 * dengan `grep "action: '"` / auditPic(...) di src/app/api dan src/lib; aksi baru
 * tanpa label tampil sebagai kodenya. Nada: info = buat/kirim, risk = ubah,
 * done = setujui/selesai, late = hapus/tolak/kunci, neutral = akses & sistem.
 */
const ACTIONS: Record<string, { label: string; tone: Status }> = {
  // Masuk & akun
  LOGIN: { label: 'Masuk', tone: 'neutral' },
  LOGIN_FAILED: { label: 'Gagal masuk', tone: 'late' },
  LOGOUT: { label: 'Keluar', tone: 'neutral' },
  CHANGE_OWN_PASSWORD: { label: 'Ganti kata sandi sendiri', tone: 'neutral' },
  RESET_PASSWORD: { label: 'Atur ulang kata sandi', tone: 'risk' },
  UPDATE_PROFILE: { label: 'Ubah profil', tone: 'risk' },
  CREATE_ACCOUNT: { label: 'Buat akun', tone: 'info' },
  UPDATE_ACCOUNT: { label: 'Ubah akun', tone: 'risk' },
  DELETE_ACCOUNT: { label: 'Hapus akun', tone: 'late' },
  // Permintaan & akses
  REQUEST_ACCESS: { label: 'Ajukan permintaan akses', tone: 'info' },
  APPROVE_ACCESS_REQUEST: { label: 'Setujui permintaan akses', tone: 'done' },
  REJECT_ACCESS_REQUEST: { label: 'Tolak permintaan akses', tone: 'late' },
  GRANT_TEMP_ACCESS: { label: 'Beri akses sementara', tone: 'risk' },
  TEMP_ACCESS_EXPIRED: { label: 'Akses sementara berakhir', tone: 'neutral' },
  // Perusahaan & divisi
  CREATE_COMPANY: { label: 'Buat perusahaan', tone: 'info' },
  UPDATE_COMPANY: { label: 'Ubah perusahaan', tone: 'risk' },
  DELETE_COMPANY: { label: 'Hapus perusahaan', tone: 'late' },
  SET_DIVISION_MEMBER: { label: 'Atur anggota divisi', tone: 'risk' },
  SET_PROJECT_DIVISION: { label: 'Atur divisi proyek', tone: 'risk' },
  SET_ATTENDANCE: { label: 'Catat kehadiran', tone: 'info' },
  // [F2-KADIV] Kepala divisi
  KADIV_READ_DAILY: { label: 'Tandai laporan harian dibaca', tone: 'info' },
  KADIV_UNREAD_DAILY: { label: 'Batalkan tanda baca laporan harian', tone: 'info' },
  KADIV_SAVE_WEEKLY_SUMMARY: { label: 'Simpan draf ringkasan mingguan', tone: 'info' },
  KADIV_SEND_WEEKLY_SUMMARY: { label: 'Kirim ringkasan mingguan ke Direktur', tone: 'done' },
  KADIV_UNSEND_WEEKLY_SUMMARY: { label: 'Tarik ringkasan mingguan', tone: 'risk' },
  // Proyek
  PROPOSE_PROJECT: { label: 'Ajukan proyek', tone: 'info' },
  CREATE_PROJECT: { label: 'Buat proyek', tone: 'info' },
  CREATE_PROJECT_NO_APPROVAL: { label: 'Buat proyek tanpa persetujuan', tone: 'info' },
  APPROVE_PROJECT: { label: 'Setujui proyek', tone: 'done' },
  REJECT_PROJECT: { label: 'Tolak proyek', tone: 'late' },
  RESUBMIT_PROJECT: { label: 'Ajukan ulang proyek', tone: 'info' },
  UPDATE_PROJECT: { label: 'Ubah proyek', tone: 'risk' },
  DELETE_PROJECT: { label: 'Hapus proyek', tone: 'late' },
  CREATE_PROJECT_STAGE: { label: 'Tambah tahapan', tone: 'info' },
  UPDATE_PROJECT_STAGE: { label: 'Ubah tahapan', tone: 'risk' },
  DELETE_PROJECT_STAGE: { label: 'Hapus tahapan', tone: 'late' },
  REORDER_PROJECT_STAGES: { label: 'Urutkan tahapan', tone: 'neutral' },
  PROPOSE_DEADLINE: { label: 'Usulkan geser tenggat', tone: 'info' },
  APPROVE_DEADLINE: { label: 'Setujui geser tenggat', tone: 'done' },
  REJECT_DEADLINE: { label: 'Tolak geser tenggat', tone: 'late' },
  WITHDRAW_DEADLINE: { label: 'Tarik usulan tenggat', tone: 'neutral' },
  CREATE_PROJECT_NOTE: { label: 'Kirim catatan proyek', tone: 'info' },
  // Output
  CREATE_OUTPUT: { label: 'Buat output', tone: 'info' },
  OUTPUT_UPDATE: { label: 'Ubah output', tone: 'risk' },
  OUTPUT_SUBMIT: { label: 'Kirim output', tone: 'info' },
  OUTPUT_WITHDRAW: { label: 'Batalkan kirim output', tone: 'neutral' },
  OUTPUT_ACCEPT: { label: 'Terima output', tone: 'done' },
  OUTPUT_REVISE: { label: 'Minta revisi output', tone: 'risk' },
  OUTPUT_REVIEW_UNDO: { label: 'Urungkan review output', tone: 'neutral' },
  DELETE_OUTPUT: { label: 'Hapus output', tone: 'late' },
  // Laporan harian & progres
  CREATE_REPORT: { label: 'Buat laporan', tone: 'info' },
  UPDATE_REPORT: { label: 'Ubah laporan', tone: 'risk' },
  SAVE_DAILY_REPORT: { label: 'Simpan laporan harian', tone: 'risk' },
  SUBMIT_DAILY_REPORT: { label: 'Kirim laporan harian', tone: 'info' },
  FORWARD_DAILY_REPORT: { label: 'Teruskan laporan harian', tone: 'done' },
  DELETE_DAILY_REPORT: { label: 'Hapus laporan harian', tone: 'late' },
  SAVE_PROGRESS_REPORT: { label: 'Simpan laporan progres', tone: 'risk' },
  SUBMIT_PROGRESS_REPORT: { label: 'Kirim laporan progres', tone: 'info' },
  DELETE_PROGRESS_REPORT: { label: 'Hapus laporan progres', tone: 'late' },
  // Laporan mingguan
  CREATE_WEEKLY_ITEM: { label: 'Tambah butir mingguan', tone: 'info' },
  UPDATE_WEEKLY_ITEM: { label: 'Ubah butir mingguan', tone: 'risk' },
  DELETE_WEEKLY_ITEM: { label: 'Hapus butir mingguan', tone: 'late' },
  REORDER_WEEKLY_ITEMS: { label: 'Urutkan butir mingguan', tone: 'neutral' },
  SUBMIT_WEEKLY_REPORT: { label: 'Serahkan laporan mingguan', tone: 'info' },
  APPROVE_WEEKLY: { label: 'Setujui mingguan', tone: 'done' },
  FORWARD_WEEKLY_REPORT: { label: 'Teruskan laporan mingguan', tone: 'done' },
  READ_WEEKLY_REPORT: { label: 'Tandai mingguan dibaca', tone: 'neutral' },
  UNREAD_WEEKLY_REPORT: { label: 'Tandai mingguan belum dibaca', tone: 'neutral' },
  // Tugas & bukti
  CREATE_TASK: { label: 'Tambah tugas', tone: 'info' },
  UPDATE_TASK: { label: 'Ubah tugas', tone: 'risk' },
  DELETE_TASK: { label: 'Hapus tugas', tone: 'late' },
  REORDER_TASKS: { label: 'Urutkan tugas', tone: 'neutral' },
  UPLOAD_EVIDENCE: { label: 'Unggah bukti', tone: 'info' },
  ATTACH_EVIDENCE: { label: 'Lampirkan bukti', tone: 'info' },
  REMOVE_EVIDENCE: { label: 'Hapus bukti', tone: 'late' },
  // Kunci & buka kunci
  LOCK_REPORT: { label: 'Kunci laporan', tone: 'late' },
  REQUEST_UNLOCK: { label: 'Ajukan buka kunci', tone: 'info' },
  APPROVE_UNLOCK: { label: 'Setujui buka kunci', tone: 'done' },
  REJECT_UNLOCK: { label: 'Tolak buka kunci', tone: 'late' },
  UNLOCK_EXECUTE: { label: 'Buka kunci', tone: 'info' },
  RELOCK_REPORT: { label: 'Kunci ulang laporan', tone: 'late' },
  // Eskalasi
  CREATE_ESCALATION: { label: 'Buat eskalasi', tone: 'risk' },
  REVIEW_ESCALATION: { label: 'Tinjau eskalasi', tone: 'info' },
  DECIDE_ESCALATION: { label: 'Putuskan eskalasi', tone: 'done' },
  CLOSE_ESCALATION: { label: 'Tutup eskalasi', tone: 'done' },
  // Pengingat & sistem
  REMIND_PIC: { label: 'Ingatkan PIC', tone: 'info' },
  SEND_DIVISION_REMINDERS: { label: 'Ingatkan divisi', tone: 'info' },
  CRON_DIVISION_REMINDERS: { label: 'Pengingat divisi terjadwal', tone: 'neutral' },
  UPDATE_REMINDER_RULE: { label: 'Ubah aturan pengingat', tone: 'risk' },
  AUTO_REMINDER: { label: 'Pengingat otomatis', tone: 'neutral' },
  KPI_SNAPSHOT: { label: 'Perbarui KPI harian', tone: 'neutral' },
  EXPORT_AUDIT_LOG: { label: 'Unduh log aktivitas', tone: 'neutral' }, // [F2-GRUP] ditulis /api/audit-logs/export
  // [F2-URUNGKAN] urungkan lewat toast (POST /api/undo)
  UNDO_APPROVE_PROJECT: { label: 'Urungkan persetujuan proyek', tone: 'neutral' },
  UNDO_REJECT_PROJECT: { label: 'Urungkan penolakan proyek', tone: 'neutral' },
  UNDO_RESUBMIT_PROJECT: { label: 'Urungkan pengajuan ulang', tone: 'neutral' },
  UNDO_ARCHIVE_PROJECT: { label: 'Urungkan pengarsipan proyek', tone: 'neutral' },
  UNDO_REVIEW_ESCALATION: { label: 'Urungkan tinjau eskalasi', tone: 'neutral' },
  UNDO_DECIDE_ESCALATION: { label: 'Urungkan keputusan eskalasi', tone: 'neutral' },
  UNDO_CLOSE_ESCALATION: { label: 'Urungkan penutupan eskalasi', tone: 'neutral' },
  UNDO_FORWARD_DAILY_REPORT: { label: 'Urungkan penerusan laporan harian', tone: 'neutral' },
  UNDO_FORWARD_WEEKLY_REPORT: { label: 'Urungkan penerusan capaian mingguan', tone: 'neutral' },
}

const ACTION_OPTIONS = [
  { value: 'ALL', label: 'Semua aksi' },
  ...Object.entries(ACTIONS)
    .map(([value, a]) => ({ value, label: a.label }))
    .sort((x, y) => x.label.localeCompare(y.label, 'id')),
]

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'Semua peran' },
  ...ALL_ROLES.map((r) => ({ value: r as string, label: ROLE_LABELS[r] ?? r })),
]

const TARGET_TYPE_OPTIONS = [
  { value: 'ALL', label: 'Semua target' },
  { value: 'DAILY_REPORT', label: 'Laporan harian' },
  { value: 'WEEKLY_REPORT', label: 'Laporan mingguan' },
  { value: 'ESCALATION', label: 'Eskalasi' },
]

/** Nada titik per jenis aksi (warna selalu berpasangan dengan kata). */
const ACTION_TONE: Record<string, Status> = Object.fromEntries(Object.entries(ACTIONS).map(([k, a]) => [k, a.tone]))

/** Label aksi log; dipakai juga oleh konsol sistem. */
export const AUDIT_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(ACTIONS).map(([k, a]) => [k, a.label])
)

const TARGET_LABELS: Record<string, string> = {
  DAILY_REPORT: 'Laporan harian',
  WEEKLY_REPORT: 'Laporan mingguan',
  WEEKLY_ITEM: 'Butir mingguan',
  PROGRESS_REPORT: 'Laporan progres',
  ESCALATION: 'Eskalasi',
  USER: 'Akun',
  ENTITY: 'Perusahaan',
  PROJECT: 'Proyek',
  PROJECT_STAGE: 'Tahapan proyek',
  PROJECT_NOTE: 'Catatan proyek',
  OUTPUT: 'Output',
  TASK: 'Tugas',
  UNLOCK_REQUEST: 'Permintaan buka kunci',
  ACCESS_REQUEST: 'Permintaan akses',
  REMINDER_RULE: 'Aturan pengingat',
  KPI_SNAPSHOT: 'KPI harian',
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    // Already a string; might already be JSON-stringified
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '…'
}

/** Lencana jenis aksi: titik bernada + kata. */
export function ActionTag({ action }: { action: string }) {
  return (
    <span className="mk-tag inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cx('mk-dot', `mk-bg--${ACTION_TONE[action] ?? 'neutral'}`)} aria-hidden />
      {AUDIT_ACTION_LABELS[action] || action}
    </span>
  )
}

export function AuditView() {
  const phone = useIsPhone()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<string>('ALL')
  const [targetType, setTargetType] = useState<string>('ALL')
  // [F2-GRUP] Auditor menelusuri per peran pelaku dan rentang tanggal (WIB).
  const [role, setRole] = useState<string>('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [opened, setOpened] = useState<AuditLog | null>(null)

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (action !== 'ALL') p.set('action', action)
    if (targetType !== 'ALL') p.set('targetType', targetType)
    if (role !== 'ALL') p.set('role', role)
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo) p.set('dateTo', dateTo)
    return p.toString()
  }, [page, action, targetType, role, dateFrom, dateTo])

  const { data, loading, error, reload } = useFetch<AuditLogListData>(`/api/audit-logs?${params}`)
  const filterCount = [action !== 'ALL', targetType !== 'ALL', role !== 'ALL', !!dateFrom || !!dateTo].filter(Boolean).length
  const filtered = filterCount > 0
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  // Unduhan CSV (/api/audit-logs/export, [F2-ADMIN]) memakai rentang tanggal & aksi yang sama.
  const exportHref = useMemo(() => {
    const p = new URLSearchParams()
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo) p.set('dateTo', dateTo)
    if (action !== 'ALL') p.set('action', action)
    const q = p.toString()
    return `/api/audit-logs/export${q ? `?${q}` : ''}`
  }, [dateFrom, dateTo, action])

  const answer = (() => {
    if (!data) return null
    if (data.total === 0) return filtered ? 'Tidak ada aktivitas yang cocok dengan saringan ini.' : 'Belum ada aktivitas yang tercatat.'
    const head = `${formatNumber(data.total)} aktivitas tercatat${filtered ? ' untuk saringan ini' : ''}`
    const latest = page === 1 ? data.items[0] : null
    if (!latest) return `${head}.`
    return `${head}; terakhir oleh ${latest.actor?.name ?? 'sistem'}, ${formatRelative(latest.at).toLowerCase()}.`
  })()

  function clearFilters() {
    setAction('ALL')
    setTargetType('ALL')
    setRole('ALL')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const filterControls = (
    <>
      <div className="mk-chips" role="group" aria-label="Saring target">
        {TARGET_TYPE_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            selected={targetType === o.value}
            onClick={() => {
              setTargetType(o.value)
              setPage(1)
            }}
          >
            {o.label}
          </Chip>
        ))}
      </div>
      <div className="mk-audit-filters">
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
          aria-label="Saring aksi"
          className="mk-select mk-sortsel"
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value)
            setPage(1)
          }}
          aria-label="Saring peran pelaku"
          className="mk-select mk-sortsel"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="mk-audit-date">
          <span className="t-footnote text-ink-2">Dari</span>
          <Input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
            aria-label="Tanggal awal"
          />
        </label>
        <label className="mk-audit-date">
          <span className="t-footnote text-ink-2">Sampai</span>
          <Input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
            aria-label="Tanggal akhir"
          />
        </label>
      </div>
    </>
  )

  return (
    <>
      <PageHeader
        context="Riwayat perubahan data · hanya bisa ditambah, tidak bisa diubah atau dihapus"
        title="Log aktivitas"
        tools={
          data?.canExport ? (
            <a className="mk-btn mk-btn--secondary mk-btn--sm" href={exportHref} download>
              <Icon name="unduh" size={16} strokeWidth={2} />
              <span>Unduh CSV</span>
            </a>
          ) : undefined
        }
      />
      {answer ? <p className="t-title-3 text-ink">{answer}</p> : loading ? <Skeleton h={26} w="60%" /> : null}

      <Card>
        <div className="flex flex-col gap-4">
          {phone ? (
            <div className="flex items-center justify-between gap-3">
              <Button size="sm" variant="secondary" icon="cari" onClick={() => setFiltersOpen(true)}>
                {filterCount ? `Saring (${filterCount})` : 'Saring log'}
              </Button>
              {filtered ? (
                <Button size="sm" variant="plain" onClick={clearFilters}>
                  Hapus saringan
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="mk-filterbar flex-wrap">{filterControls}</div>
          )}

          {loading ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat log">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} h={56} />
              ))}
            </div>
          ) : error ? (
            <ErrorNote message={error} onRetry={reload} />
          ) : !data?.items?.length ? (
            <EmptyNote
              icon="aktivitas"
              action={
                filtered ? (
                  <Button size="sm" variant="plain" onClick={clearFilters}>
                    Hapus saringan
                  </Button>
                ) : undefined
              }
            >
              {filtered ? 'Tidak ada log yang cocok dengan saringan ini.' : 'Belum ada log aktivitas.'}
            </EmptyNote>
          ) : (
            <>
              {/* Tabel di desktop lebar (≥1280); di bawahnya kolom Perubahan tidak muat, jadi pakai kartu */}
              <div className="hidden xl:block overflow-x-auto relative">
                <table className="mk-adm-table">
                  <thead>
                    <tr>
                      <th scope="col">Waktu</th>
                      <th scope="col">Pelaku</th>
                      <th scope="col">Aksi</th>
                      <th scope="col">Target</th>
                      <th scope="col">Perubahan</th>
                      <th scope="col">
                        <span className="mk-sr">Rincian</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((log) => (
                      <AuditTableRow key={log.id} log={log} onOpen={() => setOpened(log)} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Ponsel: daftar ActivityItem (08-auditor.md §Ponsel); ketuk baris membuka rincian log */}
              {phone ? (
                <div className="mk-list">
                  {data.items.map((log, i) => (
                    <button
                      key={log.id}
                      type="button"
                      className="mk-audit-act"
                      onClick={() => setOpened(log)}
                      aria-label={`${AUDIT_ACTION_LABELS[log.action] || log.action} oleh ${log.actor?.name ?? 'sistem'}, ${formatDateTime(log.at)}. Buka rincian`}
                    >
                      <ActivityItem
                        who={log.actor?.name ?? 'Sistem'}
                        initials={log.actor ? initialsOf(log.actor.name) : 'S'}
                        action={
                          <>
                            <ActionTag action={log.action} />
                            <span className="t-footnote text-ink-2">{TARGET_LABELS[log.targetType] || log.targetType}</span>
                          </>
                        }
                        time={formatDateTime(log.at)}
                        last={i === data.items.length - 1}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                // Kartu di tablet dan desktop sempit (<1280)
                <div className="xl:hidden mk-list">
                  {data.items.map((log) => (
                    <AuditCardRow key={log.id} log={log} onOpen={() => setOpened(log)} />
                  ))}
                </div>
              )}

              <div className="mk-adm-pager">
                <span className="t-footnote text-ink-2 mk-adm-num">
                  Menampilkan {data.items.length} dari {formatNumber(data.total)} log
                </span>
                <div className="mk-adm-pager__nav">
                  <IconButton icon="kiri" label="Halaman sebelumnya" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} />
                  <span className="t-callout text-ink-2 mk-adm-num" aria-live="polite">
                    Halaman {page} dari {pages}
                  </span>
                  <IconButton icon="kanan" label="Halaman berikutnya" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)} />
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      <Sheet
        open={phone && filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Saring log"
        subtitle="Target, aksi, peran pelaku, dan tanggal"
        backLabel="Log aktivitas"
        footer={
          <>
            <Button variant="secondary" onClick={clearFilters}>
              Hapus saringan
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>
              Tampilkan hasil
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">{filterControls}</div>
      </Sheet>

      <AuditSheet log={opened} onClose={() => setOpened(null)} />
    </>
  )
}

function Actor({ log }: { log: AuditLog }) {
  const roleLabel = log.actor?.role ? ROLE_LABELS[log.actor.role] : null
  if (!log.actor) return <span className="t-footnote text-ink-2">Sistem</span>
  return (
    <div className="min-w-0">
      <span className="t-body-strong text-ink block truncate">{log.actor.name}</span>
      <span className="mk-adm-sub">
        {roleLabel ? `${roleLabel} · ` : ''}
        {log.actor.email}
      </span>
    </div>
  )
}

function AuditTableRow({ log, onOpen }: { log: AuditLog; onOpen: () => void }) {
  const beforeStr = safeStringify(log.beforeData)
  const afterStr = safeStringify(log.afterData)
  return (
    <tr>
      <td className="whitespace-nowrap">
        <span className="t-footnote text-ink mk-adm-num">{formatDateTime(log.at)}</span>
        {log.ip ? <span className="mk-adm-sub font-mono">{log.ip}</span> : null}
      </td>
      <td>
        <Actor log={log} />
      </td>
      <td>
        <ActionTag action={log.action} />
      </td>
      <td>
        <span className="t-footnote text-ink block">{TARGET_LABELS[log.targetType] || log.targetType}</span>
        <span className="mk-adm-sub font-mono">{truncate(log.targetId, 16)}</span>
      </td>
      <td>
        {beforeStr || afterStr ? (
          <DiffView beforeStr={truncate(beforeStr, 200)} afterStr={truncate(afterStr, 200)} compact />
        ) : (
          <span className="t-footnote text-ink-2">Tanpa perubahan data</span>
        )}
      </td>
      <td>
        <IconButton icon="kanan" label="Lihat rincian log" onClick={onOpen} />
      </td>
    </tr>
  )
}

function AuditCardRow({ log, onOpen }: { log: AuditLog; onOpen: () => void }) {
  return (
    <button type="button" className="mk-userrow" onClick={onOpen}>
      <span className="min-w-0 flex-1 flex flex-col gap-1.5">
        <span className="flex items-center gap-2 flex-wrap">
          <ActionTag action={log.action} />
          <span className="t-caption text-ink-2 mk-adm-num">{formatDateTime(log.at)}</span>
        </span>
        <span className="t-body-strong text-ink truncate">{log.actor?.name ?? 'Sistem'}</span>
        <span className="mk-userrow__meta">
          {TARGET_LABELS[log.targetType] || log.targetType} · <span className="font-mono">{truncate(log.targetId, 16)}</span>
        </span>
      </span>
      <Icon name="kanan" size={18} className="text-ink-3 shrink-0" />
    </button>
  )
}

function AuditSheet({ log, onClose }: { log: AuditLog | null; onClose: () => void }) {
  // Isi tetap tampil selama animasi menutup.
  const [last, setLast] = useState<AuditLog | null>(log)
  if (log && log !== last) setLast(log)
  const l = log ?? last
  const beforeStr = l ? safeStringify(l.beforeData) : ''
  const afterStr = l ? safeStringify(l.afterData) : ''

  return (
    <Sheet
      open={!!log}
      onOpenChange={(o) => !o && onClose()}
      size="wide"
      backLabel="Log aktivitas"
      title={l ? AUDIT_ACTION_LABELS[l.action] || l.action : ''}
      subtitle={l ? formatDateTime(l.at) : undefined}
      eyebrow={l ? TARGET_LABELS[l.targetType] || l.targetType : undefined}
    >
      {l ? (
        <>
          <section className="mk-adm-sec">
            <h3 className="t-headline">Pelaku</h3>
            <div className="mk-inset">
              <Actor log={l} />
            </div>
          </section>
          <section className="mk-adm-sec">
            <h3 className="t-headline">Target</h3>
            <div className="mk-inset flex flex-col gap-1">
              <span className="t-body-strong">{TARGET_LABELS[l.targetType] || l.targetType}</span>
              <span className="mk-adm-code break-all">{l.targetId}</span>
            </div>
          </section>
          <section className="mk-adm-sec">
            <h3 className="t-headline">Perubahan</h3>
            {beforeStr || afterStr ? (
              <DiffView beforeStr={beforeStr} afterStr={afterStr} />
            ) : (
              <p className="t-footnote text-ink-2">Aksi ini tidak mengubah data.</p>
            )}
          </section>
          {l.ip || l.userAgent ? (
            <section className="mk-adm-sec">
              <h3 className="t-headline">Perangkat</h3>
              <div className="mk-inset flex flex-col gap-1">
                {l.ip ? <span className="t-footnote text-ink">Alamat IP <span className="font-mono">{l.ip}</span></span> : null}
                {l.userAgent ? <span className="t-footnote text-ink-2 break-all">{l.userAgent}</span> : null}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </Sheet>
  )
}

function DiffView({ beforeStr, afterStr, compact }: { beforeStr: string; afterStr: string; compact?: boolean }) {
  const single = !beforeStr || !afterStr
  return (
    <div className={cx('mk-diff', single && 'is-single', compact && 'mk-diff--compact')}>
      {beforeStr ? (
        <div className="mk-diff__side is-before">
          <span className="mk-diff__label">Sebelum</span>
          <pre className="mk-diff__code">{beforeStr}</pre>
        </div>
      ) : null}
      {afterStr ? (
        <div className="mk-diff__side is-after">
          <span className="mk-diff__label">Sesudah</span>
          <pre className="mk-diff__code">{afterStr}</pre>
        </div>
      ) : null}
    </div>
  )
}
