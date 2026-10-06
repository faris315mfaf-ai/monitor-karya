'use client'

/**
 * Tambah perusahaan dalam empat langkah: Identitas → Kontak & logo → Posisi &
 * akun pertama → Tinjau. Langkah bisa dikunjungi ulang kapan saja; data tidak
 * hilang saat mundur.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button, Icon, SegmentedControl, Sheet, StatusBadge, cx } from '@/components/mk'
import { HOLDING_POSITION_OPTIONS, POSITION_OPTIONS } from '@/lib/constants'
import { DEFAULT_PASSWORD, call, slugify, type Company } from '@/lib/accounts'
import { CompanyLogo, Field, LogoPicker, SectionTitle, generatePassword, selectCls } from './parts'

type Draft = {
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

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function newDraft(role: string): Draft {
  return { key: Math.random().toString(36).slice(2), role, name: '', username: '', usernameTouched: false, email: '', password: DEFAULT_PASSWORD, title: '', divisionName: '', projectName: '' }
}

const STEPS = [
  { id: 0, title: 'Identitas', icon: 'gedung' },
  { id: 1, title: 'Kontak & logo', icon: 'catatan' },
  { id: 2, title: 'Posisi & akun', icon: 'tim' },
  { id: 3, title: 'Tinjau', icon: 'persetujuan' },
] as const

export function CompanyWizard({
  open,
  holdings,
  onClose,
  onSaved,
}: {
  open: boolean
  holdings: Company[]
  onClose: () => void
  onSaved: (id?: string) => void
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} size="wide" backLabel="Perusahaan" title="Tambah perusahaan" subtitle="Identitas, kontak, lalu posisi dan akun pertamanya.">
      {open ? <WizardBody holdings={holdings} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  )
}

function WizardBody({ holdings, onClose, onSaved }: { holdings: Company[]; onClose: () => void; onSaved: (id?: string) => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'PT' | 'HOLDING'>(holdings.length ? 'PT' : 'HOLDING')
  const [parentId, setParentId] = useState(holdings[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([newDraft('ADMIN_PT')])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [tried, setTried] = useState<Record<number, boolean>>({})

  const isHolding = kind === 'HOLDING'
  const derivedCode = useMemo(() => {
    const slug = slugify(name.replace(/^(pt|holding)\s+/i, '')) || slugify(name)
    return slug ? `${isHolding ? 'HOLDING' : 'PT'}-${slug.toUpperCase()}` : ''
  }, [name, isHolding])
  const shownCode = codeTouched ? code : derivedCode
  const options = isHolding ? [...POSITION_OPTIONS, ...HOLDING_POSITION_OPTIONS] : POSITION_OPTIONS

  const stepErrors: Record<number, string[]> = {
    0: [
      name.trim().length < 2 ? 'Nama perusahaan minimal 2 huruf.' : '',
      !isHolding && !parentId ? 'Pilih holding induknya.' : '',
      shownCode && !/^[A-Z0-9-]{2,32}$/.test(shownCode) ? 'Kode hanya huruf besar, angka, dan strip.' : '',
    ].filter(Boolean),
    1: [email && !EMAIL_RE.test(email) ? 'Format email perusahaan belum benar.' : ''].filter(Boolean),
    2: drafts.flatMap((d, i) => [
      !d.name.trim() ? `Posisi ${i + 1}: nama wajib diisi.` : '',
      !USERNAME_RE.test(d.username) ? `Posisi ${i + 1}: username belum valid.` : '',
      d.email && !EMAIL_RE.test(d.email) ? `Posisi ${i + 1}: email belum benar.` : '',
      d.password && d.password.length < 8 ? `Posisi ${i + 1}: kata sandi minimal 8 karakter.` : '',
    ]).concat(new Set(drafts.map((d) => d.username)).size !== drafts.length ? ['Ada username yang sama.'] : []).filter(Boolean),
    3: [],
  }
  const firstInvalid = [0, 1, 2].find((s) => stepErrors[s].length > 0)

  function go(next: number) {
    if (next > step && stepErrors[step].length) {
      setTried((t) => ({ ...t, [step]: true }))
      return
    }
    setStep(next)
  }

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key) return d
        const n = { ...d, ...patch }
        if (patch.name !== undefined && !n.usernameTouched) n.username = slugify(patch.name)
        if (patch.username !== undefined) n.usernameTouched = true
        return n
      })
    )
  }

  async function submit() {
    if (firstInvalid !== undefined) {
      setTried((t) => ({ ...t, [firstInvalid]: true }))
      setStep(firstInvalid)
      return
    }
    setBusy(true)
    setErr(null)
    const r = await call('/api/companies', 'POST', {
      name,
      isHolding,
      parentId: isHolding ? null : parentId || null,
      code: codeTouched ? code : undefined,
      address,
      phone,
      email,
      website,
      logoData: logo,
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
    setBusy(false)
    if (!r.ok) {
      setErr(r.error ?? 'Perusahaan belum tersimpan. Coba lagi.')
      return
    }
    const entity = r.json.entity as { id?: string } | undefined
    toast.success(`${name} ditambahkan dengan ${drafts.length} akun.`)
    onSaved(entity?.id)
    onClose()
  }

  return (
    <>
      <ol className="mk-steps" aria-label="Langkah tambah perusahaan">
        {STEPS.map((s) => {
          const state = s.id < step ? 'done' : s.id === step ? 'current' : 'todo'
          const bad = tried[s.id] && stepErrors[s.id].length > 0
          return (
            <li key={s.id}>
              <button
                type="button"
                className={cx('mk-step', `is-${state}`, bad && 'is-bad')}
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() => (s.id <= step ? setStep(s.id) : go(s.id))}
              >
                <span className="mk-step__dot" aria-hidden>
                  {state === 'done' ? <Icon name="selesai" size={14} strokeWidth={2.6} /> : s.id + 1}
                </span>
                <span className="mk-step__label">{s.title}</span>
              </button>
            </li>
          )
        })}
      </ol>

      <div key={step} className="mk-tabpane flex flex-col gap-6">
        {step === 0 && (
          <section className="mk-formsec">
            <SectionTitle icon="gedung">Identitas perusahaan</SectionTitle>
            <Field label="Jenis" hint={isHolding ? 'Holding adalah induk. Boleh berisi akun tingkat grup.' : 'Anak perusahaan berada di bawah sebuah holding.'}>
              <SegmentedControl
                full
                label="Jenis perusahaan"
                value={kind}
                onChange={(v) => setKind(v as 'PT' | 'HOLDING')}
                options={[
                  { value: 'PT', label: 'Anak perusahaan' },
                  { value: 'HOLDING', label: 'Holding' },
                ]}
              />
            </Field>
            <div className="mk-formgrid">
              <Field label="Nama perusahaan" htmlFor="cw-name" required className="is-full" error={tried[0] && name.trim().length < 2 ? 'Nama minimal 2 huruf.' : null}>
                <Input id="cw-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. PT Sigma Daya" />
              </Field>
              {!isHolding ? (
                <Field label="Holding induk" htmlFor="cw-parent" required error={tried[0] && !parentId ? 'Pilih holding induk.' : null}>
                  <select id="cw-parent" className={selectCls} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                    {holdings.length === 0 ? <option value="">Belum ada holding</option> : null}
                    {holdings.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Kode" htmlFor="cw-code" hint="Otomatis dari nama; ubah bila perlu.">
                <Input
                  id="cw-code"
                  className="font-mono"
                  value={shownCode}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase())
                    setCodeTouched(true)
                  }}
                  placeholder="PT-NAMA"
                />
              </Field>
            </div>
            {isHolding || holdings.length > 0 ? null : (
              <p className="mk-note-box mk-soft--risk">Belum ada holding. Buat holding dulu, lalu anak perusahaannya.</p>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="mk-formsec">
            <SectionTitle icon="catatan">Kontak & logo</SectionTitle>
            <LogoPicker value={logo} name={name} type={kind} onChange={setLogo} />
            <div className="mk-formgrid">
              <Field label="Alamat" htmlFor="cw-addr" className="is-full">
                <Textarea id="cw-addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jalan, kota" />
              </Field>
              <Field label="Telepon" htmlFor="cw-phone">
                <Input id="cw-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62…" />
              </Field>
              <Field label="Email" htmlFor="cw-email" error={email && !EMAIL_RE.test(email) ? 'Format email belum benar.' : null}>
                <Input id="cw-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@perusahaan.co.id" />
              </Field>
              <Field label="Situs web" htmlFor="cw-web" className="is-full">
                <Input id="cw-web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
              </Field>
            </div>
            <p className="t-footnote text-ink-2">Semua kolom di langkah ini boleh dilengkapi nanti.</p>
          </section>
        )}

        {step === 2 && (
          <section className="mk-formsec">
            <SectionTitle
              icon="tim"
              action={
                <Button size="sm" icon="tambah" onClick={() => setDrafts((ds) => [...ds, newDraft(ds.some((d) => d.role === 'ADMIN_PT') ? 'KEPALA_DIVISI' : 'ADMIN_PT')])}>
                  Tambah posisi
                </Button>
              }
            >
              Posisi & akun pertama
            </SectionTitle>
            <p className="t-footnote text-ink-2">Username dan email dibuat dari nama. Kata sandi awal {DEFAULT_PASSWORD}; pemiliknya wajib menggantinya saat masuk pertama.</p>
            {drafts.length === 0 ? <p className="mk-note-box bg-fill-1">Tanpa posisi. Akun bisa ditambahkan nanti dari detail perusahaan.</p> : null}
            {drafts.map((d, i) => {
              const label = options.find((o) => o.role === d.role)?.label ?? d.role
              return (
                <div key={d.key} className="mk-draft">
                  <div className="mk-draft__head">
                    <span className="mk-draft__num">{i + 1}</span>
                    <span className="t-body-strong flex-1 truncate">
                      {label}
                      {d.name ? <span className="text-ink-2 font-normal"> · {d.name}</span> : null}
                    </span>
                    <Button size="sm" variant="plain" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>
                      Hapus
                    </Button>
                  </div>
                  <div className="mk-formgrid">
                    <Field label="Posisi" htmlFor={`d-role-${d.key}`} hint={options.find((o) => o.role === d.role)?.hint}>
                      <select id={`d-role-${d.key}`} className={selectCls} value={d.role} onChange={(e) => update(d.key, { role: e.target.value })}>
                        {options.map((o) => (
                          <option key={o.role} value={o.role}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Nama" htmlFor={`d-name-${d.key}`} required error={tried[2] && !d.name.trim() ? 'Nama wajib diisi.' : null}>
                      <Input id={`d-name-${d.key}`} value={d.name} onChange={(e) => update(d.key, { name: e.target.value })} placeholder="Nama pemegang posisi" />
                    </Field>
                    <Field label="Username" htmlFor={`d-user-${d.key}`} required error={tried[2] && !USERNAME_RE.test(d.username) ? '3–32 huruf kecil/angka.' : null}>
                      <Input id={`d-user-${d.key}`} className="font-mono" value={d.username} onChange={(e) => update(d.key, { username: e.target.value.toLowerCase() })} placeholder="otomatis dari nama" />
                    </Field>
                    <Field label="Kata sandi awal" htmlFor={`d-pass-${d.key}`}>
                      <div className="mk-passrow">
                        <Input id={`d-pass-${d.key}`} className="font-mono flex-1" value={d.password} onChange={(e) => update(d.key, { password: e.target.value })} />
                        <Button size="sm" onClick={() => update(d.key, { password: generatePassword() })}>
                          Buat acak
                        </Button>
                      </div>
                    </Field>
                    <Field label="Email" htmlFor={`d-email-${d.key}`} hint={d.email ? undefined : `${d.username || 'username'}@karya.co.id`}>
                      <Input id={`d-email-${d.key}`} type="email" value={d.email} onChange={(e) => update(d.key, { email: e.target.value })} />
                    </Field>
                    <Field label="Jabatan" htmlFor={`d-title-${d.key}`}>
                      <Input id={`d-title-${d.key}`} value={d.title} onChange={(e) => update(d.key, { title: e.target.value })} placeholder={label} />
                    </Field>
                    {d.role === 'KEPALA_DIVISI' ? (
                      <Field label="Nama divisi yang dipimpin" htmlFor={`d-div-${d.key}`} className="is-full" hint="Divisi dibuat otomatis.">
                        <Input id={`d-div-${d.key}`} value={d.divisionName} onChange={(e) => update(d.key, { divisionName: e.target.value })} placeholder="mis. Keuangan" />
                      </Field>
                    ) : null}
                    {d.role === 'PIC_PROYEK' ? (
                      <Field label="Nama proyek yang dipegang" htmlFor={`d-prj-${d.key}`} className="is-full" hint="Proyek dibuat otomatis.">
                        <Input id={`d-prj-${d.key}`} value={d.projectName} onChange={(e) => update(d.key, { projectName: e.target.value })} placeholder="mis. Pembangunan Gudang" />
                      </Field>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {step === 3 && (
          <section className="mk-formsec">
            <SectionTitle icon="persetujuan">Tinjau sebelum menyimpan</SectionTitle>
            <div className="mk-review">
              <CompanyLogo company={{ name: name || 'Perusahaan', logoData: logo, type: kind }} size={64} />
              <div className="min-w-0">
                <div className="t-title-3">{name || 'Tanpa nama'}</div>
                <div className="t-footnote text-ink-2">
                  <span className="font-mono">{shownCode || '—'}</span> · {isHolding ? 'Holding' : `Anak perusahaan dari ${holdings.find((h) => h.id === parentId)?.name ?? '—'}`}
                </div>
                <div className="t-footnote text-ink-2">{[address, phone, email, website].filter(Boolean).join(' · ') || 'Kontak belum diisi'}</div>
              </div>
            </div>
            <div className="mk-list">
              {drafts.map((d) => (
                <div key={d.key} className="mk-listrow">
                  <div className="min-w-0 flex-1">
                    <div className="t-body-strong truncate">{d.name || 'Tanpa nama'}</div>
                    <div className="t-footnote text-ink-2 truncate">
                      {options.find((o) => o.role === d.role)?.label} · <span className="font-mono">{d.username}</span>
                      {d.divisionName ? ` · Divisi ${d.divisionName}` : ''}
                      {d.projectName ? ` · ${d.projectName}` : ''}
                    </div>
                  </div>
                  <span className="t-footnote font-mono text-ink-2">{d.password}</span>
                </div>
              ))}
            </div>
            {firstInvalid !== undefined ? (
              <p className="mk-note-box mk-soft--risk">
                Langkah {STEPS[firstInvalid].title.toLowerCase()} masih perlu dilengkapi: {stepErrors[firstInvalid][0]}
              </p>
            ) : (
              <StatusBadge status="done">Siap disimpan</StatusBadge>
            )}
          </section>
        )}

        {tried[step] && stepErrors[step].length > 0 ? (
          <p className="mk-note-box mk-soft--risk" role="alert">
            {stepErrors[step][0]}
          </p>
        ) : null}
        {err ? (
          <p className="mk-note-box mk-soft--late" role="alert">
            {err}
          </p>
        ) : null}
      </div>

      <div className="mk-sheetactions">
        {step > 0 ? (
          <Button variant="secondary" icon="kiri" onClick={() => setStep(step - 1)} disabled={busy}>
            Kembali
          </Button>
        ) : (
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
        )}
        {step < 3 ? (
          <Button variant="primary" iconAfter="kanan" onClick={() => go(step + 1)}>
            Lanjut
          </Button>
        ) : (
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan perusahaan'}
          </Button>
        )}
      </div>
    </>
  )
}
