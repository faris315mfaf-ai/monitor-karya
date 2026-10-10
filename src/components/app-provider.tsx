'use client'

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { NavTabId } from '@/lib/constants'
import { canSeeTab, defaultTabForRole } from '@/lib/rbac'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
  scopeEntityId: string | null
  avatarColor: string | null
}

/** UI preferences that are safe to keep in the browser. */
type UiState = {
  activeTab: NavTabId
  selectedEntityId: string | null
}

/** Logo & nama holding (inisiator) dan perusahaan tempat akun ditempatkan. */
export type Brand = { id: string; name: string; code: string; type: string; logoData: string | null }
export type Branding = { holding: Brand | null; entity: Brand | null; lastLoginAt: string | null }

type AppState = UiState & {
  /** The signed-in user. Comes from the session cookie, never from the browser. */
  user: SessionUser
  branding: Branding
  setActiveTab: (t: NavTabId) => void
  setSelectedEntityId: (id: string | null) => void
  /** [BERALIH] Peran yang sedang dipratinjau (null = peran asli). Murni klien. */
  viewAsRole: string | null
  setViewAsRole: (role: string | null) => void
  /** user dengan peran pratinjau bila aktif — untuk views yang membaca user.role. */
  effectiveUser: SessionUser
}

const AppContext = createContext<AppState | undefined>(undefined)

const STORAGE_KEY = 'monitor-karya-ui'

const DEFAULT_UI: UiState = {
  activeTab: 'dashboard',
  selectedEntityId: null,
}

function readStoredUi(): UiState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        activeTab: parsed.activeTab || DEFAULT_UI.activeTab,
        selectedEntityId: parsed.selectedEntityId || null,
      }
    }
  } catch {}
  return DEFAULT_UI
}

const subscribeNever = () => () => {}

/**
 * False while rendering on the server and during the hydration pass, true
 * afterwards. Lets us render exactly what the server sent, then swap in
 * browser-only state — reading localStorage during the first render would
 * make the client markup diverge from the server's and break hydration.
 */
function useIsHydrated() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
}

export function AppProvider({
  user,
  branding = { holding: null, entity: null, lastLoginAt: null },
  children,
}: {
  user: SessionUser
  branding?: Branding
  children: React.ReactNode
}) {
  const hydrated = useIsHydrated()

  // Only consulted once the browser has taken over.
  const restored = useMemo(() => (hydrated ? readStoredUi() : DEFAULT_UI), [hydrated])

  // Changes made during this session win over whatever was restored.
  const [overrides, setOverrides] = useState<Partial<UiState>>({})
  const [viewAsRole, setViewAsRole] = useState<string | null>(null)

  const ui = useMemo<UiState>(() => {
    const merged = { ...restored, ...overrides }
    // A tab remembered from another account may not be open to this role.
    const r = viewAsRole ?? user.role
    return canSeeTab(r, merged.activeTab)
      ? merged
      : { ...merged, activeTab: defaultTabForRole(r) }
  }, [restored, overrides, user.role, viewAsRole])

  // Persist, but never before the restore has happened — otherwise the first
  // commit would overwrite the saved state with the defaults.
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ui))
    } catch {}
  }, [hydrated, ui])

  const effectiveRole = viewAsRole ?? user.role
  const effectiveUser = useMemo(
    () => (viewAsRole ? { ...user, role: viewAsRole } : user),
    [user, viewAsRole]
  )

  const value = useMemo<AppState>(
    () => ({
      ...ui,
      user,
      branding,
      setActiveTab: (t: NavTabId) => setOverrides((o) => ({ ...o, activeTab: t })),
      setSelectedEntityId: (id: string | null) =>
        setOverrides((o) => ({ ...o, selectedEntityId: id })),
      viewAsRole,
      setViewAsRole,
      effectiveUser,
    }),
    [ui, user, branding, viewAsRole, effectiveUser]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
