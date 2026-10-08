# Pekerjaan yang belum selesai dan urutan penerusan

Sumber lengkap: [SISA-PEKERJAAN](../SISA-PEKERJAAN.md). Dokumen ini memetakan siapa yang dapat melanjutkan, bukan memberi persetujuan keputusan produk atau produksi.

## Pengembangan lokal

- Label tiga huruf pada heatmap Admin ponsel; kartu divisi dua kolom tablet.
- Aktivitas Auditor ponsel memakai ActivityItem sesuai spesifikasi.
- Drift skema/migrasi lama: kaji indeks manual dan approvalChain, siapkan solusi serta bukti DB terisolasi.
- Rate limit bersama untuk multi-instans. Kebutuhan bergantung rancangan deploy; jangan menambahkan layanan berbayar tanpa keputusan.
- Pemeliharaan patch braces lokal dan penggantian dengan rilis resmi kompatibel bila tersedia.
- Pengujian keyboard pada Sheet yang mengubah data, aksesibilitas, tema, tampilan; bedakan otomatis dan perangkat asli.

## Keputusan pemilik yang masih terbuka

1. Bawaan orkestrator: persetujuan mingguan hanya dari MENUNGGU_PERSETUJUAN; Kendala/Rencana selalu tampil; kebijakan sandi dan ganti awal; notifikasi milik sendiri; tombol primer antrean; warna data khusus divisi; lonceng mode Dock.
2. Siapa wajib laporan dan cara menghitung kepatuhan, pengecualian Cuti/Sakit/Izin, keterlambatan mingguan.
3. Bobot KPI 40/30/20/10, snapshot bulanan, target tepat waktu 30 hari 85%.
4. Ambang kepatuhan PT 70%/85% dan beban PIC 6 proyek/15 tugas atau 4/10.
5. Navigasi terpisah per spesifikasi atau mempertahankan kartu/tab di layar; dampaknya ROLE_TABS.
6. Admin PT boleh mengubah peran langsung atau wajib permintaan persetujuan.
7. Kepala divisi boleh mengajukan buka kunci mingguan atau tetap melalui Admin.
8. Tab Persetujuan Direksi SDM & GA; tab Log Direktur entitas.
9. Kontrak tetap jenis Materi atau jenis tersendiri.
10. Istilah progress/Berjalan/Terkendala dan tombol Hapus/Kelola.
11. Ubin Template saat ini menghitung jenis divisi; model template belum ada.
12. Fokus judul Sheet yang diprogram dan kesesuaiannya dengan aksesibilitas.
13. Tiga grafik/API belum dipasang: management-charts, compliance-treemap/compliance-map, kpi-trend-chart/kpi-trends — pasang atau hapus.

Jangan menyebut aturan bawaan sebagai keputusan final pemilik. Sajikan opsi, akibat, dan rekomendasi konkret ketika tugas tersebut dipilih.

## Operator produksi / data lama

Backup sebelum migrasi; verifikasi riwayat produksi; terapkan migrasi tertunda yang benar; backfill divisionId akun/proyek; audit PIC sementara historis tanpa snapshot; uji seluruh peran tanpa 500; setup env/CSP/storage; jadwal cron/monitor; jalur privat hook backup; backup dan **restore**; hindari dua penjadwal Vercel+VPS; komunikasi login ulang.

## QA perangkat

VoiceOver/TalkBack, Safari/iOS, perangkat sentuh asli, zoom 200% nyata, simulasi buta warna, serta konfirmasi fokus/keyboard pada Kirim/Setujui/Hapus. Screenshot preview bukan bukti perangkat nyata.

## Urutan yang disarankan kepada Zcode

1. Terima handoff dan verifikasi checkout, perubahan lokal, layanan, sumber rahasia tanpa menampilkannya.
2. Sepakati tugas berikutnya dengan pemilik dari daftar ini; jangan menjalankan seluruh backlog otomatis hanya karena membaca prompt handoff.
3. Untuk tugas teknis terpilih: zona, reproduksi, perubahan kecil, tes terfokus lalu gerbang; tulis `docs/zcode/HASIL-<topik>.md`.
4. Untuk keputusan bisnis: siapkan contoh alur dan dampak, minta keputusan spesifik sebelum implementasi bergantung keputusan itu.
5. Integrasi cabang dan produksi dilakukan sesuai izin terpisah. Seluruh paket deploy tersedia, tetapi tidak sama dengan izin menjalankannya.
