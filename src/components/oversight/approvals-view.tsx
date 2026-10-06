'use client'

/**
 * [F2-DIREKTUR] Modul "Persetujuan" (tab `approvals`) untuk Manajemen dan
 * Direktur entitas — 01-manajemen.md tab Persetujuan (tablet & ponsel: daftar
 * ApprovalItem size md; kosong "Semua persetujuan sudah beres.").
 *
 * Isi: permintaan materi/anggaran/cuti, usulan geser tenggat, pengajuan proyek
 * yang slotnya milik Anda, eskalasi terbuka (menuju modul Eskalasi), lalu
 * keputusan 14 hari terakhir. Setujui/Tolak di tempat; badge nav ikut berkurang.
 */

import { useState } from 'react'
import { useApp } from '@/components/app-provider'
import {
  ApprovalItem, AttentionItem, Button, Card, DashboardSkeleton, EmptyNote, ErrorNote, PageHeader, Sheet, StatusBadge, useIsPhone,
} from '@/components/mk'
import { useFetch } from '@/hooks/use-fetch'
import { useResource } from '@/hooks/use-resource'
import { ESCALATION_NEEDED_LABELS } from '@/lib/constants'
import { canSeeTab } from '@/lib/rbac'
import { formatNumber, formatRelative, initials } from '@/lib/format'
import { APPROVAL_STATUS_LABELS } from '@/lib/oversight-shared'
import { SearchButton } from '@/components/search/command-palette'
import {
  ApprovalDetail, ApprovalRequestItems, RejectApprovalSheet, approvalMeta, approvalTitle, useApprovalDecisions,
} from './approval-requests'
import { DeadlineProposalItems, RejectDeadlineSheet, useDeadlineDecisions } from './deadline-decisions'
import { useProjectDecisions } from './project-decisions'
import type { ApprovalRequestLite, RingkasanData } from './types'

