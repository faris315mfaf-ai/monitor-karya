# Hasil — Tahap 3 dashboard Manajemen per perusahaan (kerangka konsolidasi)

Kerangka ditulis agen T3-D dan **diisi parent (Zcode) setelah seluruh 5 agen selesai, 8 Oktober 2026 (Asia/Jakarta)**, cabang `codex/kerja`. Seluruh angka pada dokumen ini berasal dari laporan agen di [laporan-swarm/](laporan-swarm/README.md) yang telah ditinjau parent, atau dari pemeriksaan yang parent jalankan sendiri saat integrasi. Perintah orkestrasi: 4 agen bangun (T3-A1 sampai T3-A4) + 1 agen dokumentasi (T3-D), serentak, zona berkas diskrit, tanpa commit oleh agen — parent yang menggabungkan, menggerbangi, dan meng-commit per topik.

## Tujuan

Menerapkan keputusan pemilik 8 Oktober 2026 atas layar Ringkasan Manajemen ke dalam kode (menghapus enam kartu, menambah bagian "Laporan per perusahaan" dengan drill-down kartu PT → Sheet perusahaan → Sheet proyek), memperbarui spesifikasi [`docs/design/peran/01-manajemen.md`](../design/peran/01-manajemen.md) beserta backlog, lalu menggerbangi hasilnya sebagai satu kesatuan.

## Keputusan pemilik (8 Oktober 2026)

Sumber: pemilik langsung (percakapan). Layar: Ringkasan Manajemen — `ManagementDashboard` (`src/components/oversight/management-dashboard.tsx`), dipakai peran grup MANAJEMEN, DIREKTUR_SDM_GA, TI, SUPERADMIN, AUDITOR.

- **Dihapus:** kartu "Output selesai" (`BarChart` + `StatTile`), "Kapan proyek prioritas selesai?" (`Timeline`), "Status N proyek" (`DonutChart`), "Perlu perhatian" (`AttentionItem`), "Persetujuan menunggu/Keputusan terbuka" (`ApprovalItem` + `StatTile`), "Aktivitas terbaru" (`ActivityItem`).
- **Dipertahankan:** hero (kalimat + `ActivityRings`) dan `StatTile` lain (Rata-rata progres, Kehadiran).
- **Wajib baru:** bagian "Laporan per perusahaan" — kartu per PT → Sheet perusahaan berisi daftar proyek → Sheet proyek berisi laporan harian (selesai/dikerjakan/belum) + bagian perlu perhatian/eskalasi dari data eskalasi. Contoh pemilik: satu PT dengan proyek "SIM RS", "MEDCREATIX", "MEDPAY".

Rincian penandaan pada spesifikasi (butir riwayat tidak dibuang) ada di [01-manajemen](../design/peran/01-manajemen.md).

## Topologi 5 agen — status konsolidasi

Ringkasan hasil dan status tiap agen diisi parent dari laporan agen; teks brief lengkap dipegang parent dan diringkas tiap agen pada berkas laporannya sendiri (konvensi [laporan-swarm/README](laporan-swarm/README.md)).

| ID | Peran | Ringkasan hasil | Laporan |
|---|---|---|---|
| T3-A1 | Server: `projects[].escalations` di /api/ringkasan (pemetaan sourceId→projectId tahan laporan lama) + filter `projectId` /api/daily-reports; 11 tes baru | [T3-A1](laporan-swarm/T3-A1-LAPORAN.md) | [T3-A1](laporan-swarm/T3-A1-LAPORAN.md) |
| T3-A2 | Layout: enam kartu + kode mati turunannya dihapus, bagian "Laporan per perusahaan" terpasang; kartu tabel "Proyek prioritas" turut dihapus parent (keputusan pemilik menyebutnya terpisah) | [T3-A2](laporan-swarm/T3-A2-LAPORAN.md) | [T3-A2](laporan-swarm/T3-A2-LAPORAN.md) |
| T3-A3 | `company-reports.tsx`: kartu PT → Sheet perusahaan (ProjectRow) → Sheet proyek (14 laporan berlabel manusiawi + bagian eskalasi); 21 tes unit; agen putus karena jaringan setelah berkas lengkap — diverifikasi parent | [T3-A3](laporan-swarm/T3-A3-LAPORAN.md) | [T3-A3](laporan-swarm/T3-A3-LAPORAN.md) |
| T3-A4 | Mock pratinjau: PT. SPKD dengan SIM RS/MEDCREATIX/MEDPAY + eskalasi + arsip daily-reports `projectId`; tes cx11 disesuaikan; agen putus karena jaringan (DNS api.z.ai) — laporan ditulis parent hasil verifikasi | [T3-A4](laporan-swarm/T3-A4-LAPORAN.md) | [T3-A4](laporan-swarm/T3-A4-LAPORAN.md) |
| T3-D | Dokumentasi | Revisi spesifikasi 01-manajemen (blok keputusan + tanda "dihapus 8 Okt" + bagian Laporan per perusahaan), catatan keputusan pada SISA-PEKERJAAN B/C, kerangka konsolidasi ini, entri indeks dokumen, worklog | — |

