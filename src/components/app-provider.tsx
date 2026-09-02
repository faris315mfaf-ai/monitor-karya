'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { NavTabId } from '@/lib/constants'

type RoleUser = {
  id: string
  name: string
  email: string
  role: string
  scopeEntityId?: string | null
  avatarColor?: string | null
  lastLoginAt?: string | null
}

type AppState = {
  user: RoleUser | null
  setUser: (u: RoleUser | null) => void
  activeTab: NavTabId
  setActiveTab: (t: NavTabId) => void
  selectedEntityId: string | null
  setSelectedEntityId: (id: string | null) => void
}

const AppContext = createContext<AppState | undefined>(undefined)

const STORAGE_KEY = 'monitor-karya-state'

function readStoredState(): { user: RoleUser | null; activeTab: NavTabId; selectedEntityId: string | null } {
  if (typeof window === 'undefined') {
    return { user: null, activeTab: 'dashboard', selectedEntityId: null }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        user: parsed.user || null,
        activeTab: parsed.activeTab || 'dashboard',
        selectedEntityId: parsed.selectedEntityId || null,
      }
    }
  } catch {}
  return { user: null, activeTab: 'dashboard', selectedEntityId: null }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Lazy initialize from localStorage on the client only.
  const initial = useMemo(() => readStoredState(), [])
  const [user, setUserState] = useState<RoleUser | null>(initial.user)
  const [activeTab, setActiveTabState] = useState<NavTabId>(initial.activeTab)
  const [selectedEntityId, setSelectedEntityIdState] = useState<string | null>(initial.selectedEntityId)

  // Persist to localStorage whenever state changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ user, activeTab, selectedEntityId })
      )
    } catch {}
  }, [user, activeTab, selectedEntityId])

  const value = useMemo(
    () => ({
      user,
      setUser: (u: RoleUser | null) => setUserState(u),
      activeTab,
      setActiveTab: (t: NavTabId) => setActiveTabState(t),
      selectedEntityId,
      setSelectedEntityId: (id: string | null) => setSelectedEntityIdState(id),
    }),
    [user, activeTab, selectedEntityId]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
