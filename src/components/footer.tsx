'use client'

import { useApp } from '@/components/app-provider'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateTime } from '@/lib/format'
import { Activity, Github, Heart } from 'lucide-react'

export function Footer() {
  const { user } = useApp()
  return (
    <footer className="mt-auto glass-nav border-t border-white/40">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-6 py-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center">
              <Activity className="h-3 w-3 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-medium text-slate-600">MonitorKarya</span>
            <span className="hidden sm:inline">· Pemantauan Bisnis Holding</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {user && (
              <span className="hidden md:flex items-center gap-1">
                Sesi aktif: <strong className="text-slate-700">{ROLE_LABELS[user.role]}</strong>
              </span>
            )}
            <span className="hidden md:inline tabular-nums">{formatDateTime(new Date())} WIB</span>
            <span className="flex items-center gap-1">
              Dibuat dengan <Heart className="h-3 w-3 text-rose-500 fill-rose-500" /> di Indonesia
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
