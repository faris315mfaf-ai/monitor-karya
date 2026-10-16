'use client'

/**
 * Dashboard Manajemen & Superuser — tablet & desktop (KONTRAK-MANAJEMEN-MOBILE.md
 * bagian D4; papan M-Tablet-* dan F-Tablet*).
 *
 * Lebar kontainer (bukan viewport — shell punya sidebar) ≥ 1000px: tiga panel
 * subholding · PT · konten; panel PT hanya saat subholding dipilih. 600–999px:
 * dua panel — panel kiri berisi navigasi subholding, atau (subholding dipilih)
 * tombol pemilih subholding popover di atas daftar PT. Setiap panel bergulir
 * sendiri; tinggi mengikuti sisa ruang konten shell.
 *
 * Isi panel berganti dengan crossfade + geser 8px (pegas kritis); pilihan
 * aktif disorot latar yang bergeser halus. Rincian laporan: ReportDetail;
 * foto: EvidenceLightbox.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { ErrorNote, cx } from '@/components/mk'
import { EvidenceLightbox, type LightboxState } from '../evidence'
import { ReportDetail, type DetailReport } from '../report-detail'
import { displayName, photosOf, subholdingLabel, toneOf } from '../logic'
import { NO_FILTER, flatten, scoped, statusSummary, type Filter, type FlatV2 } from '../model'
import type { OverviewScreenProps } from '../screen-types'
import { AllView, ContentSkeleton, ScopeView, WeekView, type ContentActions } from './content'
import {
  allLine, contentKey, dayHeading, fillHeight, paneLayout, ptNameOf, statusCard, subRows, toDetail, weekRangeLabel,
} from './logic'
import { FadeSwap } from './parts'
import { PtList, SideHeader, SideSkeleton, StatusCard, SubNav, SubPicker } from './panes'

/** Warna panel: campuran token permukaan & latar (sisi lebih terang dari tengah di tema terang). */
const PANE_VARS = {
  '--tab-side': 'color-mix(in srgb, var(--surface) 60%, var(--bg))',
  '--tab-mid': 'color-mix(in srgb, var(--surface) 30%, var(--bg))',
} as CSSProperties

/** Ukur lebar kontainer + tinggi tersisa di bawahnya (dikurangi padding bawah konten shell). */
export function useBox() {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const main = el.closest('main')
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      const w = Math.round(el.getBoundingClientRect().width)
      const h = fillHeight(window.innerHeight, top, pad)
      setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (main) ro.observe(main)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  return { ref, box }
}

