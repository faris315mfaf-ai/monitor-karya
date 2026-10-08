'use client'

import { useEffect, useState } from 'react'

/** Nama event yang boleh dikirim layar mana pun agar badge nav dihitung ulang. */
export const NAV_BADGES_EVENT = 'mk:nav-badges'

/** Minta badge nav dihitung ulang, mis. setelah laporan harian terkirim. */
export function refreshNavBadges() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NAV_BADGES_EVENT))
}

/**
 * Angka di samping item navigasi (05-pic-proyek.md): "Laporan harian 1" untuk
 * PIC, hilang setelah laporan hari ini terkirim. Dihitung ulang saat tab
 * berpindah, saat jendela kembali fokus, lewat `refreshNavBadges()`, dan
 * berkala — lebih rapat selama tab Laporan harian terbuka.
 */
export function useNavBadges(role: string, activeTab: string): Record<string, number> {
  const [badges, setBadges] = useState<Record<string, number>>({})
  const [tick, setTick] = useState(0)
  // [F2-DIREKTUR] Pengawas juga: Eskalasi / Laporan mingguan (tab Divisi) / Persetujuan.
  const enabled = role === 'PIC_PROYEK' || ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN'].includes(role)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetch('/api/nav-badges')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { badges?: Record<string, number> } | null) => {
        if (!cancelled && j?.badges) setBadges(j.badges)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled, activeTab, tick])

  useEffect(() => {
    if (!enabled) return
    const bump = () => setTick((v) => v + 1)
    const t = setInterval(bump, activeTab === 'daily-input' ? 15000 : 60000)
    window.addEventListener(NAV_BADGES_EVENT, bump)
    window.addEventListener('focus', bump)
    return () => {
      clearInterval(t)
      window.removeEventListener(NAV_BADGES_EVENT, bump)
      window.removeEventListener('focus', bump)
    }
  }, [enabled, activeTab])

  return enabled ? badges : {}
}
