# 03 · Kepala divisi

**Siapa:** pemimpin satu divisi (contoh: Andi Wijaya, Kepala Divisi Teknologi — 7 orang, 4 proyek).
**Pertanyaan utama:** Output apa yang harus saya review? Siapa yang belum lapor? Siapa yang kelebihan beban? Apakah laporan mingguan siap dikirim?
**Papan kanvas:** halaman "4 · Kepala divisi" — `DKadiv`, `TKadiv`, `TKadivReview`, `PKadiv`, `PKadivReview`, `PKadivTim`, `PKadivProyek`, `PKadivDetail`.

## Desktop — urutan

1. **Sidebar:** "Kepala divisi · Teknologi". Nav: Ringkasan · Review output `n` (aksen) · Laporan harian `4/5` · Proyek `4` · Tim `7` · Laporan mingguan.
2. **Header:** "Senin, 5 Oktober 2026 · Divisi Teknologi · 7 orang" + "Selamat sore, Andi"; kanan: cari, notifikasi, tombol aksen **"Laporan mingguan M41"**.
3. **Hero:** eyebrow "Minggu ke-41 · 4 proyek aktif"; **"Divisi Teknologi menyelesaikan 31 output minggu ini."** (angka naik saat output diterima); pendukung "5 output menunggu review Anda. 1 laporan harian belum masuk. Aplikasi Absensi perlu perhatian."; tombol "Review 5 output", tautan "Lihat laporan harian".
   - `ActivityRings`: **Laporan harian 4/5** (sub "Fajar cuti") · **Output 31/38** · **Kehadiran 6/7**.
   - KPI: Output selesai (gradient, "31 dari 38") · Menunggu review (risk, "paling lama sejak Jumat") · Rata-rata beban kerja 77% ("1 orang di atas 100%") · Tepat waktu 30 hari 82% (target 85%).
4. **Output menunggu review** (2/3): "Output baru dihitung selesai setelah Anda terima"; tombol "Terima semua"; `Chip` per proyek (Semua 5 · Migrasi Server 2 · Aplikasi Absensi 1 · Google Workspace 1 · Portal Pelanggan 1); `ApprovalItem` dengan label **Terima / Minta revisi → Diterima / Revisi diminta** dan `amount` berisi jenis bukti ("2 berkas", "Laporan uji", "Tautan desain").
5. **Laporan harian tim** (1/3): "4 dari 5 masuk · tenggat 17.00"; baris anggota (avatar, nama, peran, lencana Terkirim 16.40 / Belum masuk / Cuti / Diingatkan), baris bisa diklik → sheet; tombol "Ingatkan yang belum mengirim".
6. **Proyek Divisi Teknologi** (lebar penuh): `Timeline` 4 proyek + legenda status.
7. **Beban kerja tim** (1/2): `DivisionBar` per orang, target 80 ("batas sehat"), warna: >100 merah, >80 oranye, selain itu `data-1`; meta = proyek orang itu. **Output harian per orang** (1/2): `Heatmap` 6 orang × 10 hari kerja (sel kosong = cuti) + di bawahnya `AreaChart` output divisi per minggu vs target.
8. **Laporan mingguan M41 untuk Direktur** (2/3): "Disusun otomatis dari laporan harian · serahkan paling lambat Kamis, 8 Okt 17.00 · dikunci Jumat, 9 Okt 17.00", lencana Draf/Terkirim; `FlowDiagram` Kumpulkan → Review output → Susun ringkasan → Kirim ke Direktur (status mengikuti sisa review); 3 angka (Output diterima, Proyek sesuai jadwal 3/4, Kendala terbuka 1); 3 poin; tombol "Edit draf" · **"Kirim ke Direktur"** → "Terkirim ke Hadi Santoso".
9. **Aktivitas tim** (1/3).

## Sheet
- **Anggota:** lencana laporan, `DivisionBar` beban kerja minggu ini, "Dikerjakan hari ini" (butir), Kendala, Rencana besok. Aksi "Kirim catatan" · "Tandai sudah dibaca" (atau "Ingatkan Rina" bila belum lapor).
- **Proyek:** ring, status, output, tenggat, tahapan.

## Tablet — Ringkasan · Review · Tim · Proyek
Ringkasan: hero + 4 KPI + kartu laporan mingguan (alur horizontal + poin + kirim). Review: chip + daftar + "Terima semua" + catatan informasi. Tim: laporan harian & beban kerja berdampingan, peta panas lebar penuh. Proyek: timeline + kartu proyek 2 kolom + tren vs target.

