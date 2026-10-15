'use client'

/**
 * Tambah subholding (di bawah PT BIKE Tbk) dan tambah PT di bawah subholding
 * (kontrak 16 Okt 2026). Membuat subholding otomatis membuat satu akun Admin
 * subholding `admin.<slug>` bersandi awal; kredensial ditampilkan SEKALI di
 * sheet ini dengan tombol salin dan tidak disimpan di mana pun di peramban —
 * begitu sheet ditutup, kredensial hilang dari layar.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/mk/forms'
import { Button, Icon, Sheet, StatusBadge } from '@/components/mk'
import { call, type Company } from '@/lib/accounts'
import { Field, SectionTitle, selectCls } from './parts'
import { credentialText, previewAdminUsername } from './subholding'

type Created = { name: string; username: string; password: string }

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} disalin.`)
  } catch {
    toast.error('Browser menolak menyalin. Salin manual.')
  }
}

/* ------------------------------------------------------------------
   Tambah subholding
   ------------------------------------------------------------------ */

export function SubholdingSheet({
  open,
  holdings,
  onClose,
  onSaved,
}: {
  open: boolean
  holdings: Company[]
  onClose: () => void
  onSaved: () => void
}) {
  // Kredensial hanya hidup di state komponen ini; ditutup = hilang.
  const [created, setCreated] = useState<Created | null>(null)
  const close = () => {
    setCreated(null)
    onClose()
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && close()}
      size="wide"
      backLabel="Perusahaan"
      title={created ? 'Subholding dibuat' : 'Tambah subholding'}
      subtitle={created ? created.name : 'Subholding berada di bawah PT BIKE Tbk dan membawahi PT.'}
    >
      {open && created ? <CredentialPanel created={created} onDone={close} /> : null}
      {open && !created ? (
        <SubholdingForm
          holdings={holdings}
          onCancel={close}
          onCreated={(c) => {
            setCreated(c)
            onSaved()
          }}
        />
      ) : null}
    </Sheet>
  )
}

