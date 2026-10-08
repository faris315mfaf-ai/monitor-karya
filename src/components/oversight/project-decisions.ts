'use client'

/**
 * [F2-DIREKTUR] Persetujuan pengajuan proyek di antrean keputusan (slot rantai
 * persetujuan milik akun ini). Menyetujui lewat POST /api/projects/approve;
 * menolak butuh alasan di modul Proyek, jadi tombol kedua = "Tinjau".
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import { toastWithUndo } from '@/lib/undo-client'

export function useProjectDecisions(reload?: () => void) {
  const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function approve(id: string) {
    setBusy(id)
    try {
      const res = await fetch('/api/projects/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, decision: 'DISETUJUI' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Persetujuan belum tersimpan. Coba lagi.')
      } else {
        setDecided((d) => ({ ...d, [id]: 'approved' }))
        refreshNavBadges()
        // Urungkan lewat tiket /api/undo [F2-URUNGKAN]; tanpa tiket toast tampil tanpa tombol.
        toastWithUndo('Pengajuan proyek disetujui.', json.undoToken, () => {
          setDecided((d) => {
            const next = { ...d }
            delete next[id]
            return next
          })
          refreshNavBadges()
          reload?.()
        })
        reload?.()
      }
    } catch {
      toast.error('Server tidak terjangkau. Coba lagi.')
    } finally {
      setBusy(null)
    }
  }

  return { decided, busy, approve }
}

export type ProjectDecisions = ReturnType<typeof useProjectDecisions>
