# Memo keputusan — tiga grafik dan API yang belum dipasang

Disusun Zcode, 8 Oktober 2026, untuk membantu keputusan pemilik (butir C pada SISA-PEKERJAAN). Memo ini tidak mengubah kode; pemasangan atau penghapusan baru dilakukan setelah keputusan ditetapkan.

Objek:

| Komponen | API | Ukuran | Status |
|---|---|---|---|
| `src/components/views/management-charts.tsx` | `/api/management-charts` | 350 + 213 baris | Tidak dipasang di tab mana pun; tidak diimpor komponen lain |
| `src/components/dashboard/compliance-treemap.tsx` | `/api/compliance-map` | 144 + 150 baris | Tidak dipasang |
| `src/components/dashboard/kpi-trend-chart.tsx` | `/api/kpi-trends` | 62 + 84 baris | Tidak dipasang (kepala berkas menyatakan itu sendiri) |

Fakta bersama: ketiga API sudah ber-guard `requireApiUser` + batas cakupan entitas (`resolveScopeEntityId`/`scopeEntityIds`/`refuseUnscoped`), tetapi **belum ada satu pun tes** yang menyentuhnya, dan ketiganya tidak dirujuk spesifikasi layar apa pun di `docs/design/peran/` (Ringkasan Manajemen saat ini sudah memakai `ActivityRings`, `BarChart`, `Timeline`, `DonutChart` sesuai 01-manajemen.md).

## Opsi

**A. Pasang.**
- `management-charts`: paling wajar di tab Ringkasan Manajemen sebagai bagian "kepatuhan grup" (tren kepatuhan/tepat waktu, skor per sub-holding, umur eskalasi). Data sudah tersedia dari tabel laporan.
- `compliance-treemap`: paling wajar di tab Entitas (Auditor/Manajemen) karena menjawab "di mana kepatuhan terendah di pohon perusahaan".
- `kpi-trend-chart`: menampilkan riwayat `KpiSnapshot` bulanan; **bergantung keputusan KPI terbuka** (bobot 40/30/20/10, target 85%) — kalau angkanya nanti berubah, makna trennya ikut berubah.
- Dampak: perlu pekerjaan pemasangan (tempat di layar, keputusan tab peran), pembuatan tes API + render, dan kewajiban pemeliharaan tiga endpoint baru selamanya. Estimasi pekerjaan: sedang; bukan penghalang rilis.

**B. Hapus beserta API-nya.**
- Dampak: `-1.003` baris komponen+API, satu nyawa konfigurasi kurang, tidak ada tes yang harus dibuat. Riwayat Git tetap menyimpannya sehingga bisa dihidupkan lagi dari riwayat bila berubah pikiran.
- Risiko: kehilangan pekerjaan yang sudah selesai dan lulus tsc/eslint; kalau nanti diminta grafik serupa, menulis ulang dari riwayat.

**C. Tunda dengan status jelas (tanpa perubahan kode).**
- Biarkan berkas dan API tetap ada, catat di SISA-PEKERJAAN bahwa keputusan ditunda sampai setelah rilis VPS pertama.
- Dampak: nol pekerjaan sekarang; tiga endpoint ter-guard tetap terpasang di produksi tanpa pemakai — permukaan audit sedikit lebih luas, tetapi tidak berbahaya karena ber-guard dan tanpa tes yang meloloskan regesi salah.

## Rekomendasi

`kpi-trend-chart` **tunda sampai keputusan KPI (bobot/target) ditetapkan** — memasangnya sebelum angka final berisiko tampil salah makna. Dua lainnya mengikuti jawaban satu pertanyaan: apakah Ringkasan Manajemen dan tab Entitas versi sekarang sudah menjawab kebutuhan pemantauan? Bila ya, **hapus** (opsi B) agar produksi berisi hanya yang dipakai; bila pengguna meminta tren kepatuhan grup saat uji penerimaan, **pasang `management-charts`** di Ringkasan Manajemen dan `compliance-treemap` di Entitas sebagai satu tugas tersendiri dengan tesnya.

Keputusan yang diminta: satu huruf per objek (pasang / hapus / tunda) atau "semua mengikuti rekomendasi".
