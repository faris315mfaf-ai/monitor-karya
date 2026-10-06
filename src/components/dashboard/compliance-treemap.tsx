'use client'

/**
 * Peta kepatuhan berjenjang (holding → sub-holding → PT) dari /api/compliance-map.
 * Skor selalu tertulis, warnanya dari token status, dan setiap kelompok bisa
 * dibuka/tutup dengan papan ketik (tombol ber-aria-expanded).
 */

import { useState } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import { EmptyNote, ErrorNote, Icon, Skeleton, cx, type Status } from '@/components/mk'
import { ENTITY_TYPE_LABELS } from '@/lib/constants'
import { formatPercent } from '@/lib/format'

type TreeNode = {
  id: string
  name: string
  code: string
  type: string
  region?: string | null
  complianceScore?: number | null
  entityCount?: number
  avgComplianceScore?: number | null
  children?: TreeNode[]
}

/** Ambang skor → status desain (sama dengan legenda di bawah). */
function scoreStatus(score: number | null | undefined): Status {
  if (score === null || score === undefined) return 'neutral'
  if (score >= 90) return 'done'
  if (score >= 75) return 'on'
  if (score >= 60) return 'risk'
  return 'late'
}

const LEGEND: { status: Status; label: string }[] = [
  { status: 'done', label: '≥ 90' },
  { status: 'on', label: '75–89' },
  { status: 'risk', label: '60–74' },
  { status: 'late', label: '< 60' },
]

export function ComplianceTreemap({
  scopeEntityId,
  onSelectEntity,
}: {
  scopeEntityId?: string | null
  onSelectEntity?: (id: string) => void
}) {
  const url = `/api/compliance-map${scopeEntityId ? `?scopeEntityId=${encodeURIComponent(scopeEntityId)}` : ''}`
  const { data, loading, error, reload } = useFetch<{ tree: TreeNode[] }>(url)

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat peta kepatuhan">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={36} r={10} />
        ))}
      </div>
    )
  }
  if (error) return <ErrorNote message={`Peta kepatuhan belum termuat. ${error}`} onRetry={reload} />
  if (!data?.tree?.length) return <EmptyNote icon="gedung">Belum ada entitas dengan skor kepatuhan.</EmptyNote>

  return (
    <div>
      <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1" aria-label="Peta kepatuhan">
        {data.tree.map((node) => (
          <TreeNodeRow key={node.id} node={node} depth={0} onSelectEntity={onSelectEntity} />
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 t-caption text-ink-2">
        {LEGEND.map((l) => (
          <span key={l.status} className="flex items-center gap-1.5">
            <span className={cx('mk-dot', 'mk-bg--' + l.status)} aria-hidden />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function TreeNodeRow({
  node,
  depth,
  onSelectEntity,
}: {
  node: TreeNode
  depth: number
  onSelectEntity?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = (node.children?.length ?? 0) > 0
  const isPT = node.type === 'PT'
  const score = isPT ? node.complianceScore : node.avgComplianceScore
  const status = scoreStatus(score)
  const label = ENTITY_TYPE_LABELS[node.type] || node.type
  const clickable = hasChildren || (isPT && !!onSelectEntity)

  return (
    <li>
      <button
        type="button"
        disabled={!clickable}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v)
          else if (isPT && onSelectEntity) onSelectEntity(node.id)
        }}
        className={cx(
          'flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-md)] px-2 text-left transition-colors',
          clickable && 'hover:bg-fill-1',
          'disabled:cursor-default'
        )}
        style={{ paddingLeft: `calc(var(--space-2) + ${depth} * var(--space-4))` }}
      >
        {hasChildren ? (
          <Icon name={expanded ? 'bawah' : 'kanan'} size={14} className="shrink-0 text-ink-3" />
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden />
        )}
        <span className="w-16 shrink-0 t-caption uppercase text-ink-3">{label}</span>
        <span className={cx('min-w-0 flex-1 truncate text-ink', depth === 0 ? 't-body-strong' : 't-body')}>{node.name}</span>
        {typeof node.entityCount === 'number' && node.entityCount > 0 && (
          <span className="hidden t-caption text-ink-3 sm:inline">{node.entityCount} PT</span>
        )}
        {score !== null && score !== undefined && (
          <span className={cx('flex items-center gap-1 t-footnote font-semibold tabular-nums', 'mk-text--' + status)}>
            <span className={cx('mk-dot', 'mk-bg--' + status)} aria-hidden />
            {formatPercent(score, 0)}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <ul className="ml-3 flex flex-col gap-1 border-l border-line">
          {node.children!.map((child) => (
            <TreeNodeRow key={child.id} node={child} depth={depth + 1} onSelectEntity={onSelectEntity} />
          ))}
        </ul>
      )}
    </li>
  )
}
