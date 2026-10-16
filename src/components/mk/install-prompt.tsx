'use client'

/**
 * Ajakan memasang PWA (KONTRAK-FASE1-PWA.md bagian C.5).
 *
 *  - Android/Chrome: `beforeinstallprompt` ditahan lalu dipicu dari tombol
 *    "Pasang".
 *  - iOS Safari di luar mode layar utama: petunjuk Bagikan → Tambah ke Layar
 *    Utama (iOS tidak punya API pemasangan).
 *  - Sudah ditutup ("Nanti") atau terpasang → tidak muncul lagi. Status
 *    disimpan di localStorage `mk:install-prompt`; bila penyimpanan tidak
 *    tersedia (mode privat) status bertahan selama sesi di memori.
 *
 * Integrator memutuskan kapan kartu dipasang (mis. setelah laporan pertama
 * terkirim); kartu sendiri null bila tidak relevan.
 */

import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button, Icon, cx } from './core'

export const INSTALL_KEY = 'mk:install-prompt'

export type InstallStored = 'dismissed' | 'installed'
export type InstallMode = 'prompt' | 'ios'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Status tersimpan; nilai asing/galat → null. */
export function readInstallState(storage: StorageLike | null | undefined): InstallStored | null {
  try {
    const v = storage?.getItem(INSTALL_KEY)
    return v === 'dismissed' || v === 'installed' ? v : null
  } catch {
    return null
  }
}

/** Tulis status; kembalikan false bila penyimpanan menolak. */
export function writeInstallState(storage: StorageLike | null | undefined, value: InstallStored): boolean {
  try {
    if (!storage) return false
    storage.setItem(INSTALL_KEY, value)
    return true
  } catch {
    return false
  }
}

/** iPhone/iPod/iPad, termasuk iPadOS yang mengaku "Macintosh" dengan layar sentuh. */
export function isIosDevice(ua: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return /Macintosh/i.test(ua) && maxTouchPoints > 1
}

/** Safari asli di iOS (bukan Chrome/Firefox/Edge/Opera iOS atau peramban dalam aplikasi). */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  if (!isIosDevice(ua, maxTouchPoints)) return false
  if (!/Safari\//i.test(ua) || !/Version\//i.test(ua)) return false
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|FBAN|FBAV|Instagram|Line\/|WhatsApp/i.test(ua)
}

/** Sudah berjalan sebagai aplikasi terpasang. */
export function isStandalone(navStandalone: boolean | undefined, displayStandalone: boolean): boolean {
  return navStandalone === true || displayStandalone
}

export interface InstallEnv {
  /** Sudah berjalan sebagai aplikasi terpasang. */
  standalone: boolean
  /** Safari iOS (punya "Tambah ke Layar Utama", tanpa API pemasangan). */
  iosSafari: boolean
  /** `beforeinstallprompt` sudah tertangkap. */
  hasPrompt: boolean
  stored: InstallStored | null
}

/** Jenis ajakan yang layak tampil, atau null. */
export function installMode(env: InstallEnv): InstallMode | null {
  if (env.stored || env.standalone) return null
  if (env.hasPrompt) return 'prompt'
  if (env.iosSafari) return 'ios'
  return null
}

/* ---------- Penyimpanan klien (dengan cadangan memori) ---------- */

interface DeferredPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let memory: InstallStored | null = null
let deferred: DeferredPrompt | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function localStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function storedNow(): InstallStored | null {
  return readInstallState(localStore()) ?? memory
}

function remember(value: InstallStored) {
  memory = value
  writeInstallState(localStore(), value)
  notify()
}

/* Chrome menembakkan `beforeinstallprompt` sekali, biasanya saat halaman
 * dimuat — jauh sebelum kartu dipasang. Tangkap di tingkat modul agar tidak
 * terlewat. Bila pengguna sudah menolak, biarkan perilaku bawaan peramban. */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    if (storedNow()) return
    e.preventDefault()
    deferred = e as DeferredPrompt
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    remember('installed')
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === INSTALL_KEY) cb()
  }
  window.addEventListener('storage', onStorage)
  const mq = window.matchMedia?.('(display-mode: standalone)')
  mq?.addEventListener?.('change', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
    mq?.removeEventListener?.('change', cb)
  }
}

/** Mode saat ini sebagai nilai primitif (stabil untuk useSyncExternalStore). */
function snapshot(): InstallMode | 'none' {
  const nav = navigator as Navigator & { standalone?: boolean }
  const display = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return (
    installMode({
      standalone: isStandalone(nav.standalone, display),
      iosSafari: isIosSafari(nav.userAgent, nav.maxTouchPoints),
      hasPrompt: deferred !== null,
      stored: storedNow(),
    }) ?? 'none'
  )
}

export interface InstallPromptState {
  /** Jenis ajakan yang tampil; null = jangan tampil. */
  mode: InstallMode | null
  /** Picu dialog pasang bawaan (hanya mode 'prompt'). */
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
  /** "Nanti": jangan tampilkan lagi. */
  dismiss: () => void
}

async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferred
  if (!ev) return 'unavailable'
  deferred = null // event hanya bisa dipakai sekali
  try {
    await ev.prompt()
    const { outcome } = await ev.userChoice
    remember(outcome === 'accepted' ? 'installed' : 'dismissed')
    return outcome
  } catch {
    remember('dismissed')
    return 'dismissed'
  }
}

const dismiss = () => remember('dismissed')

export function useInstallPrompt(): InstallPromptState {
  const snap = React.useSyncExternalStore(subscribe, snapshot, () => 'none' as const)
  return { mode: snap === 'none' ? null : snap, install, dismiss }
}

/* ---------- Kartu ---------- */

export function InstallPrompt({ className }: { className?: string }) {
  const { mode, install, dismiss } = useInstallPrompt()
  const reduce = useReducedMotion() ?? false
  const titleId = React.useId()
  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 8 },
        transition: { type: 'spring' as const, bounce: 0, duration: 0.4 },
      }

  return (
    <AnimatePresence initial={false}>
      {mode ? (
        <motion.section
          key="pasang"
          aria-labelledby={titleId}
          {...motionProps}
          className={cx('flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]', className)}
        >
          <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-[var(--radius-md)] bg-accent-fill text-on-accent">
            <Icon name="unduh" size={20} strokeWidth={2.2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id={titleId} className="m-0 t-headline text-ink">
              Pasang Monitor Karya di layar utama
            </h2>
            {mode === 'prompt' ? (
              <p className="m-0 t-footnote text-ink-2">Buka lebih cepat dalam layar penuh, tanpa bilah peramban.</p>
            ) : (
              <p className="m-0 t-footnote text-ink-2">
                Ketuk{' '}
                <span className="inline-flex items-baseline gap-0.5 font-semibold text-ink">
                  <Icon name="unggah" size={14} strokeWidth={2.2} className="self-center" />
                  Bagikan
                </span>{' '}
                di bilah Safari, lalu pilih <span className="font-semibold text-ink">Tambah ke Layar Utama</span>.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {mode === 'prompt' ? (
                <Button variant="primary" size="sm" onClick={() => void install()}>
                  Pasang
                </Button>
              ) : null}
              <Button variant="plain" size="sm" onClick={dismiss}>
                Nanti
              </Button>
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  )
}
