'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useApp } from '@/components/app-provider'
import { BrandLogo } from '@/components/brand-logo'
import { Avatar, LogoMark } from '@/components/mk'
import { ROLE_LABELS } from '@/lib/constants'
import { initials } from '@/lib/format'

const SHOW_MS = 2400

/**
 * Layar pembuka sekali setiap kali masuk (14 Sep 2026): logo holding sebagai
 * inisiator sistem, lalu siapa yang masuk beserta perusahaannya. Kuncinya
 * waktu masuk terakhir, jadi memuat ulang halaman tidak memunculkannya lagi.
 * Ketuk di mana saja untuk lewat.
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
            exit={{ opacity: 0, transition: { duration: 0.25, ease: [0.4, 0, 1, 1] } }}
            className="mk-splash"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
              className="flex flex-col items-center text-center px-6"
            >
              {initiator ? (
                <BrandLogo name={initiator.name} logoData={initiator.logoData} size={104} tone="slate" />
              ) : (
                <LogoMark size={96} label="Monitor Karya" />
              )}
              <h1 className="t-title-1 mt-6">{initiator?.name ?? 'Monitor Karya'}</h1>
              <p className="t-body text-ink-2 mt-1">Pemantauan kerja berbasis output</p>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.3 }}
                className="mk-card mt-8 flex items-center gap-3 text-left !py-3 !px-4"
              >
                {company ? <BrandLogo name={company.name} logoData={company.logoData} size={40} /> : <Avatar initials={initials(user.name)} size={40} />}
                <div className="min-w-0">
                  <div className="t-caption text-ink-2">Masuk sebagai</div>
                  <div className="t-body-strong truncate">{user.name}</div>
                  <div className="t-footnote text-ink-2 truncate">
                    {roleLabel}
                    {company ? ` · ${company.name}` : ''}
                  </div>
                </div>
              </motion.div>
            </motion.div>
            <div className="absolute bottom-8 t-footnote text-ink-2">Ketuk untuk lanjut</div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
