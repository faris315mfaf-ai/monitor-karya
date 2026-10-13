'use client'

/**
 * Kartu pengaturan aturan pelaporan Admin PT (10 Okt 2026).
 * Jam batas, hari kerja, buka/tutup — bawaan 24/7 untuk inisiasi.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Chip, ErrorNote, Skeleton, StatusBadge } from '@/components/mk'
import { useApp } from '@/components/app-provider'

type Settings = {
  dailyCutoffHour: number | null
  workingDays: number[]
  dailyOpen: boolean
  weeklyCutoffHour: number | null
  weeklyOpen: boolean
} | null

/** Cermin DEFAULT_SETTINGS server (src/lib/report-settings.ts): berlaku bila entitas belum punya baris aturan. */
const BAWAAN_SERVER = { dailyCutoffHour: 17, workingDays: [1, 2, 3, 4, 5], dailyOpen: true, weeklyCutoffHour: 17, weeklyOpen: true }

const HARI = [1, 2, 3, 4, 5, 6, 7] as const
const NAMA_HARI: Record<number, string> = { 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu', 7: 'Minggu' }

export function ReportSettingsCard({ className }: { className?: string }) {
  const { user } = useApp()
  // entityId = PT milik admin; TI/Super Admin pakai PT pertama (bisa disaring nanti)
  const [entityId, setEntityId] = useState<string | null>(user?.scopeEntityId ?? null)
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (entityId) return
    // Ambil daftar PT untuk dipilih bila user tidak terpaku satu PT
    fetch('/api/entities?type=PT')
      .then(r => r.json())
      .then(j => {
        const list = Array.isArray(j) ? j : j.entities ?? []
        setEntities(list.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })))
        if (list.length === 1) setEntityId(list[0].id)
      })
      .catch(() => {})
  }, [entityId])
  const [settings, setSettings] = useState<Settings>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await fetch(`/api/admin/report-settings${entityId ? `?entityId=${entityId}` : ''}`, { cache: 'no-store' })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Aturan pelaporan belum termuat.')
        // Tanpa baris aturan, server memakai bawaan 17.00 Senin–Jumat — samakan di sini.
        setSettings(j.settings ?? BAWAAN_SERVER)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Aturan pelaporan belum termuat.')
      } finally { setLoading(false) }
    }, 0)
    return () => clearTimeout(t)
  }, [entityId, retryKey])

  async function simpan(data: Record<string, unknown>) {
    // Satu simpanan sekali jalan: klik beruntun memakai data basi dan saling menimpa.
    if (saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/admin/report-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityId, ...data }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Gagal menyimpan.')
      if (j.settings) setSettings(j.settings)
      toast.success('Aturan pelaporan disimpan.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan.')
    } finally { setSaving(false) }
  }

  if (loading) return <Card className={className} title="Aturan pelaporan"><Skeleton h={160} /></Card>
  if (error || !settings) {
    return (
      <Card className={className} title="Aturan pelaporan">
        <ErrorNote message={error ?? 'Aturan pelaporan belum termuat.'} onRetry={() => setRetryKey((k) => k + 1)} />
      </Card>
    )
  }

  const mode = settings.dailyCutoffHour === null ? '24/7' : `Batasi ${settings.dailyCutoffHour}.00 WIB`

  return (
    <Card
      className={className}
      title="Aturan pelaporan"
      subtitle={`Mode saat ini: ${mode} · ${settings.dailyOpen ? 'Terbuka' : 'Ditutup'}`}
    >
      <div className="flex flex-col gap-4">
        {/* Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={settings.dailyOpen ? 'on' : 'late'} size="sm">
            {settings.dailyOpen ? 'Pengisian terbuka' : 'Pengisian ditutup'}
          </StatusBadge>
          <StatusBadge status={settings.dailyCutoffHour === null ? 'done' : 'info'} size="sm">
            {settings.dailyCutoffHour === null ? '24/7 tanpa batas' : `Batasi sampai ${settings.dailyCutoffHour}.00 WIB`}
          </StatusBadge>
        </div>

        {/* Buka/tutup */}
        <div>
          <p className="t-footnote text-ink-2 mb-1">Status pengisian laporan harian</p>
          <div className="flex gap-2">
            <Button size="sm" variant={settings.dailyOpen ? 'primary' : 'secondary'} disabled={saving || settings.dailyOpen}
              onClick={() => simpan({ dailyOpen: true })}>
              Buka pengisian
            </Button>
            <Button size="sm" variant={!settings.dailyOpen ? 'primary' : 'secondary'} disabled={saving || !settings.dailyOpen}
              onClick={() => simpan({ dailyOpen: false })}>
              Tutup pengisian
            </Button>
          </div>
        </div>

        {/* Jam batas */}
        <div>
          <p className="t-footnote text-ink-2 mb-1">Jam batas pengumpulan harian (WIB)</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={settings.dailyCutoffHour === null} disabled={saving} onClick={() => simpan({ dailyCutoffHour: null })}>
              24/7 (tanpa batas)
            </Chip>
            {[9, 12, 15, 17, 20, 23].map(h => (
              <Chip key={h} selected={settings.dailyCutoffHour === h} disabled={saving} onClick={() => simpan({ dailyCutoffHour: h })}>
                {h}.00
              </Chip>
            ))}
          </div>
        </div>

        {/* Hari kerja */}
        <div>
          <p className="t-footnote text-ink-2 mb-1">Hari yang wajib lapor (kosong = setiap hari)</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={settings.workingDays.length === 0} disabled={saving} onClick={() => simpan({ workingDays: [] })}>
              Setiap hari
            </Chip>
            {HARI.map(d => (
              <Chip key={d}
                selected={settings.workingDays.includes(d)}
                disabled={saving}
                onClick={() => {
                  const baru = settings.workingDays.includes(d)
                    ? settings.workingDays.filter(x => x !== d)
                    : [...settings.workingDays, d].sort()
                  simpan({ workingDays: baru })
                }}
              >
                {NAMA_HARI[d]}
              </Chip>
            ))}
          </div>
        </div>

        {/* Mingguan */}
        <div>
          <p className="t-footnote text-ink-2 mb-1">Aturan capaian mingguan</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={settings.weeklyOpen} disabled={saving} onClick={() => simpan({ weeklyOpen: true })}>Terbuka</Chip>
            <Chip selected={!settings.weeklyOpen} disabled={saving} onClick={() => simpan({ weeklyOpen: false })}>Ditutup</Chip>
            <Chip selected={settings.weeklyCutoffHour === null} disabled={saving} onClick={() => simpan({ weeklyCutoffHour: null })}>Tanpa batas</Chip>
            {[15, 17].map(h => (
              <Chip key={h} selected={settings.weeklyCutoffHour === h} disabled={saving} onClick={() => simpan({ weeklyCutoffHour: h })}>
                {h}.00
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
