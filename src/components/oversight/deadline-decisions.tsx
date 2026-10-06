'use client'

/**
 * Keputusan usulan geser tenggat dari PIC (02-direktur.md "Geser rilis … ke 31 Okt").
 * Memakai PATCH /api/deadline-proposals { id, action: approve | reject, note }.
 * Menolak wajib disertai alasan untuk PIC, jadi Tolak membuka Sheet kecil.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { ApprovalItem, Button, Sheet } from '@/components/mk'
import { Textarea } from '@/components/ui/textarea'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import { formatDateShort, formatRelative, initials } from '@/lib/format'
import type { DeadlineProposalLite } from './types'

type Decision = 'approved' | 'rejected'

async function decide(id: string, action: 'approve' | 'reject', note?: string) {
  const res = await fetch('/api/deadline-proposals', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action, note }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Keputusan belum tersimpan. Coba lagi.')
}

/** Status keputusan dipegang pemanggil agar KPI & lencana ikut berkurang. */
export function useDeadlineDecisions(onDecided?: () => void) {
  const [decided, setDecided] = useState<Record<string, Decision>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<DeadlineProposalLite | null>(null)

  function undo(p: DeadlineProposalLite) {
    fetch('/api/deadline-proposals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, action: 'undo' }),
    })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Keputusan belum diurungkan.')
        setDecided((d) => {
          const n = { ...d }
          delete n[p.id]
          return n
        })
        refreshNavBadges()
        onDecided?.()
        toast('Keputusan diurungkan. Usulan kembali menunggu.')
      })
      .catch((e: Error) => toast.error(e.message))
  }

  async function run(p: DeadlineProposalLite, action: 'approve' | 'reject', note?: string) {
    setBusy(p.id)
    try {
      await decide(p.id, action, note)
      setDecided((d) => ({ ...d, [p.id]: action === 'approve' ? 'approved' : 'rejected' }))
      refreshNavBadges()
      toast.success(
        action === 'approve'
          ? `Tenggat ${p.projectName} digeser ke ${formatDateShort(p.proposedDate)}.`
          : `Usulan tenggat ${p.projectName} ditolak. PIC menerima alasannya.`,
        // [F2-DIREKTUR] Keputusan bisa diurungkan 15 menit (PATCH action: undo).
        { action: { label: 'Urungkan', onClick: () => undo(p) }, duration: 8000 }
      )
      setRejecting(null)
      onDecided?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Keputusan belum tersimpan. Coba lagi.')
    } finally {
      setBusy(null)
    }
  }

  return {
    decided,
    busy,
    rejecting,
    approve: (p: DeadlineProposalLite) => run(p, 'approve'),
    askReject: (p: DeadlineProposalLite) => setRejecting(p),
    reject: (p: DeadlineProposalLite, note: string) => run(p, 'reject', note),
    cancelReject: () => setRejecting(null),
  }
}

export type DeadlineDecisions = ReturnType<typeof useDeadlineDecisions>

export function DeadlineProposalItems({ items, ctl, size = 'sm' }: { items: DeadlineProposalLite[]; ctl: DeadlineDecisions; size?: 'sm' | 'md' }) {
  return (
    <>
      {items.map((p) => (
        <ApprovalItem
          approveVariant="secondary"
          key={p.id}
          size={size}
          title={`Geser tenggat ${p.projectName} ke ${formatDateShort(p.proposedDate)}`}
          requester={p.proposer}
          initials={initials(p.proposer)}
          time={formatRelative(p.proposedAt)}
          amount={p.previousDate ? `semula ${formatDateShort(p.previousDate)}` : p.entityName}
          state={ctl.decided[p.id] ?? 'pending'}
          busy={ctl.busy === p.id}
          onApprove={() => ctl.approve(p)}
          onReject={() => ctl.askReject(p)}
        />
      ))}
    </>
  )
}

/** Sheet alasan penolakan; dipasang sekali per layar. */
export function RejectDeadlineSheet({ ctl }: { ctl: DeadlineDecisions }) {
  const p = ctl.rejecting
  const [last, setLast] = useState<DeadlineProposalLite | null>(p)
  const [note, setNote] = useState('')
  if (p && p !== last) {
    setLast(p)
    setNote('')
  }
  const cur = p ?? last
  const valid = note.trim().length >= 5
  return (
    <Sheet
      open={!!p}
      onOpenChange={(o) => !o && ctl.cancelReject()}
      title="Tolak usulan tenggat"
      subtitle={cur ? `${cur.projectName} · ${cur.proposer}` : undefined}
      backLabel="Ringkasan"
      footer={
        <>
          <Button variant="secondary" onClick={ctl.cancelReject}>
            Batal
          </Button>
          <Button variant="destructive" disabled={!valid || !cur || ctl.busy === cur.id} onClick={() => cur && ctl.reject(cur, note.trim())}>
            Tolak usulan
          </Button>
        </>
      }
    >
      {cur && (
        <>
          <div className="mk-inset t-body text-ink">
            <div className="t-footnote text-ink-2 mb-1">
              Usul {formatDateShort(cur.proposedDate)}
              {cur.previousDate ? ` · semula ${formatDateShort(cur.previousDate)}` : ''}
            </div>
            {cur.reason}
          </div>
          <label htmlFor="mk-reject-note" className="t-body-strong">
            Alasan penolakan untuk PIC
          </label>
          <Textarea
            id="mk-reject-note"
            rows={4}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Mis. Tenggat tetap karena rilis terkait kampanye 24 Okt."
          />
          <p className="t-footnote text-ink-2">Tenggat proyek tidak berubah. PIC menerima alasan ini di lonceng notifikasinya.</p>
        </>
      )}
    </Sheet>
  )
}
