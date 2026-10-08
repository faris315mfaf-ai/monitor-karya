'use client'

import { useMemo, useState } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import {
  BarChart, Button, Card, EmptyNote, ErrorNote, Hero, Icon, PageHeader, ProgressBar, SearchField, Sheet,
  Skeleton, StatTile, StatusBadge, cx,
} from '@/components/mk'
import { ComplianceBadge, DailyStatusBadge, WeeklyHeaderBadge, complianceStatus } from '@/components/status-badges'
import { SectionTitle } from '@/components/companies/parts'
import { ENTITY_TYPE_LABELS, PROJECT_LIFECYCLE_LABELS, PROJECT_PHASE_LABELS } from '@/lib/constants'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'

type TreeKpi = {
  complianceScore: number
  onTimeDailyPct: number
  weeklyCompletenessPct: number
  lateToday: number
  pendingReports: number
} | null

type TreeNode = {
  id: string
  name: string
  code: string
  type: string
  region?: string | null
  kpi?: TreeKpi
  children?: TreeNode[]
}

type TreeResponse = {
  tree: TreeNode[]
  periodKey: string
}

type EntityDetail = {
  entity: {
    id: string
    name: string
    code: string
    type: string
    path: string | null
    region: string | null
    parentId: string | null
    isActive: boolean
  }
  parentChain: Array<{ id: string; name: string; code: string; type: string; region: string | null }>
  children: Array<{ id: string; name: string; code: string; type: string; region: string | null; isActive: boolean }>
  divisions?: Array<{
    id: string
    name: string
    isActive: boolean
    divisionType: { id: string; code: string; name: string }
  }>
  projects?: Array<{
    id: string
    name: string
    code: string
    phase: string
    lifecycle: string
    picName: string | null
    startDate: string | null
    targetEndDate: string | null
  }>
  adminAppointments?: Array<{
    id: string
    userName: string
    userEmail: string
    kind: string
    skNumber: string
    validFrom: string
    validUntil: string
    status: string
  }>
  currentKpi?: {
    complianceScore: number
    onTimeDailyPct: number
    weeklyCompletenessPct: number
    evidenceCompletenessPct: number
    highPriorityCompletionPct: number
    lateToday: number
    pendingReports: number
    totalProjects: number
    activeProjects: number
  } | null
  recentDailyReports?: Array<{
    id: string
    status: string
    progressPct: number
    reportDate: string
    isLate: boolean
    isLocked: boolean
    project: { id: string; name: string; code: string }
  }>
  recentWeeklyReports?: Array<{
    id: string
    isoYear: number
    isoWeek: number
    statusHeader: string
    isLocked: boolean
    division: { id: string; name: string }
  }>
}

type Picked = Pick<TreeNode, 'id' | 'name' | 'code' | 'type' | 'region' | 'kpi'>

const typeLabel = (t: string) => ENTITY_TYPE_LABELS[t] || t

/** Semua simpul PT di pohon (rekursif). */
function collectPT(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    if (n.type === 'PT') out.push(n)
    if (n.children?.length) collectPT(n.children, out)
  }
  return out
}

/** Pangkas pohon menurut kata kunci; simpul yang cocok membawa seluruh turunannya. */
function filterTree(nodes: TreeNode[], needle: string): TreeNode[] {
  if (!needle) return nodes
  const out: TreeNode[] = []
  for (const n of nodes) {
    const hit = [n.name, n.code, n.region ?? ''].some((v) => v.toLowerCase().includes(needle))
    if (hit) {
      out.push(n)
      continue
    }
    const kids = filterTree(n.children ?? [], needle)
    if (kids.length) out.push({ ...n, children: kids })
  }
  return out
}

/** Simpul yang punya anak, beserta kedalamannya. */
function branchIds(nodes: TreeNode[], depth = 0, out: { id: string; depth: number }[] = []) {
  for (const n of nodes) {
    if (n.children?.length) {
      out.push({ id: n.id, depth })
      branchIds(n.children, depth + 1, out)
    }
  }
  return out
}

/**
 * Entitas: pohon organisasi holding dengan kepatuhan tiap PT. Rincian satu PT
 * (KPI, divisi, proyek, laporan terbaru, penunjukan admin) dibuka di Sheet.
 */
