# Alur bisnis dan sembilan peran

Hierarki: holding → entitas/PT → divisi → proyek. Identitas akun, cakupan entitas, anggota/kepala divisi, dan penugasan PIC adalah relasi yang berbeda; jangan menyamakan peran dengan izin semua data.

| Peran | Tanggung jawab utama |
|---|---|
| PIC_PROYEK | Tugas/progres dan laporan proyek yang ditugaskan |
| KEPALA_DIVISI | Capaian mingguan, tim, ringkasan ke Direktur |
| ADMIN_PT | Penerimaan/penerusan laporan, kelola proyek dan meja akun terbatas PT |
| DIREKTUR_ENTITAS | Pengawasan entitas, persetujuan dan tindak lanjut |
| DIREKTUR_SDM_GA | Proses laporan holding dan persetujuan buka kunci |
| MANAJEMEN | Pantauan grup dan keputusan eskalasi |
| TI | Operasional dan eksekusi buka kunci; meja perusahaan/akun memiliki pengecualian |
| AUDITOR | Pembacaan audit/pantauan grup sesuai cakupan |
| SUPERADMIN | Administrasi perusahaan/akun dan seluruh kapabilitas |

Ini ringkasan, bukan matriks otorisasi pengganti kode. Sumber izin: `ROLE_CAPABILITIES`, `ROLE_TABS` di `src/lib/rbac.ts`, guard scope dan masing-masing route.

## Harian dan beberapa proyek per PIC

1. Proyek ditentukan dari penugasan yang sah. Satu proyek: formulir langsung. Lebih dari satu: daftar “Proyek Anda hari ini”; buka proyek yang dipilih di Sheet. Laporan tiap proyek terpisah.
2. **Tambah progress** menambahkan rincian tugas/progres proyek pada hari itu. Ini bukan pengiriman laporan resmi.
3. Status/progres diturunkan dari tugas saat tersedia melalui `computeRollup`; jangan hitung ulang dengan rumus terpisah di UI.
4. PIC mengisi capaian, kendala/rencana sesuai validasi, dan bukti. Simpan draf untuk menyimpan pekerjaan yang belum lengkap.
5. **Kirim laporan** melakukan validasi dan mencatat pengiriman kepada **Admin PT**. Kepala divisi melihat, bukan penerima persetujuan wajib alur harian.
6. Admin meneruskan ke holding → laporan beku. Gerbang `dailyGate` melindungi laporan, tugas, dan bukti. Kirim ulang sebelum tenggat tetap harus lolos gerbang yang sama.
7. Perubahan setelah terkunci melalui permintaan → persetujuan → eksekusi buka kunCI. Buka kunci menyasar laporan yang sudah ada, bukan membuat hari lama baru. Laporan diteruskan tetap tidak boleh dihapus.

Satu laporan per `(projectId, reportDate)`. `reportDate` adalah awal hari **WIB**, bukan UTC. Tenggat harian bawaan 17.00 WIB. Bukti dihitung dari tabel Evidence; jangan mempercayai angka kiriman klien.

## Mingguan dan alur terkait

- Capaian divisi: serah **Kamis 17.00 WIB**, kunci **Jumat 17.00 WIB**. Disetujui dari status yang sah, diteruskan lalu beku.
- Output memiliki review dan riwayat revisi; penerimaan output memengaruhi angka dashboard.
- Usulan tenggat harus divalidasi kembali pada saat keputusan, termasuk tanggal yang sudah lewat.
- Pengajuan cuti/kehadiran dan Urungkan memerlukan konsistensi transaksi, cakupan, dan audit.
- Urungkan memakai token server, pelaku yang sama, jendela 15 menit; jangan menganggap toast klien bukti keberhasilan.
- Permintaan akun baru yang disetujui menghasilkan tautan aktivasi; pembuat/penyetuju menyerahkan tautan, bukan kata sandi tersimpan di dokumentasi.

## Sumber terperinci

[Laporan harian](../fitur/laporan-harian.md), [capaian mingguan](../fitur/capaian-mingguan.md), [penerimaan](../fitur/penerimaan.md), [output](../fitur/output-review.md), [permintaan akses](../fitur/permintaan-akses.md), [alur antarperan](../design/peran/00-alur-antarperan.md).

Aturan KPI, ambang beban, navigasi tambahan dan kewenangan tertentu masih keputusan terbuka. Jangan mengubahnya hanya berdasarkan ringkasan dokumen ini; lihat [backlog](07-BACKLOG-DAN-KEPUTUSAN.md).
