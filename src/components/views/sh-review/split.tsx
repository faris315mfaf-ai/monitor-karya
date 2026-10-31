'use client'

/**
 * Persetujuan Supervisor — tablet & desktop (papan S-Tablet-Lanskap dan
 * S-Tablet-Tegak, 16 Okt 2026).
 *
 * Lebar kontainer ≥ 1000px: tiga panel — subholding (jumlah menunggu +
 * umur terlama) · antrean · rincian. Di bawahnya dua panel: antrean dengan
 * pemilih subholding popover di atasnya · rincian. Lebar diukur pada kontainer
 * (shell punya sidebar), tiap panel bergulir sendiri.
 *
 * Rincian berganti dengan crossfade + geser 8px (pegas kritis); baris aktif
 * disorot latar yang bergeser halus; tombol naik/turun dan panah ↑/↓ di
 * antrean berpindah laporan. Bilah keputusan menempel di bawah panel rincian
 * (material kaca). Setelah memutuskan, laporan keluar dari antrean dan
 * laporan berikutnya terbuka.
 */

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion'
import { ErrorNote, Icon, Skeleton, cx } from '@/components/mk'
import { EvidenceLightbox, type LightboxState } from '../sh-overview/evidence'
import { toneOf } from '../sh-overview/logic'
import { subholdingLabel } from '../sh-overview/logic'
import { useBox } from '../sh-overview/tablet/tablet-overview'
import { ActiveBg, FadeSwap, Mono } from '../sh-overview/tablet/parts'
import { SubPicker } from '../sh-overview/tablet/panes'
import type { SubRow } from '../sh-overview/tablet/logic'
import { PdfLink } from './pdf-link'
import { Description, DecidedNote, EvidenceStrip, Facts, HighlightNote, SubMono, Thread, evidenceOf } from './body'
import {
  ApproveButton, CommentField, CommentOnlyButton, DecisionHint, HighlightCard, ReviseButton, useDecision,
} from './decision'
import {
  neighborId, oldestOf, positionText, sentLine, subLine, todayRecap, waitingHeadline, type ReviewSubholding, type ShReport,
} from './logic'
import { FOCUS_RING, QueueRowContent, SNAP, StatusTabs } from './queue'
import { useReview, type ReviewState } from './use-review'

const PANE_VARS = {
  '--tab-side': 'color-mix(in srgb, var(--surface) 60%, var(--bg))',
  '--tab-mid': 'color-mix(in srgb, var(--surface) 30%, var(--bg))',
} as CSSProperties

const THREE_MIN = 1000

export function ReviewSplit() {
  const s = useReview()
  const { ref, box } = useBox()
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  const [now] = useState(() => new Date())
  const three = (box?.w ?? 0) >= THREE_MIN

  const openPhoto = (r: ShReport, index: number) => {
    const items = evidenceOf(r)
    if (items.length) setLightbox({ items, index: Math.min(index, items.length - 1), title: r.kegiatan })
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={ref}
        style={{ ...PANE_VARS, height: box?.h ?? 'calc(100dvh - 160px)' }}
        className="flex min-h-[480px] w-full overflow-hidden rounded-[var(--radius-xl)] border border-line bg-bg"
      >
        {box ? (
          <>
            {three ? (
              <aside
                aria-label="Subholding"
                className="scrollbar-thin flex h-full w-[252px] shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain bg-[var(--tab-side)] px-3 pt-6 pb-6 shadow-[inset_-1px_0_0_var(--line)]"
              >
                <Heading total={s.totalWaiting} ready={Boolean(s.data)} />
                <SubNav s={s} now={now} />
              </aside>
            ) : null}
            <QueuePane s={s} three={three} now={now} />
            <DetailPane s={s} now={now} onPhoto={openPhoto} />
          </>
        ) : null}
      </div>
      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </MotionConfig>
  )
}

function Heading({ total, ready }: { total: number; ready: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-2">
      <span className="t-footnote font-semibold text-ink-2">{ready ? waitingHeadline(total) : 'Memuat antrean…'}</span>
      <h1 className="m-0 t-title-2 tracking-[-0.025em] text-ink">Persetujuan</h1>
    </div>
  )
}

/* ---------- Panel subholding ---------- */

