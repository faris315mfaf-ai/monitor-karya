'use client'

/**
 * Keputusan Supervisor yang dipakai layar ponsel & tablet (papan
 * S-Tablet-* dan S-Ponsel-Rincian): status isian (komentar, sorotan +
 * catatan), gerbang tombol, kirim ke API, serta bagian tampilannya —
 * kartu "Tandai untuk manajemen", kolom komentar, dan tombol keputusan.
 *
 * Data: POST /api/sh/reports/:id/comments, POST /api/sh/reports/:id/decision.
 */

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import { cx } from '@/components/mk'
import { Switch, Textarea } from '@/components/mk/forms'
import {
  HIGHLIGHT_NOTE_MAX, HIGHLIGHT_NOTE_MIN_LETTERS, approveConsequence, approveLabel, decisionBody, decisionGate,
  friendlyError, highlightNoteCheck, shouldReload, type DecisionAction, type ShReport,
} from './logic'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
/** Umpan balik tekan instan (pointer-down), tanpa menunggu klik selesai. */
const PRESS = 'motion-safe:transition-[transform,background-color,opacity] motion-safe:duration-[var(--dur-fast)] motion-safe:ease-[var(--ease-standard)] motion-safe:active:scale-[0.97]'
const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2 6.1 20.5l1.3-6.6L2.5 9.4l6.6-.8z'

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; error?: string; field?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => ({}))) as { error?: string; field?: string }
    return { ok: res.ok, status: res.status, error: json.error, field: json.field }
  } catch {
    return { ok: false, status: 0 }
  }
}

/** Fokus ke kolom isian lewat id (objek keputusan tidak membawa ref supaya aman dibaca saat render). */
function focusField(id: string) {
  document.getElementById(id)?.focus({ preventScroll: false })
}

export type DecisionCallbacks = {
  /** Setujui / minta perbaikan berhasil: pemanggil membuka laporan berikutnya. */
  onDecided: (id: string, action: 'approve' | 'revise') => void
  onCommented: () => void
  /** 409/404: data di layar usang. */
  onStale: () => void
}

export function useDecision(r: ShReport, cb: DecisionCallbacks) {
  const [note, setNote] = useState('')
  const [highlight, setHighlight] = useState(false)
  const [highlightNote, setHighlightNote] = useState('')
  const [busy, setBusy] = useState<DecisionAction | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hlErr, setHlErr] = useState<string | null>(null)
  const evidenceCount = Math.max(r.evidenceCount ?? 0, r.evidence?.length ?? 0)
  const gate = decisionGate({ status: r.status, note, evidenceCount, busy: busy !== null, highlight, highlightNote })
  const hl = highlightNoteCheck(highlightNote)
  const ids = {
    note: `sv-note-${r.id}`,
    noteErr: `sv-note-err-${r.id}`,
    hlSwitch: `sv-hl-${r.id}`,
    hlDesc: `sv-hl-desc-${r.id}`,
    hlNote: `sv-hl-note-${r.id}`,
    hlCount: `sv-hl-count-${r.id}`,
    hlErr: `sv-hl-err-${r.id}`,
    hint: `sv-hint-${r.id}`,
  }

  function toggleHighlight(on: boolean) {
    setHighlight(on)
    setHlErr(null)
    if (on) requestAnimationFrame(() => focusField(ids.hlNote))
  }

  async function act(action: DecisionAction) {
    if (action === 'revise' && !gate.canRevise) {
      setErr(gate.reviseHint)
      focusField(ids.note)
      return
    }
    if (action === 'approve' && !gate.canApprove) {
      if (gate.approveHint) setErr(gate.approveHint)
      else if (gate.highlightHint) {
        setHlErr(gate.highlightHint)
        focusField(ids.hlNote)
      }
      return
    }
    if (action === 'comment' && !gate.canComment) {
      setErr('Komentar masih kosong.')
      focusField(ids.note)
      return
    }
    setBusy(action)
    setErr(null)
    setHlErr(null)
    const sorot = action === 'approve' && highlight
    const res =
      action === 'comment'
        ? await post(`/api/sh/reports/${encodeURIComponent(r.id)}/comments`, { body: note.trim() })
        : await post(`/api/sh/reports/${encodeURIComponent(r.id)}/decision`, decisionBody(action, { note, highlight, highlightNote }))
    setBusy(null)
    if (!res.ok) {
      const msg = friendlyError(res.status, res.error, action)
      if (res.status === 422 && res.field === 'highlightNote') {
        setHlErr(msg)
        focusField(ids.hlNote)
      } else setErr(msg)
      if (shouldReload(res.status)) {
        toast.error(msg)
        cb.onStale()
      }
      return
    }
    setNote('')
    if (action === 'comment') {
      toast.success('Komentar terkirim ke admin subholding.')
      cb.onCommented()
      return
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(10)
    toast.success(action === 'approve' ? `${sorot ? 'Disetujui & disorot' : 'Disetujui'}: ${r.kegiatan}` : `Perbaikan diminta: ${r.kegiatan}`, {
      description:
        action === 'approve'
          ? sorot
            ? 'Laporan tampil di Sorotan dashboard Superuser & Manajemen.'
            : 'Laporan tampil di dashboard Superuser & Manajemen.'
          : 'Admin subholding menerima komentar Anda.',
    })
    refreshNavBadges()
    cb.onDecided(r.id, action)
  }

  return {
    r, note, setNote, highlight, toggleHighlight, highlightNote, setHighlightNote, busy, err, setErr, hlErr, setHlErr,
    gate, hl, ids, act,
  }
}

