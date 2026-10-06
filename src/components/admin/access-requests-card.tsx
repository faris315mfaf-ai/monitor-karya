'use client'

/**
 * Kartu "Permintaan akses" (04-admin-pt.md §6): akun baru, akses sementara,
 * pindah peran. Setujui/Tolak memakai ApprovalItem; keputusan baru dikirim
 * setelah 5 detik supaya bisa dibatalkan lewat "Urungkan" di toast. Perubahan
 * peran/akses diterapkan server dengan aturan meja akun dan tercatat di log.
 */

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApprovalItem, Button, Card, EmptyNote, ErrorNote, Skeleton, StatusBadge } from '@/components/mk'
import { formatDateShort, formatRelative } from '@/lib/format'
import { initialsOf } from '@/lib/accounts'
import { canManageAccounts } from '@/lib/rbac'
import { useApp } from '@/components/app-provider'
import type { AccessRequestItem, AccessRequestList } from '@/lib/admin-meta'
import { AccessRequestSheet } from './access-request-sheet'
import { send, useFetch } from './use-fetch'

const UNDO_MS = 5000
type Decision = 'approve' | 'reject'

export function AccessRequestsCard({
  className,
  limit = 6,
  onPendingChange,
  onChanged,
}: {
  className?: string
  limit?: number
  onPendingChange?: (n: number) => void
  /** [F2-ADMIN] dipanggil setelah keputusan tersimpan (mis. muat ulang log aktivitas). */
  onChanged?: () => void
}) {
  const { user } = useApp()
  const canRequest = canManageAccounts(user.role)
  const { data, setData, error, loading, reload } = useFetch<AccessRequestList>('/api/access-requests?status=all')
  const [local, setLocal] = useState<Record<string, Decision>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const timers = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; run: () => void }>())

  const pending = (data?.items ?? []).filter((i) => i.status === 'DIAJUKAN' && !local[i.id])
  useEffect(() => {
    onPendingChange?.(pending.length)
  }, [pending.length, onPendingChange])

  // Keputusan yang masih ditahan untuk "Urungkan" tetap dikirim bila kartu ditutup.
  useEffect(() => {
    const map = timers.current
    return () => {
      for (const { t, run } of map.values()) {
        clearTimeout(t)
        run()
      }
      map.clear()
    }
  }, [])

  async function commit(item: AccessRequestItem, decision: Decision, keepalive = false) {
    timers.current.delete(item.id)
    setBusy(item.id)
    const r = await send('/api/access-requests', 'PATCH', { id: item.id, decision }, { keepalive })
    setBusy(null)
    if (!r.ok) {
      setLocal((m) => {
        const next = { ...m }
        delete next[item.id]
        return next
      })
      toast.error(r.error ?? 'Keputusan belum tersimpan')
      if (r.status === 409) reload()
      return
    }
    const updated = r.json.item as AccessRequestItem | undefined
    if (updated) setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === updated.id ? updated : x)), pending: Math.max(0, d.pending - 1) } : d))
    onChanged?.()
  }

  function decide(item: AccessRequestItem, decision: Decision) {
    setLocal((m) => ({ ...m, [item.id]: decision }))
    const run = () => void commit(item, decision, true)
    const t = setTimeout(() => void commit(item, decision), UNDO_MS)
    timers.current.set(item.id, { t, run })
    toast(`${item.title} ${decision === 'approve' ? 'disetujui' : 'ditolak'}`, {
      description: decision === 'approve' ? 'Perubahan diterapkan dalam 5 detik dan tercatat di log aktivitas.' : 'Pengaju akan diberi tahu.',
      duration: UNDO_MS,
      action: {
        label: 'Urungkan',
        onClick: () => {
          const h = timers.current.get(item.id)
          if (h) clearTimeout(h.t)
          timers.current.delete(item.id)
          setLocal((m) => {
            const next = { ...m }
            delete next[item.id]
            return next
          })
        },
      },
    })
  }

  const items = data?.items ?? []
  const open = items.filter((i) => i.status === 'DIAJUKAN')
  const decided = items.filter((i) => i.status !== 'DIAJUKAN').slice(0, Math.max(0, limit - open.length))
  const shown = [...open, ...decided].slice(0, limit)

  return (
    <Card
      className={className}
      title="Permintaan akses"
      subtitle={
        loading && !data
          ? 'Memuat…'
          : pending.length
            ? `${pending.length} menunggu keputusan · perubahan peran selalu lewat persetujuan`
            : 'Akun baru, akses sementara, dan pindah peran'
      }
      action={canRequest ? (
        <Button size="sm" variant="secondary" icon="tambah" onClick={() => setCreating(true)}>
          Ajukan permintaan
        </Button>
      ) : undefined}
    >
      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton h={52} />
          <Skeleton h={52} />
        </div>
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : shown.length === 0 ? (
        <EmptyNote done>Semua permintaan sudah diproses.</EmptyNote>
      ) : (
        <div className="mk-list">
          {shown.map((item) => {
            const meta = [item.detail, item.reason].filter(Boolean).join(' · ')
            if (item.status === 'DIAJUKAN' && item.canDecide) {
              return (
                <ApprovalItem
                  approveVariant="secondary"
                  key={item.id}
                  title={item.title}
                  requester={item.requester?.name ?? 'Pengaju'}
                  initials={initialsOf(item.requester?.name ?? '?')}
                  tone="accent"
                  time={formatRelative(item.createdAt)}
                  amount={meta || undefined}
                  state={local[item.id] === 'approve' ? 'approved' : local[item.id] === 'reject' ? 'rejected' : 'pending'}
                  onApprove={() => decide(item, 'approve')}
                  onReject={() => decide(item, 'reject')}
                  busy={busy === item.id}
                />
              )
            }
            return (
              <div key={item.id} className="mk-listrow">
                <div className="min-w-0 flex-1">
                  <div className="t-body-strong truncate">{item.title}</div>
                  <div className="t-footnote text-ink-2 truncate">
                    {[item.requester?.name, meta, formatRelative(item.createdAt)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <StatusLabel item={item} />
              </div>
            )
          })}
        </div>
      )}
      {canRequest && (
        <AccessRequestSheet
          open={creating}
          onOpenChange={setCreating}
          onCreated={(item) => setData((d) => (d ? { ...d, items: [item, ...d.items], pending: d.pending + 1 } : d))}
        />
      )}
    </Card>
  )
}

function StatusLabel({ item }: { item: AccessRequestItem }) {
  if (item.status === 'DIAJUKAN') {
    return (
      <StatusBadge status="info" size="sm">
        Menunggu keputusan
      </StatusBadge>
    )
  }
  if (item.status === 'DITOLAK') {
    return (
      <StatusBadge status="late" size="sm">
        Ditolak
      </StatusBadge>
    )
  }
  if (item.type === 'AKSES_SEMENTARA' && item.expiresAt) {
    return item.revertedAt ? (
      <StatusBadge status="neutral" size="sm">
        Berakhir
      </StatusBadge>
    ) : (
      <StatusBadge status="on" size="sm">
        {`Aktif s.d. ${formatDateShort(item.expiresAt)}`}
      </StatusBadge>
    )
  }
  return (
    <StatusBadge status="done" size="sm">
      Disetujui
    </StatusBadge>
  )
}
