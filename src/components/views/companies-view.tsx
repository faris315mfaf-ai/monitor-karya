'use client'

/**
 * Perusahaan & akun — modul khusus Super Admin (dan versi terbatas Admin PT).
 * Jawaban dulu ("9 perusahaan aktif dengan 42 akun."), lalu tiga cara melihat:
 * Perusahaan (kartu), Akun (daftar lintas perusahaan dengan aksi massal), dan
 * Struktur (pohon holding → perusahaan → divisi & proyek). Semua detail dan
 * perubahan terjadi di Sheet, tidak pindah halaman.
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import { useResource } from '@/hooks/use-resource'
import {
  ActivityRings, Avatar, Button, Card, Chip, DashboardSkeleton, EmptyNote, ErrorNote, Hero, Icon, PageHeader,
  ProgressBar, SegmentedControl, StatTile, StatusBadge, cx,
} from '@/components/mk'
import { NotificationButton } from '@/components/shell'
import { AccountSheet, type AccountTarget } from '@/components/companies/account-sheet'
import { CompanySheet, UserRowButton, completeness, type CompanyTab } from '@/components/companies/company-sheet'
import { CompanyWizard } from '@/components/companies/company-wizard'
import { CompanyLogo, InfoLine, selectCls } from '@/components/companies/parts'
import { call, initialsOf, roleLabel, type CompaniesData, type Company, type UserRow } from '@/lib/accounts'
import { ALL_ROLES } from '@/lib/rbac'
import { formatNumber } from '@/lib/format'

type View = 'perusahaan' | 'akun' | 'struktur'
type CoFilter = 'all' | 'holding' | 'pt' | 'incomplete' | 'inactive'
type AccFilter = 'all' | 'active' | 'never' | 'nopass' | 'inactive'

const tones = ['data-1', 'data-2', 'data-3', 'data-4', 'data-5', 'data-6'] as const

export function CompaniesView() {
  const { data, loading, error, reload } = useResource<CompaniesData>('/api/companies')
  const [view, setView] = useState<View>('perusahaan')
  const [q, setQ] = useState('')
  const [wizard, setWizard] = useState(false)
  const [openCo, setOpenCo] = useState<{ id: string; tab: CompanyTab } | null>(null)
  const [account, setAccount] = useState<AccountTarget | null>(null)

  // Tombol "Tambah perusahaan" di dashboard Super Admin meninggalkan penanda ini.
  useEffect(() => {
    let flag = false
    try {
      flag = window.sessionStorage.getItem('mk-open-add-company') === '1'
      if (flag) window.sessionStorage.removeItem('mk-open-add-company')
    } catch {}
    if (flag) Promise.resolve().then(() => setWizard(true))
  }, [])

  if (loading && !data) return <DashboardSkeleton />
  if (error || !data) {
    return (
      <>
        <PageHeader title="Perusahaan & akun" />
        <Card>
          <ErrorNote message={error ? `Data belum termuat. ${error}` : undefined} onRetry={reload} />
        </Card>
      </>
    )
  }

  const full = data.scope !== 'ENTITY'
  const canManage = Boolean(data.canManageCompanies)
  const companies = data.companies
  const holdings = companies.filter((c) => c.type === 'HOLDING')
  const allUsers = [...data.holdingUsers, ...companies.flatMap((c) => c.users)]
  const activeUsers = allUsers.filter((u) => u.isActive)
  const loggedIn = activeUsers.filter((u) => u.lastLoginAt)
  const noPass = allUsers.filter((u) => !u.hasPassword)
  const headless = companies.flatMap((c) => c.divisions.filter((d) => !d.headUserId))
  const picless = companies.flatMap((c) => c.projects.filter((p) => !p.picUserId))
  const incomplete = companies.filter((c) => completeness(c).pct < 100)
  const activeCos = companies.filter((c) => c.isActive)
  const issues = activeUsers.length - loggedIn.length + noPass.length + headless.length + picless.length
  const openCompany = openCo ? (companies.find((c) => c.id === openCo.id) ?? null) : null
  const companyOf = (u: UserRow) => companies.find((c) => c.id === u.scopeEntityId) ?? null

  const support = [
    activeUsers.length - loggedIn.length ? `${activeUsers.length - loggedIn.length} akun belum pernah masuk.` : 'Semua akun aktif sudah pernah masuk.',
    headless.length ? `${headless.length} divisi belum punya kepala.` : null,
    picless.length ? `${picless.length} proyek belum punya manager.` : null,
    incomplete.length ? `${incomplete.length} profil perusahaan belum lengkap.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <PageHeader
        context={full ? 'Super Admin · seluruh grup' : `Admin PT · ${companies[0]?.name ?? 'perusahaan Anda'}`}
        title="Perusahaan & akun"
        tools={
          <>
            {canManage ? (
              <Button variant="secondary" size="sm" icon="tambah" onClick={() => setWizard(true)}>
                Tambah perusahaan
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon="tambah" onClick={() => setAccount({ user: null, company: companies[0] ?? null })}>
                Tambah akun
              </Button>
            )}
            <span className="mk-desktop-only">
              <NotificationButton />
            </span>
          </>
        }
      />

      <Hero
        eyebrow={full ? `${holdings.length} holding · ${companies.length - holdings.length} anak perusahaan` : 'Akun di perusahaan Anda'}
        answer={
          full
            ? `${formatNumber(activeCos.length)} perusahaan aktif dengan ${formatNumber(activeUsers.length)} akun.`
            : `${formatNumber(activeUsers.length)} akun aktif di ${companies[0]?.name ?? 'perusahaan Anda'}.`
        }
        support={support}
        actions={
          <>
            {issues > 0 ? (
              <Button variant="primary" iconAfter="kanan" onClick={() => setView(incomplete.length && full ? 'perusahaan' : 'akun')}>
                Tinjau {formatNumber(issues)} hal
              </Button>
            ) : canManage ? (
              <Button variant="primary" icon="tambah" onClick={() => setWizard(true)}>
                Tambah perusahaan
              </Button>
            ) : null}
            <Button variant="plain" onClick={() => setView('struktur')}>
              Lihat struktur grup
            </Button>
          </>
        }
        art={
          <ActivityRings
            size={176}
            rings={[
              { label: 'Akun aktif', value: pct(activeUsers.length, allUsers.length), tone: 'accent', display: `${activeUsers.length} dari ${allUsers.length}` },
              { label: 'Pernah masuk', value: pct(loggedIn.length, activeUsers.length), tone: 'hijau', display: `${loggedIn.length} dari ${activeUsers.length}`, sub: 'akun aktif' },
              {
                label: 'Profil lengkap',
                value: pct(companies.length - incomplete.length, companies.length),
                tone: 'biru',
                display: `${companies.length - incomplete.length} dari ${companies.length}`,
                sub: 'perusahaan',
              },
            ]}
          />
        }
        kpis={
          <>
            <StatTile variant="gradient" label="Perusahaan" value={companies.length} delta={`${activeCos.length} aktif · ${companies.length - activeCos.length} nonaktif`} />
            <StatTile label="Akun" value={allUsers.length} delta={noPass.length ? `${noPass.length} tanpa kata sandi` : `${data.holdingUsers.length} tingkat grup`} tone={noPass.length ? 'late' : 'neutral'} onClick={() => setView('akun')} />
            <StatTile label="Divisi" value={data.totals.divisions} delta={headless.length ? `${headless.length} tanpa kepala` : 'Semua berkepala'} tone={headless.length ? 'risk' : 'on'} onClick={() => setView('struktur')} />
            <StatTile label="Proyek" value={data.totals.projects} delta={picless.length ? `${picless.length} tanpa manager` : 'Semua bermanager'} tone={picless.length ? 'risk' : 'on'} onClick={() => setView('struktur')} />
          </>
        }
      />

      <div className="mk-toolbar">
        <SegmentedControl
          label="Tampilan"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: 'perusahaan', label: 'Perusahaan' },
            { value: 'akun', label: 'Akun' },
            { value: 'struktur', label: 'Struktur' },
          ]}
        />
        <div className="mk-search mk-toolbar__search">
          <Icon name="cari" size={18} />
          <label htmlFor="co-q" className="mk-sr">
            Cari
          </label>
          <input
            id="co-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={view === 'akun' ? 'Cari nama, username, email, jabatan' : 'Cari perusahaan, kode, kota'}
          />
        </div>
      </div>

      <div key={view} className="mk-tabpane">
        {view === 'perusahaan' && (
          <CompaniesGrid
            companies={companies}
            q={q}
            canManage={canManage}
            onOpen={(c, tab = 'ringkasan') => setOpenCo({ id: c.id, tab })}
            onAddAccount={(c) => setAccount({ user: null, company: c })}
            onAdd={() => setWizard(true)}
          />
        )}
        {view === 'akun' && (
          <AccountsPanel
            data={data}
            q={q}
            onOpen={(u) => setAccount({ user: u, company: companyOf(u) })}
            onAdd={() => setAccount({ user: null, company: full ? null : (companies[0] ?? null) })}
            onChanged={reload}
          />
        )}
        {view === 'struktur' && (
          <StructureTree data={data} q={q} onOpenCompany={(c, tab) => setOpenCo({ id: c.id, tab })} onOpenUser={(u) => setAccount({ user: u, company: companyOf(u) })} />
        )}
      </div>

      <CompanySheet
        company={openCompany}
        tab={openCo?.tab ?? 'ringkasan'}
        onTab={(t) => setOpenCo((o) => (o ? { ...o, tab: t } : o))}
        me={data.me}
        canManage={canManage}
        onClose={() => setOpenCo(null)}
        onChanged={reload}
        onOpenUser={(u, c) => setAccount({ user: u, company: c })}
      />
      <AccountSheet
        target={account}
        companies={full ? companies : companies}
        me={data.me}
        lockCompany={!full}
        allowedRoles={data.manageableRoles}
        onClose={() => setAccount(null)}
        onSaved={reload}
      />
      {canManage ? (
        <CompanyWizard
          open={wizard}
          holdings={holdings}
          onClose={() => setWizard(false)}
          onSaved={(id) => {
            reload()
            if (id) setTimeout(() => setOpenCo({ id, tab: 'ringkasan' }), 450)
          }}
        />
      ) : null}
    </>
  )
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

/* ------------------------------------------------------------------
   Perusahaan — kartu
   ------------------------------------------------------------------ */

