'use client'

import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { useFetch } from '@/hooks/use-fetch'
import { LoadingCard, LoadingSpinner, EmptyState } from '@/components/loading-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle, CalendarRange, CheckCircle2, ClipboardList, Siren, Table2, TrendingUp,
} from 'lucide-react'

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

/** Series colours come from the validated tokens in globals.css. */
const S1 = 'var(--series-1)'
const S2 = 'var(--series-2)'
const S3 = 'var(--series-3)'
const S4 = 'var(--series-4)'
const GOOD = 'var(--status-good)'
const WARNING = 'var(--status-warning)'
const SERIOUS = 'var(--status-serious)'
const CRITICAL = 'var(--status-critical)'
const NEUTRAL = 'var(--viz-neutral)'

const TARGET = 75 // the compliance score below which an entity needs attention

const axis = {
  stroke: 'var(--viz-axis)',
  tick: { fill: 'var(--viz-ink)', fontSize: 13 },
}

/** One tooltip style for every chart, so the reading habit transfers. */
function ChartTooltip({
  active,
  payload,
  label,
  unit = '',
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string }[]
  label?: string | number
  unit?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-modal rounded-xl px-3 py-2 shadow-lg">
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</div>
      <div className="mt-1 space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-slate-600 dark:text-slate-300">{p.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {p.value}
              {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Chart frame: title, the question it answers, and a table fallback. */
function ChartCard({
  title,
  question,
  icon: Icon,
  children,
  table,
}: {
  title: string
  question: string
  icon: typeof TrendingUp
  children: React.ReactNode
  table?: React.ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <Card className="glass viz">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
              <Icon className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {title}
              </CardTitle>
              <CardDescription className="text-sm">{question}</CardDescription>
            </div>
          </div>
          {table && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTable((v) => !v)}
              className="shrink-0 text-sm"
              aria-pressed={showTable}
            >
              <Table2 className="h-4 w-4" />
              {showTable ? 'Grafik' : 'Tabel'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>{showTable && table ? table : children}</CardContent>
    </Card>
  )
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm min-w-[320px]">
        <thead>
          <tr className="text-slate-500 dark:text-slate-400 text-left">
            {head.map((h, i) => (
              <th key={i} className={`py-1.5 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/40 dark:border-white/10">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`py-1.5 ${j > 0 ? 'text-right tabular-nums font-medium' : ''} text-slate-700 dark:text-slate-200`}
                >
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
  const { data, loading, error } = useFetch<Data>('/api/management-charts')

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    )
  }
  if (error || !data) {
    return <EmptyState title="Gagal memuat grafik manajemen" description={error ?? undefined} />
  }

  const r = data.ringkasan
  const totalHarian = data.dailyStatus.reduce((s, d) => s + d.jumlah, 0)

  return (
    <div className="space-y-4">
      {/* Reading guide — the charts assume nothing */}
      <div className="glass rounded-xl px-3.5 py-3 text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
        <ClipboardList className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <span>
          Semua skor memakai skala 0–100. <strong>Target kepatuhan 75</strong>; di bawah itu
          entitas perlu perhatian. Setiap grafik menjawab satu pertanyaan, dan bisa dibaca
          sebagai tabel lewat tombol di kanan atasnya.
        </span>
      </div>

      {/* 1. Trend */}
      <ChartCard
        title="Arah Kepatuhan 6 Bulan"
        question="Apakah grup membaik atau memburuk?"
        icon={TrendingUp}
        table={
          <SimpleTable
            head={['Bulan', 'Kepatuhan', 'Tepat waktu', 'Mingguan', 'Bukti']}
            rows={data.trend.map((t) => [t.label, t.kepatuhan, t.tepatWaktu, t.mingguan, t.bukti])}
          />
        }
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.trend} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...axis} tickLine={false} />
            <YAxis domain={[50, 100]} {...axis} tickLine={false} width={44} unit="" />
            <Tooltip content={<ChartTooltip unit="%" />} />
            <Legend
              wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
              iconType="plainline"
              formatter={(v) => <span className="text-slate-600 dark:text-slate-300">{v}</span>}
            />
            <Line type="monotone" dataKey="kepatuhan" name="Kepatuhan" stroke={S1} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={700} />
            <Line type="monotone" dataKey="tepatWaktu" name="Tepat waktu" stroke={S2} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={700} animationBegin={80} />
            <Line type="monotone" dataKey="mingguan" name="Kelengkapan mingguan" stroke={S3} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={700} animationBegin={160} />
            <Line type="monotone" dataKey="bukti" name="Kelengkapan bukti" stroke={S4} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={700} animationBegin={240} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Garis naik berarti membaik. Empat indikator dipisah agar terlihat mana yang menahan
          skor kepatuhan.
        </p>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 2. By sub-holding */}
        <ChartCard
          title="Kepatuhan per Sub-Holding"
          question="Bagian grup mana yang tertinggal?"
          icon={CheckCircle2}
          table={
            <SimpleTable
              head={['Sub-holding', 'Skor', 'Jumlah PT']}
              rows={data.bySubHolding.map((b) => [b.name, b.skor, b.jumlahPt])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={Math.max(160, data.bySubHolding.length * 56)}>
            <BarChart
              data={data.bySubHolding}
              layout="vertical"
              margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
            >
              <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} {...axis} tickLine={false} />
              <YAxis type="category" dataKey="name" {...axis} tickLine={false} width={120} />
              <Tooltip content={<ChartTooltip unit=" / 100" />} cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.35 }} />
              <Bar dataKey="skor" name="Skor kepatuhan" radius={[0, 4, 4, 0]} animationDuration={700} label={{ position: 'right', fill: 'var(--viz-ink)', fontSize: 13 }}>
                {data.bySubHolding.map((b, i) => (
                  <Cell key={i} fill={b.skor < TARGET ? CRITICAL : S1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Batang merah berarti di bawah target 75.
          </p>
        </ChartCard>

        {/* 3. Today's status mix */}
        <ChartCard
          title="Status Laporan Hari Ini"
          question="Bagaimana kondisi pelaporan hari ini?"
          icon={ClipboardList}
          table={
            <SimpleTable
              head={['Status', 'Jumlah']}
              rows={data.dailyStatus.map((d) => [d.label, d.jumlah])}
            />
          }
        >
          {totalHarian === 0 ? (
            <EmptyState title="Belum ada laporan hari ini" description="Grafik terisi setelah PIC mengirim laporan." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.dailyStatus} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...axis} tickLine={false} />
                  <YAxis type="category" dataKey="label" {...axis} tickLine={false} width={132} />
                  <Tooltip content={<ChartTooltip unit=" laporan" />} cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.35 }} />
                  <Bar dataKey="jumlah" name="Laporan" radius={[0, 4, 4, 0]} animationDuration={700} label={{ position: 'right', fill: 'var(--viz-ink)', fontSize: 13 }}>
                    {data.dailyStatus.map((d, i) => (
                      <Cell
                        key={i}
                        fill={
                          d.status === 'SELESAI' ? GOOD
                          : d.status === 'ON_PROGRESS' ? S1
                          : d.status === 'TERKENDALA' ? CRITICAL
                          : d.status === 'MENUNGGU_KEPUTUSAN' ? WARNING
                          : NEUTRAL
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Total {totalHarian} laporan. Merah dan kuning adalah yang menuntut tindakan.
              </p>
            </>
          )}
        </ChartCard>

        {/* 4. Escalation ageing */}
        <ChartCard
          title="Eskalasi Menunggu Keputusan"
          question="Apa yang tertahan, dan sudah berapa lama?"
          icon={Siren}
          table={
            <SimpleTable
              head={['Umur', 'Masih dalam SLA', 'Lewat SLA']}
              rows={data.escalationAging.map((e) => [e.bucket, e.dalamSla, e.lewatSla])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.escalationAging} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" {...axis} tickLine={false} />
              <YAxis allowDecimals={false} {...axis} tickLine={false} width={36} />
              <Tooltip content={<ChartTooltip unit=" eskalasi" />} cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.35 }} />
              <Legend
                wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
                formatter={(v) => <span className="text-slate-600 dark:text-slate-300">{v}</span>}
              />
              <Bar dataKey="dalamSla" name="Masih dalam SLA" stackId="a" fill={S1} radius={[0, 0, 0, 0]} animationDuration={700} />
              <Bar dataKey="lewatSla" name="Lewat SLA" stackId="a" fill={CRITICAL} radius={[4, 4, 0, 0]} animationDuration={700} animationBegin={120} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {r.eskalasiLewatSla > 0 ? (
              <span className="text-rose-700 dark:text-rose-300 font-medium">
                <AlertTriangle className="h-4 w-4 inline -mt-0.5 mr-1" />
                {r.eskalasiLewatSla} eskalasi sudah melewati SLA dan menunggu keputusan Anda.
              </span>
            ) : (
              'Seluruh eskalasi terbuka masih dalam batas SLA.'
            )}
          </p>
        </ChartCard>

        {/* 5. Weekly hand-over */}
        <ChartCard
          title="Penyerahan Mingguan"
          question="Divisi mana yang belum menyerahkan capaian?"
          icon={CalendarRange}
          table={
            <SimpleTable
              head={['Sub-holding', 'Draft', 'Menunggu', 'Disetujui', 'Terkunci']}
              rows={data.weeklyByGroup.map((w) => [
                String(w.name),
                Number(w.Draft ?? 0),
                Number(w['Menunggu persetujuan'] ?? 0),
                Number(w.Disetujui ?? 0),
                Number(w.Terkunci ?? 0),
              ])}
            />
          }
        >
          {data.weeklyByGroup.length === 0 ? (
            <EmptyState title="Belum ada laporan mingguan" description={`Minggu ${data.periode.isoWeek} belum terisi.`} />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(180, data.weeklyByGroup.length * 64)}>
                <BarChart data={data.weeklyByGroup} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...axis} tickLine={false} />
                  <YAxis type="category" dataKey="name" {...axis} tickLine={false} width={120} />
                  <Tooltip content={<ChartTooltip unit=" divisi" />} cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.35 }} />
                  <Legend
                    wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
                    formatter={(v) => <span className="text-slate-600 dark:text-slate-300">{v}</span>}
                  />
                  <Bar dataKey="Draft" stackId="w" fill={NEUTRAL} animationDuration={700} />
                  <Bar dataKey="Menunggu persetujuan" stackId="w" fill={S4} animationDuration={700} animationBegin={80} />
                  <Bar dataKey="Disetujui" stackId="w" fill={S3} animationDuration={700} animationBegin={160} />
                  <Bar dataKey="Terkunci" stackId="w" fill={S1} radius={[0, 4, 4, 0]} animationDuration={700} animationBegin={240} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Abu-abu dan kuning belum selesai diserahkan. Minggu {data.periode.isoWeek}/{data.periode.isoYear}.
              </p>
            </>
          )}
        </ChartCard>
      </div>

      {/* 6. Weakest PTs */}
      <ChartCard
        title="10 PT dengan Kepatuhan Terendah"
        question="Di mana intervensi paling mendesak?"
        icon={AlertTriangle}
        table={
          <SimpleTable
            head={['PT', 'Wilayah', 'Skor']}
            rows={data.lowestPt.map((p) => [p.name, p.region || '—', p.skor])}
          />
        }
      >
        <ResponsiveContainer width="100%" height={Math.max(200, data.lowestPt.length * 38)}>
          <BarChart data={data.lowestPt} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
            <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} {...axis} tickLine={false} />
            <YAxis type="category" dataKey="name" {...axis} tickLine={false} width={168} />
            <Tooltip content={<ChartTooltip unit=" / 100" />} cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.35 }} />
            <Bar dataKey="skor" name="Skor kepatuhan" radius={[0, 4, 4, 0]} animationDuration={700} label={{ position: 'right', fill: 'var(--viz-ink)', fontSize: 13 }}>
              {data.lowestPt.map((p, i) => (
                <Cell key={i} fill={p.skor < TARGET ? CRITICAL : p.skor < 85 ? SERIOUS : S1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {r.diBawahTarget} dari {r.entitas} entitas berada di bawah target 75. Merah menuntut
          tindakan segera, oranye perlu dipantau.
        </p>
      </ChartCard>
    </div>
  )
}
