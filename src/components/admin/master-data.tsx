'use client'

/**
 * Data induk, pengguna per peran, dan kepatuhan per orang untuk Admin PT
 * (04-admin-pt.md §4, §5, §7). Semua dari /api/admin/overview.
 */

import { useState } from 'react'
import { useApp } from '@/components/app-provider'
import { Avatar, Button, Card, DivisionBar, DonutChart, EmptyNote, ErrorNote, Sheet, Skeleton, StatTile, StatusBadge, type ChartTone } from '@/components/mk'
import { initialsOf } from '@/lib/accounts'
import { formatRelative } from '@/lib/format'
import { divisionTone } from '@/lib/division-tone'
import type { AdminOverview } from '@/lib/admin-meta'
import { useFetch } from './use-fetch'

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
// [F2-ADMIN] warna data-1..6 khusus divisi; peran memakai palet aksen.
const TONES: ChartTone[] = ['biru', 'hijau', 'ungu', 'oranye', 'merah', 'grafit']

export function useAdminOverview() {
  return useFetch<AdminOverview>('/api/admin/overview')
}

type State = { data: AdminOverview | null; error: string | null; loading: boolean; reload: () => void }

export function MasterDataCard({ state, className }: { state: State; className?: string }) {
  const { setActiveTab } = useApp()
  const m = state.data?.masterData
  return (
    <Card className={className} title="Data induk" subtitle={state.data?.scope === 'ALL' ? 'Seluruh grup' : (state.data?.entityName ?? 'Perusahaan Anda')}>
      {state.loading && !state.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} h={96} />
          ))}
        </div>
      ) : state.error || !m ? (
        <ErrorNote message={state.error ?? undefined} onRetry={state.reload} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatTile variant="surface" label="Entitas" value={m.entities} delta="perusahaan aktif" />
          <StatTile variant="surface" label="Divisi" value={m.divisions} delta="divisi aktif" onClick={() => setActiveTab('divisions')} />
          <StatTile variant="surface" label="Proyek" value={m.projects} delta={`${m.activeProjects} aktif`} onClick={() => setActiveTab('projects')} />
          <StatTile variant="surface" label="Pengguna" value={m.users} delta={`${m.activeUsers} aktif`} tone={m.users - m.activeUsers > 0 ? 'risk' : 'on'} />
          <StatTile variant="surface" label="Template divisi" value={m.templates} delta="jenis divisi aktif" />
        </div>
      )}
    </Card>
  )
}

export function UsersByRoleCard({ state, className }: { state: State; className?: string }) {
  const rows = state.data?.usersByRole ?? []
  const total = rows.reduce((a, r) => a + r.count, 0)
  return (
    <Card className={className} title="Pengguna per peran" subtitle={state.data ? `${total} akun aktif` : 'Memuat…'}>
      {state.loading && !state.data ? (
        <Skeleton h={180} />
      ) : state.error ? (
        <ErrorNote message={state.error} onRetry={state.reload} />
      ) : total === 0 ? (
        <EmptyNote icon="pengguna">Belum ada akun aktif.</EmptyNote>
      ) : (
        <DonutChart
          data={rows.map((r, i) => ({ label: r.label, value: r.count, tone: TONES[i % TONES.length] }))}
          size={168}
          centerLabel={total}
          centerSub="akun"
          label="Pengguna aktif per peran"
          showLegend
          layout="stack"
          formatValue={(v) => `${v} orang`}
        />
      )}
    </Card>
  )
}

type Division = AdminOverview['compliance']['divisions'][number]

/**
 * Kepatuhan laporan harian per orang ("5 dari 6 orang"). Bila keanggotaan
 * divisi belum diisi, kembalikan null supaya pemanggil memakai tampilan per proyek.
 */
export function PeopleCompliance({ state }: { state: State }) {
  const { setActiveTab } = useApp()
  const [openId, setOpenId] = useState<string | null>(null)
  const [last, setLast] = useState<Division | null>(null)
  const divisions = (state.data?.compliance.divisions ?? []).filter((d) => d.expected > 0 || d.onLeave > 0)
  const open = divisions.find((d) => d.id === openId) ?? null
  if (open && open !== last) setLast(open)
  const sheet = open ?? last

  if (!state.data?.compliance.hasMembership || divisions.length === 0) return null

  return (
    <>
      <div className="mk-list">
        {divisions.map((d) => {
          const missing = d.expected - d.reported
          return (
            <button key={d.id} type="button" className="mk-listrow w-full text-left" onClick={() => setOpenId(d.id)} aria-label={`Detail Divisi ${d.name}`}>
              <div className="min-w-0 flex-1">
                <DivisionBar
                  name={`Divisi ${d.name}`}
                  value={pct(d.reported, d.expected)}
                  tone={divisionTone(d.name)}
                  meta={`${d.reported} dari ${d.expected} orang${d.onLeave ? ` · ${d.onLeave} cuti/izin` : ''} · ${d.head ?? 'Kepala divisi belum ditetapkan'}`}
                />
              </div>
              <StatusBadge status={missing ? 'risk' : 'done'} size="sm">
                {missing ? `${missing} belum` : 'Lengkap'}
              </StatusBadge>
            </button>
          )
        })}
      </div>
      <Sheet
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={sheet ? `Divisi ${sheet.name}` : ''}
        subtitle={sheet ? `Kepala divisi ${sheet.head ?? 'belum ditetapkan'}` : undefined}
        backLabel="Kepatuhan"
        footer={
          <Button
            variant="primary"
            icon="notifikasi"
            onClick={() => {
              setOpenId(null)
              setActiveTab('work-desk')
            }}
          >
            Ingatkan di meja kerja
          </Button>
        }
      >
        {sheet ? (
          <>
            <div className="mk-kv">
              <div>
                <div className="t-footnote text-ink-2">Laporan harian</div>
                <div className="t-body-strong">
                  {sheet.reported} dari {sheet.expected} orang
                </div>
              </div>
              <div>
                <div className="t-footnote text-ink-2">Cuti / izin hari ini</div>
                <div className="t-body-strong">{sheet.onLeave} orang</div>
              </div>
            </div>
            <div>
              <h3 className="t-headline mb-2">Belum lapor hari ini</h3>
              {sheet.missing.length === 0 ? (
                <EmptyNote done>Semua anggota sudah lapor hari ini.</EmptyNote>
              ) : (
                <div className="mk-list">
                  {sheet.missing.map((p) => (
                    <div key={p.id} className="mk-listrow">
                      <Avatar initials={initialsOf(p.name)} size={36} name={p.name} />
                      <div className="min-w-0 flex-1">
                        <div className="t-body-strong truncate">{p.name}</div>
                        <div className="t-footnote text-ink-2 truncate">
                          {p.role} · {p.lastReportAt ? `terakhir lapor ${formatRelative(p.lastReportAt).toLowerCase()}` : 'belum pernah lapor'}
                        </div>
                      </div>
                      <StatusBadge status="risk" size="sm">
                        Belum lapor
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </Sheet>
    </>
  )
}
