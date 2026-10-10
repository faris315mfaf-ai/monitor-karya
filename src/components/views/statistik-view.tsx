'use client'

/**
 * Modul Statistik Admin PT (keputusan pemilik 9 Okt 2026): kartu kepatuhan
 * laporan per divisi dan peta panas 10 hari dipindah dari Ringkasan ke tab
 * sendiri supaya Ringkasan kembali ringkas. Keduanya berbagi satu sumber
 * data /api/admin/compliance (useCompliance di admin/compliance.tsx).
 */

import { PageHeader, Skeleton } from '@/components/mk'
import { formatDateLong } from '@/lib/format'
import { ComplianceCard, ComplianceHeatmapCard, useCompliance } from '@/components/admin/compliance'
import { ReportSettingsCard } from '@/components/admin/report-settings-card'

export function StatistikView() {
  const compliance = useCompliance()
  const c = compliance.data

  // Satu kalimat jawaban di atas modul: keadaan kepatuhan hari ini.
  const answer = c
    ? c.totals.expected + c.totals.onLeave === 0
      ? 'Belum ada PIC proyek yang wajib lapor hari ini.'
      : `${c.totals.reported} dari ${c.totals.expected} orang PIC sudah lapor hari ini${c.totals.onLeave ? `, ${c.totals.onLeave} cuti/izin` : ''}.`
    : null

  return (
    <>
      <PageHeader
        context={c ? `${formatDateLong(new Date(c.today))} · M${c.week.isoWeek} ${c.week.isoYear}` : undefined}
        title="Statistik"
      />
      {answer ? <p className="t-title-3 text-ink">{answer}</p> : compliance.loading ? <Skeleton h={26} w="60%" /> : null}
      <ComplianceCard state={compliance} />
      <ComplianceHeatmapCard state={compliance} />
      <ReportSettingsCard entityId={null} />
    </>
  )
}
