# 02 · Direktur

**Siapa:** direktur yang membawahi beberapa divisi (contoh: Hadi Santoso, Direktur Operasional & Teknologi — Teknologi, Operasional, Media; 8 proyek).
**Pertanyaan utama:** Bagaimana divisi saya minggu ini? Laporan siapa yang belum masuk? Keputusan apa yang dinaikkan ke saya?
**Papan kanvas:** halaman "3 · Direktur" — `DDirektur`, `TDirektur`, `TDirekturProyek`, `PDirektur`, `PDirekturProyek`, `PDirekturEskalasi`, `PDirekturDetail`, `PDirekturLaporan`.

## Saringan divisi (ciri khas peran)
`SegmentedControl` **Semua · Teknologi · Operasional · Media** di header. Semua isi halaman — kalimat hero, cincin, KPI, laporan mingguan, timeline, tabel, eskalasi, tren — ikut tersaring. Klik segmen `DonutChart` juga mengganti saringan.

## Desktop — urutan

1. **Sidebar:** "Direktur · 3 divisi". Nav: Ringkasan · Laporan mingguan `3` · Milestone · Proyek `8` · Eskalasi `n` (aksen) · Divisi `3`.
2. **Header:** "Senin, 5 Oktober 2026 · Minggu ke-41" + "Selamat sore, Hadi"; kanan: saringan divisi, cari, notifikasi.
3. **Hero:**
   - Semua: eyebrow "3 divisi · 8 proyek di bawah Anda", **"5 dari 8 proyek berjalan sesuai rencana."**, pendukung "2 perlu perhatian, 1 terlambat. Laporan Operasional belum masuk dan 3 eskalasi menunggu keputusan Anda."
   - Satu divisi: eyebrow "Divisi Teknologi · Andi Wijaya", kalimat per divisi, "31 dari 38 output minggu ini selesai. Laporan mingguan: terkirim."
   - Tombol "Tinjau n eskalasi" (sejak F4-B "Tinjau n keputusan" bila ada persetujuan dan eskalasi), tautan "Baca laporan mingguan".
   - `ActivityRings`: Output (x dari y) · Laporan mingguan (masuk/total) · Tepat waktu.
   - KPI: Output selesai (gradient + delta vs minggu lalu) · Laporan mingguan M40 (x dari 3, tone late bila ada yang belum) · Menunggu keputusan (persetujuan + eskalasi; F4-B) · Milestone 14 hari.
4. **Laporan mingguan divisi · M40** (2/3): baris per divisi — avatar kadiv, "Divisi X" + lencana (Terkirim / Terlambat masuk / Belum masuk / Sudah dibaca), "nama · waktu — ringkasan satu kalimat", tombol "Baca laporan" atau "Ingatkan". Di bawahnya kotak `surface-2` **Alur laporan minggu ini** (`FlowDiagram` horizontal; simpul Kepala divisi `blocked` bila ada yang belum).
5. **Output yang sedang dikerjakan** (1/3): `DonutChart stack` output aktif per divisi (38 · 24 · 30), klik = saring.
6. **Milestone proyek** (lebar penuh): `Timeline` rentang 28 Sep–20 Nov (54 hari), sub "PIC · Divisi".
7. **Proyek di bawah Anda** (2/3): tabel `ProjectRow`. **Eskalasi dari kepala divisi** (1/3): `ApprovalItem` — Revisi anggaran Renovasi Ruang IT (Rp 48,5 jt) · Materi video Kampanye Oktober · Geser rilis Aplikasi Absensi ke 31 Okt. Kosong: centang + "Tidak ada eskalasi untuk divisi ini."
8. **Tren output** (2/3): `AreaChart` 8 minggu, klik titik → angka besar. **Tepat waktu per divisi** (1/3): `DivisionBar` target 85.

## Sheet
- **Proyek:** ring 112, status, x dari y output, tenggat, `FlowDiagram` vertikal tahapan dengan meta (Selesai/Berjalan/Tertahan/Berikutnya), catatan PIC. Aksi "Kirim catatan ke PIC" · "Tandai sudah ditinjau".
- **Laporan terkirim:** lencana, 3 angka (Output x/y, Tepat waktu %, Kendala n), poin utama (3 butir), kotak Kendala `waspada-soft`. Aksi "Beri tanggapan" · "Tandai sudah dibaca".
- **Laporan belum masuk:** "Belum masuk", "Laporan mingguan M40 Divisi Operasional belum dikirim. Tenggat serahnya Kamis lalu pukul 17.00 dan minggu itu sudah dikunci Jumat 17.00.", status pengingat. Aksi "Hubungi Wahyu" · "Ingatkan kepala divisi" → "Pengingat terkirim". Pengingat dikirim hanya ke divisi itu dan untuk minggu laporan yang sedang tampil (`POST /api/notifications/remind` dengan `divisionId` dan `week`).

