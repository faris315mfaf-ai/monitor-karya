'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import { AccountDialog, ResetPasswordDialog } from '@/components/account-dialog'
import { Button, EmptyNote, ErrorNote, IconButton, SearchField, Skeleton, StatusBadge, cx } from '@/components/mk'
import { UserAvatar, selectCls, useConfirm } from '@/components/companies/parts'
import { ALL_ROLES } from '@/lib/rbac'
import { formatRelative } from '@/lib/format'
import { call, roleLabel, type CompaniesData, type Company, type UserRow } from '@/lib/accounts'

type Row = { user: UserRow; company: Company | null }

/**
 * Meja akun (15 Sep 2026): satu daftar akun, bisa dicari dan disaring, dengan
 * tombol buat, ubah, setel ulang kata sandi, nonaktifkan, dan hapus. Dipakai di
 * Pengaturan.
 *
 * Isinya mengikuti wewenang pemakainya (5 Okt 2026): Super Admin melihat
 * seluruh grup, Admin PT hanya akun di PT-nya dan hanya posisi yang boleh ia
 * kelola. API menjaga batas yang sama, jadi tampilan ini hanya cerminannya.
 */
export function AccountManager({ className }: { className?: string }) {
  const { data, loading, error, reload } = useResource<CompaniesData>('/api/companies')
  const [q, setQ] = useState('')
  const [scope, setScope] = useState('all')
  const [role, setRole] = useState('all')
  const [dialog, setDialog] = useState<{ user: UserRow | null; company: Company | null } | null>(null)
  const [resetting, setResetting] = useState<UserRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmEl, confirm] = useConfirm()

  const rows = useMemo<Row[]>(() => {
    if (!data) return []
    const flat: Row[] = [
      ...data.holdingUsers.map((u) => ({ user: u, company: null })),
      ...data.companies.flatMap((c) => c.users.map((u) => ({ user: u, company: c }))),
    ]
    const needle = q.trim().toLowerCase()
    return flat
      .filter((r) => (scope === 'all' ? true : scope === 'group' ? r.company === null : r.company?.id === scope))
      .filter((r) => (role === 'all' ? true : r.user.role === role))
      .filter((r) => {
        if (!needle) return true
        const hay = [r.user.name, r.user.username, r.user.email, r.user.title, roleLabel(r.user.role), r.company?.name]
        return hay.some((v) => (v ?? '').toLowerCase().includes(needle))
      })
      .sort((a, b) => (a.company?.name ?? '').localeCompare(b.company?.name ?? '') || a.user.name.localeCompare(b.user.name))
  }, [data, q, scope, role])

  const scoped = data?.scope === 'ENTITY'
  const allowedRoles = data?.manageableRoles
  // Meja terbatas: satu perusahaan saja, jadi tidak perlu saringan penempatan.
  const onlyCompany = scoped ? (data?.companies[0] ?? null) : null
  // Baris di luar wewenang tetap terlihat (supaya daftar PT utuh), tapi tidak bisa disentuh.
  const canTouch = (u: UserRow) => !allowedRoles || allowedRoles.includes(u.role)
  const filtered = q.trim() !== '' || scope !== 'all' || role !== 'all'

  const rolesPresent = useMemo(() => {
    const present = new Set(rows.map((r) => r.user.role))
    if (!data) return []
    const every = new Set([...data.holdingUsers, ...data.companies.flatMap((c) => c.users)].map((u) => u.role))
    return (ALL_ROLES as readonly string[]).filter((r) => every.has(r) || present.has(r))
  }, [rows, data])

  /** Aktif ⇄ nonaktif bisa dibalik, jadi tanpa konfirmasi; notifikasi membawa "Urungkan". */
  async function setActive(u: UserRow, isActive: boolean, undoable = true) {
    setBusy(u.id)
    setMsg(null)
    const r = await call('/api/companies/users', 'PATCH', { id: u.id, isActive })
    setBusy(null)
    if (!r.ok) {
      setMsg(r.error ?? 'Status akun belum berubah. Coba lagi.')
      return
    }
    reload()
    if (undoable) {
      toast.success(isActive ? `Akun ${u.name} diaktifkan.` : `Akun ${u.name} dinonaktifkan.`, {
        action: { label: 'Urungkan', onClick: () => void setActive(u, !isActive, false) },
      })
    }
  }

  async function remove(u: UserRow) {
    const ok = await confirm({
      title: `Hapus akun ${u.name}?`,
      description: `Akun ${u.username ?? u.email} tidak bisa dipulihkan. Laporan yang pernah dibuatnya tetap tersimpan.`,
      confirmLabel: 'Hapus akun',
      destructive: true,
    })
    if (!ok) return
    setBusy(u.id)
    setMsg(null)
    const r = await call(`/api/companies/users?id=${u.id}`, 'DELETE')
    setBusy(null)
    if (!r.ok) setMsg(r.error ?? 'Akun belum terhapus. Coba lagi.')
    else {
      toast.success(`Akun ${u.name} dihapus.`)
      reload()
    }
  }

  function clearFilters() {
    setQ('')
    setScope('all')
    setRole('all')
  }

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />

  const total = data ? data.totals.users : 0

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      {/* Pencarian & saringan */}
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchField
          id="akun-cari"
          label="Cari akun"
          placeholder="Cari nama, username, email, jabatan"
          value={q}
          onChange={setQ}
          className="flex-1 min-w-0"
        />
        <Button icon="tambah" onClick={() => setDialog({ user: null, company: onlyCompany })}>
          Tambah akun
        </Button>
      </div>

      <div className={cx('grid gap-2', !scoped && 'sm:grid-cols-2')}>
        {!scoped ? (
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Saring perusahaan" className={selectCls}>
            <option value="all">Semua penempatan</option>
            <option value="group">Tingkat grup (tanpa perusahaan)</option>
            {(data?.companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Saring posisi" className={selectCls}>
          <option value="all">Semua posisi</option>
          {rolesPresent.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </div>

      <p className="t-footnote text-ink-2 mk-adm-num" aria-live="polite">
        {loading && !data ? 'Memuat akun…' : `${rows.length} dari ${total} akun`}
        {onlyCompany ? ` · ${onlyCompany.name}` : ''}
      </p>

      {msg ? (
        <p className="mk-note-box mk-soft--late" role="alert">
          {msg}
        </p>
      ) : null}

      {/* Daftar akun */}
      <div className="mk-inset mk-adm-scroll">
        {loading && !data ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat akun">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton h={36} w={36} r={999} />
                <div className="flex-1 flex flex-col gap-2">
                  <Skeleton h={14} w="45%" />
                  <Skeleton h={12} w="70%" />
                </div>
              </div>
            ))}
          </div>
        ) : data && rows.length === 0 ? (
          <EmptyNote
            icon="cari"
            action={
              filtered ? (
                <Button size="sm" variant="plain" onClick={clearFilters}>
                  Hapus saringan
                </Button>
              ) : undefined
            }
          >
            {filtered ? 'Tidak ada akun yang cocok dengan saringan ini.' : 'Belum ada akun.'}
          </EmptyNote>
        ) : (
          <div className="mk-list">
            {rows.map(({ user: u, company: c }) => {
              const touch = canTouch(u)
              const isMe = data?.me === u.id
              const rowBusy = busy === u.id
              return (
                <div key={u.id} className="mk-adm-userline">
                  <button
                    type="button"
                    className={cx('mk-userrow', !u.isActive && 'is-off')}
                    onClick={() => setDialog({ user: u, company: c })}
                    disabled={rowBusy || !touch}
                    aria-label={touch ? `Ubah akun ${u.name}` : `${u.name}, dikelola Super Admin`}
                  >
                    <UserAvatar user={u} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="mk-userrow__name">
                        <span className="truncate">{u.name}</span>
                        {isMe ? <span className="mk-tag is-strong">Anda</span> : null}
                      </span>
                      <span className="mk-userrow__meta">
                        <span className="font-mono">{u.username ?? '–'}</span> · {u.title || roleLabel(u.role)} · {c ? c.name : 'Tingkat grup'}
                      </span>
                      <span className="mk-userrow__meta">
                        {u.email}
                        {u.lastLoginAt ? ` · masuk ${formatRelative(u.lastLoginAt).toLowerCase()}` : ' · belum pernah masuk'}
                      </span>
                    </span>
                    <span className="mk-userrow__status">
                      {!u.isActive ? (
                        <StatusBadge status="neutral" size="sm">Nonaktif</StatusBadge>
                      ) : !touch ? (
                        <StatusBadge status="info" size="sm">Diatur Super Admin</StatusBadge>
                      ) : null}
                    </span>
                  </button>
                  <div className="mk-adm-iconrow">
                    <IconButton icon="kunci" label={`Setel ulang kata sandi ${u.name}`} onClick={() => setResetting(u)} disabled={rowBusy || !touch} />
                    <IconButton
                      icon={u.isActive ? 'keluar' : 'selesai'}
                      label={u.isActive ? `Nonaktifkan ${u.name}` : `Aktifkan ${u.name}`}
                      onClick={() => void setActive(u, !u.isActive)}
                      disabled={rowBusy || isMe || !touch}
                    />
                    <IconButton icon="tutup" label={`Hapus akun ${u.name}`} onClick={() => void remove(u)} disabled={rowBusy || isMe || !touch} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {dialog ? (
        <AccountDialog
          companies={data?.companies ?? []}
          company={dialog.company ?? onlyCompany}
          user={dialog.user}
          me={data?.me}
          lockCompany={scoped}
          allowedRoles={allowedRoles}
          onClose={() => setDialog(null)}
          onSaved={reload}
        />
      ) : null}
      {resetting ? <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} onSaved={reload} /> : null}
      {confirmEl}
    </div>
  )
}
