'use client'

/**
 * Detail & formulir satu akun di Sheet (desktop samping 640, tablet form,
 * ponsel layar didorong). Satu tempat untuk penempatan, posisi, identitas,
 * kata sandi, status, sampai hapus — kolomnya sama dari mana pun dibuka.
 */

import { ChoiceGroup } from '@/components/mk/forms'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/mk/forms'
import { Button, Icon, Sheet, StatusBadge, cx } from '@/components/mk'
import { DEFAULT_PASSWORD, call, isEntityRole, positionsFor, slugify, type Company, type UserRow } from '@/lib/accounts'
import { formatRelative } from '@/lib/format'
import { Field, SectionTitle, SwitchRow, UserAvatar, generatePassword, selectCls, useConfirm } from './parts'

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AccountTarget = { user: UserRow | null; company: Company | null }

export function AccountSheet({
  target,
  companies,
  me,
  lockCompany,
  allowedRoles,
  onClose,
  onSaved,
}: {
  target: AccountTarget | null
  companies: Company[]
  me: string
  lockCompany?: boolean
  allowedRoles?: readonly string[]
  onClose: () => void
  onSaved: () => void
}) {
  // Isi tetap ada selama animasi menutup.
  const [last, setLast] = useState<AccountTarget | null>(target)
  if (target && target !== last) setLast(target)
  const t = target ?? last
  const key = t ? `${t.user?.id ?? 'baru'}:${t.company?.id ?? 'grup'}` : 'kosong'

  return (
    <Sheet
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      size="wide"
      backLabel="Akun"
      title={t?.user ? t.user.name : 'Akun baru'}
      subtitle={t ? (t.company ? t.company.name : 'Akun tingkat grup') : undefined}
      eyebrow={
        t?.user ? (
          !t.user.isActive ? (
            <StatusBadge status="neutral" size="sm">Nonaktif</StatusBadge>
          ) : t.user.lastLoginAt ? (
            <StatusBadge status="on" size="sm">Aktif</StatusBadge>
          ) : (
            <StatusBadge status="risk" size="sm">Belum pernah masuk</StatusBadge>
          )
        ) : undefined
      }
    >
      {t ? (
        <AccountForm
          key={key}
          target={t}
          companies={companies}
          me={me}
          lockCompany={lockCompany}
          allowedRoles={allowedRoles}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Sheet>
  )
}

function AccountForm({
  target,
  companies,
  me,
  lockCompany,
  allowedRoles,
  onClose,
  onSaved,
}: {
  target: AccountTarget
  companies: Company[]
  me: string
  lockCompany?: boolean
  allowedRoles?: readonly string[]
  onClose: () => void
  onSaved: () => void
}) {
  const user = target.user
  const editing = Boolean(user)
  const isSelf = Boolean(user && user.id === me)
  const [confirmEl, confirm] = useConfirm()

  const [entityId, setEntityId] = useState(target.company?.id ?? '')
  const company = useMemo(() => companies.find((c) => c.id === entityId) ?? null, [companies, entityId])
  const options = positionsFor(company, allowedRoles)

  const [role, setRole] = useState(user?.role ?? options[0]?.role ?? 'ADMIN_PT')
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [usernameTouched, setUsernameTouched] = useState(editing)
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [title, setTitle] = useState(user?.title ?? '')
  const [password, setPassword] = useState(editing ? '' : DEFAULT_PASSWORD)
  const [showPassword, setShowPassword] = useState(!editing)
  const [isActive, setIsActive] = useState(user?.isActive ?? true)
  const [divisionId, setDivisionId] = useState(user?.divisionId ?? '')
  const [divisionName, setDivisionName] = useState('')
  const [projectId, setProjectId] = useState(user?.projectId ?? '')
  const [projectName, setProjectName] = useState('')
  // [F2-ADMIN] keanggotaan divisi (User.divisionId), dimuat terpisah dari meja akun.
  const [memberDivisionId, setMemberDivisionId] = useState('')
  const [memberInitial, setMemberInitial] = useState<string | null>(editing ? null : '')
  useEffect(() => {
    if (!user) return
    let alive = true
    fetch(`/api/companies/users?id=${encodeURIComponent(user.id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { memberDivisionId?: string | null } | null) => {
        if (!alive || !j || j.memberDivisionId === undefined) return
        setMemberDivisionId(j.memberDivisionId ?? '')
        setMemberInitial(j.memberDivisionId ?? '')
      })
      .catch(() => null)
    return () => {
      alive = false
    }
  }, [user])
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const errors = {
    name: !name.trim() ? 'Nama wajib diisi.' : null,
    username: !USERNAME_RE.test(username) ? '3–32 huruf kecil atau angka; boleh titik, garis bawah, strip.' : null,
    email: email && !EMAIL_RE.test(email) ? 'Format email belum benar.' : null,
    password: password && password.length < 8 ? 'Minimal 8 karakter.' : null,
    placement: isEntityRole(role) && !company ? 'Posisi ini harus ditempatkan di sebuah perusahaan.' : null,
  }
  const invalid = Object.values(errors).some(Boolean)
  const show = (k: keyof typeof errors) => (touched[k] || touched.submit ? errors[k] : null)

  function changeEntity(id: string) {
    setEntityId(id)
    const next = companies.find((c) => c.id === id) ?? null
    const allowed = positionsFor(next, allowedRoles)
    if (!allowed.some((o) => o.role === role)) setRole(allowed[0]?.role ?? 'ADMIN_PT')
    setDivisionId('')
    setProjectId('')
    setMemberDivisionId('')
  }

  async function save() {
    setTouched((x) => ({ ...x, submit: true }))
    if (invalid) return
    setBusy('save')
    setErr(null)
    const link = {
      divisionId: role === 'KEPALA_DIVISI' && divisionId && divisionId !== '__new__' ? divisionId : undefined,
      divisionName: role === 'KEPALA_DIVISI' && divisionId === '__new__' ? divisionName || undefined : undefined,
      projectId: role === 'PIC_PROYEK' && projectId && projectId !== '__new__' ? projectId : undefined,
      projectName: role === 'PIC_PROYEK' && projectId === '__new__' ? projectName || undefined : undefined,
    }
    // [F2-ADMIN] kirim keanggotaan divisi hanya bila sudah dimuat dan berubah.
    const member = company && memberInitial !== null && memberDivisionId !== memberInitial ? { memberDivisionId: memberDivisionId || null } : {}
    const r = editing
      ? await call('/api/companies/users', 'PATCH', {
          id: user!.id,
          name,
          username,
          email,
          role,
          title,
          phone,
          entityId: lockCompany ? undefined : (company?.id ?? null),
          password: password || undefined,
          isActive: isSelf ? undefined : isActive,
          ...(company ? link : {}),
          ...member,
        })
      : await call('/api/companies/users', 'POST', {
          entityId: company?.id ?? null,
          name,
          username,
          email: email || undefined,
          password: password || undefined,
          role,
          title: title || undefined,
          phone: phone || undefined,
          ...link,
          ...member,
        })
    setBusy(null)
    if (!r.ok) {
      setErr(r.error ?? 'Perubahan belum tersimpan. Coba lagi.')
      return
    }
    toast.success(editing ? `Akun ${name} tersimpan.` : `Akun ${username} dibuat.`, {
      description: !editing && password ? `Kata sandi awal: ${password}` : password && editing ? 'Kata sandi baru berlaku saat masuk berikutnya.' : undefined,
    })
    onSaved()
    onClose()
  }

  async function remove() {
    if (!user) return
    const ok = await confirm({
      title: `Hapus akun ${user.name}?`,
      description: (
        <>
          Akun <span className="font-mono">{user.username ?? user.email}</span> tidak bisa dipakai masuk lagi. Laporan yang pernah dibuatnya tetap
          tersimpan. Tindakan ini tidak bisa dibatalkan; bila ragu, nonaktifkan saja.
        </>
      ),
      confirmLabel: 'Hapus akun',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    const r = await call(`/api/companies/users?id=${user.id}`, 'DELETE')
    setBusy(null)
    if (!r.ok) {
      setErr(r.error ?? 'Akun belum terhapus.')
      return
    }
    toast.success(`Akun ${user.name} dihapus.`)
    onSaved()
    onClose()
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Kata sandi disalin.')
    } catch {
      toast.error('Browser menolak menyalin. Salin manual.')
    }
  }

  const roleOpt = options.find((o) => o.role === role)

  return (
    <>
      {user ? (
        <div className="mk-acchead">
          <UserAvatar user={user} size={56} />
          <div className="min-w-0 flex-1">
            <div className="t-body-strong font-mono truncate">{user.username ?? '—'}</div>
            <div className="t-footnote text-ink-2 truncate">{user.email}</div>
            <div className="t-footnote text-ink-2">
              {user.lastLoginAt ? `Terakhir masuk ${formatRelative(user.lastLoginAt).toLowerCase()}` : 'Belum pernah masuk'}
              {isSelf ? ' · akun Anda' : ''}
            </div>
          </div>
        </div>
      ) : null}

      <section className="mk-formsec">
        <SectionTitle icon="gedung">Penempatan & posisi</SectionTitle>
        {!lockCompany && companies.length > 0 ? (
          <Field label="Perusahaan" htmlFor="ac-entity" error={show('placement')} hint="Akun tingkat grup membaca seluruh holding; akun perusahaan terbatas pada perusahaannya.">
            <select id="ac-entity" className={selectCls} value={entityId} onChange={(e) => changeEntity(e.target.value)} onBlur={() => setTouched((x) => ({ ...x, placement: true }))}>
              <option value="">Tingkat grup (tanpa perusahaan)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.type === 'HOLDING' ? ' · holding' : ''}
                  {c.isActive ? '' : ' · nonaktif'}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <ChoiceGroup aria-label="Posisi">
          {options.map((o) => (
            <button
              key={o.role}
              type="button"
              role="radio"
              aria-checked={role === o.role}
              className={cx('mk-choice', role === o.role && 'is-on')}
              onClick={() => setRole(o.role)}
            >
              <span className="mk-choice__radio" aria-hidden />
              <span className="min-w-0">
                <span className="mk-choice__title">{o.label}</span>
                <span className="mk-choice__hint">{o.hint}</span>
              </span>
            </button>
          ))}
        </ChoiceGroup>

        {company && role === 'KEPALA_DIVISI' ? (
          <Field label="Divisi yang dipimpin" htmlFor="ac-div" hint="Kepala divisi menyerahkan capaian mingguan divisinya.">
            <select id="ac-div" className={selectCls} value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
              <option value="">{editing ? 'Tidak diubah' : 'Belum ditentukan'}</option>
              {company.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.headName ? ` (kini: ${d.headName})` : ' (belum ada kepala)'}
                </option>
              ))}
              <option value="__new__">Divisi baru…</option>
            </select>
            {divisionId === '__new__' ? <Input className="mt-2" value={divisionName} onChange={(e) => setDivisionName(e.target.value)} placeholder="Nama divisi baru, mis. Keuangan" /> : null}
          </Field>
        ) : null}

        {company && role === 'PIC_PROYEK' ? (
          <Field label="Proyek yang dipegang" htmlFor="ac-prj" hint="Manager proyek mengirim laporan harian proyek ini.">
            <select id="ac-prj" className={selectCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{editing ? 'Tidak diubah' : 'Belum ditentukan'}</option>
              {company.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.picName ? ` (kini: ${p.picName})` : ' (belum ada manager)'}
                </option>
              ))}
              <option value="__new__">Proyek baru…</option>
            </select>
            {projectId === '__new__' ? <Input className="mt-2" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Nama proyek baru" /> : null}
          </Field>
        ) : null}

        {company && company.type === 'PT' && company.divisions.length > 0 ? (
          <Field label="Anggota divisi" htmlFor="ac-member" hint="Dipakai menghitung kepatuhan laporan per divisi dan tim kepala divisi.">
            <select
              id="ac-member"
              className={selectCls}
              value={memberDivisionId}
              disabled={memberInitial === null}
              onChange={(e) => setMemberDivisionId(e.target.value)}
            >
              <option value="">Tanpa divisi</option>
              {company.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="pengguna">Identitas</SectionTitle>
        <div className="mk-formgrid">
          <Field label="Nama lengkap" htmlFor="ac-name" required error={show('name')} className="is-full">
            <Input
              id="ac-name"
              value={name}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value)
                if (!usernameTouched) setUsername(slugify(e.target.value))
              }}
              onBlur={() => setTouched((x) => ({ ...x, name: true }))}
              placeholder="Nama sesuai identitas"
              aria-invalid={!!show('name')}
            />
          </Field>
          <Field label="Username" htmlFor="ac-user" required error={show('username')} hint="Dipakai untuk masuk.">
            <Input
              id="ac-user"
              className="font-mono"
              value={username}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase())
                setUsernameTouched(true)
              }}
              onBlur={() => setTouched((x) => ({ ...x, username: true }))}
              placeholder="otomatis dari nama"
              aria-invalid={!!show('username')}
            />
          </Field>
          <Field label="Email" htmlFor="ac-email" error={show('email')} hint={!editing && !email ? `Kosongkan untuk ${username || 'username'}@karya.co.id` : undefined}>
            <Input id="ac-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched((x) => ({ ...x, email: true }))} aria-invalid={!!show('email')} />
          </Field>
          <Field label="Jabatan" htmlFor="ac-title" hint="Sebutan di profil, mis. Manager Operasional.">
            <Input id="ac-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={roleOpt?.label} />
          </Field>
          <Field label="Telepon" htmlFor="ac-phone">
            <Input id="ac-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62…" />
          </Field>
        </div>
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="kunci">{editing ? 'Setel ulang kata sandi' : 'Kata sandi awal'}</SectionTitle>
        <Field
          label={editing ? 'Kata sandi baru' : 'Kata sandi'}
          htmlFor="ac-pass"
          error={show('password')}
          hint={editing ? 'Kosongkan bila tidak diubah. Berlaku saat pemegang akun masuk berikutnya.' : 'Sampaikan langsung ke pemegang akun, lalu minta ia menggantinya di Pengaturan.'}
        >
          <div className="mk-passrow">
            <div className="relative flex-1 min-w-0">
              <Input
                id="ac-pass"
                className="font-mono pr-12"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((x) => ({ ...x, password: true }))}
                placeholder={editing ? 'Tidak diubah' : DEFAULT_PASSWORD}
              />
              <button
                type="button"
                className="mk-passrow__eye"
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                onClick={() => setShowPassword((v) => !v)}
              >
                <Icon name={showPassword ? 'sembunyi' : 'lihat'} size={18} />
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setPassword(generatePassword())
                setShowPassword(true)
              }}
            >
              Buat acak
            </Button>
            <Button size="sm" variant="plain" disabled={!password} onClick={() => copy(password)}>
              Salin sandi
            </Button>
          </div>
        </Field>
        {editing && user && !user.hasPassword ? (
          <p className="mk-note-box mk-soft--risk">Akun ini belum punya kata sandi, jadi belum bisa masuk. Setel kata sandi di atas.</p>
        ) : null}
      </section>

      {editing ? (
        <section className="mk-formsec">
          <SectionTitle icon="pengaturan">Status</SectionTitle>
          <SwitchRow
            id="ac-active"
            title="Akun aktif"
            description={isSelf ? 'Akun Anda sendiri tidak bisa dinonaktifkan.' : 'Akun nonaktif tidak bisa masuk, tetapi riwayatnya tetap utuh.'}
            checked={isActive}
            onChange={setIsActive}
            disabled={isSelf}
          />
          <div className="mk-danger">
            <div className="min-w-0">
              <div className="t-body-strong">Hapus akun</div>
              <p className="t-footnote text-ink-2">Tidak bisa dibatalkan. Laporan yang pernah dibuat tetap tersimpan.</p>
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

      <div className="mk-sheetactions">
        <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
          Batal
        </Button>
        <Button variant="primary" onClick={save} disabled={busy !== null || (touched.submit && invalid)}>
          {busy === 'save' ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Buat akun'}
        </Button>
      </div>
      {confirmEl}
    </>
  )
}

