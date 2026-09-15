'use client'

import { useMemo, useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { AccountDialog, ResetPasswordDialog } from '@/components/account-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ALL_ROLES } from '@/lib/rbac'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  call, initialsOf, roleLabel, selectClass,
  type CompaniesData, type Company, type UserRow,
} from '@/lib/accounts'
import { KeyRound, Loader2, Pencil, Power, Search, Trash2, UserPlus, Users } from 'lucide-react'

type Row = { user: UserRow; company: Company | null }

/**
 * Meja akun Super Admin (15 Sep 2026): satu daftar berisi seluruh akun grup,
 * bisa dicari dan disaring, dengan tombol buat, ubah, setel ulang kata sandi,
 * nonaktifkan, dan hapus. Dipakai di Pengaturan dan di tab Perusahaan & Akun.
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

  const rolesPresent = useMemo(() => {
    const present = new Set(rows.map((r) => r.user.role))
    if (!data) return []
    const every = new Set([...data.holdingUsers, ...data.companies.flatMap((c) => c.users)].map((u) => u.role))
    return (ALL_ROLES as readonly string[]).filter((r) => every.has(r) || present.has(r))
  }, [rows, data])

  async function toggleActive(u: UserRow) {
    setBusy(u.id)
    setMsg(null)
    const r = await call('/api/companies/users', 'PATCH', { id: u.id, isActive: !u.isActive })
    setBusy(null)
    if (!r.ok) setMsg(r.error ?? 'Gagal')
    else reload()
  }

  async function remove(u: UserRow) {
    if (!window.confirm(`Hapus akun ${u.username ?? u.email} (${u.name})? Laporan yang pernah dibuatnya tetap tersimpan.`)) return
    setBusy(u.id)
    setMsg(null)
    const r = await call(`/api/companies/users?id=${u.id}`, 'DELETE')
    setBusy(null)
    if (!r.ok) setMsg(r.error ?? 'Gagal')
    else reload()
  }

  if (error) return <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>

  const total = data ? data.totals.users : 0

  return (
    <div className={cn('space-y-3', className)}>
      {/* Pencarian & saringan */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, username, email, jabatan…"
            aria-label="Cari akun"
            className="bg-white/80 dark:bg-slate-900/60 h-11 text-base pl-9"
          />
        </div>
        <Button onClick={() => setDialog({ user: null, company: null })} className="h-11 px-4 bg-gradient-to-r from-violet-600 to-violet-500 text-white shrink-0">
          <UserPlus className="h-4 w-4" /> Tambah akun
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Saring perusahaan" className={selectClass}>
          <option value="all">Semua penempatan</option>
          <option value="group">Tingkat grup (tanpa perusahaan)</option>
          {(data?.companies ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Saring peran" className={selectClass}>
          <option value="all">Semua posisi</option>
          {rolesPresent.map((r) => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
        <Users className="h-3.5 w-3.5" />
        {loading && !data ? 'Memuat akun…' : `${rows.length} dari ${total} akun`}
      </div>

      {msg && <p className="text-sm text-rose-700 dark:text-rose-300">{msg}</p>}

      {/* Daftar akun */}
      <div className="glass rounded-2xl divide-y divide-white/40 dark:divide-white/10 max-h-[26rem] overflow-y-auto scrollbar-thin">
        {loading && !data &&
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <div className="space-y-2 flex-1"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-56" /></div>
            </div>
          ))}

        {data && rows.length === 0 && (
          <p className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">Tidak ada akun yang cocok dengan pencarian ini.</p>
        )}

        {rows.map(({ user: u, company: c }) => (
          <div key={u.id} className={cn('flex items-center gap-3 px-3 py-2.5', !u.isActive && 'opacity-60')}>
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center text-white text-[13px] font-semibold shrink-0"
              style={{ background: u.avatarColor || '#2563eb' }}
            >
              {initialsOf(u.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{u.name}</span>
                {data?.me === u.id && <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-500/40 text-blue-700 dark:text-blue-300">Anda</Badge>}
                {!u.isActive && <Badge variant="outline" className="text-[10px] h-4 px-1 text-rose-600 border-rose-500/40">Nonaktif</Badge>}
              </div>
              <div className="text-[12px] text-slate-500 dark:text-slate-400 truncate">
                <span className="font-mono text-slate-700 dark:text-slate-200">{u.username ?? '—'}</span>
                <span> · {u.title || roleLabel(u.role)}</span>
                <span> · {c ? c.name : 'Tingkat grup'}</span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                {u.email}
                {u.lastLoginAt ? ` · masuk ${formatRelative(u.lastLoginAt)}` : ' · belum pernah masuk'}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <IconBtn label="Ubah akun" onClick={() => setDialog({ user: u, company: c })} disabled={busy === u.id}>
                <Pencil className="h-4 w-4" />
              </IconBtn>
              <IconBtn label="Setel ulang kata sandi" onClick={() => setResetting(u)} disabled={busy === u.id}>
                <KeyRound className="h-4 w-4 text-amber-600" />
              </IconBtn>
              <IconBtn label={u.isActive ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggleActive(u)} disabled={busy === u.id || data?.me === u.id}>
                {busy === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className={cn('h-4 w-4', u.isActive ? 'text-emerald-600' : 'text-slate-400')} />}
              </IconBtn>
              <IconBtn label="Hapus akun" danger onClick={() => remove(u)} disabled={busy === u.id || data?.me === u.id}>
                <Trash2 className="h-4 w-4" />
              </IconBtn>
            </div>
          </div>
        ))}
      </div>

      {dialog && (
        <AccountDialog
          companies={data?.companies ?? []}
          company={dialog.company}
          user={dialog.user}
          me={data?.me}
          onClose={() => setDialog(null)}
          onSaved={reload}
        />
      )}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} onSaved={reload} />}
    </div>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'h-10 w-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors disabled:opacity-40',
        danger ? 'hover:bg-rose-500/10 hover:text-rose-600' : 'hover:bg-slate-500/10 dark:hover:bg-white/10'
      )}
    >
      {children}
    </button>
  )
}
