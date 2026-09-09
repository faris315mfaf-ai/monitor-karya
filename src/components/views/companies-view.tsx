'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/components/app-provider'
import { useResource } from '@/hooks/use-resource'
import { LoadingSpinner, EmptyState, ErrorState } from '@/components/loading-states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HOLDING_POSITION_OPTIONS, POSITION_OPTIONS, ROLE_LABELS } from '@/lib/constants'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, Building2, Check, CheckCircle2, ChevronDown, FolderKanban, Globe, ImagePlus, KeyRound, Loader2, Mail,
  MapPin, Pencil, Phone, Plus, Power, Shield, Trash2, UserPlus, Users, X,
} from 'lucide-react'

// ------------------------------------------------------------------
// Bentuk data dari /api/companies
// ------------------------------------------------------------------

type UserRow = {
  id: string
  name: string
  username: string | null
  email: string
  role: string
  title: string | null
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
  avatarColor: string | null
  hasPassword: boolean
  scopeEntityId: string | null
  divisionId: string | null
  divisionName: string | null
  projectId: string | null
  projectName: string | null
}

type Company = {
  id: string
  code: string
  name: string
  type: 'HOLDING' | 'PT'
  parentId: string | null
  parentName: string | null
  logoData: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  isActive: boolean
  users: UserRow[]
  divisions: { id: string; name: string; headUserId: string | null; headName: string | null }[]
  projects: { id: string; code: string; name: string; lifecycle: string; picUserId: string | null; picName: string | null }[]
  counts: { users: number; divisions: number; projects: number; dailyReports: number; weeklyReports: number }
}

type Data = {
  companies: Company[]
  holdingUsers: UserRow[]
  totals: { companies: number; users: number; divisions: number; projects: number }
  me: string
}

const DEFAULT_PASSWORD = '1234'

const field = 'bg-white/80 dark:bg-slate-900/60 h-11 text-base'
const selectClass =
  'h-11 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-3 text-base text-slate-800 dark:text-slate-100 disabled:opacity-70'

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 24)
}

function initialsOf(name: string): string {
  return name.replace(/^(PT|Holding)\s+/i, '').replace(/^(Bpk\.|Ibu)\s*/i, '').split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?'
}

function roleLabel(role: string): string {
  return POSITION_OPTIONS.find((o) => o.role === role)?.label ?? HOLDING_POSITION_OPTIONS.find((o) => o.role === role)?.label ?? ROLE_LABELS[role] ?? role
}

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, error: res.ok ? undefined : ((json.error as string) || 'Gagal'), json }
  } catch {
    return { ok: false, error: 'Tidak dapat menghubungi server.', json: {} }
  }
}

// ------------------------------------------------------------------
// Halaman
// ------------------------------------------------------------------

/**
 * Perusahaan & Akun — meja Super Admin (10 Sep 2026). Satu kartu per
 * perusahaan (holding & anak perusahaan) dengan logo, identitas, dan
 * orang-orangnya; pop-up besar untuk menambah perusahaan berikut posisi
 * pertamanya, dan pop-up kelola untuk mengubah apa pun sesudahnya.
 */