Batasan bersama yang dipegang semua agen: tanpa commit/add/push, tanpa menjalankan tes/build (gerbang dijalankan parent), tanpa jaringan/port/kontainer, zona berkas diskrit (laporan agen lain di `laporan-swarm/T3-A*.md` tidak disentuh agen lain), dan dilarang memperluas keputusan bisnis yang belum diputuskan pemilik.

## Hasil integrasi parent

Bagian ini diisi parent setelah seluruh agen selesai dan zona digabung.

### Gerbang konsolidasi (dijalankan parent di atas pohon gabungan)

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit --incremental false` | Lulus |
| `npx eslint src` | Lulus |
| `npx vitest run` | **88 berkas / 1.559 tes lulus** (sebelum fitur: 87/1.527 → +32) |
| `npx next build` (env tiruan) | Lulus (61/61 halaman) |
| `git diff --check` | Bersih |

Catatan insiden: agen T3-A3 dan T3-A4 kehilangan koneksi ke API model (DNS `api.z.ai`, ±14.00 WIB) sebelum menulis balasan akhir. Berkas A3 sudah lengkap saat itu; pekerjaan A4 ditemukan lengkap di pohon kerja dan diverifikasi parent (`tests/api`+`tests/ui`+`tests/cx` 35 berkas/731 tes hijau). Laporan A4 ditulis parent dengan status verifikasi jelas.

### Perbaikan integrasi oleh parent

1. Kartu tabel **"Proyek prioritas"** turut dihapus — keputusan pemilik menyebutnya sebagai butir terpisah dari "kapan proyek selesai"; chip filter/`STATUS_FILTERS`/state `filter`/`filtered` dan impor mati dibersihkan; pencarian ⌘K tetap membuka Sheet proyek.
2. Cast `as OversightProject[]` dilepas — `CompanyReports` kini menerima array proyek ternormalisasi (PIC fallback tetap di dashboard).
3. Duplikasi kalimat pengantar dihilangkan (dipertahankan kalimat jawaban A3 "n perusahaan · ketuk untuk membaca laporan hariannya").
4. Dua tes `tests/cx/cx15-features.test.ts` yang mengunci kartu terhapus ditulis ulang: kartu lama dipastikan hilang + bagian baru hadir; regresi PIC-null dipertahankan via `.not.toThrow()`; mock `@/hooks/use-fetch` ditambahkan karena `useFetch` memakai app router.

### Commit integrasi (per topik, oleh parent)

`db53244` T3-A1 (server) · `93bb27b` T3-A3 (company-reports) · `9727e07` T3-A2+integrasi (management-dashboard + cx15) · `5a8e35f` T3-A4 (mock pratinjau + cx11) · dokumentasi pada commit akhir.

### Verifikasi visual (parent, peramban sungguhan di server dev 3200 hot-reload)

Desktop 1440 px, pratinjau MANAJEMEN: keenam kartu lama + "Proyek prioritas" tidak ada; bagian "Laporan per perusahaan" menampilkan 4 kartu PT (termasuk **PT. SPKD · 3 proyek**). Klik PT. SPKD → Sheet berisi SIM RS (64%, Sesuai jadwal), MEDCREATIX (46%, Perlu perhatian), MEDPAY (25%, Sesuai jadwal). Klik MEDCREATIX → Sheet proyek: identitas + PIC, StatTile "Lapor 14 hari" (10, 1 terlambat), riwayat laporan berlabel manusiawi (Selesai/Dikerjakan/Terkendala/Tanpa perubahan + penanda Terlambat), dan bagian "Perlu perhatian & eskalasi" dengan eskalasi nyata (Anggaran · 3 hari · Ditinjau).

### Temuan lintas agen yang menunggu keputusan/tindak lanjut

- Kartu "Kinerja divisi" / "Tepat waktu per perusahaan" dan papan "Aktivitas per perusahaan" **dipertahankan** — pemilik tidak menyebutnya; konfirmasi bila ingin dihapus juga.
- `ActivityRings` hero masih memuat lingkaran Output — pemilik menyebut tampilan "fitur output"; ring tidak dihapus karena bukan kartu yang disebut. Konfirmasi bila ingin diganti.
- Tiga grafik/API tertunda (`management-charts` dll.): keputusan penghapusan kartu ini memperkuat rekomendasi hapus pada [memo](USULAN-GRAFIK-TERTUNDA.md); keputusan final tetap pemilik.

## Sisa pekerjaan operator (diperbarui setelah konsolidasi)

Tidak ada pekerjaan operator baru dari fitur ini. Yang tetap menunggu pemilik/operator berasal dari tahap sebelumnya: A2-08/jalur Biznet, keputusan bagian B lainnya, dan deploy VPS sesuai [DEPLOY-RENCANA-VPS-BIZNET](DEPLOY-RENCANA-VPS-BIZNET.md). Push GitHub cabang `codex/kerja` menunggu instruksi pemilik.