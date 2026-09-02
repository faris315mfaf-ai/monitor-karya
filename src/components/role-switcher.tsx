'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/components/app-provider'
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '@/lib/constants'
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
import { Check, ChevronDown, Users } from 'lucide-react'

type RoleGroup = {
  role: string
  label: string
  users: {
    id: string
    name: string
    email: string
    role: string
    scopeEntityId?: string | null
    avatarColor?: string | null
    lastLoginAt?: string | null
  }[]
}

function initials(name: string) {
  return name
    .replace(/^(Bpk\.|Ibu)\s*/i, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function RoleSwitcher() {
  const { user, setUser } = useApp()
  const [groups, setGroups] = useState<RoleGroup[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch roles once on mount.
  useEffect(() => {
    let cancelled = false
    fetch('/api/roles')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setGroups(d.roles || [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Pick a default user if none is set yet and roles are loaded.
  useEffect(() => {
    if (user || loading || groups.length === 0) return
    const mgmt = groups.find((g) => g.role === 'MANAJEMEN')
    if (mgmt?.users?.[0]) setUser(mgmt.users[0])
  }, [user, loading, groups, setUser])

  if (loading || !user) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-full bg-slate-200 animate-pulse" />
        <div className="hidden sm:flex flex-col gap-1">
          <div className="h-3 w-24 rounded bg-slate-200 animate-pulse" />
          <div className="h-2.5 w-16 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    )
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
              className="text-white text-xs font-semibold"
              style={{ background: user.avatarColor || '#2563eb' }}
            >
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-xs font-semibold text-slate-700">{user.name}</span>
            <span className="text-[10px] text-slate-500">{ROLE_LABELS[user.role]}</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="glass-strong w-80 max-h-[70vh] overflow-y-auto scrollbar-thin"
      >
        <DropdownMenuLabel className="text-xs text-slate-500 font-medium flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          Ganti peran (demo)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groups.map((g) => (
          <div key={g.role}>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-blue-600/80 font-semibold">
              {g.label}
            </DropdownMenuLabel>
            <div className="text-[10px] text-slate-500 px-2 pb-1">
              {ROLE_DESCRIPTIONS[g.role]}
            </div>
            {g.users.map((u) => (
              <DropdownMenuItem
                key={u.id}
                onClick={() => setUser(u)}
                className="gap-2 py-2 cursor-pointer"
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback
                    className="text-white text-[10px] font-semibold"
                    style={{ background: u.avatarColor || '#2563eb' }}
                  >
                    {initials(u.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{u.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{u.email}</div>
                </div>
                {user?.id === u.id && <Check className="h-3.5 w-3.5 text-blue-600" />}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
