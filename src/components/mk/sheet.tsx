'use client'

/**
 * Detail selalu dibuka di Sheet, tidak pindah halaman (12 · Perangkat & navigasi):
 * desktop = sheet samping 440 di atas scrim, tablet = form sheet di tengah,
 * ponsel = layar penuh didorong dari kanan dengan header kaca + tombol menempel di bawah.
 *
 * Aksesibilitas (09 · Aksesibilitas): role="dialog" + aria-modal, dilabeli judul;
 * saat dibuka fokus pindah ke judul (kecuali isian ber-autoFocus), fokus terkunci di
 * dalam sheet, Esc dan klik scrim menutup, lalu fokus kembali ke pemicu (baris asal).
 * Di ponsel: tombol "Kembali" kiri atas dan geser dari tepi kiri untuk menutup.
 */

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { IconButton, cx } from './core'

/** Lebar zona tepi kiri (px) tempat gestur geser-kembali dimulai di ponsel. */
const EDGE = 24
/** Jarak geser minimum (px) untuk menutup. */
const SWIPE = 72

export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  eyebrow,
  footer,
  children,
  backLabel = 'Kembali',
  size = 'default',
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  eyebrow?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
  /** Label tombol kembali di ponsel, mis. "Proyek". */
  backLabel?: string
  /** `wide` untuk detail yang memuat daftar atau formulir panjang (640 px di desktop). */
  size?: 'default' | 'wide'
  className?: string
}) {
  const titleRef = React.useRef<HTMLHeadingElement>(null)
  const swipe = React.useRef<{ x: number; y: number } | null>(null)

  // Pemicu dicatat saat sheet berganti ke terbuka (sebelum commit), supaya fokus bisa
  // kembali ke baris asal walau isi sheet memindahkan fokus lewat autoFocus.
  // [F4-A] Sheet yang dipasang langsung dalam keadaan terbuka (`{open && <Sheet open />}`)
  // tidak pernah berganti ke terbuka, jadi pemicunya dicatat saat pertama dipasang.
  const [trigger, setTrigger] = React.useState<HTMLElement | null>(() => {
    if (!open || typeof document === 'undefined') return null
    const el = document.activeElement
    return el instanceof HTMLElement && el !== document.body ? el : null
  })
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open && typeof document !== 'undefined') {
      const el = document.activeElement
      setTrigger(el instanceof HTMLElement && el !== document.body ? el : null)
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    if (!t || e.touches.length > 1) return
    if (t.clientX <= EDGE && window.matchMedia('(max-width: 599px)').matches) swipe.current = { x: t.clientX, y: t.clientY }
    else swipe.current = null
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = swipe.current
    swipe.current = null
    const t = e.changedTouches[0]
    if (!s || !t) return
    const dx = t.clientX - s.x
    const dy = Math.abs(t.clientY - s.y)
    if (dx >= SWIPE && dy < dx * 0.6) onOpenChange(false)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mk-scrim" />
        <DialogPrimitive.Content
          className={cx('mk-sheet mk-sheet--responsive', size === 'wide' && 'mk-sheet--wide', className)}
          aria-describedby={undefined}
          aria-modal="true"
          onOpenAutoFocus={(e) => {
            // Fokus ke judul, bukan tombol pertama: pembaca layar mulai dari nama sheet.
            if (!titleRef.current) return
            e.preventDefault()
            titleRef.current.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(e) => {
            if (trigger && trigger.isConnected) {
              e.preventDefault()
              trigger.focus({ preventScroll: true })
            }
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => {
            swipe.current = null
          }}
        >
          <div className="mk-sheet__phonebar">
            <DialogPrimitive.Close asChild>
              <button type="button" className="mk-sheet__back">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m15 6-6 6 6 6" />
                </svg>
                {backLabel}
              </button>
            </DialogPrimitive.Close>
          </div>
          <header className="mk-sheet__head">
            <div className="mk-sheet__titles">
              {eyebrow ? <div className="mk-sheet__eyebrow">{eyebrow}</div> : null}
              <DialogPrimitive.Title ref={titleRef} tabIndex={-1} className="mk-sheet__title">
                {title}
              </DialogPrimitive.Title>
              {subtitle ? <p className="mk-sheet__sub">{subtitle}</p> : null}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton icon="tutup" label="Tutup" variant="filled" className="mk-sheet__close" />
            </DialogPrimitive.Close>
          </header>
          <div className="mk-sheet__body">{children}</div>
          {footer ? <footer className="mk-sheet__foot">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
