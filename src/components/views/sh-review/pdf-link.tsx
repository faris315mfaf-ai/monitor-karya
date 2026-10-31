'use client'

/**
 * Tombol "Lihat PDF" untuk satu laporan (GET /api/sh/pdf?id=…). Membuka PDF di
 * tab baru: penampil bawaan peramban sudah menyediakan unduh, bagikan, dan cetak.
 * Laporan yang belum disetujui diberi tanda air DRAF oleh server.
 */

import { Icon, cx } from '@/components/mk'
import { shPdfHref } from '@/lib/subholding/pdf-href'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'

export function PdfLink({ reportId, title, className }: { reportId: string; title: string; className?: string }) {
  return (
    <a
      href={shPdfHref({ id: reportId })}
      target="_blank"
      rel="noopener"
      aria-label={`Lihat PDF laporan ${title} (tab baru)`}
      className={cx(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] bg-fill-1 px-3 t-footnote font-semibold text-ink no-underline',
        'motion-safe:transition-[transform,background-color] motion-safe:duration-[var(--dur-fast)] motion-safe:ease-[var(--ease-standard)] motion-safe:active:scale-[0.97] active:bg-fill-2',
        FOCUS,
        className
      )}
    >
      <Icon name="dokumen" size={16} strokeWidth={2.2} className="text-accent" />
      Lihat PDF
    </a>
  )
}
