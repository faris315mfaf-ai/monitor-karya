'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { PROJECT_PHASE_LABELS } from '@/lib/constants'
import { ROLE_DUTIES } from '@/lib/rbac'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AlertTriangle, Building2, Check, FolderKanban, Loader2, Monitor, Moon, Sun, Users } from 'lucide-react'

type Profile = {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  roleLabel: string
  avatarColor: string | null
  entity: { id: string; name: string; code: string; type: string } | null
  holding: string | null
  projects: { id: string; code: string; name: string; phase: string }[]
  divisions: { id: string; name: string }[]
  lastLoginAt: string | null
  memberSince: string | null
}

function initials(name: string) {
  return name.replace(/^(Bpk\.|Ibu)\s*/i, '').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

const THEMES = [
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'system', label: 'Ikuti sistem', icon: Monitor },
] as const

/** Baris label–nilai di kartu penempatan. */
function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        <div className="text-base font-medium text-slate-800 dark:text-slate-100">{value}</div>
      </div>
    </div>
  )
}

/**
 * Pengaturan (7 Sep 2026): profil akun, penempatan (PT / proyek / divisi),
 * dan tema. Nama & telepon bisa diubah sendiri; peran dan penempatan diatur TI.
 */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { theme, setTheme } = useTheme()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/profile')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Gagal memuat profil')
        return j as Profile
      })
      .then((p) => {
        if (cancelled) return
        setProfile(p)
        setName(p.name)
        setPhone(p.phone ?? '')
        setError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function save() {
    setSaving(true)
    setSaved(null)
    setError(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Gagal menyimpan')
      setSaved('Profil tersimpan. Nama baru tampil setelah halaman dimuat ulang.')
      setProfile((p) => (p ? { ...p, name: j.name ?? name, phone: j.phone ?? null } : p))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const dirty = profile !== null && (name.trim() !== profile.name || (phone.trim() || '') !== (profile.phone ?? ''))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-modal sm:max-w-2xl max-h-[92vh] overflow-y-auto scrollbar-thin p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/40 dark:border-white/10 text-left">
          <DialogTitle className="text-2xl font-bold tracking-tight">Pengaturan</DialogTitle>
          <DialogDescription className="text-sm">Profil, penempatan, dan tampilan.</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {error && !profile && (
            <p className="text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</p>
          )}

          {/* Profil */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Profil</h3>
            {profile ? (
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 ring-2 ring-white/80 dark:ring-white/10 shadow-sm">
                  <AvatarFallback className="text-white text-xl font-semibold" style={{ background: profile.avatarColor || '#2563eb' }}>
                    {initials(profile.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">{profile.name}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 truncate">{profile.email}</div>
                  <div className="text-sm text-blue-700 dark:text-blue-300 font-medium mt-0.5">{profile.roleLabel}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4"><Skeleton className="h-16 w-16 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div></div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="st-name" className="text-sm">Nama tampilan</Label>
                <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!profile} className="bg-white/70 dark:bg-slate-900/50 h-11 text-base" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-phone" className="text-sm">Nomor telepon</Label>
                <Input id="st-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62…" inputMode="tel" disabled={!profile} className="bg-white/70 dark:bg-slate-900/50 h-11 text-base" />
              </div>
            </div>
            {profile && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{ROLE_DUTIES[profile.role]}</p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={save} disabled={!dirty || saving} className="h-11 px-5 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Simpan profil
              </Button>
              {saved && <span className="text-sm text-emerald-700 dark:text-emerald-300">{saved}</span>}
              {error && profile && <span className="text-sm text-rose-700 dark:text-rose-300">{error}</span>}
            </div>
          </section>

          {/* Penempatan */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Penempatan</h3>
            <div className="glass rounded-2xl px-4 divide-y divide-white/40 dark:divide-white/10">
              <Row
                icon={Building2}
                label="PT / entitas"
                value={
                  profile
                    ? profile.entity
                      ? <>{profile.entity.name}{profile.holding && <span className="text-slate-500 dark:text-slate-400 font-normal"> · {profile.holding}</span>}</>
                      : profile.holding
                        ? <>Seluruh grup <span className="text-slate-500 dark:text-slate-400 font-normal">· {profile.holding}</span></>
                        : 'Seluruh grup'
                    : <Skeleton className="h-4 w-40" />
                }
              />
              {profile?.role === 'PIC_PROYEK' && (
                <Row
                  icon={FolderKanban}
                  label="Proyek"
                  value={
                    profile.projects.length
                      ? profile.projects.map((p) => (
                          <div key={p.id}>
                            {p.name} <span className="text-slate-500 dark:text-slate-400 font-normal text-sm">· {p.code} · {PROJECT_PHASE_LABELS[p.phase] ?? p.phase}</span>
                          </div>
                        ))
                      : <span className="text-amber-700 dark:text-amber-300">Belum ada proyek ditugaskan</span>
                  }
                />
              )}
              {profile?.role === 'KEPALA_DIVISI' && (
                <Row icon={Users} label="Divisi" value={profile.divisions.length ? profile.divisions.map((d) => d.name).join(', ') : <span className="text-amber-700 dark:text-amber-300">Belum memimpin divisi</span>} />
              )}
              {profile?.lastLoginAt && <Row icon={Check} label="Masuk terakhir" value={formatDateTime(profile.lastLoginAt)} />}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Peran dan penempatan diatur oleh Tim TI holding.</p>
          </section>

          {/* Tema */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tampilan</h3>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => {
                const active = (theme ?? 'system') === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTheme(t.value)}
                    aria-pressed={active}
                    className={cn(
                      'min-h-14 rounded-xl border flex flex-col items-center justify-center gap-1 text-sm font-medium transition-colors',
                      active ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                    )}
                  >
                    <t.icon className="h-5 w-5" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
