'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { AccountManager } from '@/components/account-manager'
import { useApp } from '@/components/app-provider'
import { BrandLogo } from '@/components/brand-logo'
import { Avatar, Button, ErrorNote, Icon, SegmentedControl, Sheet, Skeleton, type IconName } from '@/components/mk'
import { Field, SectionTitle } from '@/components/companies/parts'
import { PROJECT_PHASE_LABELS } from '@/lib/constants'
import { ROLE_DUTIES, canManageAccounts, canManageAllAccounts } from '@/lib/rbac'
import { formatDateTime } from '@/lib/format'

type Profile = {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  roleLabel: string
  avatarColor: string | null
  entity: { id: string; name: string; code: string; type: string; logoData: string | null } | null
  holding: string | null
  holdingBrand: { id: string; name: string; logoData: string | null } | null
  projects: { id: string; code: string; name: string; phase: string }[]
  divisions: { id: string; name: string }[]
  lastLoginAt: string | null
  memberSince: string | null
}

function initials(name: string) {
  return name.replace(/^(Bpk\.|Ibu)\s*/i, '').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

const THEMES = [
  { value: 'light', label: 'Terang' },
  { value: 'dark', label: 'Gelap' },
  { value: 'system', label: 'Ikuti sistem' },
]

/** Baris label–nilai di bagian penempatan. */
function Row({ icon, label, value }: { icon: IconName; label: string; value: React.ReactNode }) {
  return (
    <div className="mk-adm-place">
      <span className="mk-adm-place__icon" aria-hidden>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="t-caption text-ink-2">{label}</div>
        <div className="t-body-strong text-ink">{value}</div>
      </div>
    </div>
  )
}

/** Ganti kata sandi sendiri — kata sandi lama wajib benar. */
function PasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const mismatch = confirm.length > 0 && next !== confirm
  const ready = current.length > 0 && next.length >= 8 && next === confirm && !busy

  async function submit() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Kata sandi belum berubah. Coba lagi.')
      setCurrent('')
      setNext('')
      setConfirm('')
      setMsg({ kind: 'ok', text: 'Kata sandi diubah. Pakai yang baru saat masuk berikutnya.' })
      toast.success('Kata sandi diubah.')
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Kata sandi belum berubah. Coba lagi.' })
    } finally {
      setBusy(false)
    }
  }

  const type = show ? 'text' : 'password'

  return (
    <section className="mk-formsec">
      <SectionTitle
        icon="kunci"
        action={
          <Button size="sm" variant="plain" onClick={() => setShow((v) => !v)} aria-pressed={show}>
            {show ? 'Sembunyikan' : 'Tampilkan'}
          </Button>
        }
      >
        Kata sandi
      </SectionTitle>
      <div className="mk-formgrid">
        <Field label="Kata sandi saat ini" htmlFor="pw-current" className="is-full">
          <input id="pw-current" type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className="mk-adm-input is-mono" />
        </Field>
        <Field label="Kata sandi baru" htmlFor="pw-new" hint="Minimal 8 karakter.">
          <input id="pw-new" type={type} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className="mk-adm-input is-mono" />
        </Field>
        <Field label="Ulangi kata sandi baru" htmlFor="pw-confirm" error={mismatch ? 'Ulangan kata sandi belum sama.' : null}>
          <input
            id="pw-confirm"
            type={type}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="mk-adm-input is-mono"
            aria-invalid={mismatch || undefined}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={submit} disabled={!ready}>
          {busy ? 'Mengubah…' : 'Ubah kata sandi'}
        </Button>
        <span className="t-footnote text-ink-2">Lupa kata sandi? Super Admin dapat menyetel ulang dari meja akun.</span>
      </div>
      {msg ? (
        <p className={msg.kind === 'ok' ? 'mk-note-box mk-soft--on' : 'mk-note-box mk-soft--late'} role={msg.kind === 'err' ? 'alert' : 'status'}>
          {msg.text}
        </p>
      ) : null}
    </section>
  )
}

