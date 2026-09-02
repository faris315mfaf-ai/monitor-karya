'use client'

import { useApp } from '@/components/app-provider'
import { RoleSwitcher } from '@/components/role-switcher'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Activity, Bell, Globe2, ShieldCheck, Zap } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/constants'
import { useEffect, useState } from 'react'
import { formatTime } from '@/lib/format'

export function Navbar() {
  const { user, activeTab } = useApp()
  const [now, setNow] = useState(new Date())
  const [notifCount, setNotifCount] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetch('/api/notifications?status=FAILED&page=1&pageSize=1')
      .then((r) => r.json())
      .then((d) => setNotifCount(d.total || 0))
      .catch(() => {})
  }, [])

  return (
    <header className="glass-nav sticky top-0 z-50 px-3 sm:px-4 lg:px-6 py-2.5">
      <div className="mx-auto max-w-[1600px] flex items-center gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 flex items-center justify-center shadow-glow-blue shrink-0">
            <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
            <div className="absolute -inset-1 -z-10 rounded-xl bg-blue-400/30 blur-md" />
          </div>
          <div className="hidden sm:flex flex-col leading-tight min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-800 text-base tracking-tight">MonitorKarya</span>
              <Badge className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/20 text-[9px] px-1.5 py-0 h-4 font-semibold">
                v1.0
              </Badge>
            </div>
            <span className="text-[10px] text-slate-500 hidden md:inline">Pemantauan Bisnis Holding</span>
          </div>
        </div>

        {/* Center — status indicators (hidden on mobile) */}
        <div className="hidden lg:flex items-center gap-1.5 ml-2">
          <StatusChip
            icon={<Globe2 className="h-3 w-3" />}
            label="WIB"
            value={formatTime(now)}
            color="text-blue-600"
          />
          <StatusChip
            icon={<ShieldCheck className="h-3 w-3" />}
            label="Sistem"
            value="Aktif"
            color="text-emerald-600"
          />
          <StatusChip
            icon={<Zap className="h-3 w-3" />}
            label="Job"
            value="17:00"
            color="text-amber-600"
          />
        </div>

        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Active tab hint */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 pr-2 border-r border-slate-200/60">
            <span className="capitalize">{activeTab.replace('-', ' ')}</span>
          </div>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="glass h-9 w-9 relative hover:bg-blue-500/10"
            aria-label="Notifikasi"
          >
            <Bell className="h-4 w-4 text-slate-600" />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </Button>

          <RoleSwitcher />
        </div>
      </div>

      {/* Mobile sub-header — current role */}
      {user && (
        <div className="sm:hidden mt-2 px-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Masuk sebagai <strong className="text-slate-700">{user.name}</strong>
          </span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-medium border-blue-500/30 text-blue-700 bg-blue-500/10">
            {ROLE_LABELS[user.role]}
          </Badge>
        </div>
      )}
    </header>
  )
}

function StatusChip({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="glass rounded-full px-2.5 py-1 flex items-center gap-1.5">
      <span className={color}>{icon}</span>
      <span className="text-[10px] text-slate-500 font-medium">{label}</span>
      <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{value}</span>
    </div>
  )
}
