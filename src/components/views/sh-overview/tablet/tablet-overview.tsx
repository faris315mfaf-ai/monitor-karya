'use client'

/**
 * Dashboard Manajemen & Superuser — tablet & desktop. Rentang Hari ini /
 * Kemarin: tampilan "Semua terbuka" (TabletDayFeed, day-feed.tsx) atau
 * "Ringkas" (TabletDaySplit, day-split.tsx) menurut pilihan pengguna.
 * Rentang 7 hari: TabletWeek di bawah (KONTRAK-MANAJEMEN-MOBILE.md bagian D4;
 * papan M-Tablet-7Hari).
 *
 * TabletWeek — lebar kontainer (bukan viewport — shell punya sidebar)
 * ≥ 1000px: tiga panel subholding · PT · tabel; panel PT hanya saat subholding
 * dipilih. 600–999px: dua panel — panel kiri berisi navigasi subholding, atau
 * (subholding dipilih) tombol pemilih subholding popover di atas daftar PT.
 * Setiap panel bergulir sendiri; tinggi mengikuti sisa ruang konten shell.
 */

import { useMemo, type ReactNode } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { cx } from '@/components/mk'
import { displayName, subholdingLabel, toneOf } from '../logic'
import type { OverviewScreenProps } from '../screen-types'
import { WeekView } from './content'
import { TabletDayFeed } from './day-feed'
import { TabletDaySplit } from './day-split'
import { allLine, contentKey, paneLayout, ptNameOf, subRows, weekRangeLabel } from './logic'
import { FadeSwap } from './parts'
import { PtList, SideHeader, SideSkeleton, SubNav, SubPicker } from './panes'
import { PANE_VARS, useBox } from './use-box'

export function TabletOverview(props: OverviewScreenProps) {
  if (props.range === 'week') return <TabletWeek {...props} />
  return props.dayView === 'ringkas' ? <TabletDaySplit {...props} /> : <TabletDayFeed {...props} />
}

function TabletWeek({ roleName, range, onRange, data, week, loading, error, reload, filter, onFilter }: OverviewScreenProps) {
  const { ref, box } = useBox()

  const sub = useMemo(() => data?.subholdings.find((s) => s.id === filter.sub) ?? null, [data, filter.sub])
  const rows = useMemo(() => subRows(data, week, range), [data, week, range])
  const all = useMemo(() => ({ line: allLine(data, week, range) }), [data, week, range])
  const curRow = rows.find((r) => r.id === filter.sub) ?? null
  const L = paneLayout(box?.w ?? 0, Boolean(filter.sub))
  const dateText = weekRangeLabel(week?.days) || '7 hari terakhir'
  const context = [roleName, dateText].filter(Boolean).join(' · ')
  const pickSub = (id: string | null) => onFilter({ sub: id, pt: null })

  const subNav = !data && !week ? (
    <SideSkeleton />
  ) : (
    <SubNav rows={rows} all={all} current={filter.sub} week onPick={pickSub} />
  )

  const ptList = (top?: ReactNode) =>
    sub ? (
      <PtList
        sub={sub}
        range={range}
        current={filter.pt}
        onPick={(pt) => onFilter({ sub: sub.id, pt })}
        top={top}
        className="min-h-0 flex-1"
      />
    ) : null

  const ptName = ptNameOf(sub, filter.pt)
  const subTitle = sub ? subholdingLabel(sub.name) : curRow?.name ?? ''
  const head = filter.sub
    ? {
        crumb: filter.pt ? subTitle : dateText,
        title: filter.pt ? displayName(ptName) || 'PT' : subTitle,
        tone: toneOf(filter.sub),
      }
    : null

  const busy = loading && Boolean(week)

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={ref}
        style={{ ...PANE_VARS, height: box?.h ?? 'calc(100dvh - 160px)' }}
        className="flex min-h-[480px] w-full overflow-hidden rounded-[var(--radius-xl)] border border-line bg-bg"
      >
        {box ? (
          <>
            {/* Panel subholding (tiga panel) / panel kiri (dua panel) */}
            {L.mode === 'three' || !sub ? (
              <aside
                aria-label="Subholding"
                style={{ width: L.sideW }}
                className="scrollbar-thin flex h-full shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain bg-[var(--tab-side)] px-3.5 pt-[26px] pb-6 shadow-[inset_-1px_0_0_var(--line)]"
              >
                <SideHeader context={context} title="Pola 7 hari" range={range} onRange={onRange} />
                {subNav}
              </aside>
            ) : (
              <aside
                aria-label="Subholding dan PT"
                style={{ width: L.sideW }}
                className="flex h-full shrink-0 flex-col bg-[var(--tab-mid)] shadow-[inset_-1px_0_0_var(--line)]"
              >
                <div className="flex-none px-3.5 pt-[26px]">
                  <SideHeader context={context} title="Pola 7 hari" range={range} onRange={onRange} />
                </div>
                {ptList(<SubPicker rows={rows} all={all} current={curRow} onPick={pickSub} />)}
              </aside>
            )}

            {/* Panel PT (tiga panel, hanya bila subholding dipilih) */}
            {L.mode === 'three' && sub ? (
              <motion.section
                key="pt"
                aria-label="Daftar PT"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                style={{ width: L.ptW }}
                className="flex h-full shrink-0 flex-col bg-[var(--tab-mid)] shadow-[inset_-1px_0_0_var(--line)]"
              >
                {ptList()}
              </motion.section>
            ) : null}

            <FadeSwap
              k={contentKey(range, filter)}
              label="Isi ringkasan"
              className={cx(
                'h-full flex-1 motion-safe:transition-opacity motion-safe:duration-[var(--dur-base)]',
                busy && 'opacity-60'
              )}
            >
              <div aria-busy={busy || undefined}>
                <WeekView
                  mode={L.mode}
                  week={week}
                  filter={filter}
                  loading={loading}
                  error={error}
                  reload={reload}
                  head={head}
                  ptName={ptName}
                />
              </div>
            </FadeSwap>
          </>
        ) : null}
      </div>
    </MotionConfig>
  )
}