## Tablet — Ringkasan · Proyek · Eskalasi · Divisi
Saringan divisi di kanan judul. Ringkasan: hero + 4 KPI + laporan mingguan + milestone. Proyek: kartu 2 kolom. Eskalasi: daftar + alur laporan. Divisi: tren output (angka minggu terpilih), tepat waktu, donat.

## Ponsel — tab yang sama
Saringan `SegmentedControl full` (Semua · Tek · Ops · Media) di bawah judul. Ringkasan: hero cincin 96 + legenda + kalimat; 2 KPI; laporan mingguan (baris bisa diketuk → layar laporan); **Milestone 14 hari** sebagai daftar bertanggal (kotak tanggal 44px + nama + PIC + lencana). Proyek: chip + `ProjectRow compact`. Eskalasi: kartu per item + alur vertikal. Divisi: tren, donat, tepat waktu. Detail proyek & laporan sebagai layar didorong.

## Data yang dibutuhkan
Per divisi: kadiv, status laporan mingguan + waktu + poin + kendala, output selesai/total, tepat waktu %, tren 8 minggu, output aktif. Proyek + mulai/tenggat (hari sejak awal rentang). Eskalasi (divisi, judul, pengaju, waktu, nominal).

## Implementasi saat ini (6 Okt 2026, F2)
Status per butir: [`docs/fitur/peran-direktur-manajemen.md`](../../fitur/peran-direktur-manajemen.md).
- **Tab** (`ROLE_TABS`): Ringkasan · Proyek · Divisi · Eskalasi `n` · Persetujuan · Entitas. Tablet & ponsel: Ringkasan · Proyek · Eskalasi · Divisi, sisanya di "Lainnya". Badge "Laporan mingguan n" (laporan yang sudah masuk tetapi belum Anda tandai dibaca) menempel di tab Divisi. Laporan mingguan dan milestone tampil sebagai kartu di Ringkasan (`src/components/oversight`).
- **Warna divisi** diambil dari nama divisi (`src/lib/division-tone.ts`), sama di donat, baris proyek, DivisionBar, dan avatar kepala divisi.
- **Sheet laporan terkirim**: "Beri tanggapan" menulis ke `WeeklyReportComment`; kepala divisi membaca dan membalas dari kartu "Tanggapan direktur" di Meja kerja. **Laporan belum masuk**: "Hubungi …" membuka telepon/email dari akun kepala divisi; "Ingatkan kepala divisi" mengingatkan divisi itu untuk minggu yang tampil.
- **Eskalasi dari kepala divisi** memuat permintaan materi, anggaran, dan cuti sebagai `ApprovalItem` Setujui/Tolak, usulan tenggat dari PIC, dan eskalasi (`AttentionItem` menuju modul Eskalasi, karena memutuskannya butuh teks keputusan).
- **Sheet proyek**: tahapan bertanggal dari `ProjectStage`, "Kirim catatan ke PIC", dan "Tandai sudah ditinjau".

## Pembaruan daftar periksa desain (6 Okt 2026, F4-B)
- **Kalimat pendukung & tombol hero** menyebut jenis yang menunggu supaya angkanya cocok dengan lencana nav Persetujuan dan Eskalasi: "4 persetujuan dan 2 eskalasi menunggu keputusan Anda." dan tombol "Tinjau 6 keputusan" (hanya satu jenis: "Tinjau n persetujuan" / "Tinjau n eskalasi"). KPI ketiga berlabel **Menunggu keputusan**.
- Tombol Setujui per baris di kartu **Eskalasi dari kepala divisi** dan di modul Persetujuan kini sekunder (`approveVariant="secondary"`): maksimal satu tombol primer per kartu.
- Modul Persetujuan: kalimat jawaban menjadi judul `h2` (urutan judul h1 → h2 → h3).
- Palet ⌘K: fokus kembali ke elemen yang fokus sebelum palet dibuka saat ditutup dengan Esc atau ketuk scrim.

