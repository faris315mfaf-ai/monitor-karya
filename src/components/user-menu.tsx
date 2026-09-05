'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useApp } from '@/components/app-provider'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/constants'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, LogOut, Mail, ShieldCheck } from 'lucide-react'

function initials(name: string) {
  return name
    .replace(/^(Bpk\.|Ibu)\s*/i, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function UserMenu() {
  const { user } = useApp()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Even if the call fails the cookie may already be gone — send the user
      // to /login either way and let the server decide.
    }
    router.replace('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="glass h-auto py-1.5 px-2 gap-2 hover:bg-blue-500/10 data-[state=open]:bg-blue-500/15"
        >
          <Avatar className="h-8 w-8 ring-2 ring-white/80 shadow-sm">
            <AvatarFallback
              className="text-white text-sm font-semibold"
              style={{ background: user.avatarColor || '#2563eb' }}
            >
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{user.name}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[user.role] ?? user.role}</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="glass-strong w-72">
        <DropdownMenuLabel className="pb-1">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-9 w-9">
              <AvatarFallback
                className="text-white text-sm font-semibold"
                style={{ background: user.avatarColor || '#2563eb' }}
              >
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">{user.name}</div>
              <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" />
                {user.email}
              </div>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-blue-700 dark:text-blue-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            {ROLE_LABELS[user.role] ?? user.role}
          </div>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400 leading-snug">
            {ROLE_DESCRIPTIONS[user.role] ?? 'Hak akses sesuai peran.'}
          </p>
          <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            Cakupan data:{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {user.scopeEntityId ? 'entitas Anda dan turunannya' : 'seluruh holding'}
            </span>
          </p>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={signOut}
          disabled={signingOut}
          className="gap-2 py-2 cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-500/10"
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? 'Keluar…' : 'Keluar'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
