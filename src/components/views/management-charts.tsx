'use client'

/**
 * Grafik kepatuhan grup untuk Manajemen (/api/management-charts). Setiap kartu
 * menjawab satu pertanyaan dan bisa dibaca sebagai tabel (11-diagram-dan-data.md:
 * satu sorotan, label langsung, angka selalu tertulis). Komponen & warna dari
 * @/components/mk dan token; tanpa recharts.
 */

import { useState } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import {
  AreaChart, BarChart, Button, Card, DivisionBar, DonutChart, EmptyNote, ErrorNote, Icon, SegmentedControl, Skeleton,
  StatusBadge, type ChartTone, type Status,
} from '@/components/mk'
import { formatNumber } from '@/lib/format'

type Data = {
  periode: { bulanIni: string; isoWeek: number; isoYear: number }
  ringkasan: {
    entitas: number
    rataKepatuhan: number
    diBawahTarget: number
    eskalasiTerbuka: number
    eskalasiLewatSla: number
  }
  trend: { label: string; kepatuhan: number; tepatWaktu: number; mingguan: number; bukti: number }[]
  bySubHolding: { name: string; skor: number; jumlahPt: number }[]
  dailyStatus: { status: string; label: string; jumlah: number }[]
  escalationAging: { bucket: string; dalamSla: number; lewatSla: number }[]
  weeklyByGroup: Record<string, string | number>[]
  lowestPt: { name: string; code: string; region: string; skor: number }[]
}

/** Skor kepatuhan di bawah angka ini berarti entitas perlu perhatian. */
const TARGET = 75

const TREND_METRICS = [
  { value: 'kepatuhan', label: 'Kepatuhan' },
  { value: 'tepatWaktu', label: 'Tepat waktu' },
  { value: 'mingguan', label: 'Mingguan' },
  { value: 'bukti', label: 'Bukti' },
] as const
type TrendKey = (typeof TREND_METRICS)[number]['value']

const DAILY_TONE: Record<string, ChartTone> = {
  SELESAI: 'done',
  ON_PROGRESS: 'info',
  TERKENDALA: 'late',
  MENUNGGU_KEPUTUSAN: 'risk',
}

const WEEKLY_COLUMNS: { key: string; status: Status }[] = [
  { key: 'Draft', status: 'neutral' },
  { key: 'Menunggu persetujuan', status: 'risk' },
  { key: 'Disetujui', status: 'on' },
  { key: 'Terkunci', status: 'done' },
]

const scoreStatus = (s: number): Status => (s < TARGET ? 'late' : s < 85 ? 'risk' : 'on')
const SCORE_LABEL: Partial<Record<Status, string>> = { late: 'Di bawah target', risk: 'Perlu perhatian', on: 'Sesuai target' }
const scoreTone = (s: number): ChartTone => (s < TARGET ? 'late' : s < 85 ? 'risk' : 'data-1')

