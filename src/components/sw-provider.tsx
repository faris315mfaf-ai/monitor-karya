'use client'

/**
 * Pemasangan service worker + indikator koneksi (8 Okt 2026, keputusan pemilik:
 * aplikasi tetap bisa dipakai sementara saat luring).
 *
 *  - SW hanya dipasang di produksi: cache dev bikin pengembangan membingungkan.
 *  - Saat koneksi putus: toast menerangkannya sekali (data terakhir masih
 *    terbaca; kirim menunggu daring). Saat kembali daring: toast singkat.
 *  - Tidak ada antrean tulis saat luring — tenggat 17.00 WIB, pembekuan, dan
 *    konflik 409 wajib divalidasi server saat kirim (lihat public/sw.js).
 */

import { useEffect } from 'react'
import { toast } from 'sonner'

const TOAST_LURING = 'mk-luring'

export function SwProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* Pendaftaran gagal (mis. peramban lama): aplikasi tetap daring-penuh. */
      })
    }

    function saatLuring() {
      toast('Anda sedang luring', {
        id: TOAST_LURING,
        description: 'Halaman yang pernah dibuka masih bisa dibaca. Pengiriman laporan menunggu koneksi kembali.',
        duration: Infinity,
      })
    }
    function saatDaring() {
      toast.dismiss(TOAST_LURING)
      toast.success('Koneksi kembali. Data terbaru dimuat saat halaman dibuka ulang.')
    }

    if (typeof window === 'undefined') return
    if (!navigator.onLine) saatLuring()
    window.addEventListener('offline', saatLuring)
    window.addEventListener('online', saatDaring)
    return () => {
      window.removeEventListener('offline', saatLuring)
      window.removeEventListener('online', saatDaring)
    }
  }, [])

  return null
}
