'use client'

/**
 * Log aktivitas di Ringkasan Admin PT + "Unduh log" [F2-ADMIN]
 * (04-admin-pt.md §8). Kalimatnya dari /api/admin/activity, termasuk
 * konfirmasi sakelar pengingat ("Maya Lestari mematikan ringkasan untuk
 * manajemen"). Unduhan CSV dari /api/audit-logs/export (30 hari terakhir).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ActivityItem, Button, Card, EmptyNote, ErrorNote, Skeleton } from '@/components/mk'
import { initialsOf } from '@/lib/accounts'
import { formatRelative } from '@/lib/format'
import type { ActivityEntry } from '@/lib/audit-labels'
import { useFetch } from './use-fetch'

/** Unduh berkas lewat fetch (bekerja juga di /pratinjau yang memalsukan fetch). */
export async function downloadAuditCsv(): Promise<boolean> {
  try {
    const res = await fetch('/api/audit-logs/export', { cache: 'no-store' })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(j.error || 'Log belum bisa diunduh')
      return false
    }
    const blob = await res.blob()
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'log-aktivitas.csv'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    const total = Number(res.headers.get('X-Total-Rows') ?? '0')
    const rows = Number(res.headers.get('X-Exported-Rows') ?? '0')
    toast.success(total > rows ? `Log diunduh: ${rows} dari ${total} baris terbaru.` : `Log diunduh: ${rows} baris, 30 hari terakhir.`)
    return true
  } catch {
    toast.error('Tidak dapat menghubungi server')
    return false
  }
}

export function ActivityLogCard({ className, reloadKey = 0, limit = 12 }: { className?: string; reloadKey?: number; limit?: number }) {
  const { data, error, loading, reload } = useFetch<{ items: ActivityEntry[] }>(`/api/admin/activity?limit=${limit}`)
  const [downloading, setDownloading] = useState(false)

  // Muat ulang setelah tindakan di kartu lain (pengingat, sakelar, keputusan akses).
  useEffect(() => {
    if (reloadKey > 0) reload()
  }, [reloadKey, reload])

  const items = data?.items ?? []
  return (
    <Card
      className={className}
      title="Log aktivitas"
      subtitle="Pengingat, sakelar, akses, dan penerusan di perusahaan Anda"
      action={
        <Button
          size="sm"
          variant="secondary"
          icon="unduh"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true)
            await downloadAuditCsv()
            setDownloading(false)
          }}
        >
          {downloading ? 'Mengunduh…' : 'Unduh log'}
        </Button>
      }
    >
      {loading && !data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={44} />
          ))}
        </div>
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyNote icon="aktivitas">Belum ada aktivitas tercatat.</EmptyNote>
      ) : (
        <div aria-live="polite">
          {items.map((it, i) => (
            <ActivityItem
              key={it.id}
              who={it.actor?.name ?? 'Pengingat otomatis'}
              initials={it.actor ? initialsOf(it.actor.name) : 'PO'}
              action={it.text}
              time={formatRelative(it.at)}
              last={i === items.length - 1}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
