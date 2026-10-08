'use client'

/**
 * Bagian bersama modul Perusahaan & akun: logo, pemilih logo, kolom form,
 * sakelar, dan konfirmasi untuk tindakan yang tidak bisa dibatalkan.
 */

import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/mk/confirm-dialog'
import { Switch } from '@/components/mk/forms'
import { Avatar, Button, Icon, cx, type IconName, type Tone } from '@/components/mk'
import { initialsOf, type Company, type UserRow } from '@/lib/accounts'

/* ---------- Identitas visual ---------- */

export function CompanyLogo({
  company,
  size = 48,
}: {
  company: Pick<Company, 'name' | 'logoData' | 'type'>
  size?: number
}) {
  const radius = Math.round(size * 0.26)
  if (company.logoData) {
    return (
      <img
        src={company.logoData}
        alt={`Logo ${company.name}`}
        width={size}
        height={size}
        className="mk-colog mk-colog--img"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    )
  }
  return (
    <span
      className={cx('mk-colog', company.type === 'HOLDING' ? 'mk-colog--holding' : 'mk-colog--pt')}
      style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initialsOf(company.name)}
    </span>
  )
}

/** Nada avatar = warna perusahaan (urutan), akun grup = aksen. */
export function UserAvatar({ user, tone = 'accent', size = 36 }: { user: Pick<UserRow, 'name'>; tone?: Tone; size?: number }) {
  return <Avatar initials={initialsOf(user.name)} tone={tone} size={size} name={user.name} />
}

/* ---------- Kolom form ---------- */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: React.ReactNode
  htmlFor?: string
  hint?: React.ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cx('mk-field', className)}>
      <label htmlFor={htmlFor} className="mk-field__label">
        {label}
        {required ? <span className="mk-field__req" aria-hidden> wajib</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mk-field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mk-field__hint">{hint}</p>
      ) : null}
    </div>
  )
}

export const selectCls = 'mk-select'

/** Baris sakelar: judul + penjelasan + role="switch". */
export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  id,
}: {
  title: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  id: string
}) {
  return (
    <div className="mk-switchrow">
      <div className="min-w-0">
        <label htmlFor={id} className="t-body-strong block">
          {title}
        </label>
        {description ? <p className="t-footnote text-ink-2">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

/** Judul bagian di dalam sheet. */
export function SectionTitle({ icon, children, action }: { icon?: IconName; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mk-sectitle">
      <h3 className="t-headline flex items-center gap-2">
        {icon ? <Icon name={icon} size={18} className="text-ink-2" /> : null}
        {children}
      </h3>
      {action}
    </div>
  )
}

/** Baris info ikon + teks di kartu & ringkasan perusahaan. */
export function InfoLine({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="mk-infoline">
      <Icon name={icon} size={16} className="text-ink-3 shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  )
}

/* ---------- Logo ---------- */

/** Menyusutkan gambar ke ≤ 256 px lalu mengembalikannya sebagai data URL PNG. */
export function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      if (file.size > 150_000) return reject(new Error('SVG terlalu besar, maksimal 150 KB.'))
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Berkas belum terbaca. Coba lagi.'))
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
      if (!ctx) return reject(new Error('Browser ini tidak mendukung kanvas.'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Berkas ini bukan gambar yang dikenali.'))
    }
    img.src = url
  })
}

export function LogoPicker({
  value,
  name,
  type,
  onChange,
  disabled,
}: {
  value: string | null
  name: string
  type: 'HOLDING' | 'PT'
  onChange: (v: string | null) => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  async function take(f: File | undefined) {
    if (!f) return
    setErr(null)
    try {
      onChange(await shrinkImage(f))
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Logo belum termuat.')
    } finally {
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div
      className={cx('mk-logopick', over && 'is-over')}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void take(e.dataTransfer.files?.[0])
      }}
    >
      <CompanyLogo company={{ name: name || 'Perusahaan', logoData: value, type }} size={72} />
      <div className="flex flex-col gap-2 min-w-0">
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="mk-sr"
          onChange={(e) => void take(e.target.files?.[0])}
          aria-label="Pilih berkas logo"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="unggah" disabled={disabled} onClick={() => ref.current?.click()}>
            {value ? 'Ganti logo' : 'Unggah logo'}
          </Button>
          {value ? (
            <Button size="sm" variant="plain" disabled={disabled} onClick={() => onChange(null)}>
              Hapus logo
            </Button>
          ) : null}
        </div>
        <p className="t-footnote text-ink-2">Seret gambar ke sini, atau unggah PNG, JPEG, WebP, SVG. Disusutkan otomatis ke 256 px.</p>
        {err ? <p className="t-footnote text-bahaya">{err}</p> : null}
      </div>
    </div>
  )
}

/* ---------- Konfirmasi ---------- */

type ConfirmOpts = {
  title: string
  description: React.ReactNode
  confirmLabel: string
  destructive?: boolean
}

/**
 * Konfirmasi hanya untuk tindakan yang benar-benar tidak bisa dibatalkan
 * (hapus). Tindakan yang bisa dibalik memakai notifikasi "Urungkan".
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)

  const [open, setOpen] = useState(false)
  const ask = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => { setState({ ...opts, resolve }); setOpen(true) }),
    []
  )

  const close = (v: boolean) => {
    state?.resolve(v)
    setOpen(false)
  }

  const element = (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => !o && close(false)}
      title={state?.title}
      description={state?.description}
      confirmLabel={state?.confirmLabel}
      destructive={state?.destructive}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  )

  return [element, ask] as const
}

/* ---------- Kata sandi ---------- */

/** Kata sandi acak yang mudah dibacakan: tanpa huruf/angka yang mirip. */
export function generatePassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const buf = new Uint32Array(len)
  crypto.getRandomValues(buf)
  return Array.from(buf, (n) => chars[n % chars.length]).join('')
}