## Ponsel — tab yang sama
Ringkasan: cincin + legenda + kalimat + tombol "Review n output" (pindah ke tab Review); 2 KPI; laporan mingguan dengan alur **vertikal** + tombol kirim lebar penuh. Review: chip digulir, kartu per output, "Terima semua". Tim: laporan harian + tombol ingatkan, beban kerja, peta panas (sel 26, label inisial). Proyek: `ProjectRow compact` + output vs target. Detail anggota sebagai layar didorong.

## Aturan khusus
- **Tenggat mingguan (diputuskan 6 Okt 2026):** serah paling lambat **Kamis 17.00 WIB**, minggu **dikunci Jumat 17.00 WIB** (`WEEKLY_LOCK_LABEL` di `src/lib/lock.ts`; jam dan hari bisa diatur lewat env `WEEKLY_HANDOVER_DAY`, `WEEKLY_LOCK_DAY`, `WEEKLY_CUTOFF_HOUR`). Antara Kamis 17.00 dan Jumat 17.00 laporan masih bisa diisi dan diserahkan, tetapi tercatat lewat tenggat serah.
- **Alur status:** Draf → Serahkan → Menunggu persetujuan → kepala divisi **Setujui laporan** (hanya untuk laporan yang menunggu persetujuan; draf ditolak dengan pesan "Laporan masih draf…") → Admin PT meneruskan ke holding. Satu tombol primer per kartu: langkah berikutnya saja.
- **Setelah diteruskan** laporan dibekukan: tidak bisa diubah, dihapus, diserahkan, atau disetujui ulang. Koreksi hanya lewat permohonan buka kunci yang disetujui dan dijalankan; selama buka kunci berlaku koreksi tersimpan langsung tanpa menarik laporan kembali ke draf. Buka kunci juga membuka minggu yang sudah lewat untuk laporan yang dituju saja.
- Output yang diterima langsung menambah angka hero, cincin Output, KPI, dan menggerakkan alur laporan mingguan.
- Laporan mingguan tidak bisa "Terkirim" sebelum tenggat lewat tanpa konfirmasi bila masih ada review tersisa (tampilkan peringatan di langkah berikut).
- Orang cuti tidak dihitung di penyebut laporan harian; tulis alasannya di `sub` cincin.

## Data yang dibutuhkan
Anggota (nama, peran, proyek, beban %, status laporan + isi, output harian 10 hari), antrean review (proyek, judul, pengirim, waktu, jenis bukti), proyek divisi, tren output vs target, draf laporan mingguan.

## Implementasi saat ini (6 Okt 2026, F2)
Status lengkap per butir, rumus, dan bentuk data: [`docs/fitur/peran-kadiv.md`](../../fitur/peran-kadiv.md).
- **Tab** (`ROLE_TABS`): Ringkasan · Meja kerja · Capaian mingguan · Divisi. Review output, laporan harian tim, proyek divisi, beban kerja, ringkasan mingguan, dan aktivitas tampil sebagai kartu di Ringkasan (`src/components/kadiv`).
- **Header**: tombol "Laporan mingguan M41" bervarian sekunder (menggulir ke kartu ringkasan), karena tombol primer layar ada di hero.
- **KPI**: Output selesai (gradient) · Menunggu review · Rata-rata beban kerja · **Tepat waktu 30 hari** (target 85%, rumus di `src/lib/kadiv-math.ts`). Tanpa data tim, hero kembali ke versi capaian mingguan (Item selesai · Terkendala · Bukti kurang · Sisa waktu serah).
- **Laporan mingguan M41 untuk Direktur**: draf otomatis, Edit draf, "Kirim ke Direktur" (notifikasi ke direktur PT), dan peringatan bila review masih tersisa sebelum tenggat serah. Ringkasan disimpan di `WeeklyDivisionSummary` (migrasi 0021). Capaian mingguan tetap diserahkan ke Admin PT lewat Capaian mingguan → "Serahkan ke Admin PT".
- **Proyek divisi**: `Timeline` + legenda (ponsel: `ProjectRow compact`), Sheet proyek dengan cincin, status, output, tenggat, tahapan.
- **Sheet anggota**: "Tandai sudah dibaca" menandai laporan harian hari ini (tabel `DailyReportRead`); laporannya tetap milik alur PIC → Admin PT.
- **Komposisi status** (donat) diganti kartu Aktivitas tim.
- Bar beban kerja dibatasi 100% secara visual; angka sebenarnya (mis. 112%) ditulis di bawahnya.
- Belum: tab terpisah tablet/ponsel, tombol "Terima" per baris sebagai sekunder (perlu opsi varian di `ApprovalItem`), dan label jenis bukti per output.
