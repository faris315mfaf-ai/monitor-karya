'use client'

/**
 * [F2-GRUP] Pengingat otomatis untuk Tim TI & Super Admin (07-ti.md: "memiliki
 * mesin kunci & notifikasi"). Ringkasan sakelar per perusahaan, lalu empat
 * sakelar perusahaan yang dipilih. Memakai PATCH /api/admin/reminder-rules yang
 * sama dengan meja Admin PT (akun induk boleh mengatur PT mana pun); setiap
 * perubahan tercatat di log dan bisa diurungkan lewat toast.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, EmptyNote, StatusBadge } from '@/components/mk'
import { Field, SwitchRow, selectCls } from '@/components/companies/parts'
import { send } from '@/components/admin/use-fetch'
import { formatRelative } from '@/lib/format'
import { REMINDER_DEFAULTS, REMINDER_TITLES, reminderSchedule, type ReminderKind } from '@/lib/admin-meta'
import type { ReminderMatrixRow } from '@/lib/group-panel'

export function ReminderMatrixCard({ rows: initial, className }: { rows: ReminderMatrixRow[] | null; className?: string }) {
  const [rows, setRows] = useState(initial ?? [])
  const [entityId, setEntityId] = useState(initial?.[0]?.entityId ?? '')
  const [saving, setSaving] = useState<ReminderKind | null>(null)

  if (initial === null) {
    return (
      <Card className={className} title="Pengingat otomatis" subtitle="Sakelar per perusahaan">
        <EmptyNote icon="notifikasi">Tabel aturan pengingat belum tersedia. Terapkan migrasi pengingat (0016) dulu.</EmptyNote>
      </Card>
    )
  }

  const current = rows.find((r) => r.entityId === entityId) ?? rows[0]
  const totalOn = rows.reduce((a, r) => a + r.rules.filter((x) => x.enabled).length, 0)
  const total = rows.length * 4

  async function toggle(kind: ReminderKind, enabled: boolean, opts?: { undo?: boolean }) {
    if (!current) return
    const target = current.entityId
    const patchRow = (on: boolean) =>
      setRows((rs) => rs.map((r) => (r.entityId === target ? { ...r, rules: r.rules.map((x) => (x.kind === kind ? { ...x, enabled: on } : x)) } : r)))
    patchRow(enabled)
    setSaving(kind)
    const r = await send('/api/admin/reminder-rules', 'PATCH', { kind, enabled, entityId: target })
    setSaving(null)
    if (!r.ok) {
      patchRow(!enabled)
      toast.error(r.error ?? 'Pengingat belum tersimpan')
      return
    }
    const message = `${String(r.json.message ?? 'Pengingat diubah')} di ${current.entityName}`
    if (opts?.undo) {
      toast.success(`${message}. Tercatat di log aktivitas.`)
      return
    }
    toast.success(`${message}. Tercatat di log aktivitas.`, {
      action: { label: 'Urungkan', onClick: () => void toggle(kind, !enabled, { undo: true }) },
    })
  }

  return (
    <Card
      className={className}
      title="Pengingat otomatis"
      subtitle={rows.length ? `${totalOn} dari ${total} sakelar aktif di ${rows.length} perusahaan` : 'Belum ada perusahaan aktif'}
    >
      {rows.length === 0 || !current ? (
        <EmptyNote icon="gedung">Belum ada perusahaan aktif.</EmptyNote>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="list" aria-label="Sakelar aktif per perusahaan">
            {rows.map((r) => {
              const on = r.rules.filter((x) => x.enabled).length
              const off = r.rules.some((x) => !x.enabled && REMINDER_DEFAULTS[x.kind].enabled)
              return (
                <span key={r.entityId} role="listitem">
                  <StatusBadge status={off ? 'risk' : 'on'} size="sm">
                    {r.entityCode} {on}/4
                  </StatusBadge>
                </span>
              )
            })}
          </div>
          <Field label="Perusahaan" htmlFor="rm-entity">
            <select id="rm-entity" className={selectCls} value={current.entityId} onChange={(e) => setEntityId(e.target.value)}>
              {rows.map((r) => (
                <option key={r.entityId} value={r.entityId}>
                  {r.entityName}
                </option>
              ))}
            </select>
          </Field>
          <div className="mk-list">
            {current.rules.map((rule) => {
              const schedule = reminderSchedule({ kind: rule.kind, time: rule.time, weekday: rule.weekday, params: rule.days ? { days: rule.days } : {} })
              return (
                <SwitchRow
                  key={rule.kind}
                  id={`rm-${current.entityId}-${rule.kind}`}
                  title={REMINDER_TITLES[rule.kind]}
                  description={`${schedule}${rule.lastRunAt ? ` · terakhir ${formatRelative(rule.lastRunAt).toLowerCase()}` : ' · belum pernah berjalan'}`}
                  checked={rule.enabled}
                  disabled={saving === rule.kind}
                  onChange={(v) => void toggle(rule.kind, v)}
                />
              )
            })}
          </div>
          <p className="t-footnote text-ink-2">Jam pengingat diatur Admin PT dari meja kerja perusahaannya.</p>
        </div>
      )}
    </Card>
  )
}
