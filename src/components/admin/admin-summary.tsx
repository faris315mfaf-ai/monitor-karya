'use client'

/**
 * Ringkasan Admin PT [F2-ADMIN] — diperkecil sesuai keputusan pemilik 9 Okt 2026.
 * Isi cukup: satu kalimat jawaban (diterima vs diteruskan), dua StatTile dari
 * /api/inbox, dan satu tombol penuh "Teruskan laporan ke Direksi" yang
 * meneruskan semua laporan siap (harian lalu mingguan) lewat POST /api/inbox.
 * Rincian per laporan, kepatuhan, permintaan akses, dan log ada di tab lain.
 * Dipanggil oleh AdminDashboard di src/components/views/role-dashboards.tsx.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button, ErrorNote, Hero, Skeleton, StatTile } from '@/components/mk'
import { SearchButton } from '@/components/search/command-palette'
import { DashHeader } from '@/components/views/dash-common'
import { useConfirm } from '@/components/companies/parts'
import type { AdminData } from '@/components/views/role-dashboards'
import { requestUndo, UNDO_TOAST_MS } from '@/lib/undo-client'
import { useFetch } from '@/hooks/use-fetch'

type ReportRow = {
  reportId: string | null
  submittedAt: string | null
  forwardedAt: string | null
  readyToForward: boolean
}

type InboxData = {
  daily: ReportRow[]
  weekly: ReportRow[]
}

/** Kerangka memuat seukuran layar baru: satu baris jawaban dan dua angka. */
function SummarySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Memuat ringkasan">
      <Skeleton h={36} w="75%" r={12} />
      <Skeleton h={110} r={14} />
    </div>
  )
}

/**
 * Toast hasil penerusan massal: satu pesan ringkas dengan satu tombol
 * "Urungkan" yang mengurungkan semua tiket yang terbit (pola toastWithUndo
 * inbox-view, diperluas untuk banyak tiket).
 */
function toastForwardResult(message: string, tokens: string[], onUndone: () => void) {
  if (!tokens.length) {
    toast.success(message)
    return
  }
  toast.success(message, {
    duration: UNDO_TOAST_MS,
    action: {
      label: 'Urungkan',
      onClick: async () => {
        const results = await Promise.all(tokens.map((token) => requestUndo(token)))
        if (results.every((r) => r.ok)) {
          toast.success(`${results.length} penerusan diurungkan.`)
        } else {
          toast.error('Sebagian penerusan belum bisa diurungkan. Coba lagi.')
        }
        onUndone()
      },
    },
  })
}

export function AdminSummary({ data }: { data: AdminData }) {
  const [confirmEl, confirm] = useConfirm()
  const inbox = useFetch<InboxData>('/api/inbox')
  const [sending, setSending] = useState(false)

  const rows = inbox.data
  // Harian siap + sudah diteruskan = semua yang dikirim PIC; mingguan = yang diserahkan kadiv.
  const dailyIn = rows?.daily.filter((d) => d.submittedAt).length ?? 0
  const weeklyIn = rows?.weekly.filter((w) => w.submittedAt).length ?? 0
  const received = dailyIn + weeklyIn
  const forwarded = rows
    ? rows.daily.filter((d) => d.forwardedAt).length + rows.weekly.filter((w) => w.forwardedAt).length
    : 0
  const ready = rows
    ? [
        ...rows.daily.filter((d) => d.readyToForward && d.reportId).map((d) => ({ kind: 'daily' as const, id: d.reportId! })),
        ...rows.weekly.filter((w) => w.readyToForward && w.reportId).map((w) => ({ kind: 'weekly' as const, id: w.reportId! })),
      ]
    : []

  async function forwardAll() {
    if (!ready.length || sending) return
    const ok = await confirm({
      title: `Teruskan ${ready.length} laporan ke Direksi?`,
      description: 'Pastikan semua laporan sudah diperiksa dan benar. Penerusan membekukan laporan.',
      confirmLabel: 'Ya, teruskan semua',
    })
    if (!ok) return

    setSending(true)
    let done = 0
    const failed = new Set<string>()
    const tokens: string[] = []
    // Berurutan: harian dulu lalu mingguan; satu gagal tidak memutus sisanya.
    for (const item of ready) {
      try {
        const res = await fetch('/api/inbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        })
        const json = (await res.json().catch(() => ({}))) as { undoToken?: unknown; error?: string }
        if (res.ok) {
          done++
          if (typeof json.undoToken === 'string' && json.undoToken) tokens.push(json.undoToken)
        } else failed.add(json.error || `Gagal (HTTP ${res.status})`)
      } catch {
        failed.add('Tidak dapat menghubungi server')
      }
    }
    setSending(false)
    inbox.reload()

    const failures = [...failed]
    const message = failures.length
      ? `${done} laporan diteruskan, ${failures.length} gagal: ${failures.join('; ')}`
      : `${done} laporan diteruskan ke Direksi.`
    toastForwardResult(message, tokens, inbox.reload)
  }

  return (
    <>
      <DashHeader context={data.entity?.name ?? 'Entitas Anda'} tools={<SearchButton />} />

      {inbox.error || (!rows && !inbox.loading) ? (
        <ErrorNote message={inbox.error ?? 'Data penerimaan belum termuat.'} onRetry={inbox.reload} />
      ) : !rows ? (
        <SummarySkeleton />
      ) : (
        <>
          <Hero
            eyebrow="Penerimaan · hari ini"
            answer={`${received} laporan diterima hari ini · ${forwarded} sudah diteruskan`}
            kpis={
              <>
                <StatTile
                  label="Laporan diterima"
                  value={received}
                  delta={`${dailyIn} harian · ${weeklyIn} mingguan`}
                  tone="neutral"
                />
                <StatTile
                  label="Sudah diteruskan"
                  value={forwarded}
                  delta={
                    ready.length
                      ? `${ready.length} siap diteruskan`
                      : forwarded
                        ? 'Semua yang diterima sudah diteruskan'
                        : 'Belum ada penerusan'
                  }
                  tone={ready.length ? 'info' : forwarded ? 'done' : 'neutral'}
                />
              </>
            }
          />

          <Button
            variant="primary"
            size="lg"
            full
            icon="kirim"
            disabled={!ready.length || sending}
            aria-busy={sending || undefined}
            onClick={forwardAll}
          >
            {sending ? 'Meneruskan…' : ready.length ? `Teruskan ${ready.length} laporan ke Direksi` : 'Teruskan laporan ke Direksi'}
          </Button>
        </>
      )}

      {confirmEl}
    </>
  )
}
