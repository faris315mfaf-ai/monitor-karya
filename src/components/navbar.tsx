'use client'

import { useApp } from '@/components/app-provider'
import { UserMenu } from '@/components/user-menu'
import { ThemeToggle } from '@/components/theme-toggle'
import { SettingsDialog } from '@/components/settings-dialog'
import { NotificationBell } from '@/components/notification-bell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Activity, Globe2, Settings, ShieldCheck, Zap } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { NAV_TABS, ROLE_LABELS } from '@/lib/constants'
import { DAILY_CUTOFF_HOUR } from '@/lib/lock'
import { useEffect, useState } from 'react'
import { formatTime } from '@/lib/format'

export function Navbar() {
  const { user, activeTab, branding } = useApp()
  const company = branding.entity ?? branding.holding
  const [now, setNow] = useState(new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const tabLabel = NAV_TABS.find((t) => t.id === activeTab)?.label ?? activeTab

  return (
    <header className="glass-nav sticky top-0 z-50 px-3 sm:px-4 lg:px-6 py-2.5">
      <div className="mx-auto max-w-[1600px] flex items-center gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Logo holding = inisiator sistem; tanpa holding, ikon MonitorKarya. */}
          {branding.holding ? (
            <div className="relative shrink-0" title={`Inisiator: ${branding.holding.name}`}>
              <BrandLogo name={branding.holding.name} logoData={branding.holding.logoData} size={36} tone="slate" />
              <div className="absolute -inset-1 -z-10 rounded-xl bg-blue-400/25 blur-md" />
            </div>
          ) : (
            <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 flex items-center justify-center shadow-glow-blue shrink-0">
              <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
              <div className="absolute -inset-1 -z-10 rounded-xl bg-blue-400/30 blur-md" />
            </div>
          )}
          <div className="hidden sm:flex flex-col leading-tight min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-800 dark:text-slate-100 text-base tracking-tight">MonitorKarya</span>
              <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 text-[11px] px-1.5 py-0 h-4 font-semibold">v2</Badge>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden md:inline truncate">
              {branding.holding ? branding.holding.name : 'Pemantauan Bisnis Holding'}
            </span>
          </div>
        </div>

        {/* Center — status indicators (hidden on mobile) */}
        <div className="hidden lg:flex items-center gap-1.5 ml-2">
          <StatusChip icon={<Globe2 className="h-3 w-3" />} label="WIB" value={formatTime(now)} color="text-blue-600" />
          <StatusChip icon={<ShieldCheck className="h-3 w-3" />} label="Sistem" value="Aktif" color="text-emerald-600" />
          <StatusChip icon={<Zap className="h-3 w-3" />} label="Kunci" value={`${String(DAILY_CUTOFF_HOUR).padStart(2, '0')}:00`} color="text-amber-600" />
        </div>

        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 pr-2 border-r border-slate-200/60 dark:border-white/10">
            <span>{tabLabel}</span>
          </div>

          <ThemeToggle />

          <Button
            variant="ghost"
            size="icon-sm"
            className="glass hover:bg-blue-500/10 icon-gear"
            aria-label="Pengaturan"
            title="Pengaturan"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </Button>

          <NotificationBell />

          <UserMenu />
        </div>
      </div>

      {/* Mobile sub-header — current role */}
      <div className="sm:hidden mt-2 px-1 flex items-center justify-between text-[13px] text-slate-500 dark:text-slate-400">
        <span className="truncate inline-flex items-center gap-1.5 min-w-0">
          {company && <BrandLogo name={company.name} logoData={company.logoData} size={16} className="rounded shadow-none" />}
          <span className="truncate">
            Masuk sebagai <strong className="text-slate-700 dark:text-slate-200">{user.name}</strong>
            {company ? ` · ${company.name}` : ''}
          </span>
        </span>
        <Badge variant="outline" className="shrink-0 ml-2 text-[11px] h-4 px-1.5 font-medium border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-500/10">
          {ROLE_LABELS[user.role] ?? user.role}
        </Badge>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  )
}

function StatusChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="glass rounded-full px-2.5 py-1 flex items-center gap-1.5">
      <span className={color}>{icon}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</span>
      <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{value}</span>
    </div>
  )
}