/** Bingkai kartu: judul, pertanyaan yang dijawab, dan tombol beralih ke tabel. */
function ChartCard({
  title,
  question,
  table,
  className,
  children,
}: {
  title: string
  question: string
  table?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <Card
      className={className}
      title={title}
      subtitle={question}
      action={
        table ? (
          <Button size="sm" variant="plain" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Lihat grafik' : 'Lihat tabel'}
          </Button>
        ) : undefined
      }
    >
      {showTable && table ? table : children}
    </Card>
  )
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] t-footnote">
        <thead>
          <tr className="text-left text-ink-2">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`py-2 font-semibold ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className={`py-2 text-ink ${j > 0 ? 'text-right tabular-nums font-semibold' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ManagementCharts() {
  const { data, loading, error, reload } = useFetch<Data>('/api/management-charts')
  const [metric, setMetric] = useState<TrendKey>('kepatuhan')
  const [point, setPoint] = useState<number | undefined>(undefined)

  if (loading) {
    return (
      <div className="mk-row" aria-busy="true" aria-label="Memuat grafik">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="is-half mk-card">
            <Skeleton h={220} />
          </div>
        ))}
      </div>
    )
  }
  if (error || !data) {
    return (
      <Card>
        <ErrorNote message={error ? `Grafik manajemen belum termuat. ${error}` : undefined} onRetry={reload} />
      </Card>
    )
  }

  const r = data.ringkasan
  const totalHarian = data.dailyStatus.reduce((s, d) => s + d.jumlah, 0)
  const trend = data.trend
  const idx = Math.min(point ?? trend.length - 1, trend.length - 1)
  const metricLabel = TREND_METRICS.find((m) => m.value === metric)!.label

  return (
    <div className="flex flex-col gap-6">
      <p className="mk-inset t-footnote text-ink-2">
        Semua skor memakai skala 0–100. Target kepatuhan {TARGET}; di bawah itu entitas perlu perhatian. Setiap grafik
        menjawab satu pertanyaan dan bisa dibaca sebagai tabel.
      </p>

      <ChartCard
        title="Arah kepatuhan 6 bulan"
        question="Apakah grup membaik atau memburuk?"
        table={
          <SimpleTable
            head={['Bulan', 'Kepatuhan', 'Tepat waktu', 'Mingguan', 'Bukti']}
            rows={trend.map((t) => [t.label, t.kepatuhan, t.tepatWaktu, t.mingguan, t.bukti])}
          />
        }
      >
        {trend.length === 0 ? (
          <EmptyNote icon="laporan">Belum ada riwayat kepatuhan.</EmptyNote>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <SegmentedControl
                size="sm"
                label="Indikator"
                value={metric}
                onChange={(v) => setMetric(v as TrendKey)}
                options={TREND_METRICS.map((m) => ({ value: m.value, label: m.label }))}
              />
              <div className="text-right">
                <div className="t-title-2 tabular-nums">{trend[idx]?.[metric] ?? 0}</div>
                <div className="t-footnote text-ink-2">
                  {metricLabel} · {trend[idx]?.label}
                </div>
              </div>
            </div>
            <AreaChart
              data={trend.map((t) => ({ label: t.label, value: t[metric] }))}
              compare={metric === 'kepatuhan' ? undefined : trend.map((t) => t.kepatuhan)}
              compareLabel="Kepatuhan"
              seriesLabel={metricLabel}
              selectedIndex={idx}
              onSelect={setPoint}
            />
          </>
        )}
      </ChartCard>

      <div className="mk-row">
        <ChartCard
          className="is-half"
          title="Kepatuhan per sub-holding"
          question="Bagian grup mana yang tertinggal?"
          table={<SimpleTable head={['Sub-holding', 'Skor', 'Jumlah PT']} rows={data.bySubHolding.map((b) => [b.name, b.skor, b.jumlahPt])} />}
        >
          {data.bySubHolding.length === 0 ? (
            <EmptyNote>Belum ada skor kepatuhan bulan ini.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-4">
              {data.bySubHolding.map((b) => (
                <DivisionBar
                  key={b.name}
                  name={b.name}
                  value={b.skor}
                  tone={scoreTone(b.skor)}
                  target={TARGET}
                  meta={`${formatNumber(b.jumlahPt)} PT${b.skor < TARGET ? ' · di bawah target' : ''}`}
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          className="is-half"
          title="Status laporan hari ini"
          question="Bagaimana kondisi pelaporan hari ini?"
          table={<SimpleTable head={['Status', 'Jumlah']} rows={data.dailyStatus.map((d) => [d.label, d.jumlah])} />}
        >
          {totalHarian === 0 ? (
            <EmptyNote>Belum ada laporan hari ini. Grafik terisi setelah PIC mengirim laporan.</EmptyNote>
          ) : (
            <DonutChart
              size={168}
              centerSub="laporan"
              label="Status laporan hari ini"
              data={data.dailyStatus.map((d) => ({ label: d.label, value: d.jumlah, tone: DAILY_TONE[d.status] ?? 'neutral' }))}
            />
          )}
        </ChartCard>
      </div>

      <div className="mk-row">
        <ChartCard
          className="is-half"
          title="Eskalasi menunggu keputusan"
          question="Apa yang tertahan, dan sudah berapa lama?"
          table={
            <SimpleTable
              head={['Umur', 'Masih dalam SLA', 'Lewat SLA']}
              rows={data.escalationAging.map((e) => [e.bucket, e.dalamSla, e.lewatSla])}
            />
          }
        >
          <BarChart
            data={data.escalationAging.map((e) => ({ label: e.bucket, value: e.dalamSla + e.lewatSla }))}
            unit="eskalasi"
            height={180}
          />
          <div className="mt-3 flex items-center gap-2 t-footnote">
            {r.eskalasiLewatSla > 0 ? (
              <>
                <Icon name="peringatan" size={16} className="mk-text--late" />
                <span className="mk-text--late font-semibold">
                  {r.eskalasiLewatSla} dari {r.eskalasiTerbuka} eskalasi sudah melewati SLA dan menunggu keputusan Anda.
                </span>
              </>
            ) : (
              <span className="text-ink-2">Seluruh eskalasi terbuka masih dalam batas SLA.</span>
            )}
          </div>
        </ChartCard>

        <ChartCard
          className="is-half"
          title="Penyerahan mingguan"
          question="Divisi mana yang belum menyerahkan capaian?"
          table={
            <SimpleTable
              head={['Sub-holding', ...WEEKLY_COLUMNS.map((c) => c.key)]}
              rows={data.weeklyByGroup.map((w) => [String(w.name), ...WEEKLY_COLUMNS.map((c) => Number(w[c.key] ?? 0))])}
            />
          }
        >
          {data.weeklyByGroup.length === 0 ? (
            <EmptyNote>Minggu {data.periode.isoWeek} belum terisi.</EmptyNote>
          ) : (
            <div className="mk-list">
              {data.weeklyByGroup.map((w) => (
                <div key={String(w.name)} className="mk-listrow flex-wrap">
                  <span className="t-body-strong min-w-0 flex-1 truncate">{String(w.name)}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {WEEKLY_COLUMNS.filter((c) => Number(w[c.key] ?? 0) > 0).map((c) => (
                      <StatusBadge key={c.key} status={c.status} size="sm">
                        {`${formatNumber(Number(w[c.key]))} ${c.key.toLowerCase()}`}
                      </StatusBadge>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 t-footnote text-ink-2">
            Draf dan menunggu persetujuan belum selesai diserahkan. Periode M{data.periode.isoWeek} {data.periode.isoYear}.
          </p>
        </ChartCard>
      </div>

      <ChartCard
        title="10 PT dengan kepatuhan terendah"
        question="Di mana intervensi paling mendesak?"
        table={<SimpleTable head={['PT', 'Wilayah', 'Skor']} rows={data.lowestPt.map((p) => [p.name, p.region || '—', p.skor])} />}
      >
        {data.lowestPt.length === 0 ? (
          <EmptyNote done>Belum ada PT yang perlu diintervensi.</EmptyNote>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {data.lowestPt.map((p) => (
                <DivisionBar
                  key={p.code}
                  name={p.name}
                  value={p.skor}
                  tone={scoreTone(p.skor)}
                  target={TARGET}
                  meta={
                    <span className="flex items-center gap-2">
                      <StatusBadge status={scoreStatus(p.skor)} size="sm">
                        {SCORE_LABEL[scoreStatus(p.skor)]}
                      </StatusBadge>
                      <span>{p.region || 'Wilayah belum diisi'}</span>
                    </span>
                  }
                />
              ))}
            </div>
            <p className="mt-3 t-footnote text-ink-2">
              {r.diBawahTarget} dari {r.entitas} entitas berada di bawah target {TARGET}.
            </p>
          </>
        )}
      </ChartCard>
    </div>
  )
}
