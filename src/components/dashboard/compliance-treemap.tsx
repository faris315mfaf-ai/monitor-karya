'use client'

import { useFetch } from '@/hooks/use-fetch'
import { LoadingSpinner, EmptyState } from '@/components/loading-states'
import { ENTITY_TYPE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { formatPercent } from '@/lib/format'
import { ChevronDown, ChevronRight, Map } from 'lucide-react'
import { useState } from 'react'

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

function complianceColor(score: number | null | undefined): { bg: string; border: string; text: string } {
  if (score === null || score === undefined) return { bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700', text: 'text-slate-500 dark:text-slate-400' }
  if (score >= 90) return { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-700 dark:text-emerald-300' }
  if (score >= 75) return { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-700 dark:text-blue-300' }
  if (score >= 60) return { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-700 dark:text-amber-300' }
  return { bg: 'bg-rose-500/20', border: 'border-rose-500/40', text: 'text-rose-700 dark:text-rose-300' }
}

export function ComplianceTreemap({
  scopeEntityId,
  onSelectEntity,
}: {
  scopeEntityId?: string | null
  onSelectEntity?: (id: string) => void
}) {
  const url = `/api/compliance-map${scopeEntityId ? `?scopeEntityId=${scopeEntityId}` : ''}`
  const { data, loading, error } = useFetch<{ tree: TreeNode[] }>(url)

  if (loading) return <LoadingSpinner className="py-8" />
  if (error) return <EmptyState title="Gagal memuat peta" description={error} />
  if (!data?.tree?.length) return <EmptyState icon={<Map className="h-5 w-5 text-slate-400 dark:text-slate-500" />} title="Tidak ada data" />

  return (
    <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin pr-1">
      {data.tree.map((node) => (
        <TreeNodeRow key={node.id} node={node} depth={0} onSelectEntity={onSelectEntity} />
      ))}
      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500/40" /> ≥90</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-blue-500/40" /> 75-89</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-500/40" /> 60-74</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-500/40" /> &lt;60</span>
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
  const color = complianceColor(score)
  const label = ENTITY_TYPE_LABELS[node.type] || node.type

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v)
          else if (isPT && onSelectEntity) onSelectEntity(node.id)
        }}
        className={cn(
          'w-full flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all text-left',
          'hover:bg-blue-500/5',
          depth === 0 && 'font-semibold'
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" /> : <ChevronRight className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}
        <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide w-16 shrink-0">{label}</span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate flex-1">{node.name}</span>
        {typeof node.entityCount === 'number' && node.entityCount > 0 && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">{node.entityCount} PT</span>
        )}
        {score !== null && score !== undefined && (
          <span className={cn('text-xs font-bold tabular-nums px-1.5 py-0.5 rounded border', color.bg, color.border, color.text)}>
            {formatPercent(score, 0)}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <div className="border-l border-slate-200/60 ml-3">
          {node.children!.map((child) => (
            <TreeNodeRow key={child.id} node={child} depth={depth + 1} onSelectEntity={onSelectEntity} />
          ))}
        </div>
      )}
    </div>
  )
}
