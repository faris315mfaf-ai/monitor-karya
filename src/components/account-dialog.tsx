'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Sheet, StatusBadge } from '@/components/mk'
import { Field, SectionTitle, SwitchRow, selectCls, useConfirm } from '@/components/companies/parts'
import {
  DEFAULT_PASSWORD, call, isEntityRole, positionsFor, slugify,
  type Company, type UserRow,
} from '@/lib/accounts'

/** Kolom kata sandi dengan tombol tampil/sembunyi di sebelahnya. */
function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  placeholder?: string
}) {
  return (
    <div className="mk-passrow">
      <input
        id={id}
        className="mk-adm-input is-mono flex-1"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        spellCheck={false}
      />
      <Button size="sm" variant="plain" onClick={onToggle} aria-pressed={show} aria-controls={id}>
        {show ? 'Sembunyikan' : 'Tampilkan'}
      </Button>
    </div>
  )
}

/**
 * Satu sheet untuk seluruh isi sebuah akun (15 Sep 2026): perusahaan, posisi,
 * nama, username, kata sandi, email, jabatan, telepon, divisi/proyek yang
 * dipegang, status aktif, sampai hapus akun. Dipakai dari panel akun di
 * Pengaturan, jadi kolomnya selalu sama.
 *
 * `lockCompany` dipakai saat sheet dibuka dari dalam satu perusahaan —
 * penempatannya sudah jelas, jadi pilihan perusahaan disembunyikan.
 */
