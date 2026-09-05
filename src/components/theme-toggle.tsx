'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MODES = [
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'system', label: 'Sistem', icon: Monitor },
] as const

const subscribeNever = () => () => {}

/** False during SSR and the hydration pass; the resolved theme is browser-only. */
function useIsHydrated() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
}

/**
 * Cycles light → dark → follow the system. Rendering the icon only after
 * hydration keeps the server and client markup identical; before that it shows
 * a neutral placeholder of the same size so the header does not shift.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const hydrated = useIsHydrated()

  const index = Math.max(
    0,
    MODES.findIndex((m) => m.value === (theme ?? 'system'))
  )
  const current = MODES[index]
  const next = MODES[(index + 1) % MODES.length]
  const Icon = current.icon

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next.value)}
      className="glass relative hover:bg-blue-500/10"
      aria-label={hydrated ? `Tema: ${current.label}. Ganti ke ${next.label}` : 'Ganti tema'}
      title={hydrated ? `Tema: ${current.label}` : undefined}
    >
      {hydrated ? (
        <Icon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
      ) : (
        <span className="h-5 w-5" aria-hidden />
      )}
    </Button>
  )
}
