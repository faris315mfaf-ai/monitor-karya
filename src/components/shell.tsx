'use client'

/**
 * Kerangka aplikasi (12 · Perangkat & navigasi).
 * Desktop ≥1024: sidebar 248 — logo, peran, NavItem, panel Tampilan, profil.
 * Tablet 600–1023: logo kiri, TabBar mengambang di tengah, avatar kanan.
 * Ponsel <600: TabBar kaca di bawah, 4 tab; sisanya di tab "Lainnya".
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import * as Popover from '@radix-ui/react-popover'
import { useApp } from '@/components/app-provider'
import { SettingsDialog } from '@/components/settings-dialog'
import { Dock, type DockItem, type DockLayout } from '@/components/dock'
import { switchNav } from '@/lib/nav-transition'
import { Switch } from '@/components/mk/forms'
import { setPrefs, usePrefs, type NavMode } from '@/lib/tampilan'
import {
  AccentPicker, Avatar, Button, IconButton, LogoMark, NavItem, SegmentedControl, Sheet, TabBar, cx,
  type Accent, type IconName,
} from '@/components/mk'
import { NAV_TABS, ROLE_LABELS, type NavTabId } from '@/lib/constants'
import { canSeeTab, compactTabsFor, tabsForRole } from '@/lib/rbac'
import { formatRelative, initials } from '@/lib/format'
import { useNavBadges } from '@/components/pic/nav-badges'
import { CommandPalette, openSearch } from '@/components/search/command-palette' // [F2-DIREKTUR]

const TAB_ICONS: Record<NavTabId, IconName> = {
  dashboard: 'ringkasan',
  companies: 'gedung',
  'work-desk': 'catatan',
  'daily-input': 'laporan',
  'weekly-input': 'kalender',
  inbox: 'persetujuan',
  projects: 'proyek',
  divisions: 'tim',
  escalations: 'peringatan',
  approvals: 'persetujuan', // [F2-DIREKTUR]
  entities: 'gedung',
  audit: 'aktivitas',
  system: 'kunci',
}

/** Label nav per peran; PIC membuka harinya dengan "Hari ini". */
export function tabLabel(role: string, id: NavTabId, short = false): string {
  if (id === 'dashboard' && role === 'PIC_PROYEK') return 'Hari ini'
  // [F2-DIREKTUR] Manajemen: modul divisi = "Tim & divisi" (01-manajemen.md).
  if (id === 'divisions' && role === 'MANAJEMEN') return short ? 'Tim' : 'Tim & divisi'
  const t = NAV_TABS.find((x) => x.id === id)
  return (short ? t?.short : t?.label) ?? id
}

const subscribeNever = () => () => {}
function useHydrated() {
  return useSyncExternalStore(subscribeNever, () => true, () => false)
}

/* ---------- Tampilan: tema, aksen, navigasi ---------- */

export function useTampilan() {
  const { theme, setTheme } = useTheme()
  const hydrated = useHydrated()
  const prefs = usePrefs()
  return {
    theme: hydrated ? (theme ?? 'system') : 'system',
    setTheme,
    accent: prefs.accent as Accent,
    setAccent: (a: Accent) => setPrefs({ accent: a }),
    nav: prefs.nav,
    setNav: (n: NavMode) => setPrefs({ nav: n }),
    dockAutohide: prefs.dockAutohide,
    setDockAutohide: (v: boolean) => setPrefs({ dockAutohide: v }),
  }
}