function CompaniesGrid({
  companies,
  q,
  canManage,
  onOpen,
  onAddAccount,
  onAdd,
}: {
  companies: Company[]
  q: string
  canManage: boolean
  onOpen: (c: Company, tab?: CompanyTab) => void
  onAddAccount: (c: Company) => void
  onAdd: () => void
}) {
  const [filter, setFilter] = useState<CoFilter>('all')
  const [sort, setSort] = useState<'name' | 'users' | 'complete'>('name')
  const needle = q.trim().toLowerCase()

  const counts: Record<CoFilter, number> = {
    all: companies.length,
    holding: companies.filter((c) => c.type === 'HOLDING').length,
    pt: companies.filter((c) => c.type === 'PT').length,
    incomplete: companies.filter((c) => completeness(c).pct < 100).length,
    inactive: companies.filter((c) => !c.isActive).length,
  }

  const list = companies
    .filter((c) =>
      filter === 'all' ? true : filter === 'holding' ? c.type === 'HOLDING' : filter === 'pt' ? c.type === 'PT' : filter === 'incomplete' ? completeness(c).pct < 100 : !c.isActive
    )
    .filter((c) => !needle || [c.name, c.code, c.address, c.email, c.parentName].some((v) => (v ?? '').toLowerCase().includes(needle)))
    .sort((a, b) =>
      sort === 'users'
        ? b.users.length - a.users.length
        : sort === 'complete'
          ? completeness(a).pct - completeness(b).pct
          : a.type === b.type
            ? a.name.localeCompare(b.name)
            : a.type === 'HOLDING'
              ? -1
              : 1
    )

  const FILTERS: { v: CoFilter; label: string; status?: 'risk' | 'neutral' }[] = [
    { v: 'all', label: 'Semua' },
    { v: 'holding', label: 'Holding' },
    { v: 'pt', label: 'Anak perusahaan' },
    { v: 'incomplete', label: 'Perlu dilengkapi', status: 'risk' },
    { v: 'inactive', label: 'Nonaktif', status: 'neutral' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="mk-filterbar">
        <div className="mk-chips">
          {FILTERS.map((f) => (
            <Chip key={f.v} selected={filter === f.v} status={f.status} count={counts[f.v]} onClick={() => setFilter(f.v)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <label className="mk-sortsel">
          <span className="mk-sr">Urutkan</span>
          <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="name">Urut: nama</option>
            <option value="users">Urut: akun terbanyak</option>
            <option value="complete">Urut: paling belum lengkap</option>
          </select>
        </label>
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyNote icon="gedung" action={canManage && companies.length === 0 ? <Button variant="primary" icon="tambah" onClick={onAdd}>Tambah holding</Button> : undefined}>
            {companies.length === 0 ? 'Belum ada perusahaan. Mulai dengan menambahkan holding.' : 'Tidak ada perusahaan yang cocok.'}
          </EmptyNote>
        </Card>
      ) : (
        <div className="mk-cogrid">
          {list.map((c, i) => (
            <CompanyCard key={c.id} c={c} index={i} onOpen={onOpen} onAddAccount={onAddAccount} />
          ))}
          {canManage && filter === 'all' && !needle ? (
            <button type="button" className="mk-cocard mk-cocard--add" onClick={onAdd}>
              <span className="mk-cocard__plus" aria-hidden>
                <Icon name="tambah" size={28} strokeWidth={2} />
              </span>
              <span className="t-headline">Tambah perusahaan</span>
              <span className="t-footnote text-ink-2">Identitas, kontak, lalu akun pertamanya</span>
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function CompanyCard({
  c,
  index,
  onOpen,
  onAddAccount,
}: {
  c: Company
  index: number
  onOpen: (c: Company, tab?: CompanyTab) => void
  onAddAccount: (c: Company) => void
}) {
  const comp = completeness(c)
  const people = c.users.slice(0, 5)
  const headless = c.divisions.filter((d) => !d.headUserId).length
  return (
    <article className={cx('mk-cocard', !c.isActive && 'is-off')} style={{ ['--i' as string]: index }}>
      <button type="button" className="mk-cocard__hit" onClick={() => onOpen(c)} aria-label={`Buka ${c.name}`} />
      <header className="mk-cocard__head">
        <CompanyLogo company={c} size={52} />
        <div className="min-w-0 flex-1">
          <h3 className="mk-cocard__name">{c.name}</h3>
          <div className="mk-cocard__meta">
            <span className={cx('mk-tag', c.type === 'HOLDING' && 'is-strong')}>{c.type === 'HOLDING' ? 'Holding' : 'Anak perusahaan'}</span>
            <span className="font-mono">{c.code}</span>
          </div>
        </div>
        {!c.isActive ? <StatusBadge status="neutral" size="sm">Nonaktif</StatusBadge> : null}
      </header>

      <div className="mk-cocard__info">
        <InfoLine icon="gedung">{c.address || <span className="text-ink-2">Alamat belum diisi</span>}</InfoLine>
        <InfoLine icon="kirim">{c.email || c.phone || <span className="text-ink-2">Kontak belum diisi</span>}</InfoLine>
      </div>

      <div className="mk-cocard__stats">
        <button type="button" onClick={() => onOpen(c, 'akun')}>
          <strong>{c.counts.users}</strong> akun
        </button>
        <button type="button" onClick={() => onOpen(c, 'divisi')} className={headless ? 'is-warn' : undefined}>
          <strong>{c.counts.divisions}</strong> divisi
        </button>
        <button type="button" onClick={() => onOpen(c, 'proyek')}>
          <strong>{c.counts.projects}</strong> proyek
        </button>
        <span>
          <strong>{formatNumber(c.counts.dailyReports + c.counts.weeklyReports)}</strong> laporan
        </span>
      </div>

      <div className="mk-cocard__comp">
        <div className="flex items-center justify-between t-footnote">
          <span className="text-ink-2">Kelengkapan profil</span>
          <span className={comp.pct === 100 ? 'text-sukses font-semibold' : 'text-ink font-semibold'}>{comp.pct}%</span>
        </div>
        <ProgressBar value={comp.pct} status={comp.pct === 100 ? 'done' : comp.pct >= 60 ? 'accent' : 'risk'} showValue={false} label={`Kelengkapan ${c.name}`} />
      </div>

      <footer className="mk-cocard__foot">
        <div className="mk-stack" aria-label={`${c.users.length} akun`}>
          {people.map((u) => (
            <Avatar key={u.id} initials={initialsOf(u.name)} tone={tones[index % 6]} size={30} name={`${u.name} · ${roleLabel(u.role)}`} />
          ))}
          {c.users.length > people.length ? <span className="mk-stack__more">+{c.users.length - people.length}</span> : null}
          {c.users.length === 0 ? <span className="t-footnote text-ink-2">Belum ada akun</span> : null}
        </div>
        <Button size="sm" variant="plain" icon="tambah" onClick={() => onAddAccount(c)}>
          Tambah akun
        </Button>
        <Button size="sm" onClick={() => onOpen(c)}>
          Kelola
        </Button>
      </footer>
    </article>
  )
}

/* ------------------------------------------------------------------
   Akun — daftar lintas perusahaan, saringan, aksi massal
   ------------------------------------------------------------------ */

const PAGE = 40

function AccountsPanel({
  data,
  q,
  onOpen,
  onAdd,
  onChanged,
}: {
  data: CompaniesData
  q: string
  onOpen: (u: UserRow) => void
  onAdd: () => void
  onChanged: () => void
}) {
  const [status, setStatus] = useState<AccFilter>('all')
  const [place, setPlace] = useState('all')
  const [role, setRole] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const full = data.scope !== 'ENTITY'
  const allowed = data.manageableRoles

  const rows = useMemo(() => {
    const flat = [
      ...data.holdingUsers.map((u) => ({ u, c: null as Company | null })),
      ...data.companies.flatMap((c) => c.users.map((u) => ({ u, c }))),
    ]
    const needle = q.trim().toLowerCase()
    return flat
      .filter(({ u }) =>
        status === 'all' ? true : status === 'active' ? u.isActive : status === 'never' ? u.isActive && !u.lastLoginAt : status === 'nopass' ? !u.hasPassword : !u.isActive
      )
      .filter(({ c }) => (place === 'all' ? true : place === 'group' ? c === null : c?.id === place))
      .filter(({ u }) => (role === 'all' ? true : u.role === role))
      .filter(({ u, c }) => !needle || [u.name, u.username, u.email, u.title, roleLabel(u.role), c?.name].some((v) => (v ?? '').toLowerCase().includes(needle)))
      .sort((a, b) => (a.c?.name ?? '').localeCompare(b.c?.name ?? '') || a.u.name.localeCompare(b.u.name))
  }, [data, q, status, place, role])

  const all = [...data.holdingUsers, ...data.companies.flatMap((c) => c.users)]
  const counts: Record<AccFilter, number> = {
    all: all.length,
    active: all.filter((u) => u.isActive).length,
    never: all.filter((u) => u.isActive && !u.lastLoginAt).length,
    nopass: all.filter((u) => !u.hasPassword).length,
    inactive: all.filter((u) => !u.isActive).length,
  }
  const rolesPresent = (ALL_ROLES as readonly string[]).filter((r) => all.some((u) => u.role === r))
  const canTouch = (u: UserRow) => u.id !== data.me && (!allowed || allowed.includes(u.role))
  const pickable = rows.filter(({ u }) => canTouch(u))
  const allPicked = pickable.length > 0 && pickable.every(({ u }) => picked.has(u.id))

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function bulk(active: boolean) {
    const targets = all.filter((u) => picked.has(u.id) && u.isActive !== active)
    if (targets.length === 0) return
    setBusy(true)
    const results = await Promise.all(targets.map((u) => call('/api/companies/users', 'PATCH', { id: u.id, isActive: active })))
    setBusy(false)
    const okIds = targets.filter((_, i) => results[i].ok).map((u) => u.id)
    const failed = results.find((r) => !r.ok)
    onChanged()
    setPicked(new Set())
    setSelecting(false)
    if (okIds.length) {
      toast(`${okIds.length} akun ${active ? 'diaktifkan' : 'dinonaktifkan'}.`, {
        description: failed ? `Sebagian gagal: ${failed.error}` : undefined,
        action: {
          label: 'Urungkan',
          onClick: async () => {
            await Promise.all(okIds.map((id) => call('/api/companies/users', 'PATCH', { id, isActive: !active })))
            onChanged()
          },
        },
      })
    } else if (failed) {
      toast.error(failed.error ?? 'Status belum berubah.')
    }
  }

  const FILTERS: { v: AccFilter; label: string; status?: 'on' | 'risk' | 'late' | 'neutral' }[] = [
    { v: 'all', label: 'Semua' },
    { v: 'active', label: 'Aktif', status: 'on' },
    { v: 'never', label: 'Belum pernah masuk', status: 'risk' },
    { v: 'nopass', label: 'Tanpa kata sandi', status: 'late' },
    { v: 'inactive', label: 'Nonaktif', status: 'neutral' },
  ]

  return (
    <Card
      title="Akun"
      subtitle={`${formatNumber(rows.length)} dari ${formatNumber(all.length)} akun`}
      action={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={selecting ? 'secondary' : 'plain'}
            onClick={() => {
              setSelecting((v) => !v)
              setPicked(new Set())
            }}
          >
            {selecting ? 'Selesai memilih' : 'Pilih'}
          </Button>
          <Button size="sm" variant="primary" icon="tambah" onClick={onAdd}>
            Tambah akun
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="mk-chips">
          {FILTERS.map((f) => (
            <Chip key={f.v} selected={status === f.v} status={f.status} count={counts[f.v]} onClick={() => setStatus(f.v)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <div className="mk-filterrow">
          {full ? (
            <label className="flex-1 min-w-[180px]">
              <span className="mk-sr">Penempatan</span>
              <select className={selectCls} value={place} onChange={(e) => setPlace(e.target.value)}>
                <option value="all">Semua penempatan</option>
                <option value="group">Tingkat grup</option>
                {data.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex-1 min-w-[180px]">
            <span className="mk-sr">Posisi</span>
            <select className={selectCls} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="all">Semua posisi</option>
              {rolesPresent.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selecting ? (
          <div className="mk-bulkbar" role="toolbar" aria-label="Aksi untuk akun terpilih">
            <label className="flex items-center gap-2 t-callout">
              <input
                type="checkbox"
                className="mk-check"
                checked={allPicked}
                onChange={() => setPicked(allPicked ? new Set() : new Set(pickable.map(({ u }) => u.id)))}
              />
              {picked.size ? `${picked.size} dipilih` : 'Pilih semua yang tampil'}
            </label>
            <div className="flex-1" />
            <Button size="sm" disabled={!picked.size || busy} onClick={() => bulk(true)}>
              Aktifkan
            </Button>
            <Button size="sm" variant="destructive" disabled={!picked.size || busy} onClick={() => bulk(false)}>
              Nonaktifkan
            </Button>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyNote icon="pengguna">Tidak ada akun yang cocok dengan saringan ini.</EmptyNote>
        ) : (
          <div className="mk-list">
            {rows.slice(0, limit).map(({ u, c }) => (
              <div key={u.id} className="mk-pickrow">
                {selecting ? (
                  <input
                    type="checkbox"
                    className="mk-check"
                    aria-label={`Pilih ${u.name}`}
                    disabled={!canTouch(u)}
                    checked={picked.has(u.id)}
                    onChange={() => toggle(u.id)}
                  />
                ) : null}
                <UserRowButton u={u} me={data.me} onClick={() => (selecting && canTouch(u) ? toggle(u.id) : onOpen(u))} sub={`${u.title || roleLabel(u.role)} · ${c ? c.name : 'Tingkat grup'}`} />
              </div>
            ))}
          </div>
        )}
        {rows.length > limit ? (
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
            Tampilkan {Math.min(PAGE, rows.length - limit)} akun lagi
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------
   Struktur — pohon grup
   ------------------------------------------------------------------ */

function StructureTree({
  data,
  q,
  onOpenCompany,
  onOpenUser,
}: {
  data: CompaniesData
  q: string
  onOpenCompany: (c: Company, tab: CompanyTab) => void
  onOpenUser: (u: UserRow) => void
}) {
  const holdings = data.companies.filter((c) => c.type === 'HOLDING')
  const orphans = data.companies.filter((c) => c.type !== 'HOLDING' && !holdings.some((h) => h.id === c.parentId))
  const [open, setOpen] = useState<Set<string>>(() => new Set(['grup', ...holdings.map((h) => h.id)]))
  const needle = q.trim().toLowerCase()
  const match = (c: Company) =>
    !needle ||
    [c.name, c.code].some((v) => v.toLowerCase().includes(needle)) ||
    c.users.some((u) => u.name.toLowerCase().includes(needle)) ||
    c.divisions.some((d) => d.name.toLowerCase().includes(needle)) ||
    c.projects.some((p) => p.name.toLowerCase().includes(needle))

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const isOpen = (id: string) => open.has(id) || Boolean(needle)

  const allIds = ['grup', ...data.companies.map((c) => c.id)]

  return (
    <Card
      title="Struktur grup"
      subtitle="Holding, anak perusahaan, divisi, dan proyek beserta penanggung jawabnya"
      action={
        <Button size="sm" variant="secondary" onClick={() => setOpen(open.size >= allIds.length ? new Set() : new Set(allIds))}>
          {open.size >= allIds.length ? 'Ciutkan semua' : 'Buka semua'}
        </Button>
      }
    >
      <ul className="mk-tree" role="tree" aria-label="Struktur grup">
        {data.holdingUsers.length > 0 ? (
          <TreeNode id="grup" open={isOpen('grup')} onToggle={toggle} icon="kunci" title="Akun tingkat grup" meta={`${data.holdingUsers.length} akun`}>
            {data.holdingUsers
              .filter((u) => !needle || u.name.toLowerCase().includes(needle))
              .map((u) => (
                <li key={u.id} role="treeitem" aria-selected={false}>
                  <button type="button" className="mk-tree__leaf" onClick={() => onOpenUser(u)}>
                    <Avatar initials={initialsOf(u.name)} size={26} />
                    <span className="truncate">{u.name}</span>
                    <span className="mk-tree__sub">{roleLabel(u.role)}</span>
                  </button>
                </li>
              ))}
          </TreeNode>
        ) : null}
        {[...holdings, ...orphans].map((h) => {
          const kids = data.companies.filter((c) => c.parentId === h.id && c.type !== 'HOLDING')
          if (!match(h) && !kids.some(match)) return null
          return (
            <CompanyNode key={h.id} c={h} isOpen={isOpen} onToggle={toggle} onOpenCompany={onOpenCompany}>
              {kids.filter(match).map((k) => (
                <CompanyNode key={k.id} c={k} isOpen={isOpen} onToggle={toggle} onOpenCompany={onOpenCompany} />
              ))}
            </CompanyNode>
          )
        })}
      </ul>
    </Card>
  )
}

function CompanyNode({
  c,
  isOpen,
  onToggle,
  onOpenCompany,
  children,
}: {
  c: Company
  isOpen: (id: string) => boolean
  onToggle: (id: string) => void
  onOpenCompany: (c: Company, tab: CompanyTab) => void
  children?: React.ReactNode
}) {
  return (
    <TreeNode
      id={c.id}
      open={isOpen(c.id)}
      onToggle={onToggle}
      logo={<CompanyLogo company={c} size={28} />}
      title={c.name}
      meta={`${c.users.length} akun · ${c.divisions.length} divisi · ${c.projects.length} proyek`}
      onOpen={() => onOpenCompany(c, 'ringkasan')}
      dim={!c.isActive}
    >
      {c.divisions.map((d) => (
        <li key={d.id} role="treeitem" aria-selected={false}>
          <button type="button" className="mk-tree__leaf" onClick={() => onOpenCompany(c, 'divisi')}>
            <Icon name="tim" size={16} className="text-ink-3" />
            <span className="truncate">Divisi {d.name}</span>
            <span className={cx('mk-tree__sub', !d.headName && 'is-warn')}>{d.headName ?? 'Belum ada kepala'}</span>
          </button>
        </li>
      ))}
      {c.projects.map((p) => (
        <li key={p.id} role="treeitem" aria-selected={false}>
          <button type="button" className="mk-tree__leaf" onClick={() => onOpenCompany(c, 'proyek')}>
            <Icon name="proyek" size={16} className="text-ink-3" />
            <span className="truncate">{p.name}</span>
            <span className={cx('mk-tree__sub', !p.picName && 'is-warn')}>{p.picName ?? 'Belum ada manager'}</span>
          </button>
        </li>
      ))}
      {children}
    </TreeNode>
  )
}

function TreeNode({
  id,
  open,
  onToggle,
  icon,
  logo,
  title,
  meta,
  onOpen,
  dim,
  children,
}: {
  id: string
  open: boolean
  onToggle: (id: string) => void
  icon?: Parameters<typeof Icon>[0]['name']
  logo?: React.ReactNode
  title: string
  meta?: string
  onOpen?: () => void
  dim?: boolean
  children?: React.ReactNode
}) {
  return (
    <li role="treeitem" aria-expanded={open} aria-selected={false} className={cx('mk-tree__node', dim && 'is-dim')}>
      <div className="mk-tree__row">
        <button type="button" className="mk-tree__twisty" aria-label={open ? `Ciutkan ${title}` : `Buka ${title}`} onClick={() => onToggle(id)}>
          <Icon name="kanan" size={16} className={cx('mk-tree__chev', open && 'is-open')} />
        </button>
        {logo ?? (icon ? <span className="mk-tree__icon"><Icon name={icon} size={16} /></span> : null)}
        <button type="button" className="mk-tree__title" onClick={onOpen ?? (() => onToggle(id))}>
          <span className="truncate">{title}</span>
          {meta ? <span className="mk-tree__sub">{meta}</span> : null}
        </button>
      </div>
      <div className={cx('mk-tree__kids', open && 'is-open')}>
        <ul role="group">{children}</ul>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------
   Pita di dashboard Super Admin
   ------------------------------------------------------------------ */

export function SuperadminStrip() {
  const { setActiveTab } = useApp()
  const { data } = useResource<CompaniesData>('/api/companies')
  function openAdd() {
    try {
      window.sessionStorage.setItem('mk-open-add-company', '1')
    } catch {}
    setActiveTab('companies')
  }
  return (
    <Card
      title="Perusahaan & akun seluruh grup"
      subtitle={
        data
          ? `${formatNumber(data.totals.companies)} perusahaan · ${formatNumber(data.totals.users)} akun · ${formatNumber(data.totals.divisions)} divisi · ${formatNumber(data.totals.projects)} proyek`
          : 'Memuat ringkasan…'
      }
      action={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setActiveTab('companies')}>
            Kelola akun
          </Button>
          <Button size="sm" variant="primary" icon="tambah" onClick={openAdd}>
            Tambah perusahaan
          </Button>
        </div>
      }
    />
  )
}