export function EntitiesView() {
  const { data, loading, error, reload } = useFetch<TreeResponse>(`/api/entities`)
  const [picked, setPicked] = useState<Picked | null>(null)

  return (
    <>
      <PageHeader context="Pohon organisasi holding" title="Entitas" />

      {loading && !data ? (
        <EntitiesSkeleton />
      ) : error ? (
        <Card>
          <ErrorNote message={error} onRetry={reload} />
        </Card>
      ) : !data?.tree?.length ? (
        <Card>
          <EmptyNote icon="gedung">Belum ada entitas yang tercatat dalam cakupan Anda.</EmptyNote>
        </Card>
      ) : (
        <>
          <EntitiesHero data={data} />
          <EntityTree tree={data.tree} selectedId={picked?.id ?? null} onSelect={setPicked} />
        </>
      )}

      <EntitySheet picked={picked} onClose={() => setPicked(null)} />
    </>
  )
}

function EntitiesSkeleton() {
  return (
    <div className="contents" aria-busy="true" aria-label="Memuat entitas">
      <div className="mk-hero">
        <div className="mk-hero__text">
          <Skeleton h={26} w={180} r={999} />
          <Skeleton h={40} w="80%" r={12} />
          <Skeleton h={20} w="60%" />
        </div>
        <div className="mk-hero__kpis">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={96} r={14} />
          ))}
        </div>
      </div>
      <div className="mk-card">
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} h={44} />
          ))}
        </div>
      </div>
    </div>
  )
}

function EntitiesHero({ data }: { data: TreeResponse }) {
  const pts = collectPT(data.tree)
  const scored = pts.filter((p) => typeof p.kpi?.complianceScore === 'number')
  const needAttention = scored.filter((p) => {
    const s = complianceStatus(p.kpi!.complianceScore)
    return s === 'risk' || s === 'late'
  })
  const avg = scored.length ? scored.reduce((s, p) => s + p.kpi!.complianceScore, 0) / scored.length : null
  const pending = pts.reduce((s, p) => s + (p.kpi?.pendingReports ?? 0), 0)
  const late = pts.reduce((s, p) => s + (p.kpi?.lateToday ?? 0), 0)

  const answer =
    pts.length === 0
      ? 'Belum ada PT dalam pohon organisasi.'
      : needAttention.length === 0
        ? `${formatNumber(pts.length)} PT, semuanya patuh pelaporan periode ini.`
        : `${formatNumber(needAttention.length)} dari ${formatNumber(pts.length)} PT perlu perhatian kepatuhan.`

  return (
    <Hero
      eyebrow={`Kepatuhan ${periodLabel(data.periodKey)}`}
      answer={answer}
      support={
        needAttention.length
          ? `Perlu perhatian: ${needAttention.map((p) => p.name).slice(0, 3).join(', ')}${needAttention.length > 3 ? `, dan ${needAttention.length - 3} lainnya` : ''}. Pilih PT di pohon untuk membuka rinciannya.`
          : 'Pilih PT di pohon untuk melihat KPI, divisi, proyek, dan laporan terbarunya.'
      }
      kpis={
        <>
          <StatTile label="Entitas PT" value={pts.length} variant="surface" />
          <StatTile
            label="Rata-rata kepatuhan"
            value={avg === null ? '–' : formatPercent(avg, 0)}
            tone={avg === null ? 'neutral' : complianceStatus(avg)}
            delta={avg === null ? 'Belum ada skor' : undefined}
            variant="surface"
          />
          <StatTile label="Laporan tertunda" value={pending} tone={pending > 0 ? 'risk' : 'on'} delta={pending > 0 ? 'Belum diterima' : 'Semua masuk'} variant="surface" />
          <StatTile label="Terlambat hari ini" value={late} tone={late > 0 ? 'late' : 'on'} delta={late > 0 ? 'Lewat batas kirim' : 'Tidak ada'} variant="surface" />
        </>
      }
    />
  )
}

/* ------------------------------------------------------------------
   Pohon
   ------------------------------------------------------------------ */

