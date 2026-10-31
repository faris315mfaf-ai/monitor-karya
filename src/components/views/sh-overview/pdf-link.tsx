'use client'

/**
 * Tautan "Lihat PDF" laporan subholding (GET /api/sh/pdf, alamat dari
 * `shPdfHref`). Selalu `<a>` yang membuka tab baru — berkasnya dibuat server,
 * jadi bukan tombol. Gaya memakai kelas tombol sistem desain (mk-btn).
 */

import { Icon, cx } from '@/components/mk'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'

/** Tombol teks "Lihat PDF …" (ikon dokumen di kiri). */
export function PdfButton({
  href,
  children = 'Lihat PDF',
  variant = 'primary',
  size = 'md',
  full,
  className,
}: {
  href: string
  children?: React.ReactNode
  variant?: 'primary' | 'secondary'
  size?: 'md' | 'lg'
  full?: boolean
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx('mk-btn', `mk-btn--${variant}`, `mk-btn--${size}`, full && 'mk-btn--full', 'h-auto! min-h-11 whitespace-normal! py-2 text-center no-underline', FOCUS, className)}
    >
      <Icon name="dokumen" size={18} strokeWidth={2} />
      <span>{children}</span>
      <span className="sr-only"> (tab baru)</span>
    </a>
  )
}

/** Tautan ikon PDF (target sentuh 44px) di ujung baris daftar. */
export function PdfIconLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (tab baru)`}
      title={label}
      className={cx(
        'inline-flex h-11 w-11 flex-none items-center justify-center rounded-full bg-fill-1 text-ink-2 no-underline hover:bg-fill-2 hover:text-ink',
        'motion-safe:transition-colors motion-safe:duration-[var(--dur-base)]',
        FOCUS,
        className,
      )}
    >
      <Icon name="dokumen" size={18} strokeWidth={2} />
    </a>
  )
}