function TampilanPanel({
  compact,
  withNav,
  barLabel = 'Sidebar',
  onNav,
}: {
  compact?: boolean
  withNav?: boolean
  /** "Sidebar" di desktop, "Tab bar" di tablet & ponsel. */
  barLabel?: string
  /** Pengalih navigasi dengan transisi; tanpa ini preferensi langsung diganti. */
  onNav?: (n: NavMode) => void
}) {
  const { theme, setTheme, accent, setAccent, nav, setNav, dockAutohide, setDockAutohide } = useTampilan()
  return (
    <div className={cx('mk-tampilan', compact && 'is-compact')}>
      <div className="mk-tampilan__label">Tampilan</div>
      <SegmentedControl
        size="sm"
        full
        label="Tema"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'light', label: 'Terang' },
          { value: 'dark', label: 'Gelap' },
          { value: 'system', label: 'Sistem' },
        ]}
      />
      <AccentPicker value={accent} onChange={setAccent} />
      {withNav ? (
        <div className="mk-tampilan__nav">
          <div className="mk-tampilan__label">Navigasi</div>
          <SegmentedControl
            size="sm"
            full
            label="Navigasi"
            value={nav}
            onChange={(v) => (onNav ? onNav(v as NavMode) : setNav(v as NavMode))}
            options={[
              { value: 'sidebar', label: barLabel },
              { value: 'dock', label: 'Dock' },
            ]}
          />
          {nav === 'dock' ? (
            <label className="mk-tampilan__row mk-tampilan__autohide" htmlFor={`mk-dock-autohide${compact ? '-c' : ''}`}>
              <span>
                Sembunyikan otomatis
                <span className="mk-tampilan__kbd">⌥⌘D</span>
              </span>
              <Switch id={`mk-dock-autohide${compact ? '-c' : ''}`} checked={dockAutohide} onCheckedChange={setDockAutohide} />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Panel Tampilan di dalam popover (Dock): menutup diri dulu sebelum navigasi berpindah. */
function TampilanPopover({ trigger, barLabel, onNav }: { trigger: React.ReactNode; barLabel: string; onNav: (n: NavMode) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={14} className="mk-popover" style={{ width: 300 }} aria-label="Tampilan">
          <TampilanPanel
            withNav
            compact
            barLabel={barLabel}
            onNav={(n) => {
              setOpen(false)
              requestAnimationFrame(() => onNav(n))
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/* ---------- Notifikasi ---------- */
type Note = { id: string; title: string; body: string; tab: string | null; createdAt: string; readAt: string | null }

const NOTES_CHANGED = 'mk:notifikasi-berubah'

function useNotifications() {
  const [data, setData] = useState<{ unread: number; items: Note[] } | null>(null)
  const [tick, setTick] = useState(0)
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
    const t = setInterval(() => setTick((v) => v + 1), 60000)
    // Lonceng bisa tampil di beberapa tempat (header dashboard, bilah atas, Dock):
    // setelah satu menandai dibaca, yang lain ikut memuat ulang lencananya.
    const sync = () => setTick((v) => v + 1)
    window.addEventListener(NOTES_CHANGED, sync)
    return () => {
      clearInterval(t)
      window.removeEventListener(NOTES_CHANGED, sync)
    }
  }, [])
  async function markRead(ids: string[] | 'all') {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids === 'all' ? { all: true } : { ids }),
      })
    } catch {}
    window.dispatchEvent(new Event(NOTES_CHANGED))
  }
  return { data, markRead }
}

export function NotificationButton() {
  const { data, markRead } = useNotifications()
  const unread = data?.unread ?? 0
  return (
    <NotificationPopover data={data} markRead={markRead}>
      <IconButton
        icon="notifikasi"
        label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        variant="filled"
        badge={unread > 0 ? (unread > 9 ? '9+' : unread) : undefined}
      />
    </NotificationPopover>
  )
}

function NotificationPopover({
  data,
  markRead,
  side = 'bottom',
  children,
}: {
  data: { unread: number; items: Note[] } | null
  markRead: (ids: string[] | 'all') => void
  side?: 'top' | 'bottom'
  children: React.ReactNode
}) {
  const { user, setActiveTab } = useApp()
  const [open, setOpen] = useState(false)
  const unread = data?.unread ?? 0

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side={side} align={side === 'top' ? 'center' : 'end'} sideOffset={side === 'top' ? 14 : 8} className="mk-popover" style={{ width: 'min(92vw, 380px)' }} aria-label="Notifikasi">
          <div className="mk-popover__head">
            <span className="t-headline">Notifikasi</span>
            {unread > 0 ? (
              <Button size="sm" variant="plain" onClick={() => markRead('all')}>
                Tandai semua dibaca
              </Button>
            ) : null}
          </div>
          <div className="mk-popover__body mk-list">
            {!data || data.items.length === 0 ? (
              <div className="mk-empty">Belum ada notifikasi.</div>
            ) : (
              data.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cx('mk-note', !n.readAt && 'is-unread')}
                  onClick={() => {
                    if (!n.readAt) void markRead([n.id])
                    if (n.tab && canSeeTab(user.role, n.tab as NavTabId)) {
                      // Tutup dulu, lalu pindah tab: popover milik header dashboard ikut
                      // terlepas saat tab berganti, jadi jangan bergantung padanya.
                      setOpen(false)
                      setActiveTab(n.tab as NavTabId)
                      window.scrollTo({ top: 0 })
                    }
                  }}
                >
                  <span className="mk-note__dot" aria-hidden />
                  <span className="mk-note__text">
                    <span className="mk-note__title">{n.title}</span>
                    {n.body ? <span className="mk-note__body">{n.body}</span> : null}
                    <span className="mk-note__time">{formatRelative(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/* ---------- Profil ---------- */
function useSignOut() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function signOut() {
    setBusy(true)
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      if (!res.ok) toast.error('Sesi server belum berhasil dicabut. Hubungi admin untuk menyetel ulang kata sandi.')
    } catch {
      toast.error('Tidak dapat keluar. Periksa koneksi Anda dan coba lagi.')
      setBusy(false)
      return
    }
    router.replace('/login')
    router.refresh()
  }
  return { busy, signOut }
}

function scopeLine(role: string, companyName: string | null) {
  const label = ROLE_LABELS[role] ?? role
  return companyName ? `${label} · ${companyName}` : label
}

function ProfileMenu({
  onSettings,
  trigger,
  side = 'top',
  barLabel = 'Sidebar',
  onNav,
}: {
  onSettings: () => void
  trigger: React.ReactNode
  side?: 'top' | 'bottom'
  barLabel?: string
  /** Bila diisi, menu memuat panel Tampilan beserta pilihan navigasi. */
  onNav?: (n: NavMode) => void
}) {
  const { user, branding } = useApp()
  const company = branding.entity ?? branding.holding
  const { busy, signOut } = useSignOut()
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={side === 'top' ? 'center' : 'end'}
          side={side}
          sideOffset={side === 'top' ? 14 : 8}
          collisionPadding={12}
          className="mk-popover mk-popover--scroll"
          style={{ width: 300 }}
          aria-label="Profil"
        >
          <div className="mk-profile">
            <Avatar initials={initials(user.name)} size={40} name={user.name} />
            <div className="min-w-0">
              <div className="t-body-strong truncate">{user.name}</div>
              <div className="t-footnote text-ink-2 truncate">{scopeLine(user.role, company?.name ?? null)}</div>
            </div>
          </div>
          {onNav ? (
            <div className="px-2">
              <TampilanPanel
                withNav
                compact
                barLabel={barLabel}
                onNav={(n) => {
                  setOpen(false)
                  requestAnimationFrame(() => onNav(n))
                }}
              />
            </div>
          ) : null}
          <div className="mk-popover__actions">
            <Button
              variant="secondary"
              size="sm"
              icon="pengaturan"
              onClick={() => {
                setOpen(false)
                onSettings()
              }}
              full
            >
              Buka pengaturan
            </Button>
            <Button variant="plain" size="sm" icon="keluar" onClick={signOut} disabled={busy} full>
              {busy ? 'Keluar…' : 'Keluar'}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/* ---------- Ukuran layar ---------- */
function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

let vwCache = 1280
function subscribeWidth(cb: () => void) {
  let raf = 0
  const on = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      vwCache = window.innerWidth
      cb()
    })
  }
  window.addEventListener('resize', on)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', on)
  }
}
/** Lebar jendela, diperbarui sekali per frame saat diubah ukurannya. */
function useViewportWidth() {
  return useSyncExternalStore(
    subscribeWidth,
    () => (typeof window === 'undefined' ? vwCache : (vwCache = window.innerWidth)),
    () => 1280
  )
}

/* ---------- Kerangka ---------- */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { user, branding, activeTab, setActiveTab } = useApp()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { busy, signOut } = useSignOut()
  const company = branding.entity ?? branding.holding
  const prefs = usePrefs()
  const dockMode = prefs.nav === 'dock'
  const notes = useNotifications()
  // Badge nav per tab, mis. "Laporan harian 1" untuk PIC (hilang setelah terkirim).
  const navBadges = useNavBadges(user.role, activeTab)

  // Tata letak mengikuti breakpoint panduan (12 · Perangkat & navigasi).
  // Range syntax yang sama dengan CSS (globals.css: `width < 1024px`, `width < 600px`),
  // supaya pada lebar pecahan (mis. 599,5 px) pilihan tata letak JS = CSS [F1-D].
  const isDesktop = useMedia('(width >= 1024px)')
  const isPhone = useMedia('(width < 600px)')
  const finePointer = useMedia('(hover: hover) and (pointer: fine)')
  const layout: DockLayout = isDesktop ? 'desktop' : isPhone ? 'phone' : 'tablet'
  const vw = useViewportWidth()
  const barLabel = layout === 'desktop' ? 'Sidebar' : 'Tab bar'

  const tabs = useMemo(() => {
    const allowed = tabsForRole(user.role)
    return NAV_TABS.filter((t) => allowed.includes(t.id)).map((t) => ({
      value: t.id as NavTabId,
      label: tabLabel(user.role, t.id),
      short: tabLabel(user.role, t.id, true),
      icon: TAB_ICONS[t.id],
    }))
  }, [user.role])

  // [F2-DIREKTUR] Peran dengan set tab ringkas di spesifikasi (rbac ROLE_COMPACT_TABS):
  // 4 tab utama berurutan + "Lainnya" untuk sisanya, di tablet maupun ponsel.
  const compact = useMemo(() => {
    const ids = compactTabsFor(user.role)
    if (!ids) return null
    return { main: tabs.filter((t) => ids.includes(t.value)).sort((a, b) => ids.indexOf(a.value) - ids.indexOf(b.value)), rest: tabs.filter((t) => !ids.includes(t.value)) }
  }, [tabs, user.role])
  // Tab bar ponsel: 4 slot; peran dengan lebih dari 4 modul mendapat "Lainnya".
  const phoneTabs = compact ? compact.main : tabs.length <= 4 ? tabs : tabs.slice(0, 3)
  const moreTabs = compact ? compact.rest : tabs.length <= 4 ? [] : tabs.slice(3)
  // Tab bar tablet mengambang: hingga 5 modul.
  const tabletTabs = compact ? compact.main : tabs.length <= 5 ? tabs : tabs.slice(0, 4)
  const tabletMore = compact ? compact.rest : tabs.length <= 5 ? [] : tabs.slice(4)
  // Dock: desktop memuat semua; tablet hingga 8 ikon; ponsel 5 slot.
  const dockCap = layout === 'phone' ? 5 : layout === 'tablet' ? 8 : Infinity
  // [F2-DIREKTUR] Dock tablet & ponsel ikut urutan tab ringkas peran (bila ada).
  const dockList = compact && layout !== 'desktop' ? [...compact.main, ...compact.rest] : tabs
  const dockTabs = dockList.length <= dockCap ? dockList : dockList.slice(0, dockCap - 1)
  const dockMore = dockList.length <= dockCap ? [] : dockList.slice(dockCap - 1)

  const overflow =
    layout === 'phone' ? (dockMode ? dockMore : moreTabs) : layout === 'tablet' ? (dockMode ? dockMore : tabletMore) : []
  const overflowActive = overflow.some((t) => t.value === activeTab)

  // Ikon Dock desktop diperkecil bila jendela sempit, supaya semuanya muat tanpa gulir.
  const desktopCount = tabs.length + 3
  const dockBase = Math.max(38, Math.min(50, Math.floor((vw - 96 - desktopCount * 6) / desktopCount)))

  /** Urutan ikon untuk jeda bertahap saat berpindah (atas→bawah, kiri→kanan). */
  function navOrder() {
    if (layout === 'desktop') return [...tabs.map((t) => t.value), 'notifikasi', 'tampilan', 'profil']
    const shown = dockMode ? dockTabs : layout === 'phone' ? phoneTabs : tabletTabs
    return [...shown.map((t) => t.value), 'lainnya']
  }

  /** Berpindah Sidebar/Tab bar ↔ Dock dengan View Transition. */
  function changeNav(n: NavMode) {
    if (n === prefs.nav) return
    if (moreOpen) {
      // Tunggu sheet "Lainnya" turun dulu supaya ikon tidak terbang di atasnya.
      setMoreOpen(false)
      window.setTimeout(() => switchNav(n, navOrder()), 320)
      return
    }
    switchNav(n, navOrder())
  }

  // ⌥⌘D (atau Alt+Ctrl+D): beralih ke Dock, atau nyalakan/matikan Dock tersembunyi otomatis.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'KeyD' && e.altKey && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        if (prefs.nav !== 'dock') {
          changeNav('dock')
          return
        }
        if (layout !== 'desktop') return
        setPrefs({ dockAutohide: !prefs.dockAutohide })
        toast(prefs.dockAutohide ? 'Dock selalu tampil.' : 'Dock disembunyikan otomatis.')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function go(id: string) {
    if (id === 'lainnya') {
      setMoreOpen(true)
      return
    }
    setActiveTab(id as NavTabId)
    setMoreOpen(false)
    window.scrollTo({ top: 0 })
  }

  const avatarBtn = (
    <button type="button" className="mk-avatarbtn" aria-label={`Profil ${user.name}`}>
      <Avatar initials={initials(user.name)} size={36} />
    </button>
  )

  const dockItems: DockItem[] = [
    ...dockTabs.map<DockItem>((t) => ({
      id: t.value,
      label: layout === 'desktop' ? t.label : t.short,
      icon: t.icon,
      badge: navBadges[t.value],
      active: activeTab === t.value,
      onSelect: () => go(t.value),
    })),
    ...(layout !== 'desktop' && (dockMore.length || layout === 'phone')
      ? [
          {
            id: 'lainnya',
            label: dockMore.length ? 'Lainnya' : 'Tampilan',
            icon: (dockMore.length ? 'lainnya' : 'pengaturan') as IconName,
            active: overflowActive || moreOpen,
            onSelect: () => go('lainnya'),
          },
        ]
      : []),
  ]

  const dockUtilities: DockItem[] =
    layout === 'desktop'
      ? [
          {
            id: 'notifikasi',
            label: 'Notifikasi',
            icon: 'notifikasi',
            badge: notes.data?.unread ? (notes.data.unread > 9 ? '9+' : notes.data.unread) : undefined,
            wrap: (b) => (
              <NotificationPopover data={notes.data} markRead={notes.markRead} side="top">
                {b}
              </NotificationPopover>
            ),
          },
          {
            id: 'tampilan',
            label: 'Tampilan',
            icon: 'pengaturan',
            wrap: (b) => <TampilanPopover trigger={b} barLabel={barLabel} onNav={changeNav} />,
          },
          {
            id: 'profil',
            label: user.name,
            icon: 'pengguna',
            render: <Avatar initials={initials(user.name)} size={34} />,
            wrap: (b) => <ProfileMenu onSettings={() => setSettingsOpen(true)} trigger={b} />,
          },
        ]
      : []

  return (
    <div className="mk-app">
      {/* Tautan lompat: tab pertama langsung ke isi, melewati navigasi. */}
      <a
        href="#isi"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[var(--z-sheet)] focus-visible:rounded-full focus-visible:bg-surface focus-visible:px-4 focus-visible:py-3 focus-visible:text-ink focus-visible:shadow-[var(--shadow-float)]"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('isi')?.focus()
        }}
      >
        Lewati ke isi
      </a>

      {/* Desktop */}
      <aside className="mk-app__side" aria-label="Sidebar" aria-hidden={dockMode || undefined} inert={dockMode || undefined}>
        <div className="mk-brand">
          <LogoMark size={36} label="Monitor Karya" />
          <div className="min-w-0">
            <div className="mk-brand__name">Monitor Karya</div>
            <div className="mk-brand__role truncate">{scopeLine(user.role, company?.name ?? null)}</div>
          </div>
        </div>
        <nav className="mk-sidenav" aria-label="Navigasi utama">
          {tabs.map((t) => (
            <NavItem
              key={t.value}
              icon={t.icon}
              label={t.label}
              href={`#${t.value}`}
              active={activeTab === t.value}
              count={navBadges[t.value]}
              countTone="accent"
              vtName={`nav-${t.value}`}
              onClick={(e) => {
                e.preventDefault()
                go(t.value)
              }}
            />
          ))}
        </nav>
        <div className="mk-side__foot">
          <TampilanPanel withNav barLabel="Sidebar" onNav={changeNav} />
          <div className="mk-side__profile">
            <Avatar initials={initials(user.name)} size={36} name={user.name} />
            <div className="min-w-0 flex-1">
              <div className="t-callout font-semibold truncate">{user.name}</div>
              <div className="t-caption text-ink-2 truncate">{ROLE_LABELS[user.role] ?? user.role}</div>
            </div>
            <IconButton icon="pengaturan" label="Pengaturan" onClick={() => setSettingsOpen(true)} />
            <IconButton icon="keluar" label="Keluar" onClick={signOut} disabled={busy} />
          </div>
        </div>
      </aside>

      {/* Tablet & ponsel: kontrol mengambang di atas */}
      <div className="mk-app__top">
        <LogoMark size={36} label="Monitor Karya" />
        <TabBar
          floating
          label="Navigasi utama"
          className="mk-app__topbar"
          value={tabletMore.some((t) => t.value === activeTab) ? 'lainnya' : activeTab}
          onChange={go}
          items={[
            ...tabletTabs.map((t) => ({ value: t.value, label: t.short, icon: t.icon, badge: navBadges[t.value] })),
            ...(tabletMore.length ? [{ value: 'lainnya', label: 'Lainnya', icon: 'lainnya' as IconName }] : []),
          ]}
        />
        <div className="mk-app__topright">
          {/* [F2-DIREKTUR] Pencarian ⌘K di tablet & ponsel */}
          <IconButton icon="cari" label="Cari" variant="filled" onClick={openSearch} />
          <NotificationButton />
          <ProfileMenu side="bottom" barLabel={barLabel} onNav={changeNav} onSettings={() => setSettingsOpen(true)} trigger={avatarBtn} />
        </div>
      </div>

      {/* tabIndex -1: sasaran tautan lompat; bukan kontrol, jadi tanpa cincin fokus. */}
      <main className="mk-app__main focus-visible:outline-none" id="isi" tabIndex={-1} data-sheet-focus-fallback>
        {children}
      </main>

      {/* Ponsel: tab bar bawah */}
      <div className="mk-app__bottom">
        <TabBar
          label="Navigasi utama"
          value={(!dockMode && overflowActive) || moreOpen ? 'lainnya' : activeTab}
          onChange={go}
          items={[
            ...phoneTabs.map((t) => ({ value: t.value, label: t.short, icon: t.icon, badge: navBadges[t.value] })),
            { value: 'lainnya', label: moreTabs.length ? 'Lainnya' : 'Tampilan', icon: (moreTabs.length ? 'lainnya' : 'pengaturan') as IconName },
          ]}
        />
      </div>

      <Sheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        title={overflow.length ? 'Lainnya' : 'Tampilan'}
        subtitle={scopeLine(user.role, company?.name ?? null)}
        backLabel="Kembali"
      >
        {overflow.length > 0 && (
          <nav className="mk-morenav" aria-label="Modul lain">
            {overflow.map((t) => (
              <NavItem
                key={t.value}
                icon={t.icon}
                label={t.label}
                href={`#${t.value}`}
                active={activeTab === t.value}
                onClick={(e) => {
                  e.preventDefault()
                  go(t.value)
                }}
              />
            ))}
          </nav>
        )}
        <TampilanPanel compact withNav barLabel={barLabel} onNav={changeNav} />
        <div className="mk-morenav__actions">
          <Button icon="pengaturan" onClick={() => { setMoreOpen(false); setSettingsOpen(true) }} full>
            Buka pengaturan
          </Button>
          <Button variant="plain" icon="keluar" onClick={signOut} disabled={busy} full>
            Keluar
          </Button>
        </div>
      </Sheet>

      {/* Dock: desktop ala macOS, tablet ala iPadOS, ponsel kapsul kaca. */}
      <Dock
        visible={dockMode}
        layout={layout}
        magnify={finePointer}
        base={layout === 'desktop' ? dockBase : layout === 'tablet' ? 48 : 44}
        autohide={prefs.dockAutohide && finePointer}
        label="Dock navigasi"
        items={dockItems}
        utilities={dockUtilities}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <CommandPalette />
    </div>
  )
}
