'use client'

import { useApp } from '@/components/app-provider'
import { NAV_TABS, type NavTabId } from '@/lib/constants'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ListTodo,
  FolderKanban,
  CalendarRange,
  Siren,
  Building2,
  Shield,
} from 'lucide-react'

const ICONS: Record<NavTabId, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  'work-desk': <ListTodo className="h-4 w-4" />,
  projects: <FolderKanban className="h-4 w-4" />,
  divisions: <CalendarRange className="h-4 w-4" />,
  escalations: <Siren className="h-4 w-4" />,
  entities: <Building2 className="h-4 w-4" />,
  audit: <Shield className="h-4 w-4" />,
}

export function TabNav() {
  const { activeTab, setActiveTab } = useApp()

  return (
    <>
      {/* Desktop/Tablet horizontal tabs (hidden on mobile — bottom bar used there) */}
      <nav className="glass rounded-xl p-1 hidden lg:flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {NAV_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'group relative flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm font-medium transition-all whitespace-nowrap',
                isActive
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-glow-blue'
                  : 'text-slate-600 hover:text-blue-700 hover:bg-blue-500/10'
              )}
            >
              {ICONS[tab.id]}
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 glass-nav border-t border-white/40 px-1 py-1 flex items-center justify-around">
        {NAV_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all min-w-[44px] min-h-[44px] justify-center',
                isActive ? 'text-blue-600' : 'text-slate-500'
              )}
              aria-label={tab.label}
            >
              <span className={cn('transition-transform', isActive && 'scale-110')}>
                {ICONS[tab.id]}
              </span>
              <span className="text-[9px] font-medium">{tab.short}</span>
              {isActive && (
                <span className="absolute -bottom-0.5 h-1 w-6 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" />
              )}
            </button>
          )
        })}
      </nav>
    </>
  )
}