export function TabletOverview(props: OverviewScreenProps) {
  const { roleName, range, onRange, dateKey, data, week, loading, error, reload, filter, onFilter } = props
  const { ref, box } = useBox()
  const [detail, setDetail] = useState<DetailReport | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  // Perpindahan dipicu dari dalam isi (kartu/nama PT): fokus pindah ke kepala isi baru.
  const [focusNext, setFocusNext] = useState(false)

  const isWeek = range === 'week'
  const sub = useMemo(() => data?.subholdings.find((s) => s.id === filter.sub) ?? null, [data, filter.sub])
  const rows = useMemo(() => subRows(data, week, range), [data, week, range])
  const all = useMemo(() => ({ line: allLine(data, week, range) }), [data, week, range])
  const list = useMemo(() => scoped(data, filter), [data, filter])
  const allList = useMemo(() => flatten(data), [data])
  const curRow = rows.find((r) => r.id === filter.sub) ?? null
  const L = paneLayout(box?.w ?? 0, Boolean(filter.sub))

  const dateText = isWeek ? weekRangeLabel(week?.days) || '7 hari terakhir' : dayHeading(dateKey)
  const context = [roleName, dateText].filter(Boolean).join(' · ')
  const status = data && !isWeek ? statusCard(statusSummary(data, NO_FILTER)) : null

  const pick = useCallback(
    (f: Filter, fromContent = false) => {
      setFocusNext(fromContent)
      onFilter(f)
    },
    [onFilter]
  )
  const pickRange = (r: typeof range) => {
    setFocusNext(false)
    setDetail(null)
    setLightbox(null)
    onRange(r)
  }
  const openPhoto = (r: { kegiatan: string; evidence: FlatV2['evidence'] }, index: number) => {
    const items = photosOf(r.evidence)
    if (items.length) setLightbox({ items, index: Math.min(index, items.length - 1), title: r.kegiatan })
  }
  const act: ContentActions = {
    pick: (f) => pick(f, true),
    open: (r) => setDetail(toDetail(r)),
    photo: (r, i) => openPhoto(r, i),
  }

  const subNav = !data && !week ? (
    <SideSkeleton />
  ) : (
    <SubNav rows={rows} all={all} current={filter.sub} week={isWeek} onPick={(id) => pick({ sub: id, pt: null })} />
  )

  const ptList = (top?: ReactNode) =>
    sub ? (
      <PtList
        sub={sub}
        range={range}
        current={filter.pt}
        onPick={(pt) => pick({ sub: sub.id, pt })}
        top={top}
        className="min-h-0 flex-1"
      />
    ) : null

  // ---------- Isi panel konten ----------
  const subTitle = sub ? subholdingLabel(sub.name) : curRow?.name ?? ''
  const ptName = ptNameOf(sub, filter.pt)
  const head = filter.sub
    ? {
        crumb: filter.pt ? subTitle : dateText,
        title: filter.pt ? displayName(ptName) || 'PT' : subTitle,
        tone: toneOf(filter.sub),
      }
    : null

  let content: ReactNode
  if (isWeek) {
    content = (
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
    )
  } else if (!data) {
    content = loading || !error ? (
      <ContentSkeleton mode={L.mode} />
    ) : (
      <div className={L.mode === 'three' ? 'px-7 pt-7' : 'px-6 pt-6'}>
        <div className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <ErrorNote message={error ?? 'Laporan belum termuat.'} onRetry={reload} />
        </div>
      </div>
    )
  } else if (!filter.sub || !head) {
    content = <AllView mode={L.mode} data={data} list={allList} act={act} />
  } else {
    const ptDone = sub ? sub.pts.filter((p) => p.reports.length > 0).length : 0
    const ptTotal = sub ? sub.allPts?.length ?? Math.max(sub.ptCount ?? 0, sub.pts.length) : 0
    content = (
      <ScopeView
        mode={L.mode}
        range={range}
        crumb={head.crumb}
        title={head.title}
        tone={head.tone}
        list={list}
        ptDone={ptDone}
        ptTotal={ptTotal}
        ptSelected={Boolean(filter.pt)}
        act={act}
      />
    )
  }

  const busy = loading && Boolean(isWeek ? week : data)

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
                <SideHeader context={context} range={range} onRange={pickRange} />
                {status ? <StatusCard {...status} /> : null}
                {subNav}
              </aside>
            ) : (
              <aside
                aria-label="Subholding dan PT"
                style={{ width: L.sideW }}
                className="flex h-full shrink-0 flex-col bg-[var(--tab-mid)] shadow-[inset_-1px_0_0_var(--line)]"
              >
                <div className="flex-none px-3.5 pt-[26px]">
                  <SideHeader context={context} range={range} onRange={pickRange} />
                </div>
                {ptList(<SubPicker rows={rows} all={all} current={curRow} onPick={(id) => pick({ sub: id, pt: null })} />)}
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

            {/* Konten */}
            <FadeSwap
              k={contentKey(range, filter)}
              autoFocus={focusNext}
              label="Isi ringkasan"
              className={cx(
                'h-full flex-1 motion-safe:transition-opacity motion-safe:duration-[var(--dur-base)]',
                busy && 'opacity-60'
              )}
            >
              <div aria-busy={busy || undefined}>{content}</div>
            </FadeSwap>
          </>
        ) : null}
      </div>

      <ReportDetail report={detail} onClose={() => setDetail(null)} onOpenPhoto={(i) => detail && openPhoto(detail, i)} />
      {/* Setelah pop-up supaya lightbox yang dibuka dari pop-up tampil di atasnya. */}
      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </MotionConfig>
  )
}