function EntityTree({
  tree,
  selectedId,
  onSelect,
}: {
  tree: TreeNode[]
  selectedId: string | null
  onSelect: (n: Picked) => void
}) {
  const [q, setQ] = useState('')
  // Bawaan: dua tingkat teratas terbuka. Nilai di sini menimpa bawaan per simpul.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const needle = q.trim().toLowerCase()
  const shown = useMemo(() => filterTree(tree, needle), [tree, needle])
  const branches = useMemo(() => branchIds(tree), [tree])

  const isOpen = (id: string, depth: number) => Boolean(needle) || (toggled[id] ?? depth < 2)
  const everyOpen = branches.length > 0 && branches.every((b) => toggled[b.id] ?? b.depth < 2)
  const toggle = (id: string, depth: number) => setToggled((t) => ({ ...t, [id]: !(t[id] ?? depth < 2) }))

  return (
    <Card
      title="Pohon organisasi"
      subtitle="Pilih PT untuk membuka rinciannya"
      action={
        branches.length ? (
          <Button size="sm" onClick={() => setToggled(Object.fromEntries(branches.map((b) => [b.id, !everyOpen])))}>
            {everyOpen ? 'Ciutkan semua' : 'Buka semua'}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <SearchField id="entitas-cari" label="Cari entitas" placeholder="Cari nama, kode, atau wilayah" value={q} onChange={setQ} />
        {shown.length === 0 ? (
          <EmptyNote
            icon="cari"
            action={
              <Button size="sm" variant="plain" onClick={() => setQ('')}>
                Hapus pencarian
              </Button>
            }
          >
            Tidak ada entitas yang cocok dengan &ldquo;{q.trim()}&rdquo;.
          </EmptyNote>
        ) : (
          <ul className="mk-tree" role="tree" aria-label="Pohon organisasi">
            {shown.map((node) => (
              <TreeNodeRow key={node.id} node={node} depth={0} isOpen={isOpen} onToggle={toggle} onSelect={onSelect} selectedId={selectedId} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function TreeNodeRow({
  node,
  depth,
  isOpen,
  onToggle,
  onSelect,
  selectedId,
}: {
  node: TreeNode
  depth: number
  isOpen: (id: string, depth: number) => boolean
  onToggle: (id: string, depth: number) => void
  onSelect: (n: Picked) => void
  selectedId: string | null
}) {
  const hasChildren = (node.children?.length ?? 0) > 0
  const open = hasChildren && isOpen(node.id, depth)
  const isPT = node.type === 'PT'
  const isSelected = selectedId === node.id
  const score = isPT ? node.kpi?.complianceScore : null

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={isSelected} className="mk-tree__node">
      <div className="mk-tree__row">
        {hasChildren ? (
          <button
            type="button"
            className="mk-tree__twisty"
            aria-label={open ? `Ciutkan ${node.name}` : `Buka ${node.name}`}
            onClick={() => onToggle(node.id, depth)}
          >
            <Icon name="kanan" size={16} className={cx('mk-tree__chev', open && 'is-open')} />
          </button>
        ) : (
          <span className="mk-tree__spacer" aria-hidden />
        )}
        <span className="mk-tree__icon" aria-hidden>
          <Icon name={isPT ? 'gedung' : 'alur'} size={16} />
        </span>
        <button
          type="button"
          className={cx('mk-tree__title', isSelected && 'is-on')}
          onClick={() => (isPT ? onSelect(node) : hasChildren ? onToggle(node.id, depth) : undefined)}
          aria-label={isPT ? `Buka rincian ${node.name}` : undefined}
        >
          <span className="truncate">{node.name}</span>
          <span className="mk-tree__sub">
            {typeLabel(node.type)}
            {node.region ? ` · ${node.region}` : ''}
          </span>
        </button>
        {typeof score === 'number' ? (
          <span className="mk-tree__score">
            <ComplianceBadge score={score} />
          </span>
        ) : null}
      </div>
      {hasChildren ? (
        <div className={cx('mk-tree__kids', open && 'is-open')} inert={!open}>
          <ul role="group">
            {node.children!.map((child) => (
              <TreeNodeRow key={child.id} node={child} depth={depth + 1} isOpen={isOpen} onToggle={onToggle} onSelect={onSelect} selectedId={selectedId} />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  )
}

/* ------------------------------------------------------------------
   Rincian di Sheet
   ------------------------------------------------------------------ */

function EntitySheet({ picked, onClose }: { picked: Picked | null; onClose: () => void }) {
  // Isi tetap tampil selama animasi menutup.
  const [last, setLast] = useState<Picked | null>(picked)
  if (picked && picked !== last) setLast(picked)
  const p = picked ?? last
  const score = p?.kpi?.complianceScore

  return (
    <Sheet
      open={!!picked}
      onOpenChange={(o) => !o && onClose()}
      size="wide"
      backLabel="Entitas"
      title={p?.name ?? ''}
      subtitle={p ? [typeLabel(p.type), p.code, p.region].filter(Boolean).join(' · ') : undefined}
      eyebrow={typeof score === 'number' ? <ComplianceBadge score={score} /> : undefined}
    >
      {p ? <EntityDetailBody key={p.id} entityId={p.id} /> : null}
    </Sheet>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Memuat rincian">
      <Skeleton h={16} w="60%" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={96} r={14} />
        ))}
      </div>
      <Skeleton h={160} r={14} />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} h={44} />
      ))}
    </div>
  )
}

function EntityDetailBody({ entityId }: { entityId: string }) {
  const { data, loading, error, reload } = useFetch<EntityDetail>(`/api/entities/${entityId}`)

  if (loading && !data) return <DetailSkeleton />
  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (!data) return <ErrorNote message="Data entitas tidak tersedia." onRetry={reload} />

  const { entity, parentChain, children, divisions, projects, currentKpi, recentDailyReports, recentWeeklyReports, adminAppointments } = data
  const isPT = entity.type === 'PT'
  const trend = (recentDailyReports ?? []).slice(0, 7).reverse()
  const lateInTrend = trend.filter((r) => r.isLate).length

  return (
    <>
      {parentChain.length > 0 || !entity.isActive ? (
        <div className="flex flex-col gap-2">
          {parentChain.length > 0 ? (
            <nav className="mk-adm-crumb" aria-label="Jalur entitas">
              {parentChain.map((b) => (
                <span key={b.id} className="inline-flex items-center gap-1">
                  <span>{b.name}</span>
                  <Icon name="kanan" size={12} className="text-ink-3" />
                </span>
              ))}
              <span className="is-current">{entity.name}</span>
            </nav>
          ) : null}
          {!entity.isActive ? (
            <span>
              <StatusBadge status="neutral" size="sm">Nonaktif</StatusBadge>
            </span>
          ) : null}
        </div>
      ) : null}

      {children && children.length > 0 ? (
        <section className="mk-adm-sec">
          <SectionTitle icon="alur">Anak entitas · {children.length}</SectionTitle>
          <div className="mk-list">
            {children.map((c) => (
              <div key={c.id} className="mk-adm-row">
                <div className="mk-adm-row__body">
                  <span className="mk-adm-row__title">{c.name}</span>
                  <span className="mk-adm-row__meta">
                    <span className="font-mono">{c.code}</span>
                    {c.region ? ` · ${c.region}` : ''}
                  </span>
                </div>
                {!c.isActive ? <StatusBadge status="neutral" size="sm">Nonaktif</StatusBadge> : null}
                <span className="mk-tag">{typeLabel(c.type)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isPT && currentKpi ? (
        <>
          <section className="mk-adm-sec" aria-label="Indikator bulan ini">
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label="Skor kepatuhan"
                value={formatPercent(currentKpi.complianceScore, 0)}
                tone={complianceStatus(currentKpi.complianceScore)}
                delta="Bulan ini"
                variant="surface"
              />
              <StatTile label="Harian tepat waktu" value={formatPercent(currentKpi.onTimeDailyPct, 0)} delta="Laporan harian" variant="surface" />
              <StatTile label="Kelengkapan mingguan" value={formatPercent(currentKpi.weeklyCompletenessPct, 0)} delta="Laporan divisi" variant="surface" />
              <StatTile
                label="Laporan tertunda"
                value={currentKpi.pendingReports}
                tone={currentKpi.pendingReports > 0 ? 'risk' : 'on'}
                delta={`${formatNumber(currentKpi.lateToday)} terlambat hari ini`}
                variant="surface"
              />
            </div>
          </section>

          {trend.length > 0 ? (
            <section className="mk-adm-sec">
              <SectionTitle icon="laporan">Progres 7 laporan terakhir</SectionTitle>
              <BarChart
                data={trend.map((r) => ({ label: formatDate(r.reportDate).split(' ').slice(0, 2).join(' '), value: r.progressPct }))}
                height={150}
                unit="%"
                formatValue={(v) => `${v}%`}
              />
              <p className="t-footnote text-ink-2">
                {lateInTrend === 0
                  ? 'Semua laporan ini dikirim tepat waktu.'
                  : `${formatNumber(lateInTrend)} dari ${formatNumber(trend.length)} laporan ini terlambat dikirim.`}
              </p>
            </section>
          ) : null}

          <section className="mk-adm-sec">
            <SectionTitle icon="tim">Divisi · {divisions?.length ?? 0}</SectionTitle>
            {!divisions || divisions.length === 0 ? (
              <EmptyNote icon="tim">Belum ada divisi.</EmptyNote>
            ) : (
              <div className="mk-list">
                {divisions.map((d) => (
                  <div key={d.id} className="mk-adm-row">
                    <div className="mk-adm-row__body">
                      <span className="mk-adm-row__title">{d.name}</span>
                      {d.divisionType.name !== d.name ? <span className="mk-adm-row__meta">{d.divisionType.name}</span> : null}
                    </div>
                    {!d.isActive ? <StatusBadge status="neutral" size="sm">Nonaktif</StatusBadge> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mk-adm-sec">
            <SectionTitle icon="proyek">Proyek · {projects?.length ?? 0}</SectionTitle>
            {!projects || projects.length === 0 ? (
              <EmptyNote icon="proyek">Belum ada proyek.</EmptyNote>
            ) : (
              <div className="mk-list">
                {projects.map((p) => (
                  <div key={p.id} className="mk-adm-row">
                    <div className="mk-adm-row__body">
                      <span className="mk-adm-row__title">{p.name}</span>
                      <span className="mk-adm-row__meta">
                        <span className="font-mono">{p.code}</span> · {PROJECT_PHASE_LABELS[p.phase] || p.phase}
                        {p.picName ? ` · ${p.picName}` : ''}
                      </span>
                    </div>
                    <span className="mk-tag">{PROJECT_LIFECYCLE_LABELS[p.lifecycle] || p.lifecycle}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {recentDailyReports && recentDailyReports.length > 0 ? (
            <section className="mk-adm-sec">
              <SectionTitle icon="kalender">Laporan harian terbaru</SectionTitle>
              <div className="mk-list">
                {recentDailyReports.slice(0, 5).map((r) => (
                  <div key={r.id} className="mk-adm-row">
                    <div className="mk-adm-row__body">
                      <span className="mk-adm-row__title">{r.project.name}</span>
                      <span className="mk-adm-row__meta">
                        {formatDate(r.reportDate)}
                        {r.isLate ? ' · terlambat' : ''}
                      </span>
                    </div>
                    <DailyStatusBadge status={r.status} size="xs" />
                    <ProgressBar value={r.progressPct} className="mk-adm-row__prog" label={`Progres ${r.project.name}`} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {recentWeeklyReports && recentWeeklyReports.length > 0 ? (
            <section className="mk-adm-sec">
              <SectionTitle icon="laporan">Laporan mingguan terbaru</SectionTitle>
              <div className="mk-list">
                {recentWeeklyReports.slice(0, 4).map((w) => (
                  <div key={w.id} className="mk-adm-row">
                    <div className="mk-adm-row__body">
                      <span className="mk-adm-row__title">{w.division.name}</span>
                      <span className="mk-adm-row__meta mk-adm-num">
                        Minggu {w.isoWeek} · {w.isoYear}
                      </span>
                    </div>
                    <WeeklyHeaderBadge status={w.statusHeader} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {isPT && adminAppointments && adminAppointments.length > 0 ? (
        <section className="mk-adm-sec">
          <SectionTitle icon="pengguna">Penunjukan admin</SectionTitle>
          <div className="mk-list">
            {adminAppointments.slice(0, 5).map((a) => (
              <div key={a.id} className="mk-adm-row">
                <div className="mk-adm-row__body">
                  <span className="mk-adm-row__title">{a.userName}</span>
                  <span className="mk-adm-row__meta">
                    {a.kind} · SK {a.skNumber || '–'} · {formatDate(a.validFrom)} sampai {formatDate(a.validUntil)}
                  </span>
                </div>
                <StatusBadge status={a.status === 'AKTIF' ? 'on' : 'neutral'} size="sm">
                  {a.status === 'AKTIF' ? 'Aktif' : a.status.charAt(0) + a.status.slice(1).toLowerCase().replace(/_/g, ' ')}
                </StatusBadge>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isPT && !currentKpi ? (
        <EmptyNote icon="laporan">KPI periode ini belum dihitung untuk PT ini.</EmptyNote>
      ) : null}

      {!isPT && (!children || children.length === 0) ? (
        <p className="mk-note-box mk-soft--info">
          Entitas non-PT tidak memiliki KPI, divisi, atau proyek langsung. Pilih PT turunannya untuk melihat rincian lengkap.
        </p>
      ) : null}
    </>
  )
}

/** [F4-B] "2026-10" → "Oktober 2026" (format tanggal 01-prinsip-dan-bahasa). Kunci lain dikembalikan apa adanya. */
function periodLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return key
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15))
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
