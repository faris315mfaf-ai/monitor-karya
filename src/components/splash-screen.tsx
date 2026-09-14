'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useApp } from '@/components/app-provider'
import { BrandLogo, initialsOf } from '@/components/brand-logo'
import { ROLE_LABELS } from '@/lib/constants'

const SHOW_MS = 2800

/**
 * Layar pembuka sekali setiap kali masuk (14 Sep 2026): logo holding sebagai
 * inisiator sistem, lalu siapa yang masuk beserta logo perusahaannya.
 * Kuncinya waktu masuk terakhir, jadi memuat ulang halaman tidak
 * memunculkannya lagi; masuk berikutnya iya. Ketuk di mana saja untuk lewat.
 */
export function SplashScreen() {
  const { user, branding } = useApp()
  const [visible, setVisible] = useState(false)
  const key = `mk-splash:${user.id}:${branding.lastLoginAt ?? 'sesi'}`

  useEffect(() => {
    let seen = true
    try {
      seen = window.localStorage.getItem(key) === '1'
    } catch {}
    if (seen) return
    try {
      // Buang kunci masuk sebelumnya milik akun ini supaya localStorage tidak menumpuk.
      const prefix = `mk-splash:${user.id}:`
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith(prefix) && k !== key)
        .forEach((k) => window.localStorage.removeItem(k))
      window.localStorage.setItem(key, '1')
    } catch {}
    const show = window.setTimeout(() => setVisible(true), 0)
    const hide = window.setTimeout(() => setVisible(false), SHOW_MS)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [key, user.id])

  const initiator = branding.holding
  const company = branding.entity ?? branding.holding
  const roleLabel = ROLE_LABELS[user.role] ?? user.role

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {visible && (
          <motion.div
            key="splash"
            role="dialog"
            aria-label="Selamat datang"
            onClick={() => setVisible(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeIn' } }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white cursor-pointer select-none"
          >
            {/* Kilau lembut di belakang logo */}
            <div className="absolute h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />

            <motion.div
              initial={{ scale: 0.86, opacity: 0, y: 14 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }}
              className="relative flex flex-col items-center text-center px-6"
            >
              {initiator ? (
                <BrandLogo name={initiator.name} logoData={initiator.logoData} size={120} tone="slate" className="shadow-2xl ring-4 ring-white/10" />
              ) : (
                <div className="h-[120px] w-[120px] rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 flex items-center justify-center text-4xl font-bold shadow-2xl">MK</div>
              )}
              <div className="mt-6 text-[11px] uppercase tracking-[0.25em] text-cyan-200/80">Inisiator · Holding</div>
              <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">{initiator?.name ?? 'MonitorKarya'}</h1>
              <p className="mt-1 text-sm text-white/60">Sistem pemantauan bisnis holding</p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="mt-8 flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur px-4 py-3 text-left"
              >
                {company ? (
                  <BrandLogo name={company.name} logoData={company.logoData} size={44} />
                ) : (
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center font-bold text-white" style={{ background: user.avatarColor ?? '#2563eb' }}>
                    {initialsOf(user.name)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-white/60">Masuk sebagai</div>
                  <div className="text-base font-semibold leading-tight truncate">{user.name}</div>
                  <div className="text-[13px] text-white/70 truncate">
                    {roleLabel}
                    {company ? ` · ${company.name}` : ''}
                  </div>
                </div>
              </motion.div>
            </motion.div>

            <div className="absolute bottom-10 h-1 w-40 overflow-hidden rounded-full bg-white/15">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: SHOW_MS / 1000, ease: 'linear' }}
                className="h-full bg-cyan-300"
              />
            </div>
            <div className="absolute bottom-4 text-xs text-white/50">Ketuk untuk lanjut</div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
