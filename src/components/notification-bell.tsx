'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/components/app-provider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { canSeeTab } from '@/lib/rbac'
import type { NavTabId } from '@/lib/constants'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Bell, BellRing, CheckCheck, Inbox } from 'lucide-react'

type Item = {
  id: string
  template: string
  title: string
  body: string
  tab: string | null
  createdAt: string
  readAt: string | null
}

const POLL_MS = 60000

/**
 * Lonceng notifikasi (8 Sep 2026): pesan dalam aplikasi untuk akun yang masuk —
 * misalnya pengingat bahwa laporan mingguan divisinya belum diserahkan. Jumlah
 * yang belum dibaca tampil di lencana; membuka satu pesan menandainya dibaca
 * dan, bila pesan itu menunjuk sebuah modul, langsung membukanya.
 */
export function NotificationBell() {
  const { user, setActiveTab } = useApp()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ unread: number; items: Item[] } | null>(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/notifications?inbox=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setData(j)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tick])

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), POLL_MS)
    return () => clearInterval(t)
  }, [])

  async function markRead(ids: string[] | 'all') {
    setBusy(true)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids === 'all' ? { all: true } : { ids }),
      })
    } catch {
      // Gagal menandai bukan alasan menahan pengguna; daftar dimuat ulang saja.
    } finally {
      setBusy(false)
      setTick((v) => v + 1)
    }
  }

  function openItem(item: Item) {
    if (!item.readAt) void markRead([item.id])
    if (item.tab && canSeeTab(user.role, item.tab as NavTabId)) {
      setActiveTab(item.tab as NavTabId)
      setOpen(false)
    }
  }

  const unread = data?.unread ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="glass relative hover:bg-blue-500/10" aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}>
          {unread > 0 ? <BellRing className="h-5 w-5 text-amber-600" /> : <Bell className="h-5 w-5 text-slate-600 dark:text-slate-300" />}
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass-modal w-[min(92vw,380px)] p-0 overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-white/40 dark:border-white/10 flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex-1">Notifikasi</span>
          {unread > 0 && (
            <button type="button" onClick={() => markRead('all')} disabled={busy} className="text-xs text-blue-600 dark:text-blue-300 hover:underline inline-flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5" /> Tandai semua dibaca
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {!data || data.items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              <Inbox className="h-6 w-6 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              Belum ada notifikasi.
            </div>
          ) : (
            <ul>
              {data.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      'w-full text-left px-3.5 py-3 border-b border-white/30 dark:border-white/5 hover:bg-blue-500/5 transition-colors',
                      !n.readAt && 'bg-amber-500/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', n.readAt ? 'bg-slate-300 dark:bg-slate-600' : 'bg-amber-500')} />
                      <div className="min-w-0 flex-1">
                        <div className={cn('text-sm leading-snug', n.readAt ? 'text-slate-700 dark:text-slate-200' : 'font-semibold text-slate-800 dark:text-slate-100')}>{n.title}</div>
                        {n.body && <div className="text-[13px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">{n.body}</div>}
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{formatRelative(n.createdAt)}</div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