function SubholdingForm({
  holdings,
  onCancel,
  onCreated,
}: {
  holdings: Company[]
  onCancel: () => void
  onCreated: (c: Created) => void
}) {
  const bike = holdings.find((h) => /bike/i.test(h.name)) ?? holdings[0] ?? null
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [parentId, setParentId] = useState(bike?.id ?? '')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const nameErr = name.trim().length < 2 ? 'Nama subholding minimal 2 huruf.' : null
  const codeErr = code && !/^[A-Z0-9-]{2,32}$/.test(code) ? 'Kode hanya huruf besar, angka, dan strip.' : null
  const parentErr = !parentId ? 'Pilih holding induk.' : null

  async function submit() {
    setTried(true)
    if (nameErr || codeErr || parentErr) return
    setBusy(true)
    setErr(null)
    const r = await call('/api/companies', 'POST', {
      name: name.trim(),
      type: 'SUB_HOLDING',
      parentId,
      code: code || undefined,
    })
    setBusy(false)
    if (!r.ok) {
      setErr(r.error ?? 'Subholding belum tersimpan. Coba lagi.')
      return
    }
    const admin = r.json.adminAccount as { username?: string; defaultPassword?: string } | undefined
    toast.success(`${name.trim()} ditambahkan.`)
    if (admin?.username && admin.defaultPassword) {
      onCreated({ name: name.trim(), username: admin.username, password: admin.defaultPassword })
    } else {
      // Server tidak mengembalikan kredensial (mis. akun sudah ada): tetap selesai.
      onCreated({ name: name.trim(), username: admin?.username ?? '', password: '' })
    }
  }

  return (
    <>
      <section className="mk-formsec">
        <SectionTitle icon="gedung">Identitas subholding</SectionTitle>
        <div className="mk-formgrid">
          <Field label="Nama subholding" htmlFor="sh-name" required className="is-full" error={tried ? nameErr : null}>
            <Input id="sh-name" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="mis. Subholding Energi" />
          </Field>
          <Field label="Holding induk" htmlFor="sh-parent" required error={tried ? parentErr : null}>
            <select id="sh-parent" className={selectCls} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              {holdings.length === 0 ? <option value="">Belum ada holding</option> : null}
              {holdings.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kode" htmlFor="sh-code" hint="Kosongkan agar dibuat otomatis (SH-NAMA)." error={codeErr}>
            <Input id="sh-code" className="font-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SH-NAMA" />
          </Field>
        </div>
      </section>
      <section className="mk-formsec">
        <SectionTitle icon="kunci">Akun Admin subholding</SectionTitle>
        <p className="mk-note-box mk-soft--risk">
          Menyimpan subholding otomatis membuat <strong>satu akun Admin subholding</strong>{' '}
          <span className="font-mono">{previewAdminUsername(name)}</span> yang dipakai bersama para pelapor. Sandi awalnya ditampilkan sekali
          setelah disimpan dan wajib diganti saat masuk pertama.
        </p>
      </section>
      {err ? (
        <p className="mk-note-box mk-soft--late" role="alert">
          {err}
        </p>
      ) : null}
      <div className="mk-sheetactions">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Batal
        </Button>
        <Button variant="primary" onClick={() => void submit()} disabled={busy || holdings.length === 0}>
          {busy ? 'Menyimpan…' : 'Simpan subholding'}
        </Button>
      </div>
    </>
  )
}

function CredentialPanel({ created, onDone }: { created: Created; onDone: () => void }) {
  const hasCred = Boolean(created.username && created.password)
  return (
    <>
      <section className="mk-formsec">
        <SectionTitle icon="kunci">Kredensial Admin subholding</SectionTitle>
        {hasCred ? (
          <>
            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-fill-1 p-4">
              <CredRow label="Username" value={created.username} onCopy={() => void copyText(created.username, 'Username')} />
              <CredRow label="Sandi awal" value={created.password} onCopy={() => void copyText(created.password, 'Sandi awal')} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="risk" size="sm">
                Wajib ganti sandi saat masuk pertama
              </StatusBadge>
            </div>
            <p className="mk-note-box mk-soft--info" role="note">
              Kredensial ini hanya ditampilkan sekali dan tidak disimpan di layar ini. Salin dan sampaikan langsung kepada admin
              subholding sebelum menutup.
            </p>
          </>
        ) : (
          <p className="mk-note-box mk-soft--info">
            Subholding tersimpan. Akun Admin subholding {created.username ? <span className="font-mono">{created.username}</span> : null} bisa
            diatur sandinya dari daftar akun.
          </p>
        )}
      </section>
      <div className="mk-sheetactions">
        {hasCred ? (
          <Button
            icon="dokumen"
            onClick={() => void copyText(credentialText({ subholding: created.name, username: created.username, password: created.password }), 'Kredensial')}
          >
            Salin semua
          </Button>
        ) : null}
        <Button variant="primary" onClick={onDone}>
          Selesai
        </Button>
      </div>
    </>
  )
}

function CredRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="t-caption text-ink-2">{label}</div>
        <div className="t-body-strong font-mono text-ink break-all">{value}</div>
      </div>
      <Button size="sm" icon="dokumen" onClick={onCopy} aria-label={`Salin ${label.toLowerCase()}`}>
        Salin
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------
   Tambah PT di bawah subholding
   ------------------------------------------------------------------ */

export function SubholdingPtSheet({
  subholding,
  subholdings,
  onClose,
  onSaved,
}: {
  /** Subholding awal yang dipilih; null = sheet tertutup. */
  subholding: Company | null
  subholdings: Company[]
  onClose: () => void
  onSaved: () => void
}) {
  const [last, setLast] = useState<Company | null>(subholding)
  if (subholding && subholding !== last) setLast(subholding)
  const target = subholding ?? last
  return (
    <Sheet
      open={Boolean(subholding)}
      onOpenChange={(o) => !o && onClose()}
      backLabel="Perusahaan"
      title="Tambah PT"
      subtitle={target ? `Di bawah ${target.name}` : undefined}
    >
      {subholding ? <PtForm key={subholding.id} initial={subholding} subholdings={subholdings} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  )
}

function PtForm({
  initial,
  subholdings,
  onClose,
  onSaved,
}: {
  initial: Company
  subholdings: Company[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [parentId, setParentId] = useState(initial.id)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const nameErr = name.trim().length < 2 ? 'Nama PT minimal 2 huruf.' : null
  const codeErr = code && !/^[A-Z0-9-]{2,32}$/.test(code) ? 'Kode hanya huruf besar, angka, dan strip.' : null

  async function submit() {
    setTried(true)
    if (nameErr || codeErr) return
    setBusy(true)
    setErr(null)
    const r = await call('/api/companies', 'POST', { name: name.trim(), type: 'PT', parentId, code: code || undefined, positions: [] })
    setBusy(false)
    if (!r.ok) {
      setErr(r.error ?? 'PT belum tersimpan. Coba lagi.')
      return
    }
    const sh = subholdings.find((s) => s.id === parentId)
    toast.success(`${name.trim()} ditambahkan${sh ? ` di bawah ${sh.name}` : ''}.`)
    onSaved()
    onClose()
  }

  return (
    <>
      <section className="mk-formsec">
        <div className="mk-formgrid">
          <Field label="Nama PT" htmlFor="sh-pt-name" required className="is-full" error={tried ? nameErr : null}>
            <Input id="sh-pt-name" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="mis. PT Sigma Daya" />
          </Field>
          <Field label="Subholding" htmlFor="sh-pt-parent" required>
            <select id="sh-pt-parent" className={selectCls} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              {subholdings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kode" htmlFor="sh-pt-code" hint="Kosongkan agar dibuat otomatis." error={codeErr}>
            <Input id="sh-pt-code" className="font-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PT-NAMA" />
          </Field>
        </div>
        <p className="t-footnote text-ink-2">
          <Icon name="info" size={14} className="inline align-[-2px] text-ink-3" /> PT ini muncul di pilihan PT pelaksana milik Admin subholding.
          Laporannya diisi lewat akun Admin subholding, jadi PT tidak butuh akun sendiri.
        </p>
      </section>
      {err ? (
        <p className="mk-note-box mk-soft--late" role="alert">
          {err}
        </p>
      ) : null}
      <div className="mk-sheetactions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button variant="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan PT'}
        </Button>
      </div>
    </>
  )
}