function SubNav({ s, now }: { s: ReviewState; now: Date }) {
  const subs = s.subholdings
  if (!s.data) {
    return (
      <div className="flex flex-col gap-2 px-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} h={44} r={12} />
        ))}
      </div>
    )
  }
  const all = subLine({ waiting: s.totalWaiting, oldestAt: oldestOf(subs) }, now)
  return (
    <LayoutGroup id="sv-sub">
      <nav aria-label="Pilih subholding" className="flex flex-col gap-0.5">
        <SubButton name="Semua subholding" mono="∑" id={null} line={all} count={s.totalWaiting} current={s.sub === null} onClick={() => s.pickSub(null)} />
        {subs.map((x) => (
          <SubButton
            key={x.id}
            name={subholdingLabel(x.name)}
            id={x.id}
            line={subLine(x, now)}
            count={x.waiting}
            current={s.sub === x.id}
            onClick={() => s.pickSub(x.id)}
          />
        ))}
      </nav>
    </LayoutGroup>
  )
}

function SubButton({
  name,
  mono,
  id,
  line,
  count,
  current,
  onClick,
}: {
  name: string
  mono?: string
  id: string | null
  line: { text: string; warn: boolean }
  count: number
  current: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
      className={cx(
        'relative flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 py-1.5 text-left',
        !current && 'hover:bg-fill-1',
        'motion-safe:transition-[transform,background-color] motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.98]',
        FOCUS_RING
      )}
    >
      {current ? <ActiveBg layoutId="sv-sub-aktif" className="rounded-[12px]" /> : null}
      <Mono name={name} text={mono} tone={id ? toneOf(id) : null} size={30} className="relative" />
      <span className="relative flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate t-callout font-semibold text-ink">{name}</span>
        <span className={cx('truncate t-caption font-normal', line.warn ? 'text-waspada' : 'text-ink-2')}>{line.text}</span>
      </span>
      {count > 0 ? (
        <span className="relative flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-accent-fill px-[7px] t-caption font-bold tabular-nums text-on-accent">
          {count}
          <span className="sr-only"> menunggu</span>
        </span>
      ) : null}
    </button>
  )
}

/* ---------- Panel antrean ---------- */

function pickerRows(subs: ReviewSubholding[], now: Date): SubRow[] {
  return subs.map((x) => {
    const l = subLine(x, now)
    return {
      id: x.id,
      name: subholdingLabel(x.name),
      tone: toneOf(x.id),
      reports: x.waiting,
      highlights: 0,
      line: x.waiting ? `${x.waiting} menunggu · ${l.text.toLowerCase()}` : l.text,
      warn: l.warn,
    }
  })
}