/**
 * Pengaturan (7 Sep 2026): profil akun, penempatan (PT / proyek / divisi),
 * kata sandi, dan tema — dibuka di Sheet. Nama, telepon, dan kata sandi bisa
 * diubah sendiri; peran serta penempatan diatur Super Admin. Untuk pengelola
 * akun, bagian "Akun & pengguna" di sini memuat meja akun (15 Sep 2026).
 */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useApp()
  const manageAccounts = canManageAccounts(user.role)
  const manageAll = canManageAllAccounts(user.role)
  const { theme, setTheme } = useTheme()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/profile')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Profil belum termuat.')
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
  }, [open, attempt])

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
      if (!res.ok) throw new Error(j.error || 'Profil belum tersimpan. Coba lagi.')
      setSaved('Profil tersimpan. Nama baru tampil setelah halaman dimuat ulang.')
      toast.success('Profil tersimpan.')
      setProfile((p) => (p ? { ...p, name: j.name ?? name, phone: j.phone ?? null } : p))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Profil belum tersimpan. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  const dirty = profile !== null && (name.trim() !== profile.name || (phone.trim() || '') !== (profile.phone ?? ''))
  const brand = profile ? (profile.entity ?? profile.holdingBrand) : null

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      backLabel="Kembali"
      title="Pengaturan"
      subtitle={manageAccounts ? 'Profil, kata sandi, akun pengguna, dan tampilan' : 'Profil, penempatan, kata sandi, dan tampilan'}
    >
      {error && !profile ? <ErrorNote message={error} onRetry={() => setAttempt((n) => n + 1)} /> : null}

      {/* Profil */}
      <section className="mk-formsec">
        <SectionTitle icon="pengguna">Profil</SectionTitle>
        {profile ? (
          <div className="mk-acchead">
            <Avatar initials={initials(profile.name)} size={56} name={profile.name} />
            <div className="min-w-0 flex-1">
              <div className="t-headline text-ink truncate">{profile.name}</div>
              <div className="t-footnote text-ink-2 truncate">{profile.email}</div>
              <div className="t-footnote text-accent">{profile.roleLabel}</div>
            </div>
            {/* Logo perusahaan si pemilik akun; akun tingkat grup memakai logo holding. */}
            {brand ? (
              <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
                <BrandLogo name={brand.name} logoData={brand.logoData} size={48} tone={profile.entity ? 'blue' : 'slate'} />
                <span className="t-caption text-ink-2 max-w-28 text-center truncate">{brand.name}</span>
              </div>
            ) : null}
          </div>
        ) : !error ? (
          <div className="mk-acchead" aria-busy="true" aria-label="Memuat profil">
            <Skeleton h={56} w={56} r={999} />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton h={16} w="45%" />
              <Skeleton h={12} w="65%" />
            </div>
          </div>
        ) : null}
        <div className="mk-formgrid">
          <Field label="Nama tampilan" htmlFor="st-name">
            <input id="st-name" className="mk-adm-input" value={name} onChange={(e) => setName(e.target.value)} disabled={!profile} />
          </Field>
          <Field label="Nomor telepon" htmlFor="st-phone">
            <input id="st-phone" className="mk-adm-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62…" inputMode="tel" disabled={!profile} />
          </Field>
        </div>
        {profile ? <p className="t-footnote text-ink-2">{ROLE_DUTIES[profile.role]}</p> : null}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="primary" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Menyimpan…' : 'Simpan profil'}
          </Button>
        </div>
        {saved ? (
          <p className="mk-note-box mk-soft--on" role="status">
            {saved}
          </p>
        ) : null}
        {error && profile ? (
          <p className="mk-note-box mk-soft--late" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {/* Penempatan */}
      <section className="mk-formsec">
        <SectionTitle icon="gedung">Penempatan</SectionTitle>
        <div className="mk-inset mk-list">
          <Row
            icon="gedung"
            label="PT / entitas"
            value={
              profile ? (
                profile.entity ? (
                  <>
                    {profile.entity.name}
                    {profile.holding && profile.holding !== profile.entity.name ? <span className="text-ink-2 font-normal"> · {profile.holding}</span> : null}
                  </>
                ) : profile.holding ? (
                  <>
                    Seluruh grup <span className="text-ink-2 font-normal">· {profile.holding}</span>
                  </>
                ) : (
                  'Seluruh grup'
                )
              ) : (
                <Skeleton h={16} w={160} />
              )
            }
          />
          {profile?.role === 'PIC_PROYEK' ? (
            <Row
              icon="proyek"
              label="Proyek"
              value={
                profile.projects.length ? (
                  profile.projects.map((p) => (
                    <div key={p.id}>
                      {p.name}{' '}
                      <span className="text-ink-2 font-normal t-footnote">
                        · {p.code} · {PROJECT_PHASE_LABELS[p.phase] ?? p.phase}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-waspada">Belum ada proyek ditugaskan</span>
                )
              }
            />
          ) : null}
          {profile?.role === 'KEPALA_DIVISI' ? (
            <Row
              icon="tim"
              label="Divisi"
              value={profile.divisions.length ? profile.divisions.map((d) => d.name).join(', ') : <span className="text-waspada">Belum memimpin divisi</span>}
            />
          ) : null}
          {profile?.holdingBrand ? (
            <Row
              icon="alur"
              label="Inisiator sistem"
              value={
                <span className="inline-flex items-center gap-2">
                  <BrandLogo name={profile.holdingBrand.name} logoData={profile.holdingBrand.logoData} size={24} tone="slate" className="shadow-none" />
                  {profile.holdingBrand.name}
                </span>
              }
            />
          ) : null}
          {profile?.lastLoginAt ? <Row icon="waktu" label="Masuk terakhir" value={formatDateTime(profile.lastLoginAt)} /> : null}
        </div>
        <p className="t-footnote text-ink-2">Peran dan penempatan diatur oleh Tim TI holding.</p>
      </section>

      {/* Kata sandi sendiri */}
      <PasswordSection />

      {/* Akun & pengguna — pengelola akun */}
      {manageAccounts ? (
        <section className="mk-formsec">
          <SectionTitle icon="tim">Akun & pengguna</SectionTitle>
          <p className="t-footnote text-ink-2">
            {manageAll
              ? 'Buat akun baru lengkap dengan username, kata sandi, nama, jabatan, dan penempatannya. Ubah, setel ulang kata sandi, nonaktifkan, atau hapus akun mana pun.'
              : 'Buat akun untuk perusahaan Anda lengkap dengan username, kata sandi, nama, dan jabatan. Ubah, setel ulang kata sandi, nonaktifkan, atau hapus akun Admin PT, kepala divisi, dan manager proyek di PT Anda. Akun direktur perusahaan dan akun tingkat grup diatur Super Admin.'}
          </p>
          <AccountManager />
        </section>
      ) : null}

      {/* Tema */}
      <section className="mk-formsec">
        <SectionTitle icon={theme === 'dark' ? 'gelap' : 'terang'}>Tampilan</SectionTitle>
        <SegmentedControl label="Tema" options={THEMES} value={theme ?? 'system'} onChange={setTheme} full />
      </section>
    </Sheet>
  )
}