export type Decision = ReturnType<typeof useDecision>

/** Bintang sorotan. Dekoratif — selalu bersama kata. */
export function Star({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor" className={cx('shrink-0', className)}>
      <path d={STAR} />
    </svg>
  )
}

/** Kartu "Tandai untuk manajemen": sakelar + catatan wajib 5–280 yang membuka halus. */
export function HighlightCard({ d, compact }: { d: Decision; compact?: boolean }) {
  const reduce = useReducedMotion()
  if (!d.gate.decidable) return null
  const { ids, hl } = d
  return (
    <section
      aria-label="Tandai untuk manajemen"
      className={cx('flex flex-col rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-card)]', compact ? 'px-3.5 py-3' : 'px-4 py-3.5')}
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-auto flex-col gap-0.5">
          <label htmlFor={ids.hlSwitch} className="t-body-strong cursor-pointer text-ink">
            Tandai untuk manajemen
          </label>
          <p id={ids.hlDesc} className="t-caption text-ink-2">
            Muncul di bagian Sorotan dashboard Manajemen &amp; Superuser
          </p>
        </div>
        <Switch
          id={ids.hlSwitch}
          checked={d.highlight}
          onCheckedChange={d.toggleHighlight}
          disabled={d.busy !== null || d.gate.approveHint !== null}
          aria-describedby={ids.hlDesc}
        />
      </div>
      <AnimatePresence initial={false}>
        {d.highlight ? (
          <motion.div
            key="hl-note"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0.15 } : { type: 'spring', bounce: 0, duration: 0.32 }}
            className="-mx-1 overflow-hidden px-1"
          >
            <div className="flex flex-col gap-1.5 pt-3 pb-0.5">
              <label htmlFor={ids.hlNote} className="t-footnote font-semibold text-ink">
                Catatan untuk manajemen <span className="font-normal text-ink-2">(wajib, maks {HIGHLIGHT_NOTE_MAX} karakter)</span>
              </label>
              <Textarea
                id={ids.hlNote}
                rows={compact ? 3 : 2}
                value={d.highlightNote}
                maxLength={1000}
                required
                disabled={d.busy !== null}
                onChange={(e) => {
                  d.setHighlightNote(e.target.value)
                  if (d.hlErr) d.setHlErr(null)
                }}
                placeholder="Mis. Perlu keputusan perbaikan struktur sebelum pengecoran lantai 4."
                aria-invalid={Boolean(d.hlErr) || hl.tone === 'over' || undefined}
                aria-describedby={cx(ids.hlCount, d.hlErr && ids.hlErr)}
              />
              <div className="flex items-start justify-between gap-3">
                {d.hlErr ? (
                  <p id={ids.hlErr} role="alert" className="t-footnote font-semibold text-bahaya">
                    {d.hlErr}
                  </p>
                ) : (
                  <span className="t-caption text-ink-2">Minimal {HIGHLIGHT_NOTE_MIN_LETTERS} huruf.</span>
                )}
                <span
                  id={ids.hlCount}
                  aria-label={`${hl.length} dari ${HIGHLIGHT_NOTE_MAX} karakter`}
                  className={cx(
                    'ml-auto flex-none t-caption tabular-nums',
                    hl.tone === 'over' ? 'font-semibold text-bahaya' : hl.tone === 'near' ? 'text-waspada' : 'text-ink-2'
                  )}
                >
                  {hl.counter}
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}

/**
 * Kolom komentar untuk admin. `inlineSend`: tombol "Kirim komentar saja"
 * di bawah kolom (ponsel, atau laporan yang sudah diputuskan).
 */
export function CommentField({
  d,
  rows = 2,
  inlineSend,
  sendClassName,
}: {
  d: Decision
  rows?: number
  inlineSend?: boolean
  /** Kelas tambahan tombol kirim di bawah kolom (mis. sembunyikan saat bilah keputusan cukup lebar). */
  sendClassName?: string
}) {
  const { ids, gate } = d
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={ids.note} className="t-footnote font-semibold text-ink">
        Komentar untuk admin subholding{' '}
        <span className="font-normal text-ink-2">{gate.decidable ? '(wajib bila minta perbaikan)' : '(opsional)'}</span>
      </label>
      <Textarea
        id={ids.note}
        rows={rows}
        value={d.note}
        maxLength={2000}
        onChange={(e) => {
          d.setNote(e.target.value)
          if (d.err) d.setErr(null)
        }}
        placeholder={gate.decidable ? 'Mis. Tambahkan foto titik retak dan nomor kolomnya.' : 'Tulis komentar untuk admin subholding'}
        aria-invalid={Boolean(d.err) || undefined}
        aria-describedby={d.err ? ids.noteErr : undefined}
      />
      {d.err ? (
        <p id={ids.noteErr} role="alert" className="t-footnote font-semibold text-bahaya">
          {d.err}
        </p>
      ) : null}
      {inlineSend ? (
        <button
          type="button"
          onClick={() => void d.act('comment')}
          disabled={d.busy !== null || !d.note.trim()}
          className={cx(
            'min-h-11 self-start rounded-[var(--radius-sm)] px-1 t-callout font-semibold text-accent disabled:cursor-default disabled:text-ink-3',
            PRESS,
            FOCUS,
            sendClassName
          )}
        >
          {d.busy === 'comment' ? 'Mengirim…' : gate.decidable ? 'Kirim komentar saja' : 'Kirim komentar'}
        </button>
      ) : null}
    </div>
  )
}

