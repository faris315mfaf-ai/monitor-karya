# Serah terima Monitor Karya — Codex ke Zcode

Tanggal 8 Oktober 2026, Asia/Jakarta. Disusun atas permintaan pemilik untuk melanjutkan proyek di alat lain. Paket dokumentasi selesai disiapkan; penerimaan dan perpindahan runtime oleh Zcode belum dilakukan.

## Keadaan yang diserahkan

Aplikasi Next/React/Prisma untuk laporan proyek harian, capaian divisi mingguan, persetujuan, akun, audit, dan pantauan holding. Sembilan peran. Sumber terbaru di worktree `monitor-karya-codex`, cabang `codex/kerja`, basis `4117a25`. Worktree Claude `monitor karya` pada `89766df` saat diperiksa; belum digabung.

CX 1–7, perbaikan poin 1–7 dan CX 8–15, serta lima prioritas CX 16–20 memiliki laporan lokal. Terakhir: 1.356 tes aplikasi, 794 tes dependensi, build Next/Docker,7 skenario HTTP/DB dan 3 probe gangguan lulus7 Oktober. Pembuatan paket 8 Oktober tidak menjalankan ulang tes atau mengubah aplikasi/data/layanan.

DB lokal pengguna 54339 dipertahankan; snapshot terakhir97 akun, 40 proyek, 741 laporan. Runtime pengguna port 3200. Jangan menganggap layanan masih hidup hanya dari catatan ini: periksa saat sesi baru. Kredensial tidak disertakan.

## Paket yang harus dibaca

[Indeks utama](zcode/README.md) mencakup aturan, struktur, alur peran, keamanan, lingkungan, bukti, backlog, operasional, prompt, inventaris endpoint/model/env, serta indeks dokumen. Semua tautan relatif agar repo tetap dapat dipindah.

## Batas serah terima

Tidak ada push/PR/deploy/akses produksi, pergantian cabang, atau perubahan model Zcode. Instruksi berlaku sebagai dokumen proyek; tidak mengasumsikan format konfigurasi atau kemampuan khusus Zcode. Database dan rahasia harus dikelola terpisah secara privat bila pindah mesin. Riwayat Git dan vendor harus ikut; menyalin linked worktree saja tidak cukup.

## Langkah penerima

1. Buka worktree yang benar dan baca ZCODE.md/AGENTS/paket ini.
2. Periksa status Git, layanan lokal, dan perbedaan fakta terhadap catatan; jangan cetak rahasia.
3. Buat `docs/zcode/PENERIMAAN-ZCODE.md` dengan hasil pemeriksaan aktual.
4. Pilih tugas berikutnya dari backlog dengan pemilik; keputusan bisnis dan produksi tetap memerlukan arahan khusus.
5. Pertahankan catatan hasil, bukti tes dan batasan pada setiap perubahan.

Daftar global: [SISA-PEKERJAAN](SISA-PEKERJAAN.md). Lima prioritas terakhir selesai **lokal** tidak sama dengan seluruh proyek selesai atau siap produksi.