export function AccountDialog({
  companies,
  company,
  user,
  me,
  lockCompany,
  allowedRoles,
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
  /** Posisi yang boleh dipilih; kosong berarti semua yang berlaku di sana. */
  allowedRoles?: readonly string[]
  onClose: () => void
  onSaved: () => void
}) {
  const editing = Boolean(user)
  const all = companies ?? (company ? [company] : [])
  const [entityId, setEntityId] = useState(company?.id ?? '')
  const target = useMemo(() => all.find((c) => c.id === entityId) ?? null, [all, entityId])
  const options = positionsFor(target, allowedRoles)

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
  const [confirmEl, confirm] = useConfirm()

  const isSelf = Boolean(me && user && me === user.id)

  /** Pindah perusahaan: peran yang tidak berlaku di sana diganti yang pertama. */
  function changeEntity(id: string) {
    setEntityId(id)
    const next = all.find((c) => c.id === id) ?? null
    const allowed = positionsFor(next, allowedRoles)
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
      setErr(r.error ?? 'Akun belum tersimpan. Coba lagi.')
      return
    }
    toast.success(editing ? `Akun ${name} tersimpan.` : `Akun ${username} dibuat.`)
    onSaved()
    onClose()
  }

  async function remove() {
    if (!user) return
    const ok = await confirm({
      title: `Hapus akun ${user.name}?`,
      description: `Akun ${user.username ?? user.email} tidak bisa dipulihkan. Laporan yang pernah dibuatnya tetap tersimpan.`,
      confirmLabel: 'Hapus akun',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    setErr(null)
    const r = await call(`/api/companies/users?id=${user.id}`, 'DELETE')
    setBusy(null)
    if (!r.ok) {
      setErr(r.error ?? 'Akun belum terhapus. Coba lagi.')
      return
    }
    toast.success(`Akun ${user.name} dihapus.`)
    onSaved()
    onClose()
  }

  const roleOpt = options.find((o) => o.role === role)

  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      size="wide"
      backLabel="Akun"
      title={editing ? `Ubah akun ${user?.name ?? ''}`.trim() : 'Tambah akun'}
      subtitle={`${target ? target.name : 'Akun tingkat grup'}${editing && user?.username ? ` · ${user.username}` : ''}`}
      eyebrow={editing && user && !user.isActive ? <StatusBadge status="neutral" size="sm">Nonaktif</StatusBadge> : undefined}
      footer={
        <div className="flex gap-3 justify-end w-full">
          <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
            Batal
          </Button>
          <Button variant="primary" onClick={save} disabled={busy !== null || !name.trim() || !username.trim()}>
            {busy === 'save' ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Buat akun'}
          </Button>
        </div>
      }
    >
      <section className="mk-formsec">
        <SectionTitle icon="gedung">Penempatan & posisi</SectionTitle>
        {!lockCompany && all.length > 0 ? (
          <Field label="Perusahaan" htmlFor="ac-entity" hint="Akun tingkat grup membaca seluruh holding; akun perusahaan terbatas pada PT-nya.">
            <select id="ac-entity" value={entityId} onChange={(e) => changeEntity(e.target.value)} className={selectCls}>
              <option value="">Tingkat grup (tanpa perusahaan)</option>
              {all.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.type === 'HOLDING' ? ' · holding' : ''}
                  {c.isActive ? '' : ' · nonaktif'}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Posisi" htmlFor="ac-role" required hint={roleOpt?.hint}>
          <select id="ac-role" value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
            {options.map((o) => (
              <option key={o.role} value={o.role}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {target && role === 'KEPALA_DIVISI' ? (
          <Field label="Divisi yang dipimpin" htmlFor="ac-div">
            <select id="ac-div" value={divisionId} onChange={(e) => setDivisionId(e.target.value)} className={selectCls}>
              <option value="">Tidak diubah</option>
              {target.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.headName ? ` (kini: ${d.headName})` : ''}
                </option>
              ))}
              <option value="__new__">Divisi baru…</option>
            </select>
            {divisionId === '__new__' ? (
              <input
                className="mk-adm-input mt-2"
                value={divisionName}
                onChange={(e) => setDivisionName(e.target.value)}
                placeholder="Nama divisi baru"
                aria-label="Nama divisi baru"
              />
            ) : null}
          </Field>
        ) : null}

        {target && role === 'PIC_PROYEK' ? (
          <Field label="Proyek yang dipegang" htmlFor="ac-prj">
            <select id="ac-prj" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectCls}>
              <option value="">Tidak diubah</option>
              {target.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.picName ? ` (kini: ${p.picName})` : ''}
                </option>
              ))}
              <option value="__new__">Proyek baru…</option>
            </select>
            {projectId === '__new__' ? (
              <input
                className="mk-adm-input mt-2"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Nama proyek baru"
                aria-label="Nama proyek baru"
              />
            ) : null}
          </Field>
        ) : null}
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="pengguna">Identitas</SectionTitle>
        <div className="mk-formgrid">
          <Field label="Nama" htmlFor="ac-name" required className="is-full">
            <input
              id="ac-name"
              className="mk-adm-input"
              value={name}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value)
                if (!usernameTouched) setUsername(slugify(e.target.value))
              }}
              placeholder="Nama lengkap"
            />
          </Field>
          <Field label="Username" htmlFor="ac-username" required hint="3–32 huruf kecil atau angka, boleh titik, garis bawah, atau strip.">
            <input
              id="ac-username"
              className="mk-adm-input is-mono"
              value={username}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase())
                setUsernameTouched(true)
              }}
              placeholder="otomatis dari nama"
            />
          </Field>
          <Field label="Email" htmlFor="ac-email">
            <input
              id="ac-email"
              type="email"
              className="mk-adm-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={username ? `${username}@karya.co.id` : 'otomatis dari username'}
            />
          </Field>
          <Field label="Jabatan" htmlFor="ac-title" hint="Sebutan yang tampil di profil, misalnya Manager Operasional.">
            <input id="ac-title" className="mk-adm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={roleOpt?.label} />
          </Field>
          <Field label="Telepon" htmlFor="ac-phone">
            <input id="ac-phone" className="mk-adm-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62…" inputMode="tel" />
          </Field>
        </div>
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="kunci">{editing ? 'Setel ulang kata sandi' : 'Kata sandi awal'}</SectionTitle>
        <Field
          label={editing ? 'Kata sandi baru' : 'Kata sandi'}
          htmlFor="ac-password"
          hint={editing ? 'Diisi hanya bila ingin menyetel ulang.' : 'Minimal 8 karakter.'}
        >
          <PasswordInput
            id="ac-password"
            value={password}
            onChange={setPassword}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            placeholder={editing ? 'Kosongkan bila tidak diubah' : DEFAULT_PASSWORD}
          />
        </Field>
      </section>

      {editing ? (
        <section className="mk-formsec">
          <SectionTitle icon="pengaturan">Status & penghapusan</SectionTitle>
          <SwitchRow
            id="ac-active"
            title="Akun aktif"
            description={
              isSelf
                ? 'Ini akun Anda sendiri, jadi tidak bisa dinonaktifkan.'
                : isActive
                  ? 'Akun nonaktif tidak bisa masuk, tetapi riwayatnya tetap utuh.'
                  : 'Perubahan status tersimpan saat Anda menekan Simpan perubahan.'
            }
            checked={isActive}
            onChange={setIsActive}
            disabled={isSelf || busy !== null}
          />
          <div className="mk-danger">
            <div className="min-w-0">
              <div className="t-body-strong">Hapus akun</div>
              <p className="t-footnote text-ink-2">
                {isSelf ? 'Akun Anda sendiri tidak bisa dihapus dari sini.' : 'Tidak bisa dibatalkan. Laporan yang pernah dibuat tetap tersimpan.'}
              </p>
            </div>
            <Button variant="destructive" size="sm" disabled={isSelf || busy !== null} onClick={remove}>
              {busy === 'delete' ? 'Menghapus…' : 'Hapus akun'}
            </Button>
          </div>
        </section>
      ) : null}

      {err ? (
        <p className="mk-note-box mk-soft--late" role="alert">
          {err}
        </p>
      ) : null}
      {confirmEl}
    </Sheet>
  )
}

/** Sheet ringkas khusus menyetel ulang kata sandi satu akun. */
export function ResetPasswordDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState(DEFAULT_PASSWORD)
  const [show, setShow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setErr(null)
    const r = await call('/api/companies/users', 'PATCH', { id: user.id, password })
    setBusy(false)
    if (!r.ok) {
      setErr(r.error ?? 'Kata sandi belum tersimpan. Coba lagi.')
      return
    }
    toast.success(`Kata sandi ${user.name} disetel ulang.`)
    onSaved()
    onClose()
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      backLabel="Akun"
      title="Setel ulang kata sandi"
      subtitle={`${user.name} · ${user.username ?? user.email}`}
      footer={
        <div className="flex gap-3 justify-end w-full">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || password.length < 8}>
            {busy ? 'Menyimpan…' : 'Simpan kata sandi'}
          </Button>
        </div>
      }
    >
      <Field label="Kata sandi baru" htmlFor="rp-pass" hint="Minimal 8 karakter. Sampaikan langsung ke pemegang akun.">
        <PasswordInput id="rp-pass" value={password} onChange={setPassword} show={show} onToggle={() => setShow((v) => !v)} />
      </Field>
      {err ? (
        <p className="mk-note-box mk-soft--late" role="alert">
          {err}
        </p>
      ) : null}
    </Sheet>
  )
}