export function CompaniesView() {
  const { data, loading, error, reload } = useResource<Data>('/api/companies')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [holdingUser, setHoldingUser] = useState<{ user: UserRow | null } | null>(null)

  // Tombol "Tambah Perusahaan" di dashboard meninggalkan penanda ini lalu
  // pindah ke tab ini; pop-upnya dibuka setelah render pertama.
  useEffect(() => {
    let flag = false
    try {
      flag = window.sessionStorage.getItem('mk-open-add-company') === '1'
      if (flag) window.sessionStorage.removeItem('mk-open-add-company')
    } catch {}
    if (flag) Promise.resolve().then(() => setCreating(true))
  }, [])

  if (loading && !data) return <LoadingSpinner className="py-10" />
  if (error || !data) return <ErrorState message={error ?? 'Data tidak tersedia'} />

  const editing = editingId ? (data.companies.find((c) => c.id === editingId) ?? null) : null
  const holdings = data.companies.filter((c) => c.type === 'HOLDING')

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <div className="hero-strip p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Perusahaan &amp; Akun</h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
            Tambah perusahaan, atur posisi, kelola akun dan kata sandi seluruh grup.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 stagger">
            <Chip icon={Building2}>{data.totals.companies} perusahaan</Chip>
            <Chip icon={Users}>{data.totals.users} akun</Chip>
            <Chip icon={Shield}>{data.totals.divisions} divisi</Chip>
            <Chip icon={FolderKanban}>{data.totals.projects} proyek</Chip>
          </div>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="icon-rotate-hover h-14 px-6 text-base font-semibold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white btn-primary-glow shrink-0"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} /> Tambah Perusahaan
        </Button>
      </div>

      {/* Akun tingkat holding */}
      <section className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="h-9 w-9 rounded-xl bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 flex items-center justify-center">
            <Shield className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-slate-800 dark:text-slate-100">Akun tingkat grup</div>
            <div className="text-[13px] text-slate-500 dark:text-slate-400">Super Admin, Manajemen, Direksi Holding, Tim TI, Auditor — tidak terpaku pada satu perusahaan.</div>
          </div>
          <Button size="sm" variant="outline" className="h-10" onClick={() => setHoldingUser({ user: null })}>
            <UserPlus className="h-4 w-4" /> Tambah akun
          </Button>
        </div>
        <UserList users={data.holdingUsers} me={data.me} onEdit={(u) => setHoldingUser({ user: u })} onChanged={reload} />
      </section>

      {/* Kartu perusahaan */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 stagger">
        {data.companies.map((c) => (
          <CompanyCard key={c.id} company={c} onManage={() => setEditingId(c.id)} onChanged={reload} />
        ))}
      </div>
      {data.companies.length === 0 && <EmptyState title="Belum ada perusahaan" description="Mulai dengan menambahkan holding." />}

      {creating && <CompanyDialog mode="create" holdings={holdings} onClose={() => setCreating(false)} onSaved={reload} />}
      {editing && (
        <CompanyDialog
          mode="edit"
          company={editing}
          holdings={holdings}
          me={data.me}
          onClose={() => setEditingId(null)}
          onSaved={reload}
        />
      )}
      {holdingUser && (
        <UserDialog
          company={null}
          user={holdingUser.user}
          onClose={() => setHoldingUser(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}

function Chip({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 dark:bg-slate-900/50 border border-white/60 dark:border-white/10 px-2.5 py-1 text-[13px] font-medium text-slate-700 dark:text-slate-200">
      <Icon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> {children}
    </span>
  )
}

function Logo({ company, size = 'md' }: { company: Pick<Company, 'name' | 'logoData' | 'type'>; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-20 w-20 rounded-2xl text-2xl' : 'h-14 w-14 rounded-xl text-lg'
  if (company.logoData) {
    return <img src={company.logoData} alt={`Logo ${company.name}`} className={cn(box, 'object-contain bg-white/80 dark:bg-slate-900/60 ring-1 ring-black/5 dark:ring-white/10 p-1 animate-fade-in')} />
  }
  return (
    <div className={cn(box, 'flex items-center justify-center font-bold text-white shadow-glow-blue', company.type === 'HOLDING' ? 'bg-gradient-to-br from-slate-700 to-slate-900' : 'bg-gradient-to-br from-blue-600 to-cyan-500')}>
      {initialsOf(company.name)}
    </div>
  )
}

function CompanyCard({ company: c, onManage, onChanged }: { company: Company; onManage: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const people = c.users.slice(0, 6)

  async function toggleActive() {
    if (!window.confirm(c.isActive ? `Nonaktifkan ${c.name}? Akunnya tetap ada, perusahaan disembunyikan dari daftar aktif.` : `Aktifkan kembali ${c.name}?`)) return
    setBusy(true)
    const r = await call('/api/companies', 'PATCH', { id: c.id, isActive: !c.isActive })
    setBusy(false)
    if (!r.ok) window.alert(r.error)
    else onChanged()
  }

  return (
    <article className={cn('glass rounded-2xl p-4 flex flex-col gap-3 card-hover transition-all', !c.isActive && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <Logo company={c} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight truncate">{c.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge className={cn('text-[11px] h-5', c.type === 'HOLDING' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-blue-500/15 text-blue-700 dark:text-blue-300')}>
              {c.type === 'HOLDING' ? 'Holding' : 'Anak perusahaan'}
            </Badge>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{c.code}</span>
            {!c.isActive && <Badge variant="outline" className="text-[11px] h-5 text-rose-600 border-rose-500/40">Nonaktif</Badge>}
          </div>
        </div>
      </div>

      {(c.address || c.email || c.phone) && (
        <div className="space-y-0.5 text-[13px] text-slate-600 dark:text-slate-300">
          {c.address && <div className="flex items-start gap-1.5"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" /> <span className="line-clamp-1">{c.address}</span></div>}
          {c.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {c.phone}</div>}
          {c.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /> <span className="truncate">{c.email}</span></div>}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-[12px]">
        <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-slate-700 dark:text-slate-200">{c.counts.users} akun</span>
        <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-300">{c.counts.divisions} divisi</span>
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-700 dark:text-blue-300">{c.counts.projects} proyek</span>
        {c.counts.dailyReports + c.counts.weeklyReports > 0 && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">{c.counts.dailyReports + c.counts.weeklyReports} laporan</span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-auto">
        <div className="flex -space-x-2">
          {people.map((u) => (
            <span
              key={u.id}
              title={`${u.name} · ${roleLabel(u.role)}`}
              className="h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-900 flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: u.avatarColor ?? '#2563eb' }}
            >
              {initialsOf(u.name)}
            </span>
          ))}
          {c.users.length > people.length && (
            <span className="h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-900 bg-slate-200 dark:bg-slate-700 text-[11px] font-semibold flex items-center justify-center text-slate-700 dark:text-slate-200">
              +{c.users.length - people.length}
            </span>
          )}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="h-10 w-10 p-0 text-slate-500" aria-label={c.isActive ? 'Nonaktifkan' : 'Aktifkan'} onClick={toggleActive} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className={cn('h-4 w-4', c.isActive ? 'text-emerald-600' : 'text-slate-400')} />}
        </Button>
        <Button size="sm" onClick={onManage} className="h-10 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
          <Pencil className="h-4 w-4" /> Kelola
        </Button>
      </div>
    </article>
  )
}

// ------------------------------------------------------------------
// Daftar akun dengan aksi
// ------------------------------------------------------------------

function UserList({ users, me, onEdit, onChanged, compact }: { users: UserRow[]; me: string; onEdit: (u: UserRow) => void; onChanged: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [resetting, setResetting] = useState<UserRow | null>(null)

  async function toggleActive(u: UserRow) {
    setBusy(u.id)
    const r = await call('/api/companies/users', 'PATCH', { id: u.id, isActive: !u.isActive })
    setBusy(null)
    if (!r.ok) window.alert(r.error)
    else onChanged()
  }

  async function remove(u: UserRow) {
    if (!window.confirm(`Hapus akun ${u.username ?? u.email} (${u.name})? Laporan yang pernah dibuatnya tetap tersimpan.`)) return
    setBusy(u.id)
    const r = await call(`/api/companies/users?id=${u.id}`, 'DELETE')
    setBusy(null)
    if (!r.ok) window.alert(r.error)
    else onChanged()
  }

  if (users.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada akun.</p>

  return (
    <ul className="divide-y divide-white/40 dark:divide-white/10">
      {users.map((u) => (
        <li key={u.id} className={cn('flex items-center gap-3 py-2.5', !u.isActive && 'opacity-60')}>
          <span className="h-10 w-10 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0" style={{ background: u.avatarColor ?? '#2563eb' }}>
            {initialsOf(u.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{u.name}</span>
              {u.id === me && <Badge variant="outline" className="text-[10px] h-4 px-1">Anda</Badge>}
              {!u.isActive && <Badge variant="outline" className="text-[10px] h-4 px-1 text-rose-600 border-rose-500/40">Nonaktif</Badge>}
            </div>
            <div className="text-[12px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-1.5">
              <span className="font-mono text-slate-700 dark:text-slate-200">{u.username ?? '—'}</span>
              <span>· {u.title || roleLabel(u.role)}</span>
              {!compact && u.divisionName && <span>· {u.divisionName}</span>}
              {!compact && u.projectName && <span>· {u.projectName}</span>}
              {!compact && <span className="hidden sm:inline">· {u.email}</span>}
              {u.lastLoginAt && <span className="hidden sm:inline">· masuk {formatRelative(u.lastLoginAt)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <IconBtn label="Ubah" onClick={() => onEdit(u)}><Pencil className="h-4 w-4" /></IconBtn>
            <IconBtn label="Setel ulang kata sandi" onClick={() => setResetting(u)}><KeyRound className="h-4 w-4" /></IconBtn>
            <IconBtn label={u.isActive ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggleActive(u)} disabled={busy === u.id || u.id === me}>
              <Power className={cn('h-4 w-4', u.isActive ? 'text-emerald-600' : 'text-slate-400')} />
            </IconBtn>
            <IconBtn label="Hapus" onClick={() => remove(u)} disabled={busy === u.id || u.id === me} danger>
              {busy === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </IconBtn>
          </div>
        </li>
      ))}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} onSaved={onChanged} />}
    </ul>
  )
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn('h-10 w-10 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-500/10 disabled:opacity-40', danger && 'hover:text-rose-600 hover:bg-rose-500/10')}
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------------
// Pop-up perusahaan (tambah / kelola)
// ------------------------------------------------------------------

type PositionDraft = {
  key: string
  role: string
  name: string
  username: string
  usernameTouched: boolean
  email: string
  password: string
  title: string
  divisionName: string
  projectName: string
}

function newDraft(role = 'ADMIN_PT'): PositionDraft {
  return { key: Math.random().toString(36).slice(2), role, name: '', username: '', usernameTouched: false, email: '', password: DEFAULT_PASSWORD, title: '', divisionName: '', projectName: '' }
}

/** Menyusutkan gambar ke ≤ 256 px lalu mengembalikannya sebagai data URL PNG. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      if (file.size > 150_000) return reject(new Error('SVG terlalu besar (maks. 150 KB).'))
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Gagal membaca berkas.'))
      reader.readAsDataURL(file)
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const max = 256
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Browser tidak mendukung kanvas.'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Berkas bukan gambar yang dikenali.'))
    }
    img.src = url
  })
}

function LogoPicker({ value, name, type, onChange, disabled }: { value: string | null; name: string; type: 'HOLDING' | 'PT'; onChange: (v: string | null) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-start gap-3">
      <Logo company={{ name: name || 'Perusahaan', logoData: value, type }} size="lg" />
      <div className="space-y-1.5">
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          setErr(null)
          try {
            onChange(await shrinkImage(f))
          } catch (ex) {
            setErr(ex instanceof Error ? ex.message : 'Gagal memuat logo')
          } finally {
            if (ref.current) ref.current.value = ''
          }
        }} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="h-10" disabled={disabled} onClick={() => ref.current?.click()}>
            <ImagePlus className="h-4 w-4" /> {value ? 'Ganti logo' : 'Unggah logo'}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" className="h-10 text-rose-600" disabled={disabled} onClick={() => onChange(null)}>
              <X className="h-4 w-4" /> Hapus
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">PNG/JPEG/WebP/SVG, disusutkan otomatis ke 256 px.</p>
        {err && <p className="text-xs text-rose-600">{err}</p>}
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, hint, children, tone = 'blue' }: { icon: typeof Users; title: React.ReactNode; hint?: string; children: React.ReactNode; tone?: 'blue' | 'violet' | 'rose' }) {
  const tones = { blue: 'text-blue-600 dark:text-blue-400', violet: 'text-violet-600 dark:text-violet-400', rose: 'text-rose-600 dark:text-rose-400' }
  return (
    <section className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-2">
        <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', tones[tone])} />
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          {hint && <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

// `sm:max-w-none` mengalahkan `sm:max-w-lg` bawaan DialogContent — tanpa itu
// lembar ini tertahan 512 px di desktop.
const sheetClass = cn(
  'glass-modal p-0 gap-0 flex flex-col overflow-hidden',
  'w-screen h-dvh max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0',
  'sm:w-[min(96vw,60rem)] sm:max-w-none sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2'
)

function CompanyDialog({
  mode,
  company,
  holdings,
  me = '',
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  company?: Company
  holdings: Company[]
  me?: string
  onClose: () => void
  onSaved: () => void
}) {
  const editing = mode === 'edit' && company
  const [name, setName] = useState(company?.name ?? '')
  const [isHolding, setIsHolding] = useState(company?.type === 'HOLDING')
  const [parentId, setParentId] = useState(company?.parentId ?? holdings[0]?.id ?? '')
  const [code, setCode] = useState(company?.code ?? '')
  const [codeTouched, setCodeTouched] = useState(Boolean(company))
  const [address, setAddress] = useState(company?.address ?? '')
  const [phone, setPhone] = useState(company?.phone ?? '')
  const [email, setEmail] = useState(company?.email ?? '')
  const [website, setWebsite] = useState(company?.website ?? '')
  const [logo, setLogo] = useState<string | null>(company?.logoData ?? null)
  const [drafts, setDrafts] = useState<PositionDraft[]>(mode === 'create' ? [newDraft('ADMIN_PT')] : [])
  const [userDialog, setUserDialog] = useState<{ user: UserRow | null } | null>(null)
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const derivedCode = useMemo(() => {
    const slug = slugify(name.replace(/^(pt|holding)\s+/i, '')) || slugify(name)
    return slug ? `${isHolding ? 'HOLDING' : 'PT'}-${slug.toUpperCase()}` : ''
  }, [name, isHolding])
  const shownCode = codeTouched ? code : derivedCode

  function updateDraft(key: string, patch: Partial<PositionDraft>) {
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key) return d
        const next = { ...d, ...patch }
        if (patch.name !== undefined && !next.usernameTouched) next.username = slugify(patch.name)
        if (patch.username !== undefined) next.usernameTouched = true
        return next
      })
    )
  }

  async function save() {
    setBusy('save')
    setMsg(null)
    const identity = { name, address, phone, email, website, logoData: logo }
    const r = editing
      ? await call('/api/companies', 'PATCH', { id: company!.id, ...identity })
      : await call('/api/companies', 'POST', {
          ...identity,
          isHolding,
          parentId: isHolding ? null : parentId || null,
          code: codeTouched ? code : undefined,
          positions: drafts.map((d) => ({
            role: d.role,
            name: d.name,
            username: d.username,
            email: d.email || undefined,
            password: d.password || undefined,
            title: d.title || undefined,
            divisionName: d.role === 'KEPALA_DIVISI' ? d.divisionName || undefined : undefined,
            projectName: d.role === 'PIC_PROYEK' ? d.projectName || undefined : undefined,
          })),
        })
    setBusy(null)
    if (!r.ok) {
      setMsg({ kind: 'err', text: r.error ?? 'Gagal menyimpan' })
      return
    }
    onSaved()
    if (editing) setMsg({ kind: 'ok', text: 'Perubahan tersimpan.' })
    else onClose()
  }

  async function removeCompany() {
    if (!company) return
    if (!window.confirm(`Hapus ${company.name} beserta ${company.counts.users} akun, ${company.counts.divisions} divisi, dan ${company.counts.projects} proyeknya? Tindakan ini tidak bisa dibatalkan.`)) return
    setBusy('delete')
    const r = await call(`/api/companies?id=${company.id}`, 'DELETE')
    setBusy(null)
    if (!r.ok) {
      setMsg({ kind: 'err', text: r.error ?? 'Gagal menghapus' })
      return
    }
    onSaved()
    onClose()
  }

  const positionOptions = isHolding ? [...POSITION_OPTIONS, ...HOLDING_POSITION_OPTIONS] : POSITION_OPTIONS

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className={sheetClass}>
        <DialogHeader className="px-5 sm:px-7 pt-5 pb-4 border-b border-white/40 dark:border-white/10 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <Logo company={{ name: name || 'Perusahaan', logoData: logo, type: isHolding ? 'HOLDING' : 'PT' }} />
              <div className="min-w-0">
                <DialogTitle className="text-2xl font-bold tracking-tight truncate">{editing ? company!.name : 'Tambah Perusahaan'}</DialogTitle>
                <DialogDescription className="text-sm mt-0.5">
                  {editing ? `${company!.code} · ${company!.type === 'HOLDING' ? 'Holding' : `Anak perusahaan${company!.parentName ? ` dari ${company!.parentName}` : ''}`}` : 'Identitas, logo, lalu posisi dan akun pertamanya.'}
                </DialogDescription>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Tutup" className="shrink-0 h-11 w-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-500/10 dark:hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 sm:px-7 py-5 space-y-4">
          <Section icon={Building2} title="Identitas perusahaan">
            <div className="grid gap-4 lg:grid-cols-[14rem_1fr] lg:gap-6">
              <LogoPicker value={logo} name={name} type={isHolding ? 'HOLDING' : 'PT'} onChange={setLogo} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="co-name" className="text-sm">Nama perusahaan <span className="text-rose-500">*</span></Label>
                  <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. PT Sigma" className={field} />
                </div>
                {!editing && (
                  <>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 h-11 cursor-pointer select-none sm:col-span-2">
                      <input type="checkbox" checked={isHolding} onChange={(e) => setIsHolding(e.target.checked)} className="h-5 w-5 accent-blue-600" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">Perusahaan ini adalah <strong>holding</strong> (induk), bukan anak perusahaan</span>
                    </label>
                    {!isHolding && (
                      <div className="space-y-1.5">
                        <Label htmlFor="co-parent" className="text-sm">Induk (holding)</Label>
                        <select id="co-parent" value={parentId} onChange={(e) => setParentId(e.target.value)} className={selectClass}>
                          {holdings.length === 0 && <option value="">— belum ada holding —</option>}
                          {holdings.map((h) => (
                            <option key={h.id} value={h.id}>{h.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="co-code" className="text-sm">Kode</Label>
                      <Input id="co-code" value={shownCode} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeTouched(true) }} placeholder="otomatis dari nama" className={cn(field, 'font-mono')} />
                    </div>
                  </>
                )}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="co-address" className="text-sm flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Alamat</Label>
                  <Textarea id="co-address" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} className="bg-white/80 dark:bg-slate-900/60 text-base" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-phone" className="text-sm flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Telepon</Label>
                  <Input id="co-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-email" className="text-sm flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</Label>
                  <Input id="co-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="co-web" className="text-sm flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Situs web</Label>
                  <Input id="co-web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={field} />
                </div>
              </div>
            </div>
          </Section>

          {editing ? (
            <>
              <Section icon={Users} tone="violet" title={<>Posisi &amp; akun <span className="text-sm font-normal text-slate-500">· {company!.users.length}</span></>} hint="Ubah nama, username, email, jabatan, peran; setel ulang kata sandi; nonaktifkan atau hapus.">
                <UserList users={company!.users} me={me} onEdit={(u) => setUserDialog({ user: u })} onChanged={onSaved} />
                <Button type="button" variant="outline" className="h-11 icon-rotate-hover" onClick={() => setUserDialog({ user: null })}>
                  <Plus className="h-5 w-5" /> Tambah posisi
                </Button>
              </Section>
              <div className="grid gap-4 md:grid-cols-2">
                <Section icon={Shield} tone="violet" title={<>Divisi <span className="text-sm font-normal text-slate-500">· {company!.divisions.length}</span></>}>
                  {company!.divisions.length === 0 ? <p className="text-sm text-slate-500">Belum ada divisi — tambahkan Kepala Divisi dengan nama divisi baru.</p> : (
                    <ul className="text-sm space-y-1">
                      {company!.divisions.map((d) => (
                        <li key={d.id} className="flex justify-between gap-2"><span className="font-medium text-slate-800 dark:text-slate-100">{d.name}</span><span className="text-slate-500 truncate">{d.headName ?? 'belum ada kepala'}</span></li>
                      ))}
                    </ul>
                  )}
                </Section>
                <Section icon={FolderKanban} title={<>Proyek <span className="text-sm font-normal text-slate-500">· {company!.projects.length}</span></>}>
                  {company!.projects.length === 0 ? <p className="text-sm text-slate-500">Belum ada proyek — tambahkan Manager Proyek dengan nama proyek baru.</p> : (
                    <ul className="text-sm space-y-1">
                      {company!.projects.map((p) => (
                        <li key={p.id} className="flex justify-between gap-2"><span className="font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</span><span className="text-slate-500 truncate">{p.picName ?? 'belum ada manager'}</span></li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>
              <Section icon={AlertTriangle} tone="rose" title="Zona hati-hati">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="h-11" onClick={async () => { const r = await call('/api/companies', 'PATCH', { id: company!.id, isActive: !company!.isActive }); if (!r.ok) setMsg({ kind: 'err', text: r.error ?? 'Gagal' }); else onSaved() }}>
                    <Power className="h-4 w-4" /> {company!.isActive ? 'Nonaktifkan perusahaan' : 'Aktifkan perusahaan'}
                  </Button>
                  <Button type="button" variant="outline" className="h-11 border-rose-500/40 text-rose-700 dark:text-rose-300" disabled={busy !== null} onClick={removeCompany}>
                    {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Hapus perusahaan
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Perusahaan yang sudah punya laporan tidak bisa dihapus, hanya dinonaktifkan.</p>
              </Section>
            </>
          ) : (
            <Section icon={Users} tone="violet" title="Posisi & akun pertama" hint="Tambahkan Admin PT, Kepala Divisi, Manager Proyek, atau Direktur. Username dan email otomatis dari nama; kata sandi awal 1234.">
              <div className="space-y-3">
                {drafts.map((d, idx) => (
                  <PositionRow key={d.key} draft={d} index={idx} options={positionOptions} onChange={(patch) => updateDraft(d.key, patch)} onRemove={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} />
                ))}
                <Button type="button" variant="outline" className="h-11 icon-rotate-hover" onClick={() => setDrafts((ds) => [...ds, newDraft(ds.length === 0 ? 'ADMIN_PT' : 'KEPALA_DIVISI')])}>
                  <Plus className="h-5 w-5" /> Tambah posisi
                </Button>
              </div>
            </Section>
          )}

          {msg && (
            <div className={cn('flex items-start gap-2 rounded-lg p-2.5 text-[13px]', msg.kind === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300')}>
              {msg.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              {msg.text}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-7 py-4 border-t border-white/40 dark:border-white/10 flex gap-2 justify-end bg-white/40 dark:bg-slate-900/40">
          <Button variant="ghost" onClick={onClose} disabled={busy !== null} className="h-12 px-5 text-base">{editing ? 'Tutup' : 'Batal'}</Button>
          <Button onClick={save} disabled={busy !== null || name.trim().length < 2 || (!editing && !isHolding && !parentId)} className="h-12 px-6 text-base bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-glow-blue">
            {busy === 'save' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {editing ? 'Simpan identitas' : 'Simpan perusahaan'}
          </Button>
        </div>

        {userDialog && company && (
          <UserDialog company={company} user={userDialog.user} onClose={() => setUserDialog(null)} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PositionRow({ draft: d, index, options, onChange, onRemove }: { draft: PositionDraft; index: number; options: { role: string; label: string; hint: string }[]; onChange: (p: Partial<PositionDraft>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(true)
  const label = options.find((o) => o.role === d.role)?.label ?? d.role
  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex-1 flex items-center gap-2 text-left min-h-9">
          <span className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center">{index + 1}</span>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
          {d.name && <span className="text-sm text-slate-500 truncate">· {d.name}{d.username ? ` (${d.username})` : ''}</span>}
          <ChevronDown className={cn('h-4 w-4 text-slate-400 ml-auto transition-transform', open && 'rotate-180')} />
        </button>
        <IconBtn label="Hapus posisi" onClick={onRemove} danger><Trash2 className="h-4 w-4" /></IconBtn>
      </div>
      {open && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Posisi</Label>
            <select value={d.role} onChange={(e) => onChange({ role: e.target.value, title: '' })} className={selectClass}>
              {options.map((o) => (
                <option key={o.role} value={o.role}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500">{options.find((o) => o.role === d.role)?.hint}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Nama <span className="text-rose-500">*</span></Label>
            <Input value={d.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Nama pemegang posisi" className={field} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Username <span className="text-rose-500">*</span></Label>
            <Input value={d.username} onChange={(e) => onChange({ username: e.target.value.toLowerCase() })} placeholder="otomatis dari nama" className={cn(field, 'font-mono')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Kata sandi awal</Label>
            <Input value={d.password} onChange={(e) => onChange({ password: e.target.value })} className={cn(field, 'font-mono')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Email</Label>
            <Input value={d.email} onChange={(e) => onChange({ email: e.target.value })} placeholder={d.username ? `${d.username}@karya.co.id` : 'otomatis dari username'} className={field} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Jabatan (opsional)</Label>
            <Input value={d.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={label} className={field} />
          </div>
          {d.role === 'KEPALA_DIVISI' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Nama divisi yang dipimpin</Label>
              <Input value={d.divisionName} onChange={(e) => onChange({ divisionName: e.target.value })} placeholder="mis. Keuangan — dibuat otomatis" className={field} />
            </div>
          )}
          {d.role === 'PIC_PROYEK' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Nama proyek yang dipegang</Label>
              <Input value={d.projectName} onChange={(e) => onChange({ projectName: e.target.value })} placeholder="mis. Pembangunan Gudang — dibuat otomatis" className={field} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Pop-up akun (tambah / ubah)
// ------------------------------------------------------------------

function UserDialog({ company, user, onClose, onSaved }: { company: Company | null; user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(user)
  const options = company ? (company.type === 'HOLDING' ? [...POSITION_OPTIONS, ...HOLDING_POSITION_OPTIONS] : POSITION_OPTIONS) : HOLDING_POSITION_OPTIONS
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [usernameTouched, setUsernameTouched] = useState(Boolean(user))
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState(user?.role ?? options[0]?.role ?? 'ADMIN_PT')
  const [title, setTitle] = useState(user?.title ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [password, setPassword] = useState(editing ? '' : DEFAULT_PASSWORD)
  const [divisionId, setDivisionId] = useState(user?.divisionId ?? '')
  const [divisionName, setDivisionName] = useState('')
  const [projectId, setProjectId] = useState(user?.projectId ?? '')
  const [projectName, setProjectName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setErr(null)
    const link = {
      divisionId: role === 'KEPALA_DIVISI' && divisionId && divisionId !== '__new__' ? divisionId : undefined,
      divisionName: role === 'KEPALA_DIVISI' && (divisionId === '__new__' || !divisionId) ? divisionName || undefined : undefined,
      projectId: role === 'PIC_PROYEK' && projectId && projectId !== '__new__' ? projectId : undefined,
      projectName: role === 'PIC_PROYEK' && (projectId === '__new__' || !projectId) ? projectName || undefined : undefined,
    }
    const r = editing
      ? await call('/api/companies/users', 'PATCH', { id: user!.id, name, username, email, role, title, phone, ...(company ? link : {}) })
      : await call('/api/companies/users', 'POST', { entityId: company?.id ?? null, name, username, email: email || undefined, password: password || undefined, role, title: title || undefined, phone: phone || undefined, ...link })
    setBusy(false)
    if (!r.ok) {
      setErr(r.error ?? 'Gagal menyimpan')
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className={cn(sheetClass, 'sm:w-[min(96vw,44rem)]')}>
        <DialogHeader className="px-5 sm:px-7 pt-5 pb-4 border-b border-white/40 dark:border-white/10 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold tracking-tight">{editing ? 'Ubah Akun' : 'Tambah Posisi & Akun'}</DialogTitle>
              <DialogDescription className="text-sm mt-0.5">{company ? company.name : 'Akun tingkat grup'}{editing && user?.username ? ` · ${user.username}` : ''}</DialogDescription>
            </div>
            <button type="button" onClick={onClose} aria-label="Tutup" className="shrink-0 h-11 w-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-500/10 dark:hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 sm:px-7 py-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-role" className="text-sm">Posisi / peran</Label>
              <select id="u-role" value={role} onChange={(e) => setRole(e.target.value)} className={selectClass}>
                {options.map((o) => (
                  <option key={o.role} value={o.role}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">{options.find((o) => o.role === role)?.hint}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-name" className="text-sm">Nama <span className="text-rose-500">*</span></Label>
              <Input id="u-name" value={name} onChange={(e) => { setName(e.target.value); if (!usernameTouched) setUsername(slugify(e.target.value)) }} className={field} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-username" className="text-sm">Username <span className="text-rose-500">*</span></Label>
              <Input id="u-username" value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase()); setUsernameTouched(true) }} className={cn(field, 'font-mono')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email" className="text-sm">Email</Label>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={username ? `${username}@karya.co.id` : ''} className={field} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-title" className="text-sm">Jabatan</Label>
              <Input id="u-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={options.find((o) => o.role === role)?.label} className={field} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-phone" className="text-sm">Telepon</Label>
              <Input id="u-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label htmlFor="u-password" className="text-sm">Kata sandi awal</Label>
                <Input id="u-password" value={password} onChange={(e) => setPassword(e.target.value)} className={cn(field, 'font-mono')} />
              </div>
            )}
            {company && role === 'KEPALA_DIVISI' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-sm">Divisi yang dipimpin</Label>
                <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} className={selectClass}>
                  <option value="">— tidak diubah —</option>
                  {company.divisions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}{d.headName ? ` (kini: ${d.headName})` : ''}</option>
                  ))}
                  <option value="__new__">+ Divisi baru…</option>
                </select>
                {divisionId === '__new__' && <Input value={divisionName} onChange={(e) => setDivisionName(e.target.value)} placeholder="Nama divisi baru" className={field} />}
              </div>
            )}
            {company && role === 'PIC_PROYEK' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-sm">Proyek yang dipegang</Label>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
                  <option value="">— tidak diubah —</option>
                  {company.projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.picName ? ` (kini: ${p.picName})` : ''}</option>
                  ))}
                  <option value="__new__">+ Proyek baru…</option>
                </select>
                {projectId === '__new__' && <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Nama proyek baru" className={field} />}
              </div>
            )}
          </div>
          {err && (
            <p className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {err}</p>
          )}
        </div>
        <div className="px-5 sm:px-7 py-4 border-t border-white/40 dark:border-white/10 flex gap-2 justify-end bg-white/40 dark:bg-slate-900/40">
          <Button variant="ghost" onClick={onClose} disabled={busy} className="h-12 px-5 text-base">Batal</Button>
          <Button onClick={save} disabled={busy || !name.trim() || !username.trim()} className="h-12 px-6 text-base bg-gradient-to-r from-violet-600 to-violet-500 text-white">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} {editing ? 'Simpan perubahan' : 'Buat akun'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState(DEFAULT_PASSWORD)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    setBusy(true)
    setErr(null)
    const r = await call('/api/companies/users', 'PATCH', { id: user.id, password })
    setBusy(false)
    if (!r.ok) {
      setErr(r.error ?? 'Gagal')
      return
    }
    onSaved()
    onClose()
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-modal max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2"><KeyRound className="h-5 w-5 text-amber-600" /> Setel ulang kata sandi</DialogTitle>
          <DialogDescription className="text-sm">{user.name} · <span className="font-mono">{user.username ?? user.email}</span></DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rp-pass" className="text-sm">Kata sandi baru (minimal 4 karakter)</Label>
          <Input id="rp-pass" value={password} onChange={(e) => setPassword(e.target.value)} className={cn(field, 'font-mono')} />
          {err && <p className="text-sm text-rose-700 dark:text-rose-300">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button onClick={save} disabled={busy || password.length < 4} className="bg-gradient-to-r from-amber-600 to-amber-500 text-white">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Simpan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Pita kecil di dashboard Super Admin: hitungan + tombol tambah perusahaan. */
export function SuperadminStrip() {
  const { setActiveTab } = useApp()
  const { data } = useResource<Data>('/api/companies')
  function openAdd() {
    try {
      window.sessionStorage.setItem('mk-open-add-company', '1')
    } catch {}
    setActiveTab('companies')
  }
  return (
    <div className="hero-strip p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Super Admin</div>
        <div className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight mt-0.5">Perusahaan &amp; akun seluruh grup</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip icon={Building2}>{data?.totals.companies ?? '…'} perusahaan</Chip>
          <Chip icon={Users}>{data?.totals.users ?? '…'} akun</Chip>
          <Chip icon={FolderKanban}>{data?.totals.projects ?? '…'} proyek</Chip>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" className="h-12" onClick={() => setActiveTab('companies')}>
          <Users className="h-5 w-5" /> Kelola akun
        </Button>
        <Button onClick={openAdd} className="icon-rotate-hover h-12 px-5 text-base font-semibold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white btn-primary-glow">
          <Plus className="h-5 w-5" strokeWidth={2.5} /> Tambah Perusahaan
        </Button>
      </div>
    </div>
  )
}
