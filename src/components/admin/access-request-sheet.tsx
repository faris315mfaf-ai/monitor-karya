'use client'

/**
 * Formulir "Ajukan permintaan akses" di dalam Sheet. Tiga jenis: akun baru,
 * pindah peran, akses sementara. Kata sandi tidak pernah ikut permintaan;
 * akun baru memakai sandi awal yang bisa disetel ulang di meja akun.
 */

import { ChoiceGroup } from '@/components/mk/forms'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/mk/forms'
import { Textarea } from '@/components/mk/forms'
import { Button, Sheet, cx } from '@/components/mk'
import { Field, selectCls } from '@/components/companies/parts'
import { positionsFor, roleLabel, type CompaniesData } from '@/lib/accounts'
import { ACCESS_REQUEST_LABELS, MAX_TEMP_ACCESS_DAYS, type AccessRequestItem, type AccessRequestType } from '@/lib/admin-meta'
import { send, useFetch } from './use-fetch'

const HINTS: Record<AccessRequestType, string> = {
  AKUN_BARU: 'Orang baru yang perlu masuk ke aplikasi',
  PINDAH_PERAN: 'Mengganti peran akun yang sudah ada',
  AKSES_SEMENTARA: 'Peran atau akun aktif untuk jangka waktu tertentu',
}

export function AccessRequestSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (item: AccessRequestItem) => void
}) {
  const { data } = useFetch<CompaniesData>(open ? '/api/companies?for=access' : null)
  const [type, setType] = useState<AccessRequestType>('AKUN_BARU')
  const [companyId, setCompanyId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState('PIC_PROYEK')
  const [divisionId, setDivisionId] = useState('')
  const [userId, setUserId] = useState('')
  const [days, setDays] = useState('30')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const companies = useMemo(() => (data?.companies ?? []).filter((c) => c.type === 'PT'), [data])
  const company = companies.find((c) => c.id === companyId) ?? companies[0] ?? null
  const users = (company?.users ?? []).filter((u) => u.id !== data?.me)
  const roles = positionsFor(company)

  function reset() {
    setName('')
    setEmail('')
    setTitle('')
    setUserId('')
    setDivisionId('')
    setReason('')
    setDays('30')
    setErr(null)
  }

  async function submit() {
    setErr(null)
    let payload: Record<string, unknown>
    if (type === 'AKUN_BARU') {
      if (!name.trim()) return setErr('Nama pemilik akun wajib diisi.')
      payload = { name: name.trim(), role, email: email.trim() || undefined, title: title.trim() || undefined, divisionId: divisionId || undefined }
    } else {
      if (!userId) return setErr('Pilih akun yang dimaksud.')
      if (type === 'PINDAH_PERAN') payload = { userId, role, divisionId: role === 'KEPALA_DIVISI' && divisionId ? divisionId : undefined }
      else {
        const n = parseInt(days, 10)
        if (!Number.isFinite(n) || n < 1 || n > MAX_TEMP_ACCESS_DAYS) return setErr(`Lama akses 1–${MAX_TEMP_ACCESS_DAYS} hari.`)
        payload = { userId, days: n, role: role === '__same__' ? undefined : role }
      }
    }
    setSaving(true)
    const r = await send('/api/access-requests', 'POST', { type, payload, reason: reason.trim() || undefined, entityId: company?.id })
    setSaving(false)
    if (!r.ok) return setErr(r.error)
    onCreated(r.json.item as AccessRequestItem)
    toast.success('Permintaan diajukan. Tercatat di log aktivitas.')
    reset()
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ajukan permintaan akses"
      subtitle={company ? company.name : 'Perubahan peran dan akses selalu lewat persetujuan'}
      backLabel="Permintaan akses"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Mengajukan…' : 'Ajukan permintaan'}
          </Button>
        </>
      }
    >
      <div className="mk-formsec">
        <ChoiceGroup aria-label="Jenis permintaan">
          {(Object.keys(ACCESS_REQUEST_LABELS) as AccessRequestType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              className={cx('mk-choice', type === t && 'is-on')}
              onClick={() => {
                setType(t)
                setErr(null)
                if (t === 'AKSES_SEMENTARA') setRole('__same__')
                else if (role === '__same__') setRole('PIC_PROYEK')
              }}
            >
              <span className="mk-choice__radio" aria-hidden />
              <span>
                <span className="mk-choice__title">{ACCESS_REQUEST_LABELS[t]}</span>
                <span className="mk-choice__hint">{HINTS[t]}</span>
              </span>
            </button>
          ))}
        </ChoiceGroup>

        {companies.length > 1 ? (
          <Field label="Perusahaan" htmlFor="ar-company">
            <select id="ar-company" className={selectCls} value={company?.id ?? ''} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="mk-formgrid">
          {type === 'AKUN_BARU' ? (
            <>
              <Field label="Nama lengkap" htmlFor="ar-name" required className="is-full">
                <Input id="ar-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Galih Pratama" autoComplete="off" />
              </Field>
              <Field label="Email" htmlFor="ar-email" hint="Kosongkan untuk dibuat otomatis">
                <Input id="ar-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Jabatan" htmlFor="ar-title">
                <Input id="ar-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Staf operasional" />
              </Field>
            </>
          ) : (
            <Field label="Akun" htmlFor="ar-user" required className="is-full">
              <select id="ar-user" className={selectCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Pilih akun</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {roleLabel(u.role)}
                    {u.isActive ? '' : ' · nonaktif'}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label={type === 'AKSES_SEMENTARA' ? 'Peran sementara' : type === 'PINDAH_PERAN' ? 'Peran tujuan' : 'Peran'} htmlFor="ar-role">
            <select id="ar-role" className={selectCls} value={role} onChange={(e) => setRole(e.target.value)}>
              {type === 'AKSES_SEMENTARA' ? <option value="__same__">Tetap peran sekarang, aktifkan akun</option> : null}
              {roles.map((o) => (
                <option key={o.role} value={o.role}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          {type === 'AKSES_SEMENTARA' ? (
            <Field label="Lama akses (hari)" htmlFor="ar-days" hint={`Dicabut otomatis setelahnya, maks ${MAX_TEMP_ACCESS_DAYS} hari`}>
              <Input id="ar-days" type="number" inputMode="numeric" min={1} max={MAX_TEMP_ACCESS_DAYS} value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
          ) : (type === 'AKUN_BARU' || role === 'KEPALA_DIVISI') && company?.divisions.length ? (
            <Field label="Divisi" htmlFor="ar-division">
              <select id="ar-division" className={selectCls} value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                <option value="">Tanpa divisi</option>
                {company.divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label="Alasan" htmlFor="ar-reason" className="is-full" error={err}>
            <Textarea id="ar-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Bergabung di proyek gudang mulai Senin" maxLength={500} />
          </Field>
        </div>
      </div>
    </Sheet>
  )
}
