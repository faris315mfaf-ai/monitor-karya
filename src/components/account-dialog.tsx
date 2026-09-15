'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  DEFAULT_PASSWORD, call, field, isEntityRole, positionsFor, selectClass, sheetClass, slugify,
  type Company, type UserRow,
} from '@/lib/accounts'
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, Loader2, Power, Trash2, X } from 'lucide-react'

/**
 * Satu pop-up untuk seluruh isi sebuah akun (15 Sep 2026): perusahaan, posisi,
 * nama, username, kata sandi, email, jabatan, telepon, divisi/proyek yang
 * dipegang, status aktif, sampai hapus akun. Dipakai dari tab Perusahaan &
 * Akun maupun dari panel akun di Pengaturan, jadi kolomnya selalu sama.
 *
 * `lockCompany` dipakai saat pop-up dibuka dari dalam satu perusahaan —
 * penempatannya sudah jelas, jadi pilihan perusahaan disembunyikan.
 */
export function AccountDialog({
  companies,
  company,
  user,
  me,
  lockCompany,
  onClose,
  onSaved,
}: {
  /** Seluruh perusahaan, untuk memindahkan akun. Boleh kosong. */
  companies?: Company[]
  /** Penempatan awal; null berarti akun tingkat grup. */
  company: Company | null
  /** null = buat akun baru. */
  user: UserRow | null
  /** Id akun yang sedang dipakai, supaya tidak menonaktifkan diri sendiri. */
  me?: string
  lockCompany?: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const editing = Boolean(user)
  const all = companies ?? (company ? [company] : [])
  const [entityId, setEntityId] = useState(company?.id ?? '')
  const target = useMemo(() => all.find((c) => c.id === entityId) ?? null, [all, entityId])
  const options = positionsFor(target)

  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [usernameTouched, setUsernameTouched] = useState(Boolean(user))
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState(user?.role ?? options[0]?.role ?? 'ADMIN_PT')
  const [title, setTitle] = useState(user?.title ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [password, setPassword] = useState(editing ? '' : DEFAULT_PASSWORD)
  const [showPassword, setShowPassword] = useState(!editing)
  const [isActive, setIsActive] = useState(user?.isActive ?? true)
  const [divisionId, setDivisionId] = useState(user?.divisionId ?? '')
  const [divisionName, setDivisionName] = useState('')
  const [projectId, setProjectId] = useState(user?.projectId ?? '')
  const [projectName, setProjectName] = useState('')
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const isSelf = Boolean(me && user && me === user.id)

  /** Pindah perusahaan: peran yang tidak berlaku di sana diganti yang pertama. */
  function changeEntity(id: string) {
    setEntityId(id)
    const next = all.find((c) => c.id === id) ?? null
    const allowed = positionsFor(next)
    if (!allowed.some((o) => o.role === role)) setRole(allowed[0]?.role ?? 'ADMIN_PT')
    setDivisionId('')
    setProjectId('')
  }

  async function save() {
    if (isEntityRole(role) && !target) {
      setErr('Posisi ini harus ditempatkan di sebuah perusahaan. Pilih perusahaannya dulu.')
      return
    }
    setBusy('save')
    setErr(null)
    const link = {
      divisionId: role === 'KEPALA_DIVISI' && divisionId && divisionId !== '__new__' ? divisionId : undefined,
      divisionName: role === 'KEPALA_DIVISI' && divisionId === '__new__' ? divisionName || undefined : undefined,
      projectId: role === 'PIC_PROYEK' && projectId && projectId !== '__new__' ? projectId : undefined,
      projectName: role === 'PIC_PROYEK' && projectId === '__new__' ? projectName || undefined : undefined,
    }
    const r = editing
      ? await call('/api/companies/users', 'PATCH', {
          id: user!.id,
          name,
          username,
          email,
          role,
          title,
          phone,
          entityId: lockCompany ? undefined : (target?.id ?? null),
          password: password || undefined,
          isActive: isSelf ? undefined : isActive,
          ...(target ? link : {}),
        })
      : await call('/api/companies/users', 'POST', {
          entityId: target?.id ?? null,
          name,
          username,
          email: email || undefined,
          password: password || undefined,
          role,
          title: title || undefined,
          phone: phone || undefined,
          ...link,
        })
    setBusy(null)
    if (!r.ok) {
      setErr(r.error ?? 'Gagal menyimpan')
      return
    }
    onSaved()
    onClose()
  }

  async function remove() {
    if (!user) return
    if (!window.confirm(`Hapus akun ${user.username ?? user.email} (${user.name})? Laporan yang pernah dibuatnya tetap tersimpan.`)) return
    setBusy('delete')
    setErr(null)
    const r = await call(`/api/companies/users?id=${user.id}`, 'DELETE')
    setBusy(null)
    if (!r.ok) {
      setErr(r.error ?? 'Gagal menghapus')
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className={cn(sheetClass, 'sm:w-[min(96vw,46rem)]')}>
        <DialogHeader className="px-5 sm:px-7 pt-5 pb-4 border-b border-white/40 dark:border-white/10 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold tracking-tight">{editing ? 'Ubah Akun' : 'Tambah Akun'}</DialogTitle>
              <DialogDescription className="text-sm mt-0.5">
                {target ? target.name : 'Akun tingkat grup'}
                {editing && user?.username ? ` · ${user.username}` : ''}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="shrink-0 h-11 w-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-500/10 dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 sm:px-7 py-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {!lockCompany && all.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ac-entity" className="text-sm">Perusahaan / penempatan</Label>
                <select id="ac-entity" value={entityId} onChange={(e) => changeEntity(e.target.value)} className={selectClass}>
                  <option value="">— Tingkat grup (tanpa perusahaan) —</option>
                  {all.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.type === 'HOLDING' ? ' · holding' : ''}
                      {c.isActive ? '' : ' · nonaktif'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Akun tingkat grup membaca seluruh holding; akun perusahaan terbatas pada PT-nya.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ac-role" className="text-sm">Posisi / peran <span className="text-rose-500">*</span></Label>
              <select id="ac-role" value={role} onChange={(e) => setRole(e.target.value)} className={selectClass}>
                {options.map((o) => (
                  <option key={o.role} value={o.role}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">{options.find((o) => o.role === role)?.hint}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ac-name" className="text-sm">Nama <span className="text-rose-500">*</span></Label>
              <Input
                id="ac-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!usernameTouched) setUsername(slugify(e.target.value))
                }}
                placeholder="Nama lengkap"
                className={field}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ac-username" className="text-sm">Username <span className="text-rose-500">*</span></Label>
              <Input
                id="ac-username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase())
                  setUsernameTouched(true)
                }}
                placeholder="otomatis dari nama"
                className={cn(field, 'font-mono')}
              />
              <p className="text-xs text-slate-500">3–32 huruf kecil/angka, boleh titik, garis bawah, atau strip.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ac-password" className="text-sm">
                {editing ? 'Kata sandi baru' : 'Kata sandi awal'}
              </Label>
              <div className="relative">
                <Input
                  id="ac-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editing ? 'kosongkan bila tidak diubah' : DEFAULT_PASSWORD}
                  autoComplete="new-password"
                  className={cn(field, 'font-mono pr-12')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-500/10 dark:hover:bg-white/10"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500">{editing ? 'Diisi hanya bila ingin menyetel ulang.' : 'Minimal 4 karakter.'}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ac-email" className="text-sm">Email</Label>
              <Input
                id="ac-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={username ? `${username}@karya.co.id` : 'otomatis dari username'}
                className={field}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ac-title" className="text-sm">Jabatan</Label>
              <Input
                id="ac-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={options.find((o) => o.role === role)?.label}
                className={field}
              />
              <p className="text-xs text-slate-500">Sebutan yang tampil di profil, misalnya &quot;Manager Operasional&quot;.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ac-phone" className="text-sm">Telepon</Label>
              <Input id="ac-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62…" inputMode="tel" className={field} />
            </div>

            {target && role === 'KEPALA_DIVISI' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-sm">Divisi yang dipimpin</Label>
                <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} className={selectClass}>
                  <option value="">— tidak diubah —</option>
                  {target.divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.headName ? ` (kini: ${d.headName})` : ''}
                    </option>
                  ))}
                  <option value="__new__">+ Divisi baru…</option>
                </select>
                {divisionId === '__new__' && (
                  <Input value={divisionName} onChange={(e) => setDivisionName(e.target.value)} placeholder="Nama divisi baru" className={field} />
                )}
              </div>
            )}

            {target && role === 'PIC_PROYEK' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-sm">Proyek yang dipegang</Label>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
                  <option value="">— tidak diubah —</option>
                  {target.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.picName ? ` (kini: ${p.picName})` : ''}
                    </option>
                  ))}
                  <option value="__new__">+ Proyek baru…</option>
                </select>
                {projectId === '__new__' && (
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Nama proyek baru" className={field} />
                )}
              </div>
            )}
          </div>

          {editing && (
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" /> Status &amp; penghapusan
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={isSelf || busy !== null}
                  onClick={() => setIsActive((v) => !v)}
                  title={isSelf ? 'Akun sendiri tidak bisa dinonaktifkan' : undefined}
                >
                  <Power className={cn('h-4 w-4', isActive ? 'text-emerald-600' : 'text-slate-400')} />
                  {isActive ? 'Akun aktif — klik untuk nonaktifkan' : 'Nonaktif — klik untuk aktifkan'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 text-rose-600 border-rose-500/40 hover:bg-rose-500/10"
                  disabled={isSelf || busy !== null}
                  onClick={remove}
                >
                  {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Hapus akun
                </Button>
              </div>
              {!isActive && <p className="text-xs text-slate-500">Perubahan status tersimpan saat Anda menekan Simpan.</p>}
              {isSelf && <p className="text-xs text-slate-500">Ini akun Anda sendiri, jadi tidak bisa dinonaktifkan atau dihapus dari sini.</p>}
            </div>
          )}

          {err && (
            <p className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {err}
            </p>
          )}
        </div>

        <div className="px-5 sm:px-7 py-4 border-t border-white/40 dark:border-white/10 flex gap-2 justify-end bg-white/40 dark:bg-slate-900/40">
          <Button variant="ghost" onClick={onClose} disabled={busy !== null} className="h-12 px-5 text-base">Batal</Button>
          <Button
            onClick={save}
            disabled={busy !== null || !name.trim() || !username.trim()}
            className="h-12 px-6 text-base bg-gradient-to-r from-violet-600 to-violet-500 text-white"
          >
            {busy === 'save' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {editing ? 'Simpan perubahan' : 'Buat akun'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Pop-up ringkas khusus menyetel ulang kata sandi satu akun. */
export function ResetPasswordDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
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
          <DialogTitle className="text-xl flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-600" /> Setel ulang kata sandi
          </DialogTitle>
          <DialogDescription className="text-sm">
            {user.name} · <span className="font-mono">{user.username ?? user.email}</span>
          </DialogDescription>
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
