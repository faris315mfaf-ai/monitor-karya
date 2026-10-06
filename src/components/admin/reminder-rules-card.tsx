'use client'

/**
 * Kartu "Pengingat otomatis" (04-admin-pt.md §6): empat sakelar yang berlaku
 * seketika. Setiap perubahan tercatat di log ("Maya Lestari mematikan
 * ringkasan untuk manajemen") dan bisa dibalik lewat "Urungkan" di toast.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, ErrorNote, Skeleton } from '@/components/mk'
import { SwitchRow } from '@/components/companies/parts'
import { formatRelative } from '@/lib/format'
import { REMINDER_LABELS, REMINDER_TITLES, reminderSchedule, type ReminderKind, type ReminderRuleView } from '@/lib/admin-meta'
import { send, useFetch } from './use-fetch'

type Rules = { entityId: string; rules: ReminderRuleView[] }

export function ReminderRulesCard({ className, onChanged }: { className?: string; /** [F2-ADMIN] mis. muat ulang log aktivitas */ onChanged?: () => void }) {
  const { data, setData, error, loading, reload } = useFetch<Rules>('/api/admin/reminder-rules')
  const [saving, setSaving] = useState<ReminderKind | null>(null)
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  async function toggle(kind: ReminderKind, enabled: boolean, opts?: { undo?: boolean }) {
    const prev = data?.rules.find((r) => r.kind === kind)
    if (!prev) return
    setData((d) => (d ? { ...d, rules: d.rules.map((r) => (r.kind === kind ? { ...r, enabled } : r)) } : d))
    setSaving(kind)
    const r = await send('/api/admin/reminder-rules', 'PATCH', { kind, enabled, entityId: data?.entityId })
    setSaving(null)
    if (!r.ok) {
      // Kembalikan ke keadaan sebelum sakelar ditekan (kebalikan dari yang diminta).
      setData((d) => (d ? { ...d, rules: d.rules.map((x) => (x.kind === kind ? { ...x, enabled: !enabled } : x)) } : d))
      toast.error(r.error ?? 'Pengingat belum tersimpan')
      return
    }
    const rule = r.json.rule as ReminderRuleView
    const message = String(r.json.message ?? '')
    setData((d) => (d ? { ...d, rules: d.rules.map((x) => (x.kind === kind ? rule : x)) } : d))
    setLastMessage(message)
    onChanged?.()
    if (opts?.undo) {
      toast.success(`${message}. Tercatat di log aktivitas.`)
      return
    }
    toast.success(`${message}. Tercatat di log aktivitas.`, {
      action: { label: 'Urungkan', onClick: () => void toggle(kind, !enabled, { undo: true }) },
    })
  }

  const rules = data?.rules ?? []
  const latest = [...rules].filter((r) => r.updatedAt && r.updatedBy).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
  const note =
    lastMessage ?? (latest ? `${latest.updatedBy} ${latest.enabled ? 'menyalakan' : 'mematikan'} ${REMINDER_LABELS[latest.kind]} · ${formatRelative(latest.updatedAt)}` : null)
  const on = rules.filter((r) => r.enabled).length

  return (
    <Card
      className={className}
      title="Pengingat otomatis"
      subtitle={data ? `${on} dari ${rules.length} aktif · teks sama dengan pengingat manual` : 'Berlaku seketika untuk perusahaan Anda'}
    >
      {loading && !data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={64} />
          ))}
        </div>
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((r) => (
            <SwitchRow
              key={r.kind}
              id={`pengingat-${r.kind}`}
              title={REMINDER_TITLES[r.kind]}
              description={reminderSchedule(r) + (r.lastRunAt ? ` · terakhir jalan ${formatRelative(r.lastRunAt)}` : '')}
              checked={r.enabled}
              disabled={saving === r.kind}
              onChange={(v) => void toggle(r.kind, v)}
            />
          ))}
          {note ? (
            <p className="t-footnote text-ink-2" aria-live="polite">
              {note}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  )
}