function QueuePane({ s, three, now }: { s: ReviewState; three: boolean; now: Date }) {
  const listRef = useRef<HTMLUListElement>(null)
  const rows = useMemo(() => pickerRows(s.subholdings, now), [s.subholdings, now])
  const curRow = rows.find((r) => r.id === s.sub) ?? null
  const allLine = s.totalWaiting ? `${s.totalWaiting} menunggu` : 'Tidak ada antrean'

  // Panah ↑/↓ saat fokus di antrean: pindah laporan dan fokus ikut.
  function onKey(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const next = neighborId(s.items, s.selected, e.key === 'ArrowDown' ? 1 : -1)
    if (!next) return
    e.preventDefault()
    s.select(next)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-id="${next}"]`)?.focus())
  }

  return (
    <section
      aria-label="Antrean"
      className={cx('flex h-full shrink-0 flex-col bg-[var(--tab-mid)] shadow-[inset_-1px_0_0_var(--line)]', three ? 'w-[330px]' : 'w-[320px]')}
    >
      <div className="flex flex-none flex-col gap-2.5 px-3.5 pt-[22px] pb-2.5">
        {!three ? (
          <>
            <Heading total={s.totalWaiting} ready={Boolean(s.data)} />
            <SubPicker rows={rows} all={{ line: allLine }} current={curRow} onPick={s.pickSub} />
          </>
        ) : null}
        <StatusTabs value={s.tab} counts={s.counts} onChange={s.pickTab} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-5">
        {!s.data ? (
          s.error ? (
            <div className="px-1 pt-2">
              <ErrorNote message={s.error} onRetry={s.reload} />
            </div>
          ) : (
            <div className="flex flex-col gap-1 px-1" aria-busy="true" aria-label="Memuat antrean">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 py-2.5">
                  <Skeleton w={48} h={48} r={10} />
                  <div className="flex flex-1 flex-col gap-2 pt-1">
                    <Skeleton h={14} w="80%" />
                    <Skeleton h={10} w="55%" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : s.items.length === 0 ? (
          <p className="m-0 mx-1 mt-2 rounded-[var(--radius-md)] bg-surface p-4 t-callout font-normal text-ink-2 shadow-[var(--shadow-card)]">
            {s.tab === 'MENUNGGU' ? 'Tidak ada laporan yang menunggu. Semua sudah ditinjau.' : 'Belum ada laporan dengan status ini.'}
          </p>
        ) : (
          <LayoutGroup id="sv-queue">
            <ul ref={listRef} onKeyDown={onKey} aria-label="Antrean laporan" className="m-0 flex list-none flex-col gap-0.5 p-0">
              <AnimatePresence initial={false}>
                {s.items.map((r) => {
                  const on = r.id === s.selected
                  return (
                    <motion.li
                      key={r.id}
                      layout="position"
                      transition={SNAP}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                    >
                      <button
                        type="button"
                        data-id={r.id}
                        aria-current={on ? 'true' : undefined}
                        onClick={() => s.select(r.id)}
                        className={cx(
                          'relative flex w-full cursor-pointer items-start gap-3 rounded-[13px] p-2.5 text-left',
                          !on && 'hover:bg-fill-1',
                          'motion-safe:transition-[transform,background-color] motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.98]',
                          FOCUS_RING
                        )}
                      >
                        {on ? <ActiveBg layoutId="sv-queue-aktif" className="rounded-[13px]" /> : null}
                        <span className="relative flex min-w-0 flex-1 items-start gap-3">
                          <QueueRowContent r={r} subLabel={s.sub === null ? s.shortOf(r.subholdingId) : null} now={now} />
                        </span>
                      </button>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          </LayoutGroup>
        )}
      </div>
    </section>
  )
}

/* ---------- Panel rincian ---------- */

function DetailPane({ s, now, onPhoto }: { s: ReviewState; now: Date; onPhoto: (r: ShReport, i: number) => void }) {
  const r = s.current
  const idx = r ? s.items.findIndex((x) => x.id === r.id) : -1
  const prev = r ? neighborId(s.items, r.id, -1) : null
  const next = r ? neighborId(s.items, r.id, 1) : null

  return (
    <section aria-label="Rincian laporan" className="@container/detail flex h-full min-w-0 flex-1 flex-col">
      {r ? (
        <div className="flex flex-none items-center gap-2.5 py-3 pr-5 pl-6 shadow-[inset_0_-1px_0_var(--line)]">
          <SubMono id={r.subholdingId} name={r.subholdingName} size={24} />
          <span className="min-w-0 flex-1 truncate t-footnote text-ink-2">
            <strong className="font-semibold text-ink">{subholdingLabel(r.subholdingName)}</strong> · {r.ptName}
          </span>
          <span className="shrink-0 t-footnote tabular-nums text-ink-2">{positionText(idx, s.items.length)}</span>
          <PdfLink reportId={r.id} title={r.kegiatan} />
          <NavButton label="Laporan sebelumnya" icon="naik" disabled={!prev} onClick={() => prev && s.select(prev)} />
          <NavButton label="Laporan berikutnya" icon="turun" disabled={!next} onClick={() => next && s.select(next)} />
        </div>
      ) : null}
      <FadeSwap k={r?.id ?? `kosong-${s.tab}`} label={r ? r.kegiatan : undefined} className="min-h-0 flex-1">
        {r ? (
          <Detail key={r.id} r={r} s={s} now={now} onPhoto={(i) => onPhoto(r, i)} />
        ) : !s.data ? (
          <div className="flex flex-col gap-4 px-6 pt-6" aria-hidden>
            <Skeleton h={30} w="70%" />
            <Skeleton h={14} w="40%" />
            <Skeleton h={168} r={14} />
            <Skeleton h={120} r={14} />
          </div>
        ) : (
          <Empty s={s} />
        )}
      </FadeSwap>
    </section>
  )
}

function NavButton({ label, icon, disabled, onClick }: { label: string; icon: 'naik' | 'turun'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fill-2 text-ink disabled:cursor-default disabled:text-ink-3',
        'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.92]',
        FOCUS_RING
      )}
    >
      <Icon name="bawah" size={16} strokeWidth={2.4} className={icon === 'naik' ? 'rotate-180' : undefined} />
    </button>
  )
}

function Detail({ r, s, now, onPhoto }: { r: ShReport; s: ReviewState; now: Date; onPhoto: (i: number) => void }) {
  const d = useDecision(r, { onDecided: (id) => s.decided(id), onCommented: s.reload, onStale: s.reload })
  const sent = sentLine(r, now)
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-[18px] px-6 pt-5 pb-8">
        <header className="flex flex-col gap-1.5">
          <h2 data-pane-focus tabIndex={-1} className="m-0 t-title-2 text-ink outline-none">
            {r.kegiatan}
          </h2>
          <span className="t-callout font-normal text-ink-2">
            {sent.text}
            {sent.wait ? <span className={sent.warn ? 'font-semibold text-waspada' : undefined}>{sent.wait}</span> : null}
          </span>
        </header>
        <HighlightNote r={r} />
        <EvidenceStrip r={r} onOpen={onPhoto} />
        <Facts r={r} />
        <Description r={r} />
        <Thread r={r} onEdited={s.reload} />
        <HighlightCard d={d} />
        {/* Panel sempit: "Kirim komentar saja" di bawah kolom; panel lebar: di bilah keputusan. */}
        <CommentField d={d} inlineSend sendClassName={d.gate.decidable ? '@min-[600px]/detail:hidden' : undefined} />
        <DecidedNote r={r} />
      </div>
      {d.gate.decidable ? (
        <div
          role="group"
          aria-label="Keputusan"
          className={cx(
            'sticky bottom-0 z-[1] flex flex-none flex-col items-end gap-1.5 pt-3 pr-5 pb-2.5 pl-6',
            'bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] shadow-[inset_0_1px_0_var(--line)] backdrop-blur-[24px] backdrop-saturate-[1.8]'
          )}
        >
          <div className="flex flex-wrap items-center justify-end gap-2">
            <CommentOnlyButton d={d} className="hidden @min-[600px]/detail:inline-flex" />
            <ReviseButton d={d} />
            <ApproveButton d={d} />
          </div>
          <DecisionHint d={d} className="text-right" />
        </div>
      ) : null}
    </div>
  )
}

function Empty({ s }: { s: ReviewState }) {
  const recap = s.tab === 'MENUNGGU' && s.items.length === 0 ? todayRecap(s.today) : null
  const done = s.tab === 'MENUNGGU' && s.items.length === 0
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-10 text-center">
      {done ? (
        <>
          <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-sukses-soft text-sukses">
            <Icon name="selesai" size={26} strokeWidth={2.6} />
          </span>
          <h2 className="m-0 t-title-3 font-bold text-ink">Semua sudah ditinjau</h2>
          <p className="m-0 max-w-[340px] t-callout font-normal text-ink-2">
            {recap?.line ?? 'Tidak ada laporan yang menunggu di sini. Laporan baru muncul otomatis.'}
          </p>
          {recap && s.today ? <Recap t={s.today} /> : null}
        </>
      ) : (
        <p className="m-0 t-callout font-normal text-ink-2">
          {s.items.length ? 'Pilih laporan di antrean untuk meninjaunya.' : 'Belum ada laporan dengan status ini.'}
        </p>
      )}
    </div>
  )
}

export function Recap({ t }: { t: { approved: number; highlighted: number; revised: number } }) {
  const cells: [string, number, string][] = [
    ['Disetujui', t.approved, 'text-sukses'],
    ['Disorot', t.highlighted, 'text-waspada'],
    ['Perbaikan', t.revised, 'text-waspada'],
  ]
  return (
    <dl className="m-0 mt-1 grid w-full max-w-[340px] grid-cols-3 gap-2">
      {cells.map(([k, v, c]) => (
        <div key={k} className="flex flex-col gap-0.5 rounded-[var(--radius-md)] bg-fill-1 px-2 py-3">
          <dt className="t-caption font-normal text-ink-2">{k}</dt>
          <dd className={cx('m-0 t-title-3 font-bold tabular-nums', c)}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