export function ApprovalsView() {
  const { user, setActiveTab } = useApp()
  const phone = useIsPhone()
  const { data, loading, error, reload } = useFetch<RingkasanData>('/api/ringkasan')
  const history = useResource<{ canDecide: boolean; items: ApprovalRequestLite[] }>('/api/approval-requests?decided=1')
  const approvals = useApprovalDecisions(() => history.reload())
  const deadline = useDeadlineDecisions()
  const projects = useProjectDecisions(reload)
  const [detail, setDetail] = useState<ApprovalRequestLite | null>(null)
  const [lastDetail, setLastDetail] = useState<ApprovalRequestLite | null>(null)
  if (detail && detail !== lastDetail) setLastDetail(detail)

  if (loading) return <DashboardSkeleton />
  if (error || !data) {
    return (
      <>
        <PageHeader title="Persetujuan" />
        <Card>
          <ErrorNote message={error ? `Data belum termuat. ${error}` : undefined} onRetry={reload} />
        </Card>
      </>
    )
  }

  const viewer = data.viewer
  const requests = data.approvalRequests ?? []
  const proposals = viewer?.canDecideDeadline === false ? [] : (data.deadlineProposals ?? [])
  const decisions = data.decisions
  const escalations = data.escalations
  const pending =
    requests.filter((r) => !approvals.decided[r.id]).length +
    proposals.filter((p) => !deadline.decided[p.id]).length +
    decisions.filter((d) => !projects.decided[d.id]).length
  const seesEscalations = canSeeTab(user.role, 'escalations')
  const empty = requests.length + proposals.length + decisions.length + escalations.length === 0
  const cur = detail ?? lastDetail

  const answer = pending
    ? `${formatNumber(pending)} persetujuan menunggu keputusan Anda.`
    : escalations.length
      ? `Semua persetujuan sudah beres. ${formatNumber(escalations.length)} eskalasi masih terbuka.`
      : 'Semua persetujuan sudah beres.'

  return (
    <>
      <PageHeader
        context={data.scope.global ? 'Seluruh grup' : `${formatNumber(data.scope.entities)} perusahaan`}
        title="Persetujuan"
        tools={!phone ? <SearchButton /> : undefined}
      />
      <p className="t-title-3 text-ink mb-4">{answer}</p>

      {empty ? (
        <Card>
          <EmptyNote done>Semua persetujuan sudah beres.</EmptyNote>
        </Card>
      ) : null}

      {requests.length > 0 ? (
        <Card title="Materi, anggaran, dan cuti" subtitle="Ketuk rincian untuk membaca penjelasan dan berkasnya">
          {requests.map((a) => (
            <div key={a.id}>
              <ApprovalRequestItems items={[a]} ctl={approvals} size="md" canDecide={viewer?.canDecideApproval !== false} />
              {a.description || a.file ? (
                <div className="pl-12 -mt-1 mb-2">
                  <Button size="sm" variant="plain" iconAfter="kanan" onClick={() => setDetail(a)}>
                    Lihat rincian
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}

      {proposals.length > 0 ? (
        <Card title="Usulan geser tenggat" subtitle="Dari PIC proyek">
          <DeadlineProposalItems items={proposals} ctl={deadline} size="md" />
        </Card>
      ) : null}

      {decisions.length > 0 ? (
        <Card title="Pengajuan proyek baru" subtitle="Menunggu tanda tangan Anda di rantai persetujuan">
          {decisions.map((d) => (
            <ApprovalItem
              key={d.id}
              size="md"
              title={`Proyek baru: ${d.name}`}
              requester={d.proposer}
              initials={initials(d.proposer)}
              time={formatRelative(d.proposedAt)}
              amount={d.entityName}
              state={projects.decided[d.id] ?? 'pending'}
              busy={projects.busy === d.id}
              onApprove={() => projects.approve(d.id)}
              onReject={() => setActiveTab('projects')}
              rejectLabel="Tinjau"
            />
          ))}
        </Card>
      ) : null}

      {escalations.length > 0 ? (
        <Card
          title="Eskalasi terbuka"
          subtitle="Memutuskan eskalasi butuh teks keputusan, jadi dibuka di modul Eskalasi"
          action={
            seesEscalations ? (
              <Button size="sm" variant="secondary" onClick={() => setActiveTab('escalations')}>
                Buka eskalasi
              </Button>
            ) : undefined
          }
        >
          {escalations.slice(0, 8).map((e) => (
            <AttentionItem
              key={e.id}
              title={e.summary}
              reason={`${e.raisedBy ?? e.entityName} · butuh ${(ESCALATION_NEEDED_LABELS[e.needed] ?? e.needed).toLowerCase()}`}
              status={e.overdue ? 'late' : 'risk'}
              meta={e.overdue ? `lewat SLA, ${e.ageDays} hari` : `${e.ageDays} hari`}
              onClick={() => setActiveTab(seesEscalations ? 'escalations' : 'dashboard')}
            />
          ))}
        </Card>
      ) : null}

      {(history.data?.items.length ?? 0) > 0 ? (
        <Card title="Diputuskan 14 hari terakhir" subtitle="Materi, anggaran, dan cuti">
          <div className="mk-list">
            {history.data!.items.slice(0, 10).map((a) => (
              <div key={a.id} className="mk-listrow">
                <div className="min-w-0 flex-1">
                  <div className="t-body-strong truncate">{approvalTitle(a)}</div>
                  <div className="t-footnote text-ink-2 truncate">
                    {a.requester} · {approvalMeta(a)} · {a.decidedBy ?? '—'} {a.decidedAt ? formatRelative(a.decidedAt).toLowerCase() : ''}
                  </div>
                </div>
                <StatusBadge status={a.status === 'DISETUJUI' ? 'done' : 'late'} size="sm">
                  {APPROVAL_STATUS_LABELS[a.status]}
                </StatusBadge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Sheet
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={cur ? approvalTitle(cur) : ''}
        subtitle={cur ? `${cur.requester} · ${formatRelative(cur.createdAt)}` : undefined}
        backLabel="Persetujuan"
        footer={
          cur && viewer?.canDecideApproval !== false && !approvals.decided[cur.id] ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setDetail(null)
                  approvals.askReject(cur)
                }}
              >
                Tolak
              </Button>
              <Button
                variant="primary"
                disabled={approvals.busy === cur.id}
                onClick={() => {
                  void approvals.approve(cur)
                  setDetail(null)
                }}
              >
                Setujui
              </Button>
            </>
          ) : null
        }
      >
        {cur ? <ApprovalDetail a={cur} /> : null}
      </Sheet>
      <RejectApprovalSheet ctl={approvals} />
      <RejectDeadlineSheet ctl={deadline} />
    </>
  )
}