const BTN = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full font-bold disabled:cursor-default'

/** Tombol "Minta perbaikan". */
export function ReviseButton({ d, className }: { d: Decision; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void d.act('revise')}
      disabled={d.busy !== null}
      className={cx(BTN, 'bg-fill-2 px-[18px] t-callout text-ink hover:brightness-95 dark:hover:brightness-125', PRESS, FOCUS, className)}
    >
      {d.busy === 'revise' ? 'Mengirim…' : 'Minta perbaikan'}
    </button>
  )
}

/** Tombol "Setujui" / "Setujui & sorot" (hijau, teks putih di kedua tema). */
export function ApproveButton({ d, className }: { d: Decision; className?: string }) {
  const blocked = d.gate.approveHint !== null
  return (
    <button
      type="button"
      onClick={() => void d.act('approve')}
      disabled={d.busy !== null || blocked}
      aria-describedby={d.ids.hint}
      className={cx(
        BTN,
        'px-5 t-callout',
        blocked ? 'bg-fill-2 text-ink-3' : 'bg-[var(--hijau-fill)] text-[var(--putih)] hover:brightness-110',
        PRESS,
        FOCUS,
        className
      )}
    >
      {d.highlight && !blocked ? <Star size={14} /> : null}
      {d.busy === 'approve' ? 'Menyetujui…' : approveLabel(d.highlight)}
    </button>
  )
}

/** Teks kecil di dekat tombol: akibat menyetujui, atau kenapa belum bisa disetujui. */
export function DecisionHint({ d, className }: { d: Decision; className?: string }) {
  const blocked = d.gate.approveHint
  return (
    <p id={d.ids.hint} className={cx('m-0 t-caption', blocked ? 'font-semibold text-waspada' : 'text-ink-2', className)}>
      {blocked ? 'Tanpa bukti belum bisa disetujui. Minta perbaikan agar admin melampirkan bukti.' : approveConsequence(d.highlight)}
    </p>
  )
}

/** Tombol teks "Kirim komentar saja" (bilah keputusan tablet). */
export function CommentOnlyButton({ d, className }: { d: Decision; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void d.act('comment')}
      disabled={d.busy !== null || !d.note.trim()}
      className={cx(
        'min-h-11 cursor-pointer rounded-full px-3.5 t-footnote font-semibold text-accent disabled:cursor-default disabled:text-ink-3',
        PRESS,
        FOCUS,
        className
      )}
    >
      {d.busy === 'comment' ? 'Mengirim…' : 'Kirim komentar saja'}
    </button>
  )
}
