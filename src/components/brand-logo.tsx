'use client'

import { cn } from '@/lib/utils'

/**
 * Logo perusahaan (14 Sep 2026): gambar yang diunggah Super Admin, atau
 * monogram dari nama bila belum ada. Dipakai splash, navbar, menu akun,
 * halaman masuk, dan Pengaturan supaya rupanya sama di mana pun.
 */
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
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }
  if (logoData) {
    return (
      <img
        src={logoData}
        alt={`Logo ${name}`}
        width={size}
        height={size}
        style={style}
        className={cn(radius, 'object-contain bg-white ring-1 ring-black/5 dark:ring-white/10 p-[6%] shrink-0 animate-fade-in', className)}
      />
    )
  }
  return (
    <div
      aria-label={name}
      style={style}
      className={cn(
        radius,
        'flex items-center justify-center font-bold text-white shrink-0 shadow-glow-blue',
        tone === 'slate' ? 'bg-gradient-to-br from-slate-700 to-slate-900' : 'bg-gradient-to-br from-blue-600 to-cyan-500',
        className
      )}
    >
      {initialsOf(name)}
    </div>
  )
}
