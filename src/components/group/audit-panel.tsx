'use client'

/**
 * [F2-GRUP] Auditor (08-auditor.md): "Apakah laporan masuk tepat waktu dan
 * konsisten? Siapa mengubah apa, kapan? Di mana kepatuhan paling lemah?"
 *
 * Mode baca: tombol di sini hanya navigasi (tab Log aktivitas) dan unduhan
 * CSV jejak audit (/api/audit-logs/export, milik [F2-ADMIN]). Tidak ada tombol
 * yang mengubah data; server juga menolaknya (tests/api/auditor-readonly.test.ts).
 */

import { useApp } from '@/components/app-provider'
import { Button, Card, EmptyNote, StatusBadge, type Status } from '@/components/mk'
import { ActionTag } from '@/components/views/audit-view'
import { pct } from '@/components/oversight/types'
import { formatDateShort, formatNumber, formatRelative } from '@/lib/format'
import { wibDateKey } from '@/lib/lock'
import type { AuditPanel as AuditData } from '@/lib/group-panel'

const TARGET_LABEL: Record<string, string> = { DAILY_REPORT: 'Laporan harian', WEEKLY_REPORT: 'Laporan mingguan' }

function lateTone(late: number, total: number): Status {
  if (late === 0) return 'on'
  return pct(late, total) >= 15 ? 'late' : 'risk'
}

/** Tautan unduh CSV 30 hari terakhir (rentang bawaan /api/audit-logs/export). */
export function auditExportHref(days = 30): string {
  const to = new Date()
  const from = new Date(to.getTime() - (days - 1) * 86400000)
  return `/api/audit-logs/export?dateFrom=${wibDateKey(from)}&dateTo=${wibDateKey(to)}`
}

export function AuditPanel({ panel }: { panel: AuditData }) {
  const { setActiveTab } = useApp()
  const { late, audit, unlocks30 } = panel

  return (
    <>
      <div className="mk-row">
        <Card
          className="is-wide"
          title="Laporan terlambat"
          subtitle={`${formatNumber(late.daily30)} dari ${formatNumber(late.dailyTotal30)} laporan harian terlambat (30 hari) · ${formatNumber(late.weeklyLate8w)} laporan mingguan terlambat (8 minggu)`}
        >
          {late.byEntity.length === 0 ? (
            <EmptyNote done>Belum ada laporan yang masuk dalam 30 hari terakhir.</EmptyNote>
          ) : (
            <div className="mk-list">
              {late.byEntity.map((e) => (
                <div key={e.id} className="mk-listrow flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="t-body-strong truncate">{e.name}</div>
                    <div className="t-footnote text-ink-2">
                      {formatNumber(e.dailyLate)} dari {formatNumber(e.dailyTotal)} harian terlambat · {formatNumber(e.weeklyLate)} mingguan terlambat
                    </div>
                  </div>
                  <StatusBadge status={lateTone(e.dailyLate + e.weeklyLate, e.dailyTotal || 1)} size="sm">
                    {e.dailyLate + e.weeklyLate === 0 ? 'Tepat waktu' : `${pct(e.dailyLate, e.dailyTotal)}% harian terlambat`}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
          {late.recent.length > 0 ? (
            <div className="mk-inset mt-4">
              <h4 className="t-callout text-ink-2 mb-2">Terlambat terbaru</h4>
              <div className="mk-list">
                {late.recent.map((r) => (
                  <div key={`${r.kind}-${r.id}`} className="mk-listrow">
                    <div className="min-w-0 flex-1">
                      <div className="t-body truncate">{r.label}</div>
                      <div className="t-footnote text-ink-2">
                        {r.kind === 'HARIAN' ? `Harian ${formatDateShort(r.period)}` : 'Mingguan'} · {r.entityCode}
                        {r.submittedAt ? ` · masuk ${formatRelative(r.submittedAt).toLowerCase()}` : ''}
                      </div>
                    </div>
                    <StatusBadge status="late" size="sm">
                      Terlambat
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card
          className="is-narrow"
          title="Jejak audit"
          subtitle="Mode baca · log hanya bisa ditambah, tidak diubah"
        >
          <div className="mk-list">
            {(
              [
                ['24 jam terakhir', audit.last24h],
                ['7 hari terakhir', audit.last7d],
                ['Perubahan hak & kunci (7 hari)', audit.sensitive7d],
                ['Seluruh catatan', audit.total],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="mk-listrow justify-between">
                <span className="t-body text-ink-2">{k}</span>
                <span className="t-body-strong text-ink mk-adm-num">{formatNumber(v)}</span>
              </div>
            ))}
          </div>
          {audit.topActions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Aksi terbanyak 7 hari">
              {audit.topActions.map((a) => (
                <span key={a.action} className="inline-flex items-center gap-1">
                  <ActionTag action={a.action} />
                  <span className="t-footnote text-ink-2 mk-adm-num">{formatNumber(a.count)}</span>
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" iconAfter="kanan" onClick={() => setActiveTab('audit')}>
              Telusuri log aktivitas
            </Button>
            <a className="mk-btn mk-btn--secondary mk-btn--sm" href={auditExportHref()} download>
              <span>Unduh log 30 hari</span>
            </a>
          </div>
        </Card>
      </div>

      <Card
        title="Buka kunci yang dijalankan"
        subtitle={`${formatNumber(unlocks30.executed)} laporan terkunci dibuka dalam 30 hari terakhir`}
      >
        {unlocks30.items.length === 0 ? (
          <EmptyNote done>Tidak ada laporan yang dibuka kuncinya dalam 30 hari terakhir.</EmptyNote>
        ) : (
          <div className="mk-list">
            {unlocks30.items.map((u) => (
              <div key={u.id} className="mk-listrow flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="t-body-strong truncate">{u.reason}</div>
                  <div className="t-footnote text-ink-2">
                    {[TARGET_LABEL[u.targetType] ?? u.targetType, u.requestedBy ? `diajukan ${u.requestedBy}` : null, u.executedBy ? `dibuka ${u.executedBy}` : null, u.executedAt ? formatRelative(u.executedAt).toLowerCase() : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <StatusBadge status="info" size="sm">
                  Dibuka
                </StatusBadge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
