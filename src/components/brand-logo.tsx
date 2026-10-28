'use client'

import { cn } from '@/lib/utils'

/**
 * Logo perusahaan (14 Sep 2026): gambar yang diunggah Super Admin, atau
 * monogram dari nama bila belum ada. Dipakai splash, kerangka aplikasi,
 * halaman masuk, dan Pengaturan supaya rupanya sama di mana pun.
 */
/**
 * Logo PT. BIKE Tbk (28 Okt 2026) — dipakai untuk holding selama Super Admin
 * belum mengunggah logo sendiri. Berkas dibangkitkan scripts/buat-ikon-merek.mjs.
 */
export const LOGO_HOLDING = '/brand/pt-bike-logo.png'

/** Rasio sisi logo bawaan (472 × 273 px setelah dipangkas). */
const RASIO_LOGO_HOLDING = 472 / 273

/**
 * Logo holding di halaman masuk dan layar pembuka. Logo unggahan Super Admin
 * tetap di kotak [BrandLogo]; logo bawaan PT. BIKE Tbk berbentuk melebar
 * (sayap) sehingga tampil utuh tanpa kotak, setinggi [height] piksel.
 */
export function HoldingLogo({
  name,
  logoData,
  height,
  className,
}: {
  name: string
  logoData?: string | null
  height: number
  className?: string
}) {
  if (logoData) return <BrandLogo name={name} logoData={logoData} size={height} tone="slate" className={className} />
  const width = Math.round(height * RASIO_LOGO_HOLDING)
  return (
    <img
      src={LOGO_HOLDING}
      alt={`Logo ${name}`}
      width={width}
      height={height}
      style={{ width, height }}
      className={cn('shrink-0 object-contain select-none', className)}
      draggable={false}
    />
  )
}

export function initialsOf(name: string): string {
  // "PT. BIKE Tbk" -> BT, "PT Ratu Karya" -> RK, "PT Sigma" -> SI.
  const words = name.replace(/^(PT\.?|Holding|Bpk\.|Ibu)\s+/i, '').split(' ').filter(Boolean)
  const mono = words.length === 1 ? words[0].slice(0, 2) : words.slice(0, 2).map((w) => w[0]).join('')
  return mono.toUpperCase() || '?'
}

export function BrandLogo({
  name,
  logoData,
  size = 40,
  tone = 'blue',
  className,
}: {
  name: string
  logoData?: string | null
  /** Sisi kotak dalam piksel. */
  size?: number
  tone?: 'blue' | 'slate'
  className?: string
}) {
  const radius = size >= 96 ? 'rounded-3xl' : size >= 48 ? 'rounded-2xl' : 'rounded-xl'
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)), borderRadius: Math.round(size * 0.28) }
  if (logoData) {
    return (
      <img
        src={logoData}
        alt={`Logo ${name}`}
        width={size}
        height={size}
        style={style}
        className={cn(radius, 'object-contain bg-[var(--putih)] p-[6%] shrink-0 shadow-[0_0_0_1px_var(--line)]', className)}
      />
    )
  }
  return (
    <div
      aria-label={name}
      style={{ ...style, background: tone === 'slate' ? 'var(--grad-malam)' : 'var(--kilau), var(--accent-grad)' }}
      className={cn(
        radius,
        'flex items-center justify-center font-bold shrink-0',
        tone === 'slate' ? 'text-[var(--putih)]' : 'text-on-accent',
        className
      )}
    >
      {initialsOf(name)}
    </div>
  )
}
