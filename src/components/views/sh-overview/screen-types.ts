import type { DayView, Filter, V2Data } from './model'

/** Props bersama layar ponsel (MobileOverview) dan tablet/desktop (TabletOverview). */
export type OverviewScreenProps = {
  /** Label peran, mis. "Superuser" atau "Manajemen". */
  roleName: string
  /** Tanggal laporan yang ditampilkan, 'YYYY-MM-DD' WIB. */
  dateKey: string
  /** Hari ini WIB — batas akhir pemilih tanggal. */
  todayKey: string
  onDate: (key: string) => void
  /**
   * Status pelaporan — kartu "13 dari 18 PT sudah melapor", PT/subholding
   * "belum melapor" — hanya untuk peninjau (Supervisor). Ketua Umum &
   * Manajemen (false) hanya melihat laporan yang sudah disetujui.
   */
  showStatus: boolean
  /** GET /api/sh/overview?date=dateKey. */
  data: V2Data | null
  loading: boolean
  error: string | null
  reload: () => void
  /** Sudah divalidasi terhadap data (validFilter). */
  filter: Filter
  /** Integrator menyimpan pilihan per perangkat (saveFilter). */
  onFilter: (f: Filter) => void
  /** Tampilan daftar: Semua terbuka / Ringkas (tersimpan per perangkat). */
  dayView: DayView
  onDayView: (v: DayView) => void
}
